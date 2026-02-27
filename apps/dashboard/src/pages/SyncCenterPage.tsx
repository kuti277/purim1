// ─── Main Page ─────────────────────────────────────────────────────────────────
// Sync is fully managed server-side. No client-side controls are exposed.

export function SyncCenterPage() {
  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">

      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">מרכז סנכרון</h1>
        <p className="mt-1 text-sm text-slate-500">
          חיבור וסנכרון עסקאות עם מערכת נדרים פלוס
        </p>
      </div>

      {/* ── Sync engine status card ── */}
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
              <p className="text-xs text-slate-500">סנכרון אוטומטי עם נדרים פלוס</p>
            </div>
          </div>

          {/* Static server-managed status */}
          <div className="flex items-start gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
            <p className="text-sm leading-relaxed text-emerald-300">
              הסנכרון מנוהל בצורה מאובטחת ואוטומטית ברקע על ידי שרתי המערכת (כל 3 דקות).
              אין צורך בהתערבות ידנית.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
