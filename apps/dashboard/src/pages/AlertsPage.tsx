import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemAlert {
  id: string;
  type: string;
  message: string;
  timestamp: Timestamp | null;
  severity: "info" | "warning" | "error";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const SEVERITY_STYLES: Record<SystemAlert["severity"], string> = {
  info:    "bg-cyan-500/10  text-cyan-400  ring-cyan-400/30",
  warning: "bg-amber-500/10 text-amber-400 ring-amber-400/30",
  error:   "bg-red-500/10   text-red-400   ring-red-400/30",
};

const SEVERITY_LABELS: Record<SystemAlert["severity"], string> = {
  info:    "מידע",
  warning: "אזהרה",
  error:   "שגיאה",
};

const TYPE_LABELS: Record<string, string> = {
  transaction_cancelled: "עסקה בוטלה",
  offline_donation:      "תרומה אופליין",
  boy_released:          "מתרים שוחרר",
  boy_recalled:          "מתרים הוחזר",
  sync_completed:        "סנכרון הושלם",
  sync_error:            "שגיאת סנכרון",
  system_event:          "אירוע מערכת",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const { user } = useAuth();

  // ── System log ───────────────────────────────────────────────────────────
  const [alerts, setAlerts]     = useState<SystemAlert[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(clientDb, "system_alerts"),
        orderBy("timestamp", "desc"),
        limit(100)
      ),
      (snap) => {
        setAlerts(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SystemAlert, "id">),
            severity: (d.data().severity as SystemAlert["severity"]) ?? "info",
          }))
        );
        setLogLoading(false);
      },
      (err) => {
        console.error("[AlertsPage] system_alerts error:", err);
        setLogLoading(false);
      }
    );
    return unsub;
  }, []);

  // ── Showcase popup trigger ────────────────────────────────────────────────
  const [popupMsg, setPopupMsg]       = useState("");
  const [imageUrl, setImageUrl]       = useState("");
  const [displayMode, setDisplayMode] = useState<"text" | "image" | "text_on_image">("text");
  const [duration, setDuration]       = useState(7);
  const [isInfinite, setIsInfinite]   = useState(false);
  const [pushing, setPushing]         = useState(false);
  const [killing, setKilling]         = useState(false);
  const [pushResult, setPushResult]   = useState<{ ok: boolean; text: string } | null>(null);
  const pushResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pushResultTimer.current) clearTimeout(pushResultTimer.current);
    };
  }, []);

  function showFeedback(ok: boolean, text: string) {
    setPushResult({ ok, text });
    if (pushResultTimer.current) clearTimeout(pushResultTimer.current);
    pushResultTimer.current = setTimeout(() => setPushResult(null), 4000);
  }

  async function handlePushPopup() {
    const needsText  = displayMode === "text" || displayMode === "text_on_image";
    const needsImage = displayMode === "image" || displayMode === "text_on_image";
    if (needsText  && !popupMsg.trim())  { showFeedback(false, "יש להזין תוכן הודעה"); return; }
    if (needsImage && !imageUrl.trim())  { showFeedback(false, "יש להזין קישור לתמונה"); return; }
    setPushing(true);
    setPushResult(null);
    try {
      await setDoc(doc(clientDb, "settings", "showcase_popup"), {
        message:     popupMsg.trim(),
        imageUrl:    imageUrl.trim(),
        displayMode,
        duration,
        isInfinite,
        triggeredAt: serverTimestamp(),
        triggeredBy: user?.displayName ?? "מנהל",
        isActive:    true,
      });
      setPopupMsg("");
      setImageUrl("");
      showFeedback(true, "✓ הפופאפ הוצף למסך הראווה");
    } catch (err) {
      console.error("[AlertsPage] push popup error:", err);
      showFeedback(false, "שגיאה — לא ניתן לשלוח את ההודעה");
    } finally {
      setPushing(false);
    }
  }

  async function handleKillPopup() {
    setKilling(true);
    try {
      await setDoc(
        doc(clientDb, "settings", "showcase_popup"),
        { isActive: false },
        { merge: true }
      );
      showFeedback(true, "⏹ ההודעה כובתה בהצלחה");
    } catch (err) {
      console.error("[AlertsPage] kill popup error:", err);
      showFeedback(false, "שגיאה — לא ניתן לכבות את ההודעה");
    } finally {
      setKilling(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl" dir="rtl">

      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">התראות והודעות</h1>
        <p className="mt-1 text-sm text-slate-500">
          יומן אירועי מערכת בזמן אמת ושליחת הודעות מיידיות למסך הראווה
        </p>
      </div>

      {/* ── Section 2: Showcase Popup Trigger ── */}
      <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden shadow-[0_0_40px_rgba(168,85,247,0.06)]">
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-purple-500 to-pink-500" />
        <div className="p-6 space-y-5">

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 ring-1 ring-purple-500/30">
              <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-black text-white">קפיצת מסך ראווה</h2>
              <p className="text-xs text-slate-500">שלח הודעה מיידית שתצוץ על גבי מסך הראווה</p>
            </div>
          </div>

          {/* ── Row 1: display mode · duration · infinite ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

            {/* Display mode */}
            <div>
              <label className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                סוג תצוגה
              </label>
              <select
                value={displayMode}
                onChange={(e) => setDisplayMode(e.target.value as typeof displayMode)}
                disabled={pushing}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white px-3 py-2.5 text-sm focus:border-purple-500/70 focus:outline-none focus:ring-1 focus:ring-purple-500/25 disabled:opacity-40"
              >
                <option value="text">טקסט בלבד</option>
                <option value="image">תמונה בלבד</option>
                <option value="text_on_image">טקסט על גבי תמונה</option>
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                זמן תצוגה (שניות)
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={pushing || isInfinite}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white px-3 py-2.5 text-sm focus:border-purple-500/70 focus:outline-none focus:ring-1 focus:ring-purple-500/25 disabled:opacity-40"
              >
                {[5, 10, 15, 20].map((s) => (
                  <option key={s} value={s}>{s} שניות</option>
                ))}
              </select>
            </div>

            {/* Infinite toggle */}
            <div className="flex flex-col justify-end">
              <label className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                זמן ידני
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={isInfinite}
                onClick={() => setIsInfinite((v) => !v)}
                disabled={pushing}
                className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isInfinite ? "bg-purple-500" : "bg-slate-600"}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${isInfinite ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                </span>
                <span className={isInfinite ? "text-purple-300" : "text-slate-500"}>
                  {isInfinite ? "עד לכיבוי ידני" : "ידני — השאר עד כיבוי"}
                </span>
              </button>
            </div>
          </div>

          {/* ── Row 2: Message input (hidden for image-only) ── */}
          {displayMode !== "image" && (
            <div>
              <label htmlFor="popup-msg" className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                תוכן ההודעה
              </label>
              <input
                id="popup-msg"
                type="text"
                dir="rtl"
                placeholder="הזן הודעה שתוצג על המסך..."
                value={popupMsg}
                onChange={(e) => setPopupMsg(e.target.value)}
                disabled={pushing}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm transition-colors focus:border-purple-500/70 focus:outline-none focus:ring-1 focus:ring-purple-500/25 disabled:opacity-40"
              />
            </div>
          )}

          {/* ── Row 3: Image URL (hidden for text-only) ── */}
          {displayMode !== "text" && (
            <div>
              <label htmlFor="popup-img" className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                קישור לתמונה
              </label>
              <input
                id="popup-img"
                type="url"
                dir="ltr"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={pushing}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm font-mono transition-colors focus:border-purple-500/70 focus:outline-none focus:ring-1 focus:ring-purple-500/25 disabled:opacity-40"
              />
            </div>
          )}

          {/* ── Row 4: Action buttons ── */}
          <div className="flex items-center gap-3">
            {/* Push button */}
            <button
              type="button"
              onClick={() => void handlePushPopup()}
              disabled={pushing || killing}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-black text-white shadow-[0_0_16px_rgba(168,85,247,0.3)] hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {pushing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  שולח...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                  הקפץ למסך ראווה
                </>
              )}
            </button>

            {/* Kill button */}
            <button
              type="button"
              onClick={() => void handleKillPopup()}
              disabled={pushing || killing}
              className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-black text-red-400 hover:bg-red-500/20 hover:border-red-400/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {killing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  מכבה...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                  </svg>
                  כבה הודעה עכשיו
                </>
              )}
            </button>
          </div>

          {pushResult && (
            <div className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
              pushResult.ok
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {pushResult.text}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 1: System Alert Log ── */}
      <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-emerald-500" />

        {/* Card header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-black text-white">יומן אירועי מערכת</h2>
              <p className="text-xs text-slate-500">עדכון בזמן אמת — 100 רשומות אחרונות</p>
            </div>
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">LIVE</span>
          </div>
        </div>

        {/* Log body */}
        {logLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-cyan-500 border-t-transparent" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <svg className="h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
            <p className="text-sm font-medium text-slate-600">אין אירועי מערכת עדיין</p>
            <p className="text-xs text-slate-700">אירועים כגון ביטולי עסקאות ותרומות יופיעו כאן בזמן אמת</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["חומרה", "סוג", "הודעה", "זמן"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert, i) => (
                  <tr
                    key={alert.id}
                    className={`border-b border-slate-800/50 transition-colors hover:bg-slate-800/30 ${
                      i === 0 ? "bg-slate-800/20" : ""
                    }`}
                  >
                    {/* Severity */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${SEVERITY_STYLES[alert.severity]}`}>
                        {SEVERITY_LABELS[alert.severity]}
                      </span>
                    </td>

                    {/* Type */}
                    <td className="px-5 py-3 text-xs font-medium text-slate-300 whitespace-nowrap">
                      {TYPE_LABELS[alert.type] ?? alert.type}
                    </td>

                    {/* Message */}
                    <td className="px-5 py-3 text-sm text-white max-w-sm truncate">
                      {alert.message}
                    </td>

                    {/* Timestamp */}
                    <td className="px-5 py-3 text-xs tabular-nums text-slate-500 whitespace-nowrap">
                      {formatTs(alert.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
