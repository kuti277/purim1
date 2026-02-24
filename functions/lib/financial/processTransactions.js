"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processTransactionCancellation = exports.processPendingTransaction = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const admin_1 = require("../lib/admin");
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
function splitEvenly(totalNis, count) {
    const totalAg = Math.round(totalNis * 100);
    const perAg = Math.floor(totalAg / count);
    const remainderAg = totalAg - perAg * count;
    return Array.from({ length: count }, (_, i) => (i === 0 ? perAg + remainderAg : perAg) / 100);
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
exports.processPendingTransaction = (0, firestore_2.onDocumentCreated)("pending_transactions/{docId}", async (event) => {
    const snap = event.data;
    if (!snap) {
        logger.warn("processPendingTransaction: event.data is undefined", {
            docId: event.params.docId,
        });
        return;
    }
    const pending = snap.data();
    const { amount, type, targetId, targetType, targetName, dedication, date } = pending;
    // ── 1. Determine split ──────────────────────────────────────────────────
    let splitDetails;
    if (targetType === "folder") {
        const boysSnap = await admin_1.db
            .collection("boys")
            .where("folderId", "==", targetId)
            .where("status", "==", "in_field")
            .get();
        if (boysSnap.empty) {
            // No active boys — surface the failure so the client can react.
            logger.warn(`processPendingTransaction: folder ${targetId} has no active boys`, { docId: event.params.docId });
            await snap.ref.update({ status: "failed", failReason: "no_active_boys" });
            return;
        }
        const boyIds = boysSnap.docs.map((d) => d.id);
        const shares = splitEvenly(amount, boyIds.length);
        splitDetails = boyIds.map((boyId, i) => ({ boyId, amount: shares[i] }));
        logger.info(`processPendingTransaction: splitting ${amount} NIS across ${boyIds.length} boys in folder ${targetId}`, { docId: event.params.docId, splitDetails });
    }
    else {
        // Single boy — full amount to him.
        splitDetails = [{ boyId: targetId, amount }];
        logger.info(`processPendingTransaction: direct donation of ${amount} NIS to boy ${targetId}`, { docId: event.params.docId });
    }
    // ── 2. Atomic batch ─────────────────────────────────────────────────────
    const batch = admin_1.db.batch();
    // Confirmed transaction — same ID as the pending doc for idempotency.
    const txRef = admin_1.db.collection("transactions").doc(event.params.docId);
    batch.set(txRef, {
        type,
        amount,
        targetId,
        targetType,
        targetName,
        dedication,
        date, // forward the original client timestamp
        status: "completed",
        splitDetails,
    });
    // Increment each boy's running total by their exact share.
    for (const split of splitDetails) {
        batch.update(admin_1.db.collection("boys").doc(split.boyId), {
            totalRaised: firestore_1.FieldValue.increment(split.amount),
        });
    }
    // Remove the pending document — its work is done.
    batch.delete(snap.ref);
    await batch.commit();
    logger.info("processPendingTransaction: committed successfully", {
        txId: event.params.docId,
    });
});
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
exports.processTransactionCancellation = (0, firestore_2.onDocumentUpdated)("transactions/{txId}", async (event) => {
    if (!event.data) {
        logger.warn("processTransactionCancellation: event.data is undefined", {
            txId: event.params.txId,
        });
        return;
    }
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after)
        return;
    // Only handle the completed → request_cancel transition.
    if (before.status !== "completed" || after.status !== "request_cancel") {
        return;
    }
    const splitDetails = after.splitDetails ?? [];
    logger.info(`processTransactionCancellation: reversing ${splitDetails.length} split(s) for tx ${event.params.txId}`);
    // ── Atomic batch ────────────────────────────────────────────────────────
    const batch = admin_1.db.batch();
    // Decrement each boy's totalRaised by the exact stored amount.
    for (const split of splitDetails) {
        batch.update(admin_1.db.collection("boys").doc(split.boyId), {
            totalRaised: firestore_1.FieldValue.increment(-split.amount),
        });
    }
    // Mark the transaction as fully cancelled.
    batch.update(event.data.after.ref, { status: "cancelled" });
    await batch.commit();
    logger.info("processTransactionCancellation: committed successfully", {
        txId: event.params.txId,
    });
});
//# sourceMappingURL=processTransactions.js.map