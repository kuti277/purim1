import { useEffect, useMemo, useState } from "react";
import {
  collection,
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
  red:    { text: "text-red-400",    bar: "bg-red-500",    ring: "ring-red-500/30",    glow: "shadow-red-500/20",    dim: "bg-red-500/10"    },
  yellow: { text: "text-yellow-300", bar: "bg-yellow-400", ring: "ring-yellow-400/30", glow: "shadow-yellow-400/20", dim: "bg-yellow-400/10" },
  orange: { text: "text-orange-400", bar: "bg-orange-500", ring: "ring-orange-500/30", glow: "shadow-orange-500/20", dim: "bg-orange-500/10" },
  green:  { text: "text-green-400",  bar: "bg-green-400",  ring: "ring-green-500/30",  glow: "shadow-green-500/20",  dim: "bg-green-500/10"  },
};

// ─── Constants ──────────────────────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

const PROFILE_URL  = "https://placehold.co/100x100/1e1b4b/a5b4fc?text=%F0%9F%8F%86";
const CONFETTI_URL = "https://placehold.co/100x100/00000000/00000000?text=";

const ANNOUNCEMENTS = [
  { id: 1, icon: "📢", text: "מגבית פורים נפתחת רשמית! בהצלחה לכולם — יחד נשבור את היעד.", ts: "10:00" },
  { id: 2, icon: "🎯", text: "שיעור א׳ עבר את יעד ה-5,000 ₪ הראשון! כל הכבוד לכולם.", ts: "11:15" },
  { id: 3, icon: "🏆", text: "הנהלה: מוביל ה-24 שעות הכריז על עוד סיבוב — ברכות!", ts: "12:30" },
  { id: 4, icon: "⚡", text: "נותרו 2 שעות לסיום הסשן הראשון. כולם להתאמץ!", ts: "13:00" },
] as const;

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
  return goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
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
        setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
        setLoading(false);
      },
    );
  }, []);
  return { txs, loading };
}

/**
 * Listens to all non-cancelled transactions since the last 14:00 cutoff.
 * Client-side status filter avoids a composite Firestore index.
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
            .filter((t) => t.status !== "cancelled"),
        );
      },
    );
  }, []);
  return txs;
}

// ─── Primitives ─────────────────────────────────────────────────────────────────

function Bar({ raised, goal, cls }: { raised: number; goal: number; cls: string }) {
  const p = pct(raised, goal);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-all duration-1000 ${cls}`}
        style={{ width: `${p}%` }}
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

/**
 * Generic panel card used by most columns.
 * className is forwarded to the outer div so callers can inject flex-1, min-h-0, etc.
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

function CampaignNameCard() {
  return (
    <div className="flex flex-col items-end justify-center rounded-2xl bg-gradient-to-br from-indigo-950 to-gray-900 p-6 ring-1 ring-indigo-500/20">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-400 shadow-lg shadow-green-400/60" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400">
          שידור חי
        </span>
      </div>
      <h1 className="mt-2 text-right text-[2rem] font-bold leading-tight text-white">
        מגבית פורים
      </h1>
      <p className="mt-1 text-right text-sm text-indigo-300/50">פלטפורמת פורים</p>
    </div>
  );
}

// ─── Header: Daily Star ──────────────────────────────────────────────────────────

function DailyStarCard({ boys, dailyTxs }: { boys: Boy[]; dailyTxs: Transaction[] }) {
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

  const p = pct(star.totalRaised, star.goal);
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
        ⭐ כוכב היום
      </p>

      {/* Profile + confetti overlay */}
      <div className="relative z-10 mt-3 h-20 w-20 shrink-0">
        <img
          src={PROFILE_URL}
          alt={`תמונת ${star.name}`}
          className={`h-full w-full rounded-full object-cover ring-4 ${z.ring}`}
        />
        {/* Swap CONFETTI_URL with the actual Artifont exploding-confetti asset */}
        <img
          src={CONFETTI_URL}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full rounded-full object-cover mix-blend-screen"
        />
      </div>

      {/* Name — uses the Artifont special font from tailwind.config.js */}
      <h2
        className={`font-artifont-special relative z-10 mt-3 text-center text-4xl font-bold tracking-tight ${z.text}`}
      >
        {star.name}
      </h2>
      <p className="relative z-10 mt-0.5 text-xs text-white/30">שיעור {star.shiur}</p>

      {/* Daily / total amount */}
      <div className="relative z-10 mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${z.text}`}>
          {isDefault ? nis(star.totalRaised) : nis(dailyAmt)}
        </span>
        <span className="text-xs text-white/30">{isDefault ? 'סה"כ' : "היום"}</span>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-3 w-full max-w-[200px]">
        <Bar raised={star.totalRaised} goal={star.goal} cls={z.bar} />
        <p className={`mt-1 text-center text-xs tabular-nums ${z.text}`} dir="ltr">
          {p.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

// ─── Header: Campaign Total ──────────────────────────────────────────────────────

function CampaignTotalCard({ boys }: { boys: Boy[] }) {
  const { raised, goal } = useMemo(
    () => ({
      raised: boys.reduce((s, b) => s + b.totalRaised, 0),
      goal:   boys.reduce((s, b) => s + b.goal, 0),
    }),
    [boys],
  );
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
        <Bar raised={raised} goal={goal} cls={z.bar} />
        <div className="mt-1.5 flex justify-between text-xs text-white/30">
          <span dir="ltr">{p.toFixed(1)}%</span>
          <span>{boys.length} משתתפים</span>
        </div>
      </div>
    </div>
  );
}

