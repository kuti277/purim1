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
exports.yemotPersonal = exports.yemotGeneral = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const admin_1 = require("../lib/admin");
// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Round to whole ILS — the IVR reads integers more naturally */
function ils(n) {
    return Math.round(n);
}
/** Send a plain-text Yemot id_list_message response */
function ivrSend(res, body) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(body);
}
// ─── Endpoint 1: General Campaign Status ─────────────────────────────────────
//
//  GET/POST https://{region}-{project}.cloudfunctions.net/yemotGeneral
//
//  Response:
//    id_list_message=t-יעד הקמפיין הוא.n-{TARGET}.t-עד כה נאספו.n-{RAISED}.
//    t-חסר לנו להגיע ליעד.n-{REMAINING}.t-על ידי.n-{DONORS_COUNT}.
//    t-מתרימים. אנחנו אוחזים ב.n-{PERCENTAGE}.t-אחוזים
exports.yemotGeneral = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    logger.info("yemotGeneral called", { method: req.method });
    try {
        // ── 1. Global campaign goal ──────────────────────────────────────────────
        const settingsSnap = await admin_1.db.collection("settings").doc("global").get();
        const globalGoal = settingsSnap.exists
            ? (settingsSnap.data()?.globalGoal ?? 0)
            : 0;
        // ── 2. Sum all non-cancelled transactions ────────────────────────────────
        const txSnap = await admin_1.db
            .collection("transactions")
            .where("status", "!=", "cancelled")
            .get();
        let totalRaised = 0;
        txSnap.forEach((doc) => {
            totalRaised += doc.data().amount ?? 0;
        });
        const donorsCount = txSnap.size;
        const remaining = Math.max(0, globalGoal - totalRaised);
        const pct = globalGoal > 0
            ? Math.min(100, Math.round((totalRaised / globalGoal) * 100))
            : 0;
        ivrSend(res, `id_list_message=` +
            `t-יעד הקמפיין הוא.` +
            `n-${ils(globalGoal)}.` +
            `t-עד כה נאספו.` +
            `n-${ils(totalRaised)}.` +
            `t-חסר לנו להגיע ליעד.` +
            `n-${ils(remaining)}.` +
            `t-על ידי.` +
            `n-${donorsCount}.` +
            `t-מתרימים. אנחנו אוחזים ב.` +
            `n-${pct}.` +
            `t-אחוזים`);
    }
    catch (err) {
        logger.error("yemotGeneral error", err);
        ivrSend(res, "id_list_message=t-שגיאה במערכת. נסה שנית מאוחר יותר");
    }
});
// ─── Endpoint 2: Personal Boy Status (two-step Yemot flow) ───────────────────
//
//  Step A — no WorkerId yet:
//    Yemot calls this URL with no WorkerId parameter.
//    Response prompts the caller via DTMF and stores their input as WorkerId.
//
//  Step B — WorkerId provided:
//    Yemot calls the same URL again, now with ?WorkerId={digits}.
//    Response returns the personalised TTS status message.
exports.yemotPersonal = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    logger.info("yemotPersonal called", { query: req.query });
    // Yemot may return the collected digits under several key names depending on
    // the read-command syntax used and the PBX firmware version.  Check all
    // known variants across both query-string (GET) and body (POST).
    const body = (req.body ?? {});
    const rawId = (req.query["t-WorkerId"] ||
        body["t-WorkerId"] ||
        req.query["WorkerId"] ||
        body["WorkerId"] ||
        req.query["tts"] ||
        body["tts"] ||
        "").trim();
    // ── Step A: no input yet — ask the caller to dial their donor number ─────
    if (!rawId) {
        ivrSend(res, "read=t-WorkerId=tts,שלום מתרים נא להקיש מספר מתרים וסולמית,no,10,1,7,14,none");
        return;
    }
    // ── Step B: WorkerId received — look up the boy and report their stats ───
    try {
        const snap = await admin_1.db
            .collection("boys")
            .where("donorNumber", "==", rawId)
            .limit(1)
            .get();
        if (snap.empty) {
            ivrSend(res, "id_list_message=t-tts,מספר מתרים לא נמצא במערכת.");
            return;
        }
        const boyDoc = snap.docs[0];
        const boy = boyDoc.data();
        const name = boy["name"] || "מתרים";
        const className = boy["shiur"] || "";
        const collected = ils(boy["totalRaised"] ?? 0);
        const goal = ils(boy["goal"] ?? 0);
        const remaining = Math.max(0, goal - collected);
        ivrSend(res, `id_list_message=t-tts,שלום לך ${name} משיעור ${className}. עד כה אספת ${collected} מתוך היעד שלך שהוא ${goal}. נותרו לך ${remaining} לאיסוף.`);
    }
    catch (err) {
        logger.error("yemotPersonal error", err);
        ivrSend(res, "id_list_message=t-tts,שגיאה במערכת. נסה שנית מאוחר יותר.");
    }
});
//# sourceMappingURL=yemotWebhooks.js.map