import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Boy {
  id: string;
  name: string;
  shiur: string;
  totalRaised: number;
  goal: number;
  status?: string;
}

interface Transaction {
  id: string;
  targetId: string;
  targetName: string;
  amount: number;
  date: Timestamp;
  dedication?: string;
  status: string;
}

interface Announcement {
  id: string;
  icon: string;
  text: string;
}

interface GlobalSettings {
  campaignName: string;
  globalGoal: number;
  announcements: Announcement[];
  audioUrl: string;
  audioVolume: number;    // 0 – 100
  audioPlaying: boolean;
  playSlogan: boolean;
}

// ─── Color Zone ─────────────────────────────────────────────────────────────────
// All class strings written in full so Tailwind's scanner never purges them.

type Zone = "red" | "yellow" | "orange" | "green";

function getZone(p: number): Zone {
  if (p >= 90) return "green";
  if (p >= 50) return "orange";
  if (p >= 25) return "yellow";
  return "red";
}

const Z: Record<Zone, { text: string; bar: string; ring: string; glow: string; dim: string }> = {
  red:    { text: "text-red-500",    bar: "bg-red-500",    ring: "ring-red-500/30",    glow: "shadow-red-500/20",    dim: "bg-red-500/10"    },
  yellow: { text: "text-yellow-400", bar: "bg-yellow-400", ring: "ring-yellow-400/30", glow: "shadow-yellow-400/20", dim: "bg-yellow-400/10" },
  orange: { text: "text-orange-500", bar: "bg-orange-500", ring: "ring-orange-500/30", glow: "shadow-orange-500/20", dim: "bg-orange-500/10" },
  green:  { text: "text-green-500",  bar: "bg-green-400",  ring: "ring-green-500/30",  glow: "shadow-green-500/20",  dim: "bg-green-500/10"  },
};

// ─── Constants ──────────────────────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

const SHIUR_ORDER = ["שיעור א'", "שיעור ב'", "שיעור ג'", "קיבוץ נמוך", "קיבוץ גבוה", "תרומה כללית"];

const SETTINGS_DEFAULTS: GlobalSettings = {
  campaignName: "מגבית פורים",
  globalGoal: 0,
  announcements: [],
  audioUrl: "",
  audioVolume: 70,
  audioPlaying: false,
  playSlogan: false,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function nis(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(raised: number, goal: number): number {
  // Coerce to float first so Firestore integer types or accidental strings
  // never cause silent integer-division or NaN before the * 100 step.
  const r = parseFloat(String(raised)) || 0;
  const g = parseFloat(String(goal))   || 0;
  return g > 0 ? (r / g) * 100 : 0;
}

/**
 * Returns the most recent 14:00 cutoff as a JS Date.
 * If the current time is before 14:00 today, returns yesterday's 14:00.
 * NOTE: Computed at component mount. A page refresh handles the daily boundary.
 */
function getDailyCutoff(): Date {
  const now = new Date();
  const c = new Date(now);
  c.setHours(14, 0, 0, 0);
  if (now < c) c.setDate(c.getDate() - 1);
  return c;
}

function timeAgoHe(ts: Timestamp): string {
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 90) return "עכשיו";
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} דקות`;
  const hr = Math.floor(min / 60);
  if (hr === 1) return "לפני שעה";
  if (hr < 24) return `לפני ${hr} שעות`;
  return "אתמול";
}

// ─── Hooks ──────────────────────────────────────────────────────────────────────

function useBoys(): { boys: Boy[]; loading: boolean } {
  const [boys, setBoys]       = useState<Boy[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    return onSnapshot(
      query(collection(clientDb, "boys"), orderBy("totalRaised", "desc")),
      (snap) => {
        setBoys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Boy)));
        setLoading(false);
      },
    );
  }, []);
  return { boys, loading };
}

function useRecentTransactions(): { txs: Transaction[]; loading: boolean } {
  const [txs, setTxs]         = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    return onSnapshot(
      query(collection(clientDb, "transactions"), orderBy("date", "desc"), limit(10)),
      (snap) => {
        setTxs(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Transaction))
            .filter((t) => t.status !== "cancelled" && t.status !== "request_cancel" && t.amount > 0),
        );
        setLoading(false);
      },
    );
  }, []);
  return { txs, loading };
}

/**
 * Listens to all non-cancelled transactions since the last 14:00 cutoff.
 * Client-side status filter avoids a composite Firestore index.
 * Negative-amount entries (manual offsets) are excluded so they don't
 * distort the daily star ranking or trigger live-feed effects.
 */
function useDailyTransactions(): Transaction[] {
  const [txs, setTxs] = useState<Transaction[]>([]);
  useEffect(() => {
    const cutoff = Timestamp.fromDate(getDailyCutoff());
    return onSnapshot(
      query(
        collection(clientDb, "transactions"),
        where("date", ">=", cutoff),
        orderBy("date", "desc"),
      ),
      (snap) => {
        setTxs(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Transaction))
            .filter((t) => t.status !== "cancelled" && t.status !== "request_cancel" && t.amount > 0),
        );
      },
    );
  }, []);
  return txs;
}

/**
 * Listens to settings/global in real time.
 * Always returns a fully-populated settings object (merged with defaults)
 * so consumers never receive undefined fields.
 */
function useSettings(): { settings: GlobalSettings; loading: boolean } {
  const [settings, setSettings] = useState<GlobalSettings>(SETTINGS_DEFAULTS);
  const [loading, setLoading]   = useState(true);
  useEffect(() => {
    return onSnapshot(
      doc(clientDb, "settings", "global"),
      (snap) => {
        setSettings(
          snap.exists()
            ? { ...SETTINGS_DEFAULTS, ...(snap.data() as Partial<GlobalSettings>) }
            : SETTINGS_DEFAULTS,
        );
        setLoading(false);
      },
    );
  }, []);
  return { settings, loading };
}

/**
 * Listens to settings/ticker in real time.
 * Returns the custom admin message and the showTransactions toggle.
 */
/**
 * Single source of truth: loads ALL transactions in real-time.
 * Per-boy totals and the global campaign total are derived via useMemo
 * in the Leaderboard root so every child widget always reads the same
 * consistent numbers — no more per-component fragmented calculations.
 */
function useAllTransactions(): { allTxs: Transaction[]; allTxsLoading: boolean } {
  const [allTxs, setAllTxs]         = useState<Transaction[]>([]);
  const [allTxsLoading, setLoading] = useState(true);
  useEffect(() => {
    return onSnapshot(
      collection(clientDb, "transactions"),
      (snap) => {
        setAllTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
        setLoading(false);
      },
      (err) => console.error("[useAllTransactions] snapshot error:", err),
    );
  }, []);
  return { allTxs, allTxsLoading };
}

function useTickerSettings(): { message: string; showTransactions: boolean } {
  const [message, setMessage]               = useState("");
  const [showTransactions, setShowTxs]      = useState(true);
  useEffect(() => {
    return onSnapshot(
      doc(clientDb, "settings", "ticker"),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setMessage((d.message as string) ?? "");
          // Use strict inequality: only hide transactions when the field is
          // explicitly false in Firestore. Missing / undefined → keep showing.
          setShowTxs(d.showTransactions !== false);
        } else {
          setMessage("");
          setShowTxs(true);
        }
      },
    );
  }, []);
  return { message, showTransactions };
}

// ─── Primitives ─────────────────────────────────────────────────────────────────

function Bar({ raised, goal, cls }: { raised: number; goal: number; cls: string }) {
  const p    = pct(raised, goal);
  const visW = Math.min(p, 100);      // bar fills max 100% visually
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-all duration-1000 ${cls}`}
        style={{ width: `${visW}%` }}
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

