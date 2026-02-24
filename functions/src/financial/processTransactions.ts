import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "../lib/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SplitDetail {
  boyId: string;
  /** Share of the donation in NIS (e.g., 33.34). Stored as a decimal. */
  amount: number;
}

/**
 * Shape of a document in the `pending_transactions` collection,
 * written by the client-side DonationForm.
 */
interface PendingTxData {
  amount: number;
  type: "cash" | "credit";
  targetId: string;
  targetType: "folder" | "boy";
  targetName: string;
  dedication: string;
  date: Timestamp;
  status: "pending";
}

/**
 * The fields we need to read from a `transactions` document for
 * the cancellation trigger.
 */
interface TxData {
  status: "completed" | "request_cancel" | "cancelled";
  splitDetails: SplitDetail[];
}

// ─── Math helper ──────────────────────────────────────────────────────────────

/**
 * Splits a NIS total evenly across `count` recipients using agora-level
 * integer arithmetic so the sum of all shares is always exactly `totalNis`.
 *
 * Algorithm:
 *   1. Convert to agorot (×100, rounded) to eliminate float imprecision.
 *   2. Divide: perAg = floor(totalAg / count).
 *   3. Give the indivisible remainder to the first recipient.
 *   4. Convert each share back to NIS (÷100).
 *
 * Example  100 NIS ÷ 3 boys:
 *   totalAg = 10000, perAg = 3333, remainderAg = 1
 *   → shares = [33.34, 33.33, 33.33]   (sum = 100.00 ✓)
 */
function splitEvenly(totalNis: number, count: number): number[] {
  const totalAg = Math.round(totalNis * 100);
  const perAg = Math.floor(totalAg / count);
  const remainderAg = totalAg - perAg * count;
  return Array.from(
    { length: count },
    (_, i) => (i === 0 ? perAg + remainderAg : perAg) / 100
  );
}

// ─── Trigger 1: processPendingTransaction ─────────────────────────────────────

/**
 * Fires when a coordinator submits a donation via the client-side form,
 * which writes a document to `pending_transactions`.
 *
 * Steps:
 *   1. Read the pending document.
 *   2. Resolve the split (folder → boys in_field, boy → single entry).
 *   3. Atomically: create confirmed transaction, increment boys' totalRaised,
 *      delete the pending document.
 *
 * Idempotency: the confirmed transaction document reuses the pending document's
 * ID (`event.params.docId`) so a Function retry after a partial failure will
 * overwrite — not duplicate — the transaction record.
 */
export const processPendingTransaction = onDocumentCreated(
  "pending_transactions/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn("processPendingTransaction: event.data is undefined", {
        docId: event.params.docId,
      });
      return;
    }

    const pending = snap.data() as PendingTxData;
    const { amount, type, targetId, targetType, targetName, dedication, date } =
      pending;

    // ── 1. Determine split ──────────────────────────────────────────────────

    let splitDetails: SplitDetail[];

    if (targetType === "folder") {
      const boysSnap = await db
        .collection("boys")
        .where("folderId", "==", targetId)
        .where("status", "==", "in_field")
        .get();

      if (boysSnap.empty) {
        // No active boys — surface the failure so the client can react.
        logger.warn(
          `processPendingTransaction: folder ${targetId} has no active boys`,
          { docId: event.params.docId }
        );
        await snap.ref.update({ status: "failed", failReason: "no_active_boys" });
        return;
      }

      const boyIds = boysSnap.docs.map((d) => d.id);
      const shares = splitEvenly(amount, boyIds.length);
      splitDetails = boyIds.map((boyId, i) => ({ boyId, amount: shares[i] }));

      logger.info(
        `processPendingTransaction: splitting ${amount} NIS across ${boyIds.length} boys in folder ${targetId}`,
        { docId: event.params.docId, splitDetails }
      );
    } else {
      // Single boy — full amount to him.
      splitDetails = [{ boyId: targetId, amount }];

      logger.info(
        `processPendingTransaction: direct donation of ${amount} NIS to boy ${targetId}`,
        { docId: event.params.docId }
      );
    }

    // ── 2. Atomic batch ─────────────────────────────────────────────────────

    const batch = db.batch();

    // Confirmed transaction — same ID as the pending doc for idempotency.
    const txRef = db.collection("transactions").doc(event.params.docId);
    batch.set(txRef, {
      type,
      amount,
      targetId,
      targetType,
      targetName,
      dedication,
      date,           // forward the original client timestamp
      status: "completed",
      splitDetails,
    });

    // Increment each boy's running total by their exact share.
    for (const split of splitDetails) {
      batch.update(db.collection("boys").doc(split.boyId), {
        totalRaised: FieldValue.increment(split.amount),
      });
    }

    // Remove the pending document — its work is done.
    batch.delete(snap.ref);

    await batch.commit();

    logger.info("processPendingTransaction: committed successfully", {
      txId: event.params.docId,
    });
  }
);

// ─── Trigger 2: processTransactionCancellation ───────────────────────────────

/**
 * Fires on any update to a `transactions` document.
 *
 * Only acts when the document transitions from `completed` → `request_cancel`,
 * which is the signal the client sets when a coordinator clicks "ביטול עסקה".
 *
 * Steps:
 *   1. Guard: ignore all other status transitions.
 *   2. Reverse each boy's totalRaised by their exact stored share
 *      (uses `splitDetails` from the document — not recalculated — so the
 *      reversal is always mathematically identical to the original split).
 *   3. Flip the transaction status to `cancelled`.
 *
 * All writes are in a single atomic batch.
 */
export const processTransactionCancellation = onDocumentUpdated(
  "transactions/{txId}",
  async (event) => {
    if (!event.data) {
      logger.warn("processTransactionCancellation: event.data is undefined", {
        txId: event.params.txId,
      });
      return;
    }

    const before = event.data.before.data() as TxData | undefined;
    const after = event.data.after.data() as TxData | undefined;

    if (!before || !after) return;

    // Only handle the completed → request_cancel transition.
    if (before.status !== "completed" || after.status !== "request_cancel") {
      return;
    }

    const splitDetails: SplitDetail[] = after.splitDetails ?? [];

    logger.info(
      `processTransactionCancellation: reversing ${splitDetails.length} split(s) for tx ${event.params.txId}`
    );

    // ── Atomic batch ────────────────────────────────────────────────────────

    const batch = db.batch();

    // Decrement each boy's totalRaised by the exact stored amount.
    for (const split of splitDetails) {
      batch.update(db.collection("boys").doc(split.boyId), {
        totalRaised: FieldValue.increment(-split.amount),
      });
    }

    // Mark the transaction as fully cancelled.
    batch.update(event.data.after.ref, { status: "cancelled" });

    await batch.commit();

    logger.info("processTransactionCancellation: committed successfully", {
      txId: event.params.txId,
    });
  }
);
