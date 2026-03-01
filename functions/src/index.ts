import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
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

export const syncNedarimTransactions = onSchedule("every 5 minutes", async (_event) => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await response.json() as any;

        if (!data || data.Status === "Error" || !Array.isArray(data) || data.length === 0) {
            console.log("No new transactions or error from Nedarim");
            return;
        }

        const batch = db.batch();
        let maxId = lastId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const tx of data as any[]) {
            const currentTxId = parseInt(tx.TransactionId || "0");
            if (currentTxId > maxId) {
                maxId = currentTxId;
            }

            const amount = parseFloat(tx.Amount);
            // ClientName = boy's nedarimName for MatchingOffline transactions.
            // Param1     = boy's nedarimName for iframe (PostNedarim) transactions
            //              where ClientName holds the human donor's name instead.
            // Try ClientName first; fall back to Param1 so both flows are caught.
            const candidateNames: string[] = [];
            if (tx.ClientName) candidateNames.push(String(tx.ClientName));
            if (tx.Param1 && tx.Param1 !== tx.ClientName) candidateNames.push(String(tx.Param1));

            if (isNaN(amount) || candidateNames.length === 0) continue;

            // Try each candidate name until we find a matching boy
            let boysQuery = await db.collection("boys").where("nedarimName", "==", candidateNames[0]).get();
            if (boysQuery.empty && candidateNames[1]) {
                boysQuery = await db.collection("boys").where("nedarimName", "==", candidateNames[1]).get();
            }
            const nedarimClientName = candidateNames[0]; // used for logging/storage

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

// ─── Nedarim Plus: Push Offline Donation ─────────────────────────────────────
// Callable from the Dashboard frontend — proxies to the Nedarim MatchingOffline
// endpoint so that credentials never leave the server and CORS is avoided.

export const pushOfflineDonationToNedarim = onCall(async (request) => {
    const { matrimId, clientName, amount } = request.data as {
        matrimId: string | number;
        clientName: string;
        amount: number;
    };

    if (!matrimId || !clientName || amount === undefined || amount === null) {
        throw new HttpsError(
            "invalid-argument",
            "Missing required parameters: matrimId, clientName, amount"
        );
    }

    const mosadId     = process.env.NEDARIM_MOSAD_ID;
    const apiPassword = process.env.NEDARIM_API_PASSWORD;

    if (!mosadId || !apiPassword) {
        throw new HttpsError("internal", "Nedarim API credentials are not configured on the server");
    }

    const params = new URLSearchParams({
        Action:      "MatchingOffline",
        MosadNumber: mosadId,
        ApiPassword: apiPassword,
        MatrimId:    String(matrimId),
        ClientName:  clientName,
        Amount:      String(amount),
    });

    const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?${params.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        // Nedarim sometimes returns plain-text on error — wrap it so the
        // client always receives a consistent object.
        data = { rawResponse: text };
    }

    return data;
});