/**
 * Generic panel card. className is forwarded to the outer div so callers can
 * inject flex-1, min-h-0, etc. The inner content area uses overflow-y-auto
 * (suitable for static lists like ShiurPanel).
 */
function Panel({
  title,
  icon,
  accentBorder = "border-white/10",
  className = "",
  children,
}: {
  title: string;
  icon: string;
  accentBorder?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-gray-900/80 ring-1 ring-white/10 ${className}`}
    >
      <div className={`flex shrink-0 items-center gap-2 border-b px-5 py-3 ${accentBorder}`}>
        <span className="leading-none">{icon}</span>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          {title}
        </h2>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

// ─── Header: Campaign Name ───────────────────────────────────────────────────────

function CampaignNameCard({ name: _name }: { name: string }) {
  return (
    <div className="flex h-full flex-row items-center gap-6 rounded-2xl bg-gradient-to-br from-indigo-950 to-gray-900 px-6 ring-1 ring-indigo-500/20">
      <img
        src="/assets/logo.png"
        alt="Logo"
        className="h-24 w-auto shrink-0 object-contain drop-shadow-2xl"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <div className="flex min-w-0 flex-col">
        <h1
          className="text-4xl md:text-5xl font-extrabold text-transparent"
          style={{
            backgroundImage: "url('/assets/fuego.gif')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          יוצאים להפגיז תחת אש
        </h1>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-400 shadow shadow-green-400/60" />
          <span className="text-[10px] font-medium tracking-widest text-green-400/70">
            שידור חי
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Header: Daily Star ──────────────────────────────────────────────────────────

function DailyStarCard({
  boys,
  dailyTxs,
  hasBomb,
  globalGoal,
  boyTotals,
}: {
  boys: Boy[];
  dailyTxs: Transaction[];
  hasBomb: boolean;
  globalGoal: number;
  boyTotals: Map<string, number>;
}) {
  const { star, dailyAmt, isDefault } = useMemo(() => {
    if (dailyTxs.length === 0) {
      return { star: boys[0] ?? null, dailyAmt: 0, isDefault: true };
    }
    const totals = new Map<string, number>();
    for (const tx of dailyTxs) {
      totals.set(tx.targetId, (totals.get(tx.targetId) ?? 0) + tx.amount);
    }
    let topId = "", topAmt = 0;
    for (const [id, amt] of totals) {
      if (amt > topAmt) { topAmt = amt; topId = id; }
    }
    return {
      star: boys.find((b) => b.id === topId) ?? boys[0] ?? null,
      dailyAmt: topAmt,
      isDefault: false,
    };
  }, [boys, dailyTxs]);

  if (!star) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-gray-900 ring-1 ring-white/10">
        <p className="text-sm text-white/30">ממתין לנתוני כוכב</p>
      </div>
    );
  }

  // If the boy has no individual goal set, fall back to an equal share of
  // the global campaign goal so percentages are always meaningful.
  const perBoyGoal = globalGoal > 0 ? Math.round(globalGoal / Math.max(boys.length, 1)) : 0;
  const effectiveGoal = star.goal > 0 ? star.goal : perBoyGoal;
  // Use transaction-based total — never the stale denormalized field.
  const starRaised = boyTotals.get(star.id) ?? 0;
  const p = pct(starRaised, effectiveGoal);
  const z = Z[getZone(p)];

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl
        bg-gradient-to-b from-gray-800 via-gray-900 to-gray-950 p-5
        shadow-2xl ${z.glow} ring-2 ${z.ring}`}
    >
      {/* Ambient glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-56 w-56 rounded-full bg-white/[0.035] blur-3xl" />
      </div>

      <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">
        💥 המפגיז היומי
      </p>

      {/* Profile image */}
      <div className="relative z-10 mt-3 h-20 w-20 shrink-0">
        <img
          src="/assets/leizan.png"
          alt={`תמונת ${star.name}`}
          className={`h-full w-full rounded-full object-cover ring-4 ${z.ring}`}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </div>

      {/* Name — leader gets both artifont-title (for later font swap) and the existing special font */}
      <h2
        className={`font-artifont-title font-artifont-special relative z-10 mt-3 text-center text-4xl font-bold tracking-tight ${z.text}`}
      >
        {star.name}
      </h2>
      <p className="relative z-10 mt-0.5 text-xs text-white/30">{star.shiur}</p>

      {/* Daily / total amount */}
      <div className="relative z-10 mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${z.text}`}>
          {isDefault ? nis(starRaised) : nis(dailyAmt)}
        </span>
        <span className="text-xs text-white/30">{isDefault ? 'סה"כ' : "היום"}</span>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-3 w-full max-w-[200px]">
        <Bar raised={starRaised} goal={effectiveGoal} cls={z.bar} />
        <p className={`mt-1 text-center text-xs tabular-nums ${z.text}`} dir="ltr">
          {p.toFixed(1)}%
        </p>
      </div>

      {/*
       * Bomb GIF overlay — shown for 30 s after any transaction > 50 ILS.
       * Absolutely fills the card so the explosion covers the star's profile.
       */}
      {hasBomb && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <img
            src="/assets/bomb.gif"
            alt=""
            aria-hidden
            className="h-40 w-40 object-contain drop-shadow-2xl"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
      )}

      {/* Confetti overlay — permanent celebration for the daily leader */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
        <img
          src="/assets/confetti.gif"
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-50"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </div>
    </div>
  );
}

