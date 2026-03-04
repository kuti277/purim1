import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NedarimTx {
  id: string;                      // Firestore doc ID = nedarimTransactionId as string
  nedarimTransactionId?: number;   // numeric Nedarim ID
  donorName?: string;              // ClientName from Nedarim
  dedication?: string;             // raw Comments from Nedarim — may contain [#ID] routing tags
  amount: number;
  boyId?: string;
  boyName?: string;                // empty / undefined = unmatched
  paymentMethod?: string;
  status: string;
  source: string;
  createdAt?: Timestamp;
  date?: Timestamp;                // some manual writes use `date` instead of `createdAt`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nis(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency", currency: "ILS",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtTs(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" })
    + " " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

/** Strip [#123] routing tags before displaying the raw dedication */
function stripTag(s: string | undefined | null): string {
  return (s ?? "").replace(/\[#\d+\]\s*/g, "").trim();
}

function isMatched(tx: NedarimTx): boolean {
  return !!(tx.boyName && tx.boyName.trim() !== "" && tx.boyName !== "כללי");
}

// ─── Firestore hook ───────────────────────────────────────────────────────────

function useNedarimTransactions(): { txs: NedarimTx[]; loading: boolean } {
  const [txs,     setTxs]     = useState<NedarimTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Query all transactions where source == "nedarim".
    // No composite-index-requiring orderBy here — we sort client-side.
    const q = query(
      collection(clientDb, "transactions"),
      where("source", "==", "nedarim"),
      limit(1000),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as NedarimTx));
        // Sort by createdAt desc (fall back to date field for older manual writes)
        rows.sort((a, b) => {
          const ta = (a.createdAt ?? a.date)?.toMillis() ?? 0;
          const tb = (b.createdAt ?? b.date)?.toMillis() ?? 0;
          return tb - ta;
        });
        setTxs(rows);
        setLoading(false);
      },
      (err) => {
        console.error("[useNedarimTransactions]", err);
        setLoading(false);
      },
    );
  }, []);

  return { txs, loading };
}

// ─── Input / Label styles (reuse dashboard conventions) ──────────────────────