// ─── Right Column: Shiur Ranking ─────────────────────────────────────────────────

interface ShiurRow { name: string; raised: number; goal: number; count: number }

function ShiurPanel({ boys }: { boys: Boy[] }) {
  const rows = useMemo<ShiurRow[]>(() => {
    const map = new Map<string, ShiurRow>();
    for (const b of boys) {
      const r = map.get(b.shiur) ?? { name: b.shiur, raised: 0, goal: 0, count: 0 };
      r.raised += b.totalRaised;
      r.goal   += b.goal;
      r.count++;
      map.set(b.shiur, r);
    }
    return [...map.values()].sort((a, b) => b.raised - a.raised);
  }, [boys]);

  return (
    <Panel title="דירוג שיעורים" icon="🏫" accentBorder="border-violet-500/20">
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const p = pct(r.raised, r.goal);
          const z = Z[getZone(p)];
          return (
            <div key={r.name} className={`rounded-xl p-3.5 ring-1 ${z.dim} ${z.ring}`}>
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xl leading-none">
                  {MEDALS[i] ?? `#${i + 1}`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate font-bold ${z.text}`}>שיעור {r.name}</p>
                    <p className={`shrink-0 text-sm font-bold tabular-nums ${z.text}`}>
                      {nis(r.raised)}
                    </p>
                  </div>
                  <div className="mt-2">
                    <Bar raised={r.raised} goal={r.goal} cls={z.bar} />
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

// ─── Center Column: Recent Transactions ──────────────────────────────────────────

function TransactionsPanel({ txs }: { txs: Transaction[] }) {
  // Tick every 30 s to keep time-ago labels fresh without a Firestore re-read.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel title="10 תרומות אחרונות" icon="💳" accentBorder="border-cyan-500/20">
      <div className="flex flex-col gap-2">
        {txs.map((tx, i) => (
          <div
            key={tx.id}
            className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/10"
            style={{ opacity: Math.max(0.35, 1 - i * 0.065) }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
            <div className="min-w-0 flex-1">
              {/* Collector name is always the primary, bold text */}
              <p className="truncate text-sm font-semibold text-white">
                {tx.targetName || "תלמיד לא ידוע"}
              </p>
              {/* Dedication is secondary — smaller and dimmer */}
              {tx.dedication ? (
                <p className="truncate text-xs text-white/50">{tx.dedication}</p>
              ) : null}
              <p className="text-xs text-white/30">{timeAgoHe(tx.date)}</p>
            </div>
            <p className="shrink-0 text-sm font-bold tabular-nums text-cyan-400">
              {nis(tx.amount)}
            </p>
          </div>
        ))}
        {txs.length === 0 && (
          <p className="py-8 text-center text-sm text-white/30">אין תרומות עדיין</p>
        )}
      </div>
    </Panel>
  );
}

// ─── Left Column — Top Half: System Announcements ────────────────────────────────

function AnnouncementsPanel({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-gray-900/80 ring-1 ring-white/10 ${className}`}
    >
      {/* Header — mirrors Panel's header style */}
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 px-5 py-3">
        <span className="leading-none">📡</span>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          הודעות מערכת
        </h2>
      </div>

      {/* Scrolling area — overflow-hidden clips the marquee track */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/*
         * List is duplicated so translateY(-50%) loops seamlessly:
         * when the first copy exits the top, the second copy is in the
         * exact starting position. Uses .marquee-up-slow (60 s) so
         * announcements scroll noticeably slower than the in-field list.
         */}
        <div className="marquee-up-slow">
          {/* First copy */}
          {ANNOUNCEMENTS.map((a) => (
            <div key={a.id} className="border-b border-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-xl leading-none">{a.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-white/80">{a.text}</p>
                  <p className="mt-1.5 text-xs text-white/30">{a.ts}</p>
                </div>
              </div>
            </div>
          ))}
          {/* Second copy — seamless continuation */}
          {ANNOUNCEMENTS.map((a) => (
            <div key={`dup-${a.id}`} className="border-b border-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-xl leading-none">{a.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-white/80">{a.text}</p>
                  <p className="mt-1.5 text-xs text-white/30">{a.ts}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Left Column — Bottom Half: In-Field Vertical Marquee ────────────────────────

function InFieldPanel({ boys, className = "" }: { boys: Boy[]; className?: string }) {
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
      {/* Panel header — matches the style of Panel */}
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

      {/* Scrolling area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {inField.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/30">אין תלמידים בשטח</p>
          </div>
        ) : (
          /*
           * The list is duplicated so translateY(-50%) creates a seamless loop:
           * when the first copy scrolls fully off the top, the second copy is
           * exactly in the first copy's starting position.
           */
          <div className="marquee-up" style={{ animationDuration: duration }}>
            {/* First copy */}
            {inField.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-4 border-b border-white/5 px-5 py-3"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-400 shadow-sm shadow-teal-400/50" />
                <span className="flex-1 text-xl font-bold text-white">{b.name}</span>
                <span className="shrink-0 text-xs text-white/40">שיעור {b.shiur}</span>
              </div>
            ))}
            {/* Second copy — seamless continuation */}
            {inField.map((b) => (
              <div
                key={`dup-${b.id}`}
                className="flex items-center gap-4 border-b border-white/5 px-5 py-3"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-400 shadow-sm shadow-teal-400/50" />
                <span className="flex-1 text-xl font-bold text-white">{b.name}</span>
                <span className="shrink-0 text-xs text-white/40">שיעור {b.shiur}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer: News Ticker ─────────────────────────────────────────────────────────

function Ticker({ boys, txs }: { boys: Boy[]; txs: Transaction[] }) {
  const content = useMemo(() => {
    const parts: string[] = [];
    txs.slice(0, 5).forEach((tx) => {
      // Boy's name is the subject; dedication is appended only if present.
      const base = `💳 ${tx.targetName || "תלמיד"} התרים ${nis(tx.amount)}`;
      parts.push(tx.dedication ? `${base} — הקדשה: ${tx.dedication}` : base);
    });
    boys.slice(0, 3).forEach((b, i) => {
      parts.push(`${MEDALS[i]} מקום ${i + 1}: ${b.name} — ${nis(b.totalRaised)}`);
    });
    return parts.join("   ·   ");
  }, [boys, txs]);

  if (!content) {
    return <div className="h-10 shrink-0 border-t border-white/10 bg-gray-900/90" />;
  }

  return (
    <div className="h-10 shrink-0 overflow-hidden border-t border-white/10 bg-gray-900/90">
      <div className="flex h-full items-center">
        {/*
         * Text is duplicated so translateX(-50%) creates a seamless loop:
         * the second copy fills in exactly as the first scrolls off-screen.
         */}
        <div className="ticker-track inline-block whitespace-nowrap text-sm text-white/50">
          {content}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{content}
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
  const { boys, loading: bl } = useBoys();
  const { txs,  loading: tl } = useRecentTransactions();
  const dailyTxs              = useDailyTransactions();

  if (bl || tl) return <FullScreenSpinner />;

  return (
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
        .marquee-up {
          animation: marquee-up 10s linear infinite;
          will-change: transform;
        }
        .marquee-up-slow {
          animation: marquee-up 60s linear infinite;
          will-change: transform;
        }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex h-screen flex-col overflow-hidden bg-gray-950" dir="rtl">

        {/* ── Header (3 cards, fixed 200 px tall) ── */}
        <div className="grid h-[200px] shrink-0 grid-cols-[1fr_1.1fr_1fr] gap-4 p-4">
          <CampaignNameCard />
          <DailyStarCard boys={boys} dailyTxs={dailyTxs} />
          <CampaignTotalCard boys={boys} />
        </div>

        {/* ── Body (3 columns, fills remaining space) ── */}
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 px-4 pb-4">
          <ShiurPanel boys={boys} />
          <TransactionsPanel txs={txs} />

          {/*
           * Left column: two equal halves stacked vertically.
           * flex-1 min-h-0 on each child ensures they share the column height equally
           * and their overflow-hidden clipping works correctly.
           */}
          <div className="flex min-h-0 flex-col gap-4">
            <AnnouncementsPanel className="flex-1 min-h-0" />
            <InFieldPanel boys={boys} className="flex-1 min-h-0" />
          </div>
        </div>

        {/* ── Footer ticker ── */}
        <Ticker boys={boys} txs={txs} />

      </div>
    </>
  );
}
