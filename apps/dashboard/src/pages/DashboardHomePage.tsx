import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

// ─── Single source of truth ───────────────────────────────────────────────────
//
// Sums the `amount` of every non-cancelled transaction directly.
// This never drifts from reality even if the boys.totalRaised denormal
// field lags (e.g. Cloud Functions haven't processed pending docs yet).

function useAllTimeCampaignTotal(): number {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    return onSnapshot(
      collection(clientDb, "transactions"),
      (snap) => {
        const sum = snap.docs.reduce((s, d) => {
          const data = d.data();
          if (data.status === "cancelled") return s;
          return s + ((data.amount as number) ?? 0);
        }, 0);
        setTotal(sum);
      },
      (err) => console.error("[useAllTimeCampaignTotal] snapshot error:", err),
    );
  }, []);
  return total;
}
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoyRow {
  id: string;
  name: string;
  shiur: string;
  totalRaised: number;
  goal: number;
  status?: string;
}

interface TxRow {
  id: string;
  targetName: string;
  targetType: string;
  amount: number;
  date: Timestamp;
  dedication?: string;
  status: string;
  type: string; // "cash" | "credit"
}

// ─── Progress zone helpers ────────────────────────────────────────────────────

function pct(raised: number, goal: number): number {
  return goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
}

function getZone(p: number) {
  if (p >= 90) return { bar: "bg-emerald-400", text: "text-emerald-400" };
  if (p >= 50) return { bar: "bg-orange-400",  text: "text-orange-400"  };
  if (p >= 25) return { bar: "bg-yellow-400",  text: "text-yellow-300"  };
  return              { bar: "bg-red-500",      text: "text-red-400"     };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function nis(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency", currency: "ILS",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtTime(ts: Timestamp): string {
  return ts.toDate().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCsv(rows: TxRow[]) {
  const BOM     = "\uFEFF";
  const headers = ["תאריך", "שעה", "מגיס", "הקדשה", "סכום", "אמצעי תשלום", "סטטוס"];
  const lines   = rows.map((r) => {
    const d           = r.date.toDate();
    const typeLabel   = r.type === "cash" ? "מזומן" : "אשראי";
    const statusLabel = r.status === "completed" ? "הושלם" : r.status === "cancelled" ? "בוטל" : r.status;
    return [
      d.toLocaleDateString("he-IL"),
      d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      `"${r.targetName}"`,
      `"${r.dedication ?? ""}"`,
      r.amount,
      typeLabel,
      statusLabel,
    ].join(",");
  });
  const csv  = BOM + [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `עסקאות_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Firestore hooks ──────────────────────────────────────────────────────────

function useBoys(): BoyRow[] {
  const [boys, setBoys] = useState<BoyRow[]>([]);
  useEffect(() => {
    return onSnapshot(
      query(collection(clientDb, "boys"), orderBy("totalRaised", "desc")),
      (snap) => setBoys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoyRow))),
    );
  }, []);
  return boys;
}

function useTransactions(): TxRow[] {
  const [txs, setTxs] = useState<TxRow[]>([]);
  useEffect(() => {
    return onSnapshot(
      query(collection(clientDb, "transactions"), orderBy("date", "desc"), limit(500)),
      (snap) => setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TxRow))),
    );
  }, []);
  return txs;
}

interface BinderSummary { id: string; status: string; statusUpdatedAt?: Timestamp }

function useBinders(): BinderSummary[] {
  const [binders, setBinders] = useState<BinderSummary[]>([]);
  useEffect(() => {
    return onSnapshot(
      collection(clientDb, "binders"),
      (snap) => setBinders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BinderSummary))),
    );
  }, []);
  return binders;
}

function isToday(ts: Timestamp | undefined): boolean {
  if (!ts) return false;
  return ts.toDate().toDateString() === new Date().toDateString();
}

// ─── Stat card variants (all class strings are complete for Tailwind scanning) ──

const STAT_STYLES = {
  emerald: {
    card:   "rounded-xl bg-slate-900 border border-emerald-500/30 p-5 shadow-[0_0_25px_rgba(52,211,153,0.08)]",
    label:  "text-xs font-bold uppercase tracking-widest text-emerald-400",
    accent: "h-0.5 w-8 rounded-full bg-emerald-400 mt-3",
  },
  cyan: {
    card:   "rounded-xl bg-slate-900 border border-cyan-500/30 p-5 shadow-[0_0_25px_rgba(6,182,212,0.08)]",
    label:  "text-xs font-bold uppercase tracking-widest text-cyan-400",
    accent: "h-0.5 w-8 rounded-full bg-cyan-400 mt-3",
  },
  orange: {
    card:   "rounded-xl bg-slate-900 border border-orange-500/30 p-5 shadow-[0_0_25px_rgba(251,146,60,0.08)]",
    label:  "text-xs font-bold uppercase tracking-widest text-orange-400",
    accent: "h-0.5 w-8 rounded-full bg-orange-400 mt-3",
  },
  fuchsia: {
    card:   "rounded-xl bg-slate-900 border border-fuchsia-500/30 p-5 shadow-[0_0_25px_rgba(217,70,239,0.08)]",
    label:  "text-xs font-bold uppercase tracking-widest text-fuchsia-400",
    accent: "h-0.5 w-8 rounded-full bg-fuchsia-400 mt-3",
  },
  violet: {
    card:   "rounded-xl bg-slate-900 border border-violet-500/30 p-5 shadow-[0_0_25px_rgba(139,92,246,0.08)]",
    label:  "text-xs font-bold uppercase tracking-widest text-violet-400",
    accent: "h-0.5 w-8 rounded-full bg-violet-400 mt-3",
  },
  teal: {
    card:   "rounded-xl bg-slate-900 border border-teal-500/30 p-5 shadow-[0_0_25px_rgba(20,184,166,0.08)]",
    label:  "text-xs font-bold uppercase tracking-widest text-teal-400",
    accent: "h-0.5 w-8 rounded-full bg-teal-400 mt-3",
  },
} as const;

function StatCard({
  label, value, sub, icon, variant,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  variant: keyof typeof STAT_STYLES;
}) {
  const s = STAT_STYLES[variant];
  return (
    <div className={s.card}>
      <div className="flex items-start justify-between mb-1">
        <p className={s.label}>{label}</p>
        <span className="text-xl leading-none">{icon}</span>
      </div>
      <p className="text-2xl font-black text-white leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      <div className={s.accent} />
    </div>
  );
}

// ─── Section card: colored top-stripe + glass body ────────────────────────────
//
// The stripe is a real DOM div (not a CSS border trick) for cross-browser
// reliability with border-radius clipping.

const SECTION_STRIPES = {
  cyan:   "bg-gradient-to-r from-cyan-500 to-sky-400",
  lime:   "bg-gradient-to-r from-lime-400 to-emerald-400",
  orange: "bg-gradient-to-r from-orange-500 to-pink-500",
} as const;

const SECTION_SHADOWS = {
  cyan:   "shadow-[0_0_40px_rgba(6,182,212,0.06)]",
  lime:   "shadow-[0_0_40px_rgba(163,230,53,0.06)]",
  orange: "shadow-[0_0_40px_rgba(251,146,60,0.06)]",
} as const;

function SectionCard({
  variant, children, className = "",
}: {
  variant: keyof typeof SECTION_STRIPES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`
        relative rounded-2xl overflow-hidden
        bg-slate-900/60 backdrop-blur-sm
        border border-slate-700/60
        ${SECTION_SHADOWS[variant]} ${className}
      `}
    >
      {/* Colored stripe at the very top */}
      <div className={`absolute top-0 inset-x-0 h-[3px] ${SECTION_STRIPES[variant]}`} />
      {children}
    </div>
  );
}

// Accent color class sets per section variant (full strings for scanner)
const ACCENT = {
  cyan:   { heading: "text-cyan-400",   badge: "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30",   hr: "bg-gradient-to-l from-cyan-500/40 via-cyan-500/10 to-transparent"   },
  lime:   { heading: "text-lime-400",   badge: "bg-lime-500/15 text-lime-300 ring-1 ring-lime-500/30",   hr: "bg-gradient-to-l from-lime-500/40 via-lime-500/10 to-transparent"   },
  orange: { heading: "text-orange-400", badge: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30", hr: "bg-gradient-to-l from-orange-500/40 via-orange-500/10 to-transparent" },
} as const;

function SectionHeader({
  icon, title, variant, count,
}: {
  icon: string;
  title: string;
  variant: keyof typeof ACCENT;
  count?: number;
}) {
  const ac = ACCENT[variant];
  return (
    <div className="flex items-center gap-3 px-6 pt-7 pb-4 border-b border-slate-800">
      <span className="text-xl leading-none">{icon}</span>
      <h2 className={`text-base font-bold text-white`}>{title}</h2>
      {count !== undefined && (
        <span className={`mr-auto text-xs font-bold tabular-nums px-2.5 py-0.5 rounded-full ${ac.badge}`}>
          {count}
        </span>
      )}
      <div className={`flex-1 h-px ${ac.hr}`} />
    </div>
  );
}

// Input style for the orange (transaction) section — full string for Tailwind
const TX_INPUT =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-white " +
  "placeholder-slate-500 px-3 py-2 text-sm transition-colors " +
  "focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/25";

const TX_LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500";

// ─── Section 1: Donations Trend Chart (CYAN) ──────────────────────────────────

function ChartSection({ txs }: { txs: TxRow[] }) {
  // Build cumulative hourly data for today from real transactions
  const hourlyData = useMemo(() => {
    const today = new Date().toDateString();
    const buckets: Record<number, number> = {};
    txs.forEach((tx) => {
      if (tx.status === "cancelled") return;
      const d = tx.date.toDate();
      if (d.toDateString() !== today) return;
      const h = d.getHours();
      buckets[h] = (buckets[h] ?? 0) + tx.amount;
    });
    let cum = 0;
    return Array.from({ length: 24 }, (_, h) => {
      cum += buckets[h] ?? 0;
      return { hour: `${String(h).padStart(2, "0")}:00`, amount: cum };
    });
  }, [txs]);

  const hasData = hourlyData.some((d) => d.amount > 0);

  return (
    <SectionCard variant="cyan">
      <SectionHeader icon="📈" title='גרף תרומות מצטבר — היום' variant="cyan" />
      <div className="px-2 pt-4 pb-6">
        {!hasData ? (
          <div className="flex h-60 items-center justify-center gap-3 flex-col">
            <svg className="h-10 w-10 text-cyan-500/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <p className="text-sm text-slate-600">אין עסקאות היום עדיין — הגרף יופיע ברגע שתיכנס תרומה ראשונה</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={hourlyData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="cyanAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.30} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.08)" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fill: "#475569", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(71,85,105,0.2)" }}
                interval={3}
              />
              <YAxis
                tick={{ fill: "#475569", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₪${v.toLocaleString("he-IL")}`}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(6,182,212,0.35)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 0 20px rgba(6,182,212,0.15)",
                }}
                labelStyle={{ color: "#64748b", marginBottom: 4 }}
                itemStyle={{ color: "#22d3ee" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`₪${Number(value).toLocaleString("he-IL")}`, 'סה"כ מצטבר']}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#06b6d4"
                strokeWidth={2.5}
                fill="url(#cyanAreaGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#06b6d4", stroke: "#0f172a", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Section 2: Boys performance grid (LIME) ─────────────────────────────────

const RANK_META = [
  { label: "🥇", card: "ring-2 ring-yellow-400/50 shadow-[0_0_20px_rgba(234,179,8,0.15)]" },
  { label: "🥈", card: "ring-1 ring-slate-500/50" },
  { label: "🥉", card: "ring-1 ring-amber-700/40" },
] as const;

function BoysSection({ boys }: { boys: BoyRow[] }) {
  return (
    <SectionCard variant="lime">
      <SectionHeader icon="🏆" title="ביצועי מגיסים בזמן אמת" variant="lime" count={boys.length} />
      <div className="p-6">
        {boys.length === 0 ? (
          <p className="py-10 text-center text-slate-600 text-sm">אין נתוני מגיסים עדיין</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {boys.map((boy, i) => {
              const p    = pct(boy.totalRaised, boy.goal);
              const zone = getZone(p);
              const rank = RANK_META[i];

              return (
                <div
                  key={boy.id}
                  className={`
                    flex flex-col rounded-xl p-4 transition-all duration-200
                    bg-slate-800/80 border border-slate-700/60
                    hover:border-lime-500/40 hover:shadow-[0_0_16px_rgba(163,230,53,0.1)]
                    ${rank?.card ?? ""}
                  `}
                >
                  {/* Rank + in-field dot */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl leading-none">
                      {rank?.label ?? <span className="text-slate-600 text-sm font-bold">#{i + 1}</span>}
                    </span>
                    {boy.status === "in_field" && (
                      <span
                        className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                        title="בשטח"
                      />
                    )}
                  </div>

                  {/* Name & shiur */}
                  <p className="text-sm font-bold text-white leading-tight mb-0.5 truncate">
                    {boy.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3 truncate">שיעור {boy.shiur}</p>

                  {/* Progress bar — zone-colored for meaningful communication */}
                  <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${zone.bar}`}
                      style={{ width: `${p}%` }}
                    />
                  </div>

                  {/* Amount + pct */}
                  <div className="mt-2 flex items-baseline justify-between gap-1">
                    <span className="text-xs font-bold text-white tabular-nums">
                      {nis(boy.totalRaised)}
                    </span>
                    <span className={`text-[10px] font-bold tabular-nums ${zone.text}`}>
                      {p.toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-600 truncate">
                    יעד {nis(boy.goal)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Section 3: Transaction history (ORANGE) ─────────────────────────────────

// Badge styles — complete strings for scanner
const TYPE_BADGE: Record<string, string> = {
  cash:   "rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40",
  credit: "rounded-full px-2.5 py-0.5 text-xs font-bold bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40",
};
const TYPE_LABEL: Record<string, string> = { cash: "מזומן", credit: "אשראי" };

const STATUS_BADGE: Record<string, string> = {
  completed: "rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40",
  cancelled: "rounded-full px-2.5 py-0.5 text-xs font-bold bg-red-400/15 text-red-300 ring-1 ring-red-400/40",
  pending:   "rounded-full px-2.5 py-0.5 text-xs font-bold bg-yellow-400/15 text-yellow-300 ring-1 ring-yellow-400/40",
};
const STATUS_LABEL: Record<string, string> = { completed: "הושלם", cancelled: "בוטל", pending: "ממתין" };

function TransactionSection({ txs }: { txs: TxRow[] }) {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [nameSearch,      setNameSearch]      = useState("");
  const [filterDate,      setFilterDate]      = useState("");
  const [filterTime,      setFilterTime]      = useState("");
  const [filterAmtMin,    setFilterAmtMin]    = useState("");
  const [filterType,      setFilterType]      = useState("");
  const [filterCollector, setFilterCollector] = useState("");

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return txs.filter((r) => {
      const d       = r.date.toDate();
      const dateStr = d.toISOString().slice(0, 10);
      const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

      if (nameSearch.trim()) {
        const q = nameSearch.trim().toLowerCase();
        if (!r.targetName.toLowerCase().includes(q) && !(r.dedication ?? "").toLowerCase().includes(q))
          return false;
      }
      if (filterCollector.trim()) {
        if (!r.targetName.toLowerCase().includes(filterCollector.trim().toLowerCase())) return false;
      }
      if (filterDate && dateStr !== filterDate)                       return false;
      if (filterTime && timeStr < filterTime)                         return false;
      if (filterAmtMin && r.amount < parseFloat(filterAmtMin))       return false;
      if (filterType && r.type !== filterType)                        return false;
      return true;
    });
  }, [txs, nameSearch, filterDate, filterTime, filterAmtMin, filterType, filterCollector]);

  const totalAmount    = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);
  const cancelledCount = useMemo(() => filtered.filter((r) => r.status === "cancelled").length, [filtered]);

  const hasFilter = !!(nameSearch || filterDate || filterTime || filterAmtMin || filterType || filterCollector);

  function clearFilters() {
    setNameSearch(""); setFilterDate(""); setFilterTime("");
    setFilterAmtMin(""); setFilterType(""); setFilterCollector("");
  }

  return (
    <SectionCard variant="orange">
      <SectionHeader icon="📋" title="היסטוריית עסקאות" variant="orange" count={filtered.length} />

      <div className="p-6 space-y-5">

        {/* ── Filter bar ── */}
        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-orange-400/70">
            🔍 סינון מתקדם
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className={TX_LABEL}>חיפוש חופשי</label>
              <input type="text" placeholder="שם, הקדשה..." value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)} className={TX_INPUT} />
            </div>
            <div>
              <label className={TX_LABEL}>שם מגיס</label>
              <input type="text" placeholder="שם הבחור..." value={filterCollector}
                onChange={(e) => setFilterCollector(e.target.value)} className={TX_INPUT} />
            </div>
            <div>
              <label className={TX_LABEL}>תאריך</label>
              <input type="date" value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className={TX_INPUT + " [color-scheme:dark]"} />
            </div>
            <div>
              <label className={TX_LABEL}>שעה (מ-)</label>
              <input type="time" value={filterTime}
                onChange={(e) => setFilterTime(e.target.value)}
                className={TX_INPUT + " [color-scheme:dark]"} />
            </div>
            <div>
              <label className={TX_LABEL}>סכום מינ׳ (₪)</label>
              <input type="number" min="0" step="10" placeholder="0" dir="ltr"
                value={filterAmtMin} onChange={(e) => setFilterAmtMin(e.target.value)}
                className={TX_INPUT} />
            </div>
            <div>
              <label className={TX_LABEL}>סוג תשלום</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className={TX_INPUT + " cursor-pointer"}>
                <option value="">הכל</option>
                <option value="cash">מזומן</option>
                <option value="credit">אשראי</option>
              </select>
            </div>
          </div>

          {/* Stats + clear row */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>
                סה״כ:{" "}
                <span className="font-black text-emerald-400">{nis(totalAmount)}</span>
              </span>
              {cancelledCount > 0 && (
                <span>בוטלו: <span className="font-bold text-red-400">{cancelledCount}</span></span>
              )}
            </div>
            {hasFilter && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-orange-400 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                נקה סינון
              </button>
            )}
          </div>
        </div>

        {/* ── Excel download button ── */}
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
            className="
              group relative flex items-center gap-2.5 overflow-hidden
              rounded-xl px-6 py-3 text-sm font-black text-white
              bg-gradient-to-r from-orange-500 to-pink-600
              shadow-[0_4px_20px_rgba(249,115,22,0.45)]
              hover:from-orange-400 hover:to-pink-500
              hover:shadow-[0_6px_30px_rgba(249,115,22,0.65)]
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
              focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-offset-2 focus:ring-offset-slate-950
            "
          >
            {/* Shimmer sweep on hover */}
            <span className="pointer-events-none absolute inset-0 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-700 bg-gradient-to-l from-transparent via-white/20 to-transparent skew-x-12" />
            <svg className="relative h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="relative">📊 הורדה לאקסל</span>
            <span className="relative rounded-lg bg-white/20 px-2 py-0.5 text-xs font-bold tabular-nums">
              {filtered.length} שורות
            </span>
          </button>
        </div>

        {/* ── Transaction table ── */}
        <div className="relative rounded-xl overflow-hidden border border-slate-800">
          <div className="overflow-auto max-h-[520px] no-scrollbar">
            <table className="min-w-full text-sm" dir="rtl">

              {/* Sticky header */}
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 border-b-2 border-orange-500/30">
                  {[
                    "תאריך", "שעה", "מגיס", "הקדשה",
                    "סכום", "אמצעי תשלום", "סטטוס",
                  ].map((h) => (
                    <th key={h}
                      className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-orange-400/80 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-600 text-sm">
                      לא נמצאו עסקאות התואמות את הסינון
                    </td>
                  </tr>
                )}

                {filtered.map((tx, i) => {
                  const isCancelled = tx.status === "cancelled";
                  return (
                    <tr
                      key={tx.id}
                      className={`
                        border-b border-slate-800/60 transition-colors
                        hover:bg-orange-500/[0.04]
                        ${i % 2 === 1 ? "bg-slate-900/30" : "bg-transparent"}
                        ${isCancelled ? "opacity-40" : ""}
                      `}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">
                        {fmtDate(tx.date)}
                      </td>
                      {/* Time */}
                      <td className="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">
                        {fmtTime(tx.date)}
                      </td>
                      {/* Collector */}
                      <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                        {tx.targetName}
                      </td>
                      {/* Dedication */}
                      <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">
                        {tx.dedication ?? <span className="text-slate-700">—</span>}
                      </td>
                      {/* Amount — bright yellow-green for maximum contrast */}
                      <td className="px-4 py-3 font-black text-left tabular-nums whitespace-nowrap text-emerald-400">
                        {nis(tx.amount)}
                      </td>
                      {/* Type badge */}
                      <td className="px-4 py-3">
                        <span className={TYPE_BADGE[tx.type] ?? "text-slate-500 text-xs"}>
                          {TYPE_LABEL[tx.type] ?? tx.type}
                        </span>
                      </td>
                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span className={STATUS_BADGE[tx.status] ?? "text-slate-500 text-xs"}>
                          {STATUS_LABEL[tx.status] ?? tx.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom scroll fade */}
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-slate-900/80 to-transparent" />
        </div>

      </div>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardHomePage() {
  const boys    = useBoys();
  const txs     = useTransactions();
  const binders = useBinders();

  // ── Quick stats (computed) ────────────────────────────────────────────────
  // totalRaised: use the direct transaction sum — single source of truth.
  const totalRaised  = useAllTimeCampaignTotal();
  const inFieldCount = useMemo(() => boys.filter((b) => b.status === "in_field").length, [boys]);
  const todayCount   = useMemo(() => {
    const today = new Date().toDateString();
    return txs.filter((tx) => tx.date.toDate().toDateString() === today && tx.status !== "cancelled").length;
  }, [txs]);
  const topBoy = boys[0] ?? null;

  const bindersCollectingToday = useMemo(
    () => binders.filter((b) => b.status === "collecting" && isToday(b.statusUpdatedAt)).length,
    [binders],
  );
  const bindersCollectedToday = useMemo(
    () => binders.filter((b) => b.status === "collected" && isToday(b.statusUpdatedAt)).length,
    [binders],
  );

  return (
    <div className="space-y-7" dir="rtl">

      {/* Page heading */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            לוח בקרה
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            נתוני זמן אמת ·{" "}
            <span className="text-lime-400 font-semibold">{boys.length} מגיסים רשומים</span>
            {" "}·{" "}
            <span className="text-cyan-400 font-semibold">{inFieldCount} בשטח</span>
          </p>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-2 rounded-full bg-slate-900 border border-slate-800 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="סה״כ נגבה"
          value={nis(totalRaised)}
          icon="💰"
          variant="emerald"
        />
        <StatCard
          label="בשטח עכשיו"
          value={String(inFieldCount)}
          sub={`מתוך ${boys.length} מגיסים`}
          icon="🏃"
          variant="cyan"
        />
        <StatCard
          label="עסקאות היום"
          value={String(todayCount)}
          icon="💳"
          variant="orange"
        />
        <StatCard
          label="מוביל"
          value={topBoy?.name ?? "—"}
          sub={topBoy ? nis(topBoy.totalRaised) : ""}
          icon="🏆"
          variant="fuchsia"
        />
        <StatCard
          label="קלסרים באיסוף היום"
          value={String(bindersCollectingToday)}
          sub={`${binders.length} קלסרים סה״כ`}
          icon="📂"
          variant="violet"
        />
        <StatCard
          label="קלסרים שנאספו היום"
          value={String(bindersCollectedToday)}
          icon="✅"
          variant="teal"
        />
      </div>

      {/* ── Section 1: Chart (Cyan) ── */}
      <ChartSection txs={txs} />

      {/* ── Section 2: Boys performance (Lime) ── */}
      <BoysSection boys={boys} />

      {/* ── Section 3: Transaction history (Orange) ── */}
      <TransactionSection txs={txs} />

    </div>
  );
}