const INPUT =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-white " +
  "placeholder-slate-500 px-3 py-2 text-sm transition-colors " +
  "focus:border-violet-500/70 focus:outline-none focus:ring-1 focus:ring-violet-500/25";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function NedarimTransactionsPage() {
  const { txs, loading } = useNedarimTransactions();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchDonor,  setSearchDonor]  = useState("");
  const [searchDedic,  setSearchDedic]  = useState("");
  const [filterMatch,  setFilterMatch]  = useState<"all" | "matched" | "unmatched">("all");

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return txs.filter((tx) => {
      if (searchDonor.trim()) {
        const q = searchDonor.trim().toLowerCase();
        if (!(tx.donorName ?? "").toLowerCase().includes(q)) return false;
      }
      if (searchDedic.trim()) {
        const q = searchDedic.trim().toLowerCase();
        if (!(tx.dedication ?? "").toLowerCase().includes(q)) return false;
      }
      if (filterMatch === "matched"   && !isMatched(tx)) return false;
      if (filterMatch === "unmatched" &&  isMatched(tx)) return false;
      return true;
    });
  }, [txs, searchDonor, searchDedic, filterMatch]);

  // ── Summary counts ────────────────────────────────────────────────────────
  const matchedCount   = useMemo(() => txs.filter(isMatched).length,  [txs]);
  const unmatchedCount = useMemo(() => txs.filter((t) => !isMatched(t)).length, [txs]);
  const filteredTotal  = useMemo(
    () => filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [filtered],
  );

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── Page heading ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            תרומות נדרים פלוס
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            כל העסקאות שסונכרנו אוטומטית ממערכת נדרים פלוס · זמן אמת
          </p>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-2 rounded-full bg-slate-900 border border-slate-800 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse shadow-[0_0_6px_rgba(167,139,250,0.8)]" />
          <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* ── Summary badges ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-900 border border-violet-500/30 p-4 shadow-[0_0_20px_rgba(139,92,246,0.08)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">סה״כ עסקאות</p>
          <p className="mt-1 text-2xl font-black text-white tabular-nums">{txs.length}</p>
        </div>
        <div className="rounded-xl bg-slate-900 border border-emerald-500/30 p-4 shadow-[0_0_20px_rgba(52,211,153,0.08)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">שויכו למגיס</p>
          <p className="mt-1 text-2xl font-black text-white tabular-nums">{matchedCount}</p>
        </div>
        <div className="rounded-xl bg-slate-900 border border-orange-500/30 p-4 shadow-[0_0_20px_rgba(251,146,60,0.08)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">לא שויכו</p>
          <p className="mt-1 text-2xl font-black text-white tabular-nums">{unmatchedCount}</p>
        </div>
        <div className="rounded-xl bg-slate-900 border border-cyan-500/30 p-4 shadow-[0_0_20px_rgba(6,182,212,0.08)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">סכום מוצג</p>
          <p className="mt-1 text-2xl font-black text-white tabular-nums">{nis(filteredTotal)}</p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-violet-400/70">
          🔍 סינון
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              שם תורם
            </label>
            <input
              type="text"
              placeholder="חפש לפי שם תורם..."
              value={searchDonor}
              onChange={(e) => setSearchDonor(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              הערות / הקדשה
            </label>
            <input
              type="text"
              placeholder="חפש בהערות נדרים..."
              value={searchDedic}
              onChange={(e) => setSearchDedic(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              שיוך
            </label>
            <select
              value={filterMatch}
              onChange={(e) => setFilterMatch(e.target.value as "all" | "matched" | "unmatched")}
              className={INPUT + " cursor-pointer"}
            >
              <option value="all">הכל</option>
              <option value="matched">שויכו למגיס</option>
              <option value="unmatched">לא שויכו (כללי)</option>
            </select>
          </div>
        </div>

        {/* Row count */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            מציג <span className="font-bold text-white">{filtered.length}</span> מתוך{" "}
            <span className="font-bold text-white">{txs.length}</span> עסקאות
          </span>
          {(searchDonor || searchDedic || filterMatch !== "all") && (
            <button
              type="button"
              onClick={() => { setSearchDonor(""); setSearchDedic(""); setFilterMatch("all"); }}
              className="flex items-center gap-1 text-slate-500 hover:text-violet-400 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              נקה סינון
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900/60 border border-slate-700/60 shadow-[0_0_40px_rgba(139,92,246,0.06)]">
        {/* Violet top stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-violet-500 to-purple-400" />

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-800">
          <span className="text-lg leading-none">🔗</span>
          <h2 className="text-base font-bold text-white">פירוט עסקאות נדרים פלוס</h2>
          <span className="mr-auto rounded-full bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30 px-2.5 py-0.5 text-xs font-bold tabular-nums">
            {filtered.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-violet-500" />
          </div>
        ) : (
          <div className="relative overflow-auto max-h-[600px] no-scrollbar">
            <table className="min-w-full text-sm" dir="rtl">

              {/* Sticky header */}
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 border-b-2 border-violet-500/30">
                  {[
                    "תאריך",
                    "מספר עסקה",
                    "שם התורם",
                    "הערות נדרים (גולמי)",
                    "סכום",
                    "שיוך במערכת",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-violet-400/80 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-600 text-sm">
                      לא נמצאו עסקאות התואמות את הסינון
                    </td>
                  </tr>
                )}

                {filtered.map((tx, i) => {
                  const matched = isMatched(tx);
                  return (
                    <tr
                      key={tx.id}
                      className={`
                        border-b border-slate-800/60 transition-colors
                        hover:bg-violet-500/[0.04]
                        ${i % 2 === 1 ? "bg-slate-900/30" : "bg-transparent"}
                        ${tx.amount < 0 ? "opacity-50" : ""}
                      `}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap text-xs">
                        {fmtTs(tx.createdAt ?? tx.date)}
                      </td>

                      {/* Nedarim Transaction ID */}
                      <td className="px-4 py-3 tabular-nums">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-300">
                          {tx.nedarimTransactionId ?? tx.id}
                        </span>
                      </td>

                      {/* Donor Name */}
                      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                        {tx.donorName || <span className="text-slate-600">—</span>}
                      </td>

                      {/* Raw Nedarim Comments — strip routing tag for display */}
                      <td className="px-4 py-3 max-w-[260px]">
                        {tx.dedication ? (
                          <div>
                            {/* Raw text as-is */}
                            <p className="text-xs text-slate-400 font-mono truncate" title={tx.dedication}>
                              {tx.dedication}
                            </p>
                            {/* Cleaned version (tag stripped) shown beneath if different */}
                            {stripTag(tx.dedication) !== tx.dedication && (
                              <p className="mt-0.5 text-[10px] text-slate-600 truncate">
                                ← ללא תג: {stripTag(tx.dedication)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 font-black tabular-nums whitespace-nowrap text-left">
                        <span className={tx.amount < 0 ? "text-red-400" : "text-emerald-400"}>
                          {nis(tx.amount)}
                        </span>
                      </td>

                      {/* System Match */}
                      <td className="px-4 py-3">
                        {matched ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {tx.boyName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-400/15 px-2.5 py-1 text-xs font-bold text-orange-300 ring-1 ring-orange-400/40">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                            כללי
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Bottom fade */}
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-slate-900/80 to-transparent" />
          </div>
        )}
      </div>

    </div>
  );
}