// ─── Header: Campaign Total ──────────────────────────────────────────────────────

function CampaignTotalCard({ boys, globalGoal, raised }: { boys: Boy[]; globalGoal: number; raised: number }) {
  // `raised` comes from the parent Leaderboard component (derived from the
  // centralised transactions snapshot) — never touches boys.totalRaised.

  // The admin-configured global goal takes priority whenever it is set (> 0).
  // Only fall back to summing boys' individual goals if no global goal is set.
  const goal = useMemo(() => {
    if (globalGoal > 0) return globalGoal;
    return boys.reduce((s, b) => s + b.goal, 0);
  }, [globalGoal, boys]);

  const p = pct(raised, goal);
  const z = Z[getZone(p)];

  return (
    <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-bl from-emerald-950 to-gray-900 p-6 ring-1 ring-emerald-500/20">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/60">
        התקדמות קמפיין
      </p>
      <p className={`mt-2 text-[2.3rem] font-bold tabular-nums leading-none ${z.text}`}>
        {nis(raised)}
      </p>
      <p className="mt-1 text-sm text-white/30">מתוך יעד {nis(goal)}</p>
      <div className="mt-4">
        {/* Thick campaign bar — more visible than the default h-2 */}
        <div className="h-5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${z.bar}`}
            style={{ width: `${Math.min(p, 100)}%` }}
            role="progressbar"
            aria-valuenow={Math.round(p)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-white/30">
          <span dir="ltr">{p.toFixed(1)}%</span>
          <span>{boys.length} משתתפים</span>
        </div>
      </div>
    </div>
  );
}

// ─── Header: Legend (מקרא) ───────────────────────────────────────────────────────

function LegendCard() {
  return (
    <div className="flex flex-col justify-center rounded-2xl bg-gray-900/80 p-5 ring-1 ring-white/10">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
        📊 מקרא
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
          <span className="text-xs text-white/60">0–25%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-yellow-400" />
          <span className="text-xs text-white/60">25–50%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-orange-500" />
          <span className="text-xs text-white/60">50–90%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-green-400" />
          <span className="text-xs text-white/60">90%+</span>
        </div>
      </div>
    </div>
  );
}

// ─── Right Column: Shiur Ranking ─────────────────────────────────────────────────

interface ShiurRow { name: string; raised: number; goal: number; count: number }

function ShiurPanel({ boys, coinsShiurNames, globalGoal, boyTotals }: { boys: Boy[]; coinsShiurNames: Set<string>; globalGoal: number; boyTotals: Map<string, number> }) {
  const rows = useMemo<ShiurRow[]>(() => {
    const map = new Map<string, ShiurRow>();
    for (const b of boys) {
      const r = map.get(b.shiur) ?? { name: b.shiur, raised: 0, goal: 0, count: 0 };
      // Use transaction-based per-boy total — never the stale Firestore field.
      r.raised += boyTotals.get(b.id) ?? 0;
      r.goal   += b.goal;
      r.count++;
      map.set(b.shiur, r);
    }
    return [...map.values()]
      .filter((r) => SHIUR_ORDER.includes(r.name))
      .sort((a, b) => b.raised - a.raised);
  }, [boys, boyTotals]);

  return (
    <Panel title="דירוג שיעורים" icon="🏫" accentBorder="border-violet-500/20">
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          // If boys have no individual goals, use each shiur's proportional
          // share of globalGoal (by boy count) as the denominator.
          const proportionalGoal = globalGoal > 0
            ? Math.round(globalGoal * (r.count / Math.max(boys.length, 1)))
            : 0;
          const effectiveGoal    = r.goal > 0 ? r.goal : proportionalGoal;
          const p        = pct(r.raised, effectiveGoal);
          const z        = Z[getZone(p)];
          const isLeader = i === 0;
          return (
            <div key={r.name} className={`relative overflow-hidden rounded-xl p-3.5 ring-1 ${z.dim} ${z.ring}`}>
              {/* Coins GIF — absolute background for this specific shiur row only */}
              {coinsShiurNames.has(r.name) && (
                <img
                  src="/assets/coins.gif"
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-50"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              {/* Confetti overlay — leader (top-ranked shiur) only */}
              {isLeader && (
                <img
                  src="/assets/confetti.gif"
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-40"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <div className="relative z-10 flex items-center gap-3">
                <span className="shrink-0 text-xl leading-none">
                  {MEDALS[i] ?? `#${i + 1}`}
                </span>
                {/* Profile picture placeholder — leader row only */}
                {isLeader && (
                  <img
                    src="/assets/leizan.png"
                    alt=""
                    aria-hidden
                    className={`h-8 w-8 shrink-0 rounded-full object-cover ring-2 ${z.ring}`}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate font-bold ${isLeader ? "font-artifont-title" : ""} ${z.text}`}>{r.name}</p>
                    <p className={`shrink-0 text-sm font-bold tabular-nums ${z.text}`}>
                      {nis(r.raised)}
                    </p>
                  </div>
                  <div className="mt-2">
                    <Bar raised={r.raised} goal={effectiveGoal} cls={z.bar} />
                  </div>
                  <p className="mt-1 text-xs text-white/30">
                    {p.toFixed(0)}% · {r.count} {r.count === 1 ? "תלמיד" : "תלמידים"} · יעד {nis(r.goal)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-white/30">אין נתונים</p>
        )}
      </div>
    </Panel>
  );
}

// ─── Center Column: Transactions Roller ──────────────────────────────────────────
//
// Vertical infinite marquee — same seamless-loop technique as InFieldPanel.
// `boys` is passed in to calculate 90% target achievement per row.

function TransactionsPanel({ txs, boys, boyTotals }: { txs: Transaction[]; boys: Boy[]; boyTotals: Map<string, number> }) {
  // Tick every 30 s to keep time-ago labels fresh without a Firestore re-read.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Build a boy lookup map for the 90% check.
  const boyMap = useMemo(() => {
    const m = new Map<string, Boy>();
    for (const b of boys) m.set(b.id, b);
    return m;
  }, [boys]);

  // Scale scroll speed to content: 4 s per row, minimum 20 s.
  const duration = `${Math.max(20, txs.length * 4)}s`;

  // Render a single transaction row. Extracted to avoid JSX duplication.
  function TxRow({ tx, dupKey }: { tx: Transaction; i?: number; dupKey?: string }) {
    const boy       = boyMap.get(tx.targetId);
    const boyRaised = boyTotals.get(tx.targetId) ?? 0;
    const is90      = boy != null && pct(boyRaised, boy.goal) >= 90;
    const bp        = boy ? pct(boyRaised, boy.goal) : 0;
    const z    = boy ? Z[getZone(bp)] : null;
    return (
      <div
        key={dupKey ?? tx.id}
        className={`relative flex items-start gap-3 border-b border-white/5 px-4 py-4 ${z ? z.dim : ""}`}
      >
        {/* target90 badge — absolute behind all text, z-0 */}
        {is90 && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <img
              src="/assets/target90.gif"
              alt=""
              aria-hidden
              className="absolute right-3 top-1/2 h-6 w-6 -translate-y-1/2 object-contain opacity-40"
            />
          </div>
        )}
        <span className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
        <div className="relative z-10 min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {tx.targetName || "תלמיד לא ידוע"}
          </p>
          {tx.dedication ? (
            <p className="truncate text-xs text-white/50">{tx.dedication}</p>
          ) : null}
          {boy && (
            <>
              <p className={`text-xs tabular-nums ${z ? z.text : "text-white/40"}`}>
                גייס {nis(boyRaised)} · יעד {nis(boy.goal)}
              </p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${z ? z.bar : "bg-white/20"}`}
                  style={{ width: `${Math.min(bp, 100)}%` }}
                />
              </div>
            </>
          )}
          <p className="text-xs text-white/30">{timeAgoHe(tx.date)}</p>
        </div>
        <div className="relative z-10 shrink-0 text-left">
          <p className="text-sm font-bold tabular-nums text-cyan-400">
            {nis(tx.amount)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-gray-900/80 ring-1 ring-white/10">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-cyan-500/20 px-5 py-3">
        <span className="leading-none">💳</span>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          מתרימים אחרונים
        </h2>
      </div>

      {/* Scrolling area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {txs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/30">אין תרומות עדיין</p>
          </div>
        ) : (
          /*
           * List is duplicated so translateY(-50%) loops seamlessly.
           * animationDuration inline style overrides the default from .marquee-up.
           */
          <div className="marquee-up" style={{ animationDuration: duration }}>
            {/* First copy */}
            {txs.map((tx, i) => (
              <TxRow key={tx.id} tx={tx} i={i} />
            ))}
            {/* Second copy — seamless continuation */}
            {txs.map((tx, i) => (
              <TxRow key={`dup-${tx.id}`} tx={tx} i={i} dupKey={`dup-${tx.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Left Column — Top Half: System Announcements ────────────────────────────────

function AnnouncementsPanel({
  announcements,
  className = "",
}: {
  announcements: Announcement[];
  className?: string;
}) {
  // Scale duration with content: 15 s per announcement, min 20 s.
  const duration = `${Math.max(20, announcements.length * 15)}s`;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-gray-900/80 ring-1 ring-white/10 ${className}`}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 px-5 py-3">
        <span className="leading-none">📡</span>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          הודעות מערכת
        </h2>
      </div>

      {/* Scrolling area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {announcements.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/30">אין הודעות</p>
          </div>
        ) : (
          /*
           * List is duplicated so translateY(-50%) loops seamlessly.
           * animationDuration inline style overrides the 10 s default from .marquee-up.
           */
          <div className="marquee-up" style={{ animationDuration: duration }}>
            {/* First copy */}
            {announcements.map((a) => (
              <div key={a.id} className="border-b border-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-xl leading-none">{a.icon}</span>
                  <p className="min-w-0 text-sm leading-relaxed text-white/80">{a.text}</p>
                </div>
              </div>
            ))}
            {/* Second copy — seamless continuation */}
            {announcements.map((a) => (
              <div key={`dup-${a.id}`} className="border-b border-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-xl leading-none">{a.icon}</span>
                  <p className="min-w-0 text-sm leading-relaxed text-white/80">{a.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Left Column — Bottom Half: In-Field Vertical Marquee ────────────────────────

function InFieldPanel({ boys, globalGoal, className = "", boyTotals }: { boys: Boy[]; globalGoal: number; className?: string; boyTotals: Map<string, number> }) {
  const inField = useMemo(
    () => boys.filter((b) => b.status === "in_field"),
    [boys],
  );

  // 3 s per boy so names are legible; minimum 8 s so a single name isn't jarring.
  const duration = `${Math.max(8, inField.length * 3)}s`;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-gray-900/80 ring-1 ring-white/10 ${className}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-teal-500/20 px-5 py-3">
        <span className="leading-none">🏃</span>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          בשטח כעת
        </h2>
        {inField.length > 0 && (
          <span className="mr-auto rounded-full bg-teal-400/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-teal-400 ring-1 ring-teal-400/20">
            {inField.length}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {inField.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/30">אין תלמידים בשטח</p>
          </div>
        ) : (
          <div className="marquee-up" style={{ animationDuration: duration }}>
            {/* First copy */}
            {inField.map((b) => {
              const perBoy    = globalGoal > 0 ? Math.round(globalGoal / Math.max(boys.length, 1)) : 0;
              const effGoal   = b.goal > 0 ? b.goal : perBoy;
              const nameColor = Z[getZone(pct(boyTotals.get(b.id) ?? 0, effGoal))].text;
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-4 border-b border-white/5 px-5 py-3"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-400 shadow-sm shadow-teal-400/50" />
                  <span className={`flex-1 text-xl font-bold ${nameColor}`}>{b.name}</span>
                  <span className="shrink-0 text-xs text-white/40">{b.shiur}</span>
                </div>
              );
            })}
            {/* Second copy — seamless continuation */}
            {inField.map((b) => {
              const perBoy    = globalGoal > 0 ? Math.round(globalGoal / Math.max(boys.length, 1)) : 0;
              const effGoal   = b.goal > 0 ? b.goal : perBoy;
              const nameColor = Z[getZone(pct(boyTotals.get(b.id) ?? 0, effGoal))].text;
              return (
                <div
                  key={`dup-${b.id}`}
                  className="flex items-center gap-4 border-b border-white/5 px-5 py-3"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-400 shadow-sm shadow-teal-400/50" />
                  <span className={`flex-1 text-xl font-bold ${nameColor}`}>{b.name}</span>
                  <span className="shrink-0 text-xs text-white/40">{b.shiur}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer: News Ticker ─────────────────────────────────────────────────────────

function Ticker({
  boys,
  txs,
  customMessage,
  showTransactions,
  boyTotals,
}: {
  boys: Boy[];
  txs: Transaction[];
  customMessage: string;
  showTransactions: boolean;
  boyTotals: Map<string, number>;
}) {
  const SEP = "   ·   ";

  // Render one copy of all ticker items as JSX spans.
  // The [0,1].map() below duplicates this for the seamless loop.
  function TickerItems({ prefix }: { prefix: string }) {
    return (
      <>
        {customMessage.trim() && (
          <span>📢 {customMessage.trim()}{SEP}</span>
        )}

        {/* ── Strict JSX conditional: transactions rendered ONLY when flag is ON ── */}
        {showTransactions && txs.slice(0, 5).map((tx, i) => {
          const base = `💳 ${tx.targetName || "תלמיד"} התרים ${nis(tx.amount)}`;
          const text = tx.dedication ? `${base} — הקדשה: ${tx.dedication}` : base;
          return <span key={`${prefix}-tx-${i}`}>{text}{SEP}</span>;
        })}

        {showTransactions && boys.slice(0, 3).map((b, i) => (
          <span key={`${prefix}-boy-${b.id}`}>
            {MEDALS[i]} מקום {i + 1}: {b.name} — {nis(boyTotals.get(b.id) ?? 0)}{SEP}
          </span>
        ))}
      </>
    );
  }

  const hasContent =
    customMessage.trim() ||
    (showTransactions && (txs.length > 0 || boys.length > 0));

  if (!hasContent) return null;

  return (
    <div className="h-10 overflow-hidden border-t border-white/10 bg-gray-900/90">
      <div className="flex h-full items-center">
        {/*
         * Rendered twice so translateX(-50%) creates a seamless marquee loop.
         * Keys are prefixed to avoid React duplicate-key warnings.
         */}
        <div className="ticker-track inline-block whitespace-nowrap text-sm text-white/50">
          <TickerItems prefix="a" />
          <TickerItems prefix="b" />
        </div>
      </div>
    </div>
  );
}

// ─── Loading Spinner ─────────────────────────────────────────────────────────────

function FullScreenSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-indigo-500" />
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export function Leaderboard() {
  const { boys, loading: bl }             = useBoys();
  const { txs,  loading: tl }             = useRecentTransactions();
  const dailyTxs                          = useDailyTransactions();
  const { settings, loading: sl }         = useSettings();
  const { message: tickerMessage, showTransactions } = useTickerSettings();
  // ── Single source of truth: all transactions ────────────────────────────────
  const { allTxs, allTxsLoading: al }     = useAllTransactions();

  // ── Per-boy totals derived from raw transactions (bypasses stale field) ──────
  const boyTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of allTxs) {
      if (tx.status === "cancelled") continue;
      m.set(tx.targetId, (m.get(tx.targetId) ?? 0) + tx.amount);
    }
    return m;
  }, [allTxs]);

  // ── Global campaign total derived from the same dataset ──────────────────────
  const globalTotal = useMemo(
    () => [...boyTotals.values()].reduce((s, v) => s + v, 0),
    [boyTotals],
  );

  // ── Boys sorted by their real transaction total (Firestore order may be stale) ─
  const sortedBoys = useMemo(
    () => [...boys].sort((a, b) => (boyTotals.get(b.id) ?? 0) - (boyTotals.get(a.id) ?? 0)),
    [boys, boyTotals],
  );

  // ── Audio refs (three separate players) ──────────────────────────────────────
  const bgMusicRef  = useRef<HTMLAudioElement>(null);
  const sloganRef   = useRef<HTMLAudioElement>(null);
  const applauseRef = useRef<HTMLAudioElement>(null);

  // Tracks the last BG URL we loaded so we don't call .load() on every Firestore tick.
  const lastBgUrlRef = useRef<string>("");

  // ── BG music volume ─────────────────────────────────────────────────────────
  // When slogan is playing, duck BG music to 20 % of the configured volume.
  useEffect(() => {
    const el = bgMusicRef.current;
    if (!el) return;
    const base = settings.audioVolume / 100;
    el.volume = settings.playSlogan ? base * 0.2 : base;
  }, [settings.audioVolume, settings.playSlogan]);

  // ── BG music URL + play / pause ─────────────────────────────────────────────
  useEffect(() => {
    const el = bgMusicRef.current;
    if (!el) return;

    if (settings.audioUrl && settings.audioUrl !== lastBgUrlRef.current) {
      lastBgUrlRef.current = settings.audioUrl;
      el.src  = settings.audioUrl;
      el.loop = true;
      el.load();
      if (settings.audioPlaying) el.play().catch(console.error);
      return; // play state handled above for this URL change
    }

    if (settings.audioPlaying) {
      el.play().catch(console.error);
    } else {
      el.pause();
    }
  }, [settings.audioUrl, settings.audioPlaying]);

  // ── Slogan play / pause ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = sloganRef.current;
    if (!el) return;
    if (settings.playSlogan) {
      el.play().catch(console.error);
    } else {
      el.pause();
    }
  }, [settings.playSlogan]);

  // ── GIF overlay state ────────────────────────────────────────────────────────
  const [showDonationGif,  setShowDonationGif]  = useState(false);
  // Set of shiur names that currently have an active coins GIF in their row.
  const [coinsShiurNames, setCoinsShiurNames] = useState<Set<string>>(new Set());
  // Set of boyIds that currently have an active bomb overlay (large donation).
  const [bombBoyIds, setBombBoyIds] = useState<Set<string>>(new Set());

  // Timers for auto-hiding the short-lived GIFs.
  const donationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-shiur coins timers — keyed by shiur name.
  const coinsTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Per-boyId bomb overlay timers — keyed by boyId.
  const bombTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      if (donationTimerRef.current) clearTimeout(donationTimerRef.current);
      for (const t of coinsTimerRef.current.values()) clearTimeout(t);
      for (const t of bombTimerRef.current.values()) clearTimeout(t);
    };
  }, []);

  // Tracks IDs seen in the previous snapshot so we can diff for new arrivals.
  const prevTxIdsRef    = useRef<Set<string>>(new Set());
  // Skip triggering effects on the very first Firestore snapshot (existing data).
  const txInitializedRef = useRef(false);

  useEffect(() => {
    if (!txInitializedRef.current) {
      // First snapshot — initialise the baseline, do not trigger any effects.
      txInitializedRef.current = true;
      prevTxIdsRef.current = new Set(txs.map((t) => t.id));
      return;
    }

    const prevIds = prevTxIdsRef.current;
    const newTxs  = txs.filter((t) => !prevIds.has(t.id));
    prevTxIdsRef.current = new Set(txs.map((t) => t.id));

    if (newTxs.length === 0) return;

    // ── Applause on any new transaction ──
    const applauseEl = applauseRef.current;
    if (applauseEl) {
      applauseEl.currentTime = 0;
      applauseEl.play().catch(console.error);
    }

    // ── Donation GIF — central, 5 s ──
    setShowDonationGif(true);
    if (donationTimerRef.current) clearTimeout(donationTimerRef.current);
    donationTimerRef.current = setTimeout(() => setShowDonationGif(false), 5_000);

    // ── Coins GIF — inside the specific Shiur row, 5 s ──
    for (const tx of newTxs) {
      const shiur = boys.find((b) => b.id === tx.targetId)?.shiur;
      if (!shiur) continue;
      setCoinsShiurNames((prev) => new Set([...prev, shiur]));
      const existing = coinsTimerRef.current.get(shiur);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setCoinsShiurNames((prev) => {
          const next = new Set(prev);
          next.delete(shiur);
          return next;
        });
        coinsTimerRef.current.delete(shiur);
      }, 5_000);
      coinsTimerRef.current.set(shiur, t);
    }

    // ── Bomb GIF — over daily star card, 30 s per large donation ──
    for (const tx of newTxs) {
      if (tx.amount > 50) {
        const boyId = tx.targetId;
        setBombBoyIds((prev) => new Set([...prev, boyId]));
        const existing = bombTimerRef.current.get(boyId);
        if (existing) clearTimeout(existing);
        const bt = setTimeout(() => {
          setBombBoyIds((prev) => {
            const next = new Set(prev);
            next.delete(boyId);
            return next;
          });
          bombTimerRef.current.delete(boyId);
        }, 30_000);
        bombTimerRef.current.set(boyId, bt);
      }
    }
  }, [txs]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/*
       * All three <audio> elements are rendered unconditionally — before any
       * conditional returns — so their refs are always populated when effects fire.
       *
       * bgMusicRef  — remote URL from Firestore (settings.audioUrl)
       * sloganRef   — local asset, toggled via settings.playSlogan
       * applauseRef — local asset, triggered on each new transaction
       */}
      <audio ref={bgMusicRef}  loop preload="none" />
      <audio ref={sloganRef}   src="/assets/slogan.mp3"   loop preload="none" />
      <audio ref={applauseRef} src="/assets/applause.mp3"      preload="none" />

      {(bl || tl || sl || al) ? <FullScreenSpinner /> : (
        <>
          <style>{`
            @keyframes ticker-scroll {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
            }
            .ticker-track {
              animation: ticker-scroll 50s linear infinite;
            }

            @keyframes marquee-up {
              from { transform: translateY(0); }
              to   { transform: translateY(-50%); }
            }
            /*
             * Base duration is 10 s — overridden per panel via inline
             * animationDuration style.
             */
            .marquee-up {
              animation: marquee-up 10s linear infinite;
              will-change: transform;
            }

            @keyframes gif-pop {
              0%   { opacity: 0; transform: scale(0.7); }
              15%  { opacity: 1; transform: scale(1.05); }
              85%  { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(0.9); }
            }
            .gif-pop {
              animation: gif-pop linear forwards;
            }

            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>

          <div className="relative flex h-screen flex-col overflow-hidden bg-gray-950" dir="rtl">


            <div className="relative z-[1] grid min-h-[280px] shrink-0 grid-cols-[1fr_2fr_1fr] gap-4 p-4">
              <CampaignNameCard name={settings.campaignName} />
              {/* Middle slot: DailyStarCard (50%) + LegendCard (50%) */}
              <div className="grid grid-cols-2 gap-4">
                <DailyStarCard
                  boys={sortedBoys}
                  dailyTxs={dailyTxs}
                  hasBomb={bombBoyIds.size > 0}
                  globalGoal={settings.globalGoal}
                  boyTotals={boyTotals}
                />
                <LegendCard />
              </div>
              <CampaignTotalCard boys={boys} globalGoal={settings.globalGoal} raised={globalTotal} />
            </div>

            {/* ── Body (3 columns, fills remaining space) ── */}
            <div className="relative z-[1] grid min-h-0 flex-1 grid-cols-[1fr_2fr_1fr] gap-4 px-4 pb-4">
              <ShiurPanel boys={boys} coinsShiurNames={coinsShiurNames} globalGoal={settings.globalGoal} boyTotals={boyTotals} />
              {/* Center: branding label + recent donors panel */}
              <div className="flex min-h-0 flex-col gap-1.5">
                <p className="shrink-0 text-center text-[10px] font-medium tracking-widest text-white/20 whitespace-nowrap">
                  קותיס מערכות תקשורת
                </p>
                <TransactionsPanel txs={txs} boys={boys} boyTotals={boyTotals} />
              </div>

              {/*
               * Left column: announcements (top) + in-field marquee (bottom),
               * each taking exactly half the column height.
               */}
              <div className="flex min-h-0 flex-col gap-4">
                <AnnouncementsPanel
                  announcements={settings.announcements}
                  className="flex-1 min-h-0"
                />
                <InFieldPanel boys={boys} globalGoal={settings.globalGoal} className="flex-1 min-h-0" boyTotals={boyTotals} />
              </div>
            </div>

            {/* ── Footer: ticker + audio unlock button ── */}
            <div className="relative shrink-0">
              <Ticker boys={sortedBoys} txs={txs} customMessage={tickerMessage} showTransactions={showTransactions} boyTotals={boyTotals} />
              {/*
               * Audio unlock button — browsers block autoplay until the user
               * interacts with the page. Clicking this unlocks the audio context
               * so all subsequent remote play commands work without a gesture.
               */}
              <button
                type="button"
                onClick={() => {
                  bgMusicRef.current?.play().catch(console.error);
                  if (settings.playSlogan) sloganRef.current?.play().catch(console.error);
                }}
                className="
                  absolute bottom-0 right-2 top-0
                  flex items-center rounded px-2
                  text-base text-white/20 transition-colors
                  hover:text-white/60
                "
                title="לחץ להפעלת אודיו"
                aria-label="הפעל אודיו"
              >
                🔊
              </button>
            </div>

            {/* ══ Event-driven GIF overlays ══════════════════════════════════════
             *
             * All overlays use pointer-events-none so they never block clicks.
             * They are positioned with `fixed` so they sit above the layout
             * regardless of scroll or grid placement.
             */}

            {/* Donation GIF — full-screen overlay, 5 s, z-50 above everything */}
            {showDonationGif && (
              <div
                className="pointer-events-none fixed left-0 top-0 z-50 h-screen w-screen"
                aria-hidden
              >
                <img
                  src="/assets/donation.gif"
                  alt=""
                  className="gif-pop h-full w-full object-cover"
                  style={{ animationDuration: "5s" }}
                />
              </div>
            )}

            {/* coins.gif is now rendered inside ShiurPanel per-row — no global overlay */}

          </div>
        </>
      )}
    </>
  );
}
