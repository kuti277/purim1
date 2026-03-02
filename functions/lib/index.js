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
        // ── Fetch ALL boys once ────────────────────────────────────────────────
        const boysSnap = await db.collection("boys").get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allBoys = boysSnap.docs.map((d) => ({ ref: d.ref, ...d.data() }));
        // ── Pre-fetch which transaction docs already exist ─────────────────────
        // The frontend (iframe postMessage handler, ManualNedarimUpdate) writes to
        // `transactions` immediately AND increments `boys.totalRaised` for instant UI
        // feedback.  When the cron later picks up the same transaction we must NOT
        // increment totalRaised a second time — we only update the metadata.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const incomingTxIds = data
            .map((tx) => String(tx.TransactionId || "0"))
            .filter((id) => id !== "0");
        const existingTxSnaps = await Promise.all(incomingTxIds.map((id) => db.collection("transactions").doc(id).get()));
        const alreadyExisting = new Set(existingTxSnaps.filter((s) => s.exists).map((s) => s.id));
        const batch = db.batch();
        let maxId = lastId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const tx of data) {
            const currentTxId = parseInt(tx.TransactionId || "0");
            if (currentTxId > maxId)
                maxId = currentTxId;
            const amount = parseFloat(tx.Amount);
            if (isNaN(amount))
                continue;
            const txComments = String(tx.Comments ?? "").trim();
            const donorName = String(tx.ClientName ?? "").trim();
            // ── STEP A — Deterministic numeric tag ────────────────────────────
            //
            // Our iframe and offline-push embed a tag like [#87] in Comments.
            // Extract the numeric ID and look up the boy by donorNumber / matrimId.
            // This is 100% accurate: no string comparison, no word-order sensitivity.
            //
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let matchedBoy = undefined;
            const tagMatch = txComments.match(/\[#(\d+)\]/);
            if (tagMatch) {
                const extractedId = tagMatch[1];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                matchedBoy = allBoys.find((b) => {
                    const dn = String(b.donorNumber ?? b.matrimId ?? "").trim();
                    return dn !== "" && dn === extractedId;
                });
            }
            // ── STEP B — Fuzzy word-count match (external campaign page) ──────
            //
            // The live Nedarim campaign page does not embed our [#ID] tag.
            // It writes free text like "ע"י המתרים אברהם ליכט" to Comments.
            // A strict substring match fails when name order differs
            // (DB: "ליכט אברהם יהודה" vs Comments: "אברהם ליכט").
            //
            // Rule: split nedarimName into words.
            //   • 1 word  → must appear anywhere in Comments (case-insensitive).
            //   • 2+ words → at least 2 individual words must appear (order-free).
            if (!matchedBoy && txComments) {
                const lowerComments = txComments.toLowerCase();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                matchedBoy = allBoys.find((b) => {
                    const name = String(b.nedarimName ?? "").trim();
                    if (!name)
                        return false;
                    const words = name.split(/\s+/).filter(Boolean);
                    if (words.length === 0)
                        return false;
                    if (words.length === 1) {
                        return lowerComments.includes(words[0].toLowerCase());
                    }
                    // 2+ words: require at least 2 to match (prevents false positives
                    // from single common words appearing in unrelated Comments)
                    const hits = words.filter((w) => lowerComments.includes(w.toLowerCase())).length;
                    return hits >= 2;
                });
            }
            if (!matchedBoy)
                continue;
            const txDocId = String(currentTxId);
            const txRef = db.collection("transactions").doc(txDocId);
            const isNewTx = !alreadyExisting.has(txDocId);
            // Only increment totalRaised for genuinely new transactions.
            // If the frontend already wrote this doc (and incremented totalRaised),
            // we skip the increment to prevent double-counting.
            if (isNewTx) {
                batch.update(matchedBoy.ref, {
                    totalRaised: admin.firestore.FieldValue.increment(amount),
                });
            }
            batch.set(txRef, {
                nedarimTransactionId: currentTxId,
                boyId: matchedBoy.ref.id,
                boyName: matchedBoy.name ?? "",
                amount,
                donorName,
                dedication: txComments,
                paymentMethod: "credit",
                status: "completed",
                source: "nedarim",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        if (maxId > lastId) {
            batch.set(syncDocRef, { lastId: maxId }, { merge: true });
        }
        await batch.commit();
        console.log(`Nedarim sync done. maxId=${maxId}  alreadyExisting=${alreadyExisting.size}`);
    }
    catch (error) {
        console.error("Error syncing with Nedarim:", error);
    }
});
// ─── Nedarim Plus: Push Offline Donation ─────────────────────────────────────
// Callable from the Dashboard frontend — proxies to the Nedarim SaveAchnasot
// endpoint to register external cash income in the campaign totals.
// Credentials never leave the server; CORS is avoided.
exports.pushOfflineDonationToNedarim = (0, https_1.onCall)(async (request) => {
    const { nedarimName, dedication, donorNumber, amount } = request.data;
    if (!nedarimName || amount === undefined || amount === null) {
        throw new https_1.HttpsError("invalid-argument", "Missing required parameters: nedarimName, amount");
    }
    const mosadId = process.env.NEDARIM_MOSAD_ID;
    const apiPassword = process.env.NEDARIM_API_PASSWORD;
    if (!mosadId || !apiPassword) {
        throw new https_1.HttpsError("internal", "Nedarim API credentials are not configured on the server");
    }
    // Comments format: "[#<donorNumber>] <nedarimName> <dedication>"
    //   • [#ID] tag  → cron Step A: regex numeric match (100% accurate)
    //   • nedarimName → cron Step B: fuzzy word-count match as fallback
    //   • dedication  → stored in Nedarim's own records for audit trail
    const tagPart = donorNumber ? `[#${donorNumber}]` : "";
    const comments = [tagPart, nedarimName, dedication?.trim()].filter(Boolean).join(" ");
    // Date formatted as DD/MM/YYYY (required by SaveAchnasot).
    // Explicit padding is safer than toLocaleDateString() whose output varies by Node locale.
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const params = new URLSearchParams({
        Action: "SaveAchnasot",
        MosadNumber: mosadId,
        ApiPassword: apiPassword,
        Type: "1", // 1 = Cash / מזומן
        Zeout: "000000000", // required dummy ID — we don't collect donor IDs
        Amount: String(amount),
        Date: dateStr,
        Currency: "1", // 1 = ILS / ₪
        Comments: comments, // [#ID] nedarimName dedication — cron matches on this
    });
    const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?${params.toString()}`;
    const response = await fetch(url);
    const text = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        // Nedarim sometimes returns plain-text on error — wrap it so the
        // client always receives a consistent object.
        throw new https_1.HttpsError("internal", `Nedarim returned non-JSON: ${text.slice(0, 200)}`);
    }
    if (parsed["Status"] === "Error" || parsed["Status"] === "error") {
        throw new https_1.HttpsError("internal", String(parsed["Description"] ?? parsed["Message"] ?? "Nedarim API error"));
    }
    // SaveAchnasot returns the new transaction ID in a field named "ID".
    // Expose it as `transactionId` so the frontend can use it as the Firestore
    // doc ID — preventing the cron from creating a duplicate 5 min later.
    return {
        success: true,
        transactionId: parsed["ID"] ?? null,
        raw: parsed,
    };
});
// adminBackfill2 used on 2026-03-02 — confirmed 104 transactions already in Firestore,
// 0 new matches, lastId healthy at 67,292,935. Removed.
//# sourceMappingURL=index.js.map