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
exports.pushOfflineDonationToNedarim = exports.syncNedarimTransactions = exports.healthCheck = exports.yemotPersonal = exports.yemotGeneral = exports.processTransactionCancellation = exports.processPendingTransaction = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
// Initialize admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
// ─── Financial triggers ───────────────────────────────────────────────────────
var processTransactions_1 = require("./financial/processTransactions");
Object.defineProperty(exports, "processPendingTransaction", { enumerable: true, get: function () { return processTransactions_1.processPendingTransaction; } });
Object.defineProperty(exports, "processTransactionCancellation", { enumerable: true, get: function () { return processTransactions_1.processTransactionCancellation; } });
// ─── IVR / Yemot HaMashiach webhooks ─────────────────────────────────────────
var yemotWebhooks_1 = require("./ivr/yemotWebhooks");
Object.defineProperty(exports, "yemotGeneral", { enumerable: true, get: function () { return yemotWebhooks_1.yemotGeneral; } });
Object.defineProperty(exports, "yemotPersonal", { enumerable: true, get: function () { return yemotWebhooks_1.yemotPersonal; } });
// ─── Utility endpoints ────────────────────────────────────────────────────────
/**
 * Health-check endpoint — confirms the Functions runtime is alive.
 * GET /healthCheck → { status: "ok", timestamp: "<ISO string>" }
 */
exports.healthCheck = (0, https_1.onRequest)((req, res) => {
    logger.info("healthCheck called", { method: req.method });
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// ─── Nedarim Plus Sync ────────────────────────────────────────────────────────
exports.syncNedarimTransactions = (0, scheduler_1.onSchedule)("every 5 minutes", async (_event) => {
    try {
        const db = admin.firestore();
        const syncDocRef = db.collection("system").doc("nedarim_sync");
        const syncDoc = await syncDocRef.get();
        // Default seed: 40_000_000 is safely below the March 2025 transaction IDs
        // (~49M) seen in production. Override by writing lastId to the
        // system/nedarim_sync Firestore document.
        let lastId = 40_000_000;
        if (syncDoc.exists && syncDoc.data()?.lastId) {
            lastId = syncDoc.data()?.lastId;
        }
        const mosadId = process.env.NEDARIM_MOSAD_ID;
        const apiPassword = process.env.NEDARIM_API_PASSWORD;
        const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistoryJson&MosadId=${mosadId}&ApiPassword=${apiPassword}&LastId=${lastId}`;
        const response = await fetch(url);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await response.json();
        if (!data || data.Status === "Error" || !Array.isArray(data) || data.length === 0) {
            console.log("No new transactions or error from Nedarim");
            return;
        }
        // ── Fetch ALL boys once — avoids N Firestore reads inside the loop ────────
        const boysSnap = await db.collection("boys").get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allBoys = boysSnap.docs.map((d) => ({ ref: d.ref, ...d.data() }));
        const batch = db.batch();
        let maxId = lastId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const tx of data) {
            const currentTxId = parseInt(tx.TransactionId || "0");
            if (currentTxId > maxId) {
                maxId = currentTxId;
            }
            const amount = parseFloat(tx.Amount);
            if (isNaN(amount))
                continue;
            // ── Match fundraiser via Comments (the ONLY reliable field) ─────────
            //
            // Confirmed from live API output (test-nedarim.ts):
            //   • tx.Param1, tx.Param2, tx.MatrimId → ALWAYS EMPTY in GetHistoryJson
            //   • tx.ClientName                     → DONOR name, never the fundraiser
            //   • tx.Comments                       → free-text set by operator,
            //                                         e.g. "לזכות המתרים אברהם ליכט"
            //
            // Matching rule: boy.nedarimName must be a substring of tx.Comments.
            // Set boy.nedarimName to the shortest distinctive part of their name
            // that appears consistently (e.g. "ליכט" rather than "הבחור החשוב ליכט").
            const txComments = String(tx.Comments ?? "").trim();
            const donorName = String(tx.ClientName ?? "").trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const matchedBoy = allBoys.find((b) => {
                const name = String(b.nedarimName ?? "").trim();
                if (!name)
                    return false;
                return txComments.includes(name);
            });
            if (matchedBoy) {
                // Increment the boy's running total
                batch.update(matchedBoy.ref, {
                    totalRaised: admin.firestore.FieldValue.increment(amount),
                });
                // Persist transaction (idempotent — TransactionId as doc ID)
                batch.set(db.collection("transactions").doc(String(currentTxId)), {
                    nedarimTransactionId: currentTxId,
                    boyId: matchedBoy.ref.id,
                    boyName: matchedBoy.name ?? "",
                    amount,
                    donorName,
                    comments: txComments,
                    rawData: tx,
                    status: "completed",
                    source: "nedarim",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            else {
                // No boy matched — park for manual resolution.
                // The `comments` field shows exactly what the operator wrote so
                // admins know which nedarimName to configure on the boy's record.
                batch.set(db.collection("unmatched_transactions").doc(String(currentTxId)), {
                    nedarimTransactionId: currentTxId,
                    donorName,
                    comments: txComments,
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
    }
    catch (error) {
        console.error("Error syncing with Nedarim:", error);
    }
});
// ─── Nedarim Plus: Push Offline Donation ─────────────────────────────────────
// Callable from the Dashboard frontend — proxies to the Nedarim MatchingOffline
// endpoint so that credentials never leave the server and CORS is avoided.
exports.pushOfflineDonationToNedarim = (0, https_1.onCall)(async (request) => {
    const { nedarimName, donorName, amount } = request.data;
    if (!nedarimName || amount === undefined || amount === null) {
        throw new https_1.HttpsError("invalid-argument", "Missing required parameters: nedarimName, amount");
    }
    const mosadId = process.env.NEDARIM_MOSAD_ID;
    const apiPassword = process.env.NEDARIM_API_PASSWORD;
    if (!mosadId || !apiPassword) {
        throw new https_1.HttpsError("internal", "Nedarim API credentials are not configured on the server");
    }
    // Comments is set to the nedarimName so the cron's Comments.includes() match
    // can find this transaction when GetHistoryJson returns it.
    // MatrimId is also set as a belt-and-suspenders identifier on Nedarim's side.
    const params = new URLSearchParams({
        Action: "MatchingOffline",
        MosadNumber: mosadId,
        ApiPassword: apiPassword,
        MatrimId: nedarimName,
        ClientName: donorName?.trim() || "Offline Donation",
        Comments: nedarimName, // ← ensures Comments.includes(nedarimName) == true
        Amount: String(amount),
    });
    const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?${params.toString()}`;
    const response = await fetch(url);
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        // Nedarim sometimes returns plain-text on error — wrap it so the
        // client always receives a consistent object.
        data = { rawResponse: text };
    }
    return data;
});
//# sourceMappingURL=index.js.map