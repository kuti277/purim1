import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../lib/admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Round to whole ILS — the IVR reads integers more naturally */
function ils(n: number): number {
  return Math.round(n);
}

/** Minimal shape of the Express Response we actually use */
interface PlainRes {
  setHeader(name: string, value: string): void;
  send(body: string): unknown;
}

/** Send a plain-text Yemot id_list_message response */
function ivrSend(res: PlainRes, body: string): void {
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

export const yemotGeneral = onRequest({ cors: true }, async (req, res) => {
  logger.info("yemotGeneral called", { method: req.method });

  try {
    // ── 1. Global campaign goal ──────────────────────────────────────────────
    const settingsSnap = await db.collection("settings").doc("global").get();
    const globalGoal: number = settingsSnap.exists
      ? ((settingsSnap.data()?.globalGoal as number) ?? 0)
      : 0;

    // ── 2. Sum all non-cancelled transactions ────────────────────────────────
    const txSnap = await db
      .collection("transactions")
      .where("status", "!=", "cancelled")
      .get();

    let totalRaised = 0;
    txSnap.forEach((doc) => {
      totalRaised += (doc.data().amount as number) ?? 0;
    });

    const donorsCount = txSnap.size;
    const remaining   = Math.max(0, globalGoal - totalRaised);
    const pct         = globalGoal > 0
      ? Math.min(100, Math.round((totalRaised / globalGoal) * 100))
      : 0;

    ivrSend(res,
      `id_list_message=` +
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
      `t-אחוזים`
    );
  } catch (err) {
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

export const yemotPersonal = onRequest({ cors: true }, async (req, res) => {
  logger.info("yemotPersonal called", { query: req.query });

  // Yemot may return the collected digits under several key names depending on
  // the read-command syntax used and the PBX firmware version.  Check all
  // known variants across both query-string (GET) and body (POST).
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawId = (
    (req.query["t-WorkerId"] as string) ||
    (body["t-WorkerId"]      as string) ||
    (req.query["WorkerId"]   as string) ||
    (body["WorkerId"]        as string) ||
    (req.query["tts"]        as string) ||
    (body["tts"]             as string) ||
    ""
  ).trim();

  // ── Step A: no input yet — ask the caller to dial their donor number ─────
  if (!rawId) {
    ivrSend(
      res,
      "read=t-WorkerId=tts,שלום מתרים נא להקיש מספר מתרים וסולמית,no,10,1,7,14,none",
    );
    return;
  }

  // ── Step B: WorkerId received — look up the boy and report their stats ───
  try {
    const snap = await db
      .collection("boys")
      .where("donorNumber", "==", rawId)
      .limit(1)
      .get();

    if (snap.empty) {
      ivrSend(res, "id_list_message=t-tts,מספר מתרים לא נמצא במערכת.");
      return;
    }

    const boyDoc    = snap.docs[0];
    const boy       = boyDoc.data();
    const name      = (boy["name"]        as string) || "מתרים";
    const className = (boy["shiur"]       as string) || "";
    const collected = ils((boy["totalRaised"] as number) ?? 0);
    const goal      = ils((boy["goal"]        as number) ?? 0);
    const remaining = Math.max(0, goal - collected);

    ivrSend(
      res,
      `id_list_message=t-tts,שלום לך ${name} משיעור ${className}. עד כה אספת ${collected} מתוך היעד שלך שהוא ${goal}. נותרו לך ${remaining} לאיסוף.`,
    );
  } catch (err) {
    logger.error("yemotPersonal error", err);
    ivrSend(res, "id_list_message=t-tts,שגיאה במערכת. נסה שנית מאוחר יותר.");
  }
});
