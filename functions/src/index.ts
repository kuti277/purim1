import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Initialize admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// ─── Financial triggers ───────────────────────────────────────────────────────
export {
  processPendingTransaction,
  processTransactionCancellation,
} from "./financial/processTransactions";

// ─── IVR / Yemot HaMashiach webhooks ─────────────────────────────────────────
export { yemotGeneral, yemotPersonal } from "./ivr/yemotWebhooks";

// ─── Utility endpoints ────────────────────────────────────────────────────────

/**
 * Health-check endpoint — confirms the Functions runtime is alive.
 * GET /healthCheck → { status: "ok", timestamp: "<ISO string>" }
 */
export const healthCheck = onRequest((req, res) => {
  logger.info("healthCheck called", { method: req.method });
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Nedarim Plus Sync ────────────────────────────────────────────────────────

export const syncNedarimTransactions = onSchedule("every 5 minutes", async (event) => {
    try {
        const db = admin.firestore();
        const syncDocRef = db.collection("system").doc("nedarim_sync");
        const syncDoc = await syncDocRef.get();

        let lastId = 66973930;
        if (syncDoc.exists && syncDoc.data()?.lastId) {
            lastId = syncDoc.data()?.lastId;
        }

        const mosadId = process.env.NEDARIM_MOSAD_ID;
        const apiPassword = process.env.NEDARIM_API_PASSWORD;

        const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistoryJson&MosadId=${mosadId}&ApiPassword=${apiPassword}&LastId=${lastId}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data || data.Status === "Error" || data.length === 0) {
            console.log("No new transactions or error from Nedarim");
            return;
        }

        const batch = db.batch();
        let maxId = lastId;

        for (const tx of data) {
            const currentTxId = parseInt(tx.TransactionId || "0");
            if (currentTxId > maxId) {
                maxId = currentTxId;
            }

            const amount = parseFloat(tx.Amount);
            const nedarimClientName = tx.ClientName;

            if (isNaN(amount) || !nedarimClientName) continue;

            const boysQuery = await db.collection("boys").where("nedarimName", "==", nedarimClientName).get();

            if (!boysQuery.empty) {
                const boyDoc = boysQuery.docs[0];
                // Increment the boy's running total
                batch.update(boyDoc.ref, {
                    totalRaised: admin.firestore.FieldValue.increment(amount),
                });
                // Persist the transaction record (idempotent — uses TransactionId as doc ID)
                batch.set(db.collection("transactions").doc(String(currentTxId)), {
                    nedarimTransactionId: currentTxId,
                    boyId: boyDoc.id,
                    boyName: boyDoc.data().name ?? nedarimClientName,
                    amount,
                    clientName: nedarimClientName,
                    rawData: tx,
                    status: "completed",
                    source: "nedarim",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            } else {
                // No boy matched — park the transaction for manual resolution
                batch.set(db.collection("unmatched_transactions").doc(String(currentTxId)), {
                    nedarimTransactionId: currentTxId,
                    clientName: nedarimClientName,
                    amount,
                    rawData: tx,
                    status: "pending_match",
                    source: "nedarim",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        }

        if (maxId > lastId) {
            batch.set(syncDocRef, { lastId: maxId }, { merge: true });
        }

        await batch.commit();
        console.log(`Nedarim sync successful. Max ID updated to: ${maxId}`);

    } catch (error) {
        console.error("Error syncing with Nedarim:", error);
    }
});
