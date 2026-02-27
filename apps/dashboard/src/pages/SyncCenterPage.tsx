import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SyncLog {
  ts: number;          // Date.now()
  type: "auto" | "manual";
  ok: boolean;
  msg: string;
}

// ─── Mock sync helper ──────────────────────────────────────────────────────────
// Simulates fetching new donations from Nedarim Plus and writing them to
// the transactions collection.  Returns the number of rows written.

async function runNedarimSync(): Promise<number> {
  const count = Math.floor(Math.random() * 3) + 1; // 1–3 mock transactions

  const MOCK_NAMES = [
    "ישראל ישראלי", "שמעון כהן", "דוד לוי", "משה אברהמי",
    "אריה ברגמן", "יצחק פרידמן", "יעקב שטיין", "אברהם רוזנברג",
  ];
  const MOCK_DEDICATIONS = [
    "לעילוי נשמת", "לרפואת", "לכבוד", "לזכר", "בעילום שם", "—",
  ];

  for (let i = 0; i < count; i++) {
    const amount     = (Math.floor(Math.random() * 50) + 1) * 50; // 50–2500 in steps of 50
    const donorName  = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
    const dedication = MOCK_DEDICATIONS[Math.floor(Math.random() * MOCK_DEDICATIONS.length)];

    await addDoc(collection(clientDb, "transactions"), {
      type:        "donation",
      amount,
      targetId:    "general",
      targetType:  "general",
      targetName:  "כללי",
      dedication:  dedication !== "—" ? dedication : "",
      donorName,
      source:      "nedarim_plus",
      date:        serverTimestamp(),
      status:      "completed",
      splitDetails: [],
    });
  }

  return count;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function SyncCenterPage() {
  // Auto-sync toggle (persisted in Firestore settings/apiKeys.autoSync)
  const [autoSync, setAutoSync] = useState(false);
  const [syncTogglingId, setSyncTogglingId] = useState(false);

  // Manual sync
  const [syncing, setSyncing]   = useState(false);

  // Activity log (in-memory, session only)
  const [logs, setLogs]         = useState<SyncLog[]>([]);

  // Countdown to next auto-sync
  const [countdown, setCountdown] = useState(180); // 3 min
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load autoSync state from Firestore ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(clientDb, "settings", "apiKeys")).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const d = snap.data() as { autoSync?: boolean };
      if (d.autoSync !== undefined) setAutoSync(!!d.autoSync);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, []);

  // ── Auto-sync interval management ────────────────────────────────────────────
  useEffect(() => {
    if (autoSync) {
      setCountdown(180);

      // Countdown ticker
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) return 180; // will be reset by sync trigger below
          return c - 1;
        });
      }, 1_000);

      // Actual sync every 3 minutes
      intervalRef.current = setInterval(() => {
        setCountdown(180);
        runNedarimSync()
          .then((n) => {
            addLog("auto", true, `✓ סונכרן — ${n} עסקאות חדשות נכתבו`);
          })
          .catch((err) => {
            console.error("[SyncCenter] auto-sync error:", err);
            addLog("auto", false, `✗ שגיאת סנכרון: ${String(err)}`);
          });
      }, 180_000);
    } else {
      if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      setCountdown(180);
    }

    return () => {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoSync]);

  function addLog(type: SyncLog["type"], ok: boolean, msg: string) {
    setLogs((prev) => [{ ts: Date.now(), type, ok, msg }, ...prev].slice(0, 50));
  }

  // ── Toggle auto-sync ──────────────────────────────────────────────────────────
  async function handleToggleAutoSync(val: boolean) {
    setSyncTogglingId(true);
    const prev = autoSync;
    setAutoSync(val);
    try {
      await setDoc(doc(clientDb, "settings", "apiKeys"), { autoSync: val }, { merge: true });
      addLog("auto", true, val ? "✓ סנכרון אוטומטי הופעל" : "⏹ סנכרון אוטומטי הופסק");
    } catch (err) {
      console.error("[SyncCenter] toggle error:", err);
      setAutoSync(prev);
    } finally {
      setSyncTogglingId(false);
    }
  }

  // ── Manual sync ───────────────────────────────────────────────────────────────
  async function handleManualSync() {
    setSyncing(true);
    try {
      const n = await runNedarimSync();
      addLog("manual", true, `✓ סנכרן ידני — ${n} עסקאות נכתבו`);
    } catch (err) {
      console.error("[SyncCenter] manual sync error:", err);
      addLog("manual", false, `✗ שגיאת סנכרון: ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">

      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">מרכז סנכרון</h1>
        <p className="mt-1 text-sm text-slate-500">
          חיבור וסנכרון עסקאות עם מערכת נדרים פלוס
        </p>
      </div>

      {/* ── Sync controls card ── */}
      <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden shadow-[0_0_40px_rgba(52,211,153,0.05)]">
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-sky-500" />
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-black text-white">מנוע סנכרון</h2>
              <p className="text-xs text-slate-500">סנכרון אוטומטי ו/או ידני עם נדרים פלוס</p>
            </div>
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-5 py-4">
            <div>
              <p className="text-sm font-bold text-white">סנכרון אוטומטי — נדרים פלוס</p>
              <p className="mt-0.5 text-xs text-slate-500">מבצע סנכרון כל 3 דקות ברקע</p>
              {autoSync && (
                <p className="mt-1 text-xs tabular-nums text-cyan-400">
                  ⏱ סנכרון הבא בעוד <span className="font-bold">{mm}:{ss}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSync}
              disabled={syncTogglingId}
              onClick={() => void handleToggleAutoSync(!autoSync)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                autoSync
                  ? "bg-cyan-500 shadow-[0_0_14px_rgba(6,182,212,0.6)]"
                  : "bg-slate-700"
              }`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoSync ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Manual sync button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleManualSync()}
              disabled={syncing}
              className="flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-transparent px-5 py-2.5 text-sm font-bold text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {syncing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  מסנכרן...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  סנכרן עכשיו
                </>
              )}
            </button>
            <p className="text-xs text-slate-600">
              מושך עסקאות חדשות ידנית ממערכת נדרים פלוס
            </p>
          </div>
        </div>
      </div>

      {/* ── Activity log ── */}
      <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-slate-600 to-slate-700" />
        <div className="px-5 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">יומן פעילות</h2>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-xs text-slate-700 hover:text-slate-500 transition-colors"
            >
              נקה
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-700">אין פעילות עדיין</p>
          ) : logs.map((log) => (
            <div
              key={log.ts}
              className="flex items-start gap-3 border-b border-slate-800/50 px-5 py-3"
            >
              <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${log.ok ? "bg-emerald-400" : "bg-red-400"}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium ${log.ok ? "text-emerald-300" : "text-red-300"}`}>{log.msg}</p>
                <p className="mt-0.5 text-[10px] tabular-nums text-slate-600">
                  {new Date(log.ts).toLocaleTimeString("he-IL")}
                  {" · "}
                  <span className={`font-semibold ${log.type === "auto" ? "text-cyan-700" : "text-purple-700"}`}>
                    {log.type === "auto" ? "אוטומטי" : "ידני"}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
