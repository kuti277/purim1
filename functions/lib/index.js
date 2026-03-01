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
        let lastId = 66973930;
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
            // ── Match fundraiser from transaction fields ─────────────────────
            // IMPORTANT: tx.ClientName = the DONOR's name (person who paid).
            //            The fundraiser identifier is stored in Param1/Param2/Comments.
            //
            //  • MatchingOffline flow: MatrimId = nedarimName → Nedarim echoes it in Param1
            //  • Iframe (PostNedarim) flow: Param1 = nedarimName, Param2 = donorNumber
            //  • Comments may also contain the nedarimName as a fallback
            const txParam1 = String(tx.Param1 ?? "").trim();
            const txParam2 = String(tx.Param2 ?? "").trim();
            const txComments = String(tx.Comments ?? "").trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const matchedBoy = allBoys.find((b) => {
                const name = String(b.nedarimName ?? "").trim();
                const donor = String(b.donorNumber ?? "").trim();
                if (!name && !donor)
                    return false;
                return ((name && (txParam1 === name || txParam2 === name || txComments.includes(name))) ||
                    (donor && (txParam1 === donor || txParam2 === donor)));
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
                    boyName: matchedBoy.name ?? txParam1,
                    amount,
                    donorName: String(tx.ClientName ?? ""),
                    param1: txParam1,
                    param2: txParam2,
                    rawData: tx,
                    status: "completed",
                    source: "nedarim",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            else {
                // No boy matched — park for manual resolution
                batch.set(db.collection("unmatched_transactions").doc(String(currentTxId)), {
                    nedarimTransactionId: currentTxId,
                    donorName: String(tx.ClientName ?? ""),
                    param1: txParam1,
                    param2: txParam2,
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
    const params = new URLSearchParams({
        Action: "MatchingOffline",
        MosadNumber: mosadId,
        ApiPassword: apiPassword,
        MatrimId: nedarimName, // fundraiser name, not numeric ID
        ClientName: donorName?.trim() || "Offline Donation",
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