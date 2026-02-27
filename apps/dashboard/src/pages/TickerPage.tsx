import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Firestore target ──────────────────────────────────────────────────────────
//  Collection : settings
//  Document   : ticker
//  Fields     : message (string), updatedAt (Timestamp)

const TICKER_DOC = doc(clientDb, "settings", "ticker");

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Live marquee preview ──────────────────────────────────────────────────────

function MarqueePreview({ text }: { text: string }) {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="
        relative overflow-hidden rounded-xl
        border border-cyan-500/30
        bg-slate-950
        shadow-[inset_0_0_30px_rgba(6,182,212,0.05),0_0_0_1px_rgba(6,182,212,0.08)]
        h-12 flex items-center
      "
    >
      {/* Left + right fade edges */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-slate-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0  w-16 z-10 bg-gradient-to-r from-slate-950 to-transparent" />

      {/* Scrolling track */}
      <div
        ref={trackRef}
        className="flex whitespace-nowrap animate-[marquee_18s_linear_infinite]"
        style={{ direction: "rtl" }}
      >
        {/* Duplicate for seamless loop */}
        {[0, 1].map((n) => (
          <span
            key={n}
            className="px-16 text-sm font-bold tracking-wide text-cyan-300"
          >
            {text || "הזן טקסט להצגה בטיקר..."}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

export function TickerPage() {
  const [liveMessage, setLiveMessage] = useState("");
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Timestamp | undefined>();
  const [draft, setDraft]   = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState(false);
  const [showTxs, setShowTxs] = useState(true);

  // ── Real-time listener for the current ticker ───────────────────────────────
  useEffect(() => {
    return onSnapshot(
      TICKER_DOC,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const msg  = (data.message as string) ?? "";
          setLiveMessage(msg);
          setLiveUpdatedAt(data.updatedAt as Timestamp | undefined);
          setShowTxs((data.showTransactions as boolean) ?? true);
          // Pre-fill the draft only on first load (don't clobber user edits)
          setDraft((prev) => (prev === "" ? msg : prev));
        }
      },
      () => setLoadError(true),
    );
  }, []);

  // ── Write handler ───────────────────────────────────────────────────────────
  async function handleUpdate() {
    setSaveState("saving");
    try {
      await setDoc(TICKER_DOC, { message: draft.trim(), updatedAt: serverTimestamp() }, { merge: true });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  async function handleToggleTxs(val: boolean) {
    setShowTxs(val);
    try {
      await setDoc(TICKER_DOC, { showTransactions: val }, { merge: true });
    } catch {
      // revert optimistic update on failure
      setShowTxs(!val);
    }
  }

  const isDirty  = draft.trim() !== liveMessage;
  const isBusy   = saveState === "saving";

  return (
    <div className="space-y-8 max-w-3xl" dir="rtl">

      {/* ── Page heading ── */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">
          ניהול טיקר
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          הודעת הגלילה המוצגת בשידור הTV החי — מתעדכנת בזמן אמת
        </p>
      </div>

      {/* ── Live preview card ── */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm shadow-[0_0_40px_rgba(6,182,212,0.06)]">
        {/* Top stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-sky-400" />

        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-base leading-none">📺</span>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">
              תצוגה מקדימה חיה
            </h2>
            {/* Live dot */}
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          </div>

          <MarqueePreview text={draft} />

          {liveUpdatedAt && (
            <p className="mt-2.5 text-[11px] text-slate-600 text-left" dir="ltr">
              עודכן לאחרונה: {fmtTs(liveUpdatedAt)}
            </p>
          )}
        </div>
      </div>

      {/* ── Editor card ── */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm shadow-[0_0_40px_rgba(6,182,212,0.06)]">
        {/* Top stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-lime-400 to-emerald-400" />

        <div className="px-6 pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-base leading-none">✏️</span>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">
              עריכת הודעה
            </h2>
          </div>

          {/* Textarea */}
          <div className="relative">
            <textarea
              rows={4}
              dir="rtl"
              placeholder="הזן את הטקסט שיופיע בטיקר הגלילה..."
              value={draft}
              onChange={(e) => { setSaveState("idle"); setDraft(e.target.value); }}
              className="
                w-full rounded-xl
                bg-slate-950 border border-slate-700
                text-white placeholder-slate-600
                px-4 py-3 text-sm leading-relaxed resize-none
                transition-colors
                focus:border-cyan-500/70 focus:outline-none focus:ring-1 focus:ring-cyan-500/25
                shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]
              "
            />
            {/* Character counter */}
            <span className="absolute bottom-3 left-3 text-[11px] tabular-nums text-slate-600" dir="ltr">
              {draft.length} תווים
            </span>
          </div>

          {/* Toggle: show recent transactions */}
          <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={showTxs}
                onChange={(e) => void handleToggleTxs(e.target.checked)}
              />
              <div className={`w-10 h-5 rounded-full transition-colors duration-200 ${showTxs ? "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" : "bg-slate-700"}`} />
              <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showTxs ? "translate-x-5" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-slate-300 font-medium">הצג תרומות אחרונות בטיקר</span>
          </label>

          {/* Feedback banner */}
          {loadError && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              ✗ שגיאה בטעינת הנתונים — בדוק את חיבור ה-Emulator
            </p>
          )}
          {saveState === "error" && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              ✗ שגיאה בשמירה — נסה שנית
            </p>
          )}
          {saveState === "saved" && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400">
              ✓ הטיקר עודכן בהצלחה — השידור יתרענן אוטומטית
            </p>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between gap-4 pt-1">
            {/* Dirty indicator */}
            <p className="text-xs text-slate-600">
              {isDirty
                ? <span className="text-amber-400 font-semibold">• שינויים לא שמורים</span>
                : <span>הודעה נוכחית בשידור</span>
              }
            </p>

            <div className="flex items-center gap-3">
              {/* Reset to live */}
              {isDirty && (
                <button
                  type="button"
                  onClick={() => { setDraft(liveMessage); setSaveState("idle"); }}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  בטל שינויים
                </button>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={() => void handleUpdate()}
                disabled={isBusy || !isDirty}
                className="
                  group relative flex items-center gap-2.5 overflow-hidden
                  rounded-xl px-6 py-2.5 text-sm font-black text-white
                  bg-gradient-to-r from-cyan-500 to-sky-500
                  shadow-[0_4px_20px_rgba(6,182,212,0.4)]
                  hover:from-cyan-400 hover:to-sky-400
                  hover:shadow-[0_6px_28px_rgba(6,182,212,0.6)]
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-cyan-500/60 focus:ring-offset-2 focus:ring-offset-slate-950
                "
              >
                {/* Shimmer sweep */}
                <span className="pointer-events-none absolute inset-0 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-700 bg-gradient-to-l from-transparent via-white/15 to-transparent skew-x-12" />

                {isBusy ? (
                  <>
                    <svg className="relative h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="relative">מעדכן...</span>
                  </>
                ) : (
                  <>
                    <svg className="relative h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12zm0 0h7.5" />
                    </svg>
                    <span className="relative">עדכן הודעה</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Info box ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-xs text-slate-600 leading-relaxed space-y-1">
        <p className="font-bold text-slate-500 uppercase tracking-widest text-[10px] mb-2">מידע טכני</p>
        <p>• Firestore path: <code className="text-cyan-500/80 font-mono">settings / ticker</code> — fields: <code className="text-cyan-500/80 font-mono">message</code>, <code className="text-cyan-500/80 font-mono">showTransactions</code></p>
        <p>• הטיקר על מסך הTV מאזין לשינויים בזמן אמת — אין צורך לרענן</p>
        <p>• מחיקת הטקסט ולחיצה על "עדכן" תסיר את ההודעה המותאמת מהטיקר</p>
        <p>• מתג "הצג תרומות" נשמר מיידית ומשפיע על השידור בלי ללחוץ שמור</p>
      </div>

    </div>
  );
}
