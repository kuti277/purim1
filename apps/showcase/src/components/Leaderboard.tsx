import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardBoy {
  id: string;
  name: string;
  shiur: string;
  totalRaised: number;
  /** Fundraising target in NIS. */
  goal: number;
}

// ─── Asset placeholders ───────────────────────────────────────────────────────
// Swap these with the real Artifont assets before going live.

/** Profile photo shown in the top-collector card. */
const PROFILE_PLACEHOLDER_URL = "https://placehold.co/160x160/1e1b4b/a5b4fc?text=%F0%9F%8F%86";

/**
 * Exploding confetti GIF overlaid on the profile photo.
 * Replace with the actual Artifont confetti asset, e.g.:
 *   const CONFETTI_GIF_URL = "/assets/confetti-explode.gif";
 */
const CONFETTI_GIF_URL = "https://placehold.co/160x160/00000000/00000000?text=";

// ─── Color logic ──────────────────────────────────────────────────────────────
// Classes are written as full strings so Tailwind's scanner never purges them.

type ColorZone = "red" | "yellow" | "orange" | "green";

function getColorZone(pct: number): ColorZone {
  if (pct >= 90) return "green";
  if (pct >= 50) return "orange";
  if (pct >= 25) return "yellow";
  return "red";
}

const COLOR_CLASSES: Record<
  ColorZone,
  { text: string; bar: string; glow: string; ring: string }
> = {
  red:    { text: "text-red-500",    bar: "bg-red-500",    glow: "shadow-red-500/40",    ring: "ring-red-500/30"    },
  yellow: { text: "text-yellow-400", bar: "bg-yellow-400", glow: "shadow-yellow-400/40", ring: "ring-yellow-400/30" },
  orange: { text: "text-orange-500", bar: "bg-orange-500", glow: "shadow-orange-500/40", ring: "ring-orange-500/30" },
  green:  { text: "text-green-400",  bar: "bg-green-400",  glow: "shadow-green-400/40",  ring: "ring-green-400/30"  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNIS(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function calcPct(totalRaised: number, goal: number): number {
  if (!goal) return 0;
  return Math.min((totalRaised / goal) * 100, 100);
}

// ─── Top Collector Card ───────────────────────────────────────────────────────

function TopCollectorCard({ boy }: { boy: LeaderboardBoy }) {
  const pct = calcPct(boy.totalRaised, boy.goal);
  const zone = getColorZone(pct);
  const { text, bar, glow, ring } = COLOR_CLASSES[zone];

  return (
    <div
      className={`
        relative mb-8 overflow-hidden rounded-2xl
        bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950
        p-8 shadow-2xl ${glow} ring-2 ${ring}
      `}
    >
      {/* Decorative background glow blob */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-white/5 blur-3xl"
      />

      {/* Crown badge */}
      <div className="absolute top-4 right-4 text-4xl" aria-label="מקום ראשון">
        👑
      </div>

      {/* Rank label */}
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
        #1 — המוביל
      </p>

      {/* Profile image + confetti overlay */}
      <div className="relative mx-auto mb-6 h-40 w-40">
        <img
          src={PROFILE_PLACEHOLDER_URL}
          alt={`תמונת ${boy.name}`}
          className={`h-full w-full rounded-full object-cover ring-4 ${ring}`}
        />
        {/*
         * Confetti GIF overlay — swap CONFETTI_GIF_URL with the actual
         * Artifont exploding-confetti asset.  mix-blend-screen lets the dark
         * background show through the transparent parts of the GIF.
         */}
        <img
          src={CONFETTI_GIF_URL}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full rounded-full object-cover mix-blend-screen"
        />
      </div>

      {/* Name — uses the Artifont special font defined in tailwind.config.js */}
      <h2 className={`font-artifont-special text-center text-5xl font-bold tracking-tight ${text}`}>
        {boy.name}
      </h2>

      {/* Shiur label */}
      <p className="mt-1 text-center text-sm text-white/40">שיעור {boy.shiur}</p>

      {/* Amount */}
      <p className={`mt-5 text-center text-3xl font-semibold tabular-nums ${text}`}>
        {formatNIS(boy.totalRaised)}
        <span className="text-lg font-normal text-white/30"> / {formatNIS(boy.goal)}</span>
      </p>

      {/* Progress bar */}
      <div className="mx-auto mt-5 max-w-sm">
        <div className="mb-1.5 flex justify-between text-xs text-white/30">
          <span dir="ltr">{pct.toFixed(1)}%</span>
          <span>יעד</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-700 ${bar}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Ranking Row (positions 2+) ───────────────────────────────────────────────

function RankingRow({ boy, rank }: { boy: LeaderboardBoy; rank: number }) {
  const pct = calcPct(boy.totalRaised, boy.goal);
  const zone = getColorZone(pct);
  const { text, bar } = COLOR_CLASSES[zone];

  return (
    <div className="flex items-center gap-4 rounded-xl bg-white/5 px-5 py-4 ring-1 ring-white/10 transition-colors hover:bg-white/[0.07]">
      {/* Rank badge */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/40">
        {rank}
      </span>

      {/* Name + shiur */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-lg font-semibold ${text}`}>{boy.name}</p>
        <p className="text-xs text-white/40">שיעור {boy.shiur}</p>
      </div>

      {/* Progress bar — hidden on small screens */}
      <div className="hidden flex-1 items-center gap-3 sm:flex">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-700 ${bar}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-white/40" dir="ltr">
          {pct.toFixed(0)}%
        </span>
      </div>

      {/* Amount */}
      <p className={`shrink-0 text-lg font-semibold tabular-nums ${text}`}>
        {formatNIS(boy.totalRaised)}
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function Leaderboard() {
  const [boys, setBoys] = useState<LeaderboardBoy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(clientDb, "boys"), orderBy("totalRaised", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setBoys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaderboardBoy)));
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-white" />
      </div>
    );
  }

  if (boys.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-xl text-white/40">אין נתונים להצגה</p>
      </div>
    );
  }

  const [topBoy, ...restBoys] = boys;

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-12" dir="rtl">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white lg:text-5xl">
          לוח המצטיינים
        </h1>
        <p className="mt-2 text-sm text-white/30">עדכון בזמן אמת</p>
      </header>

      <div className="mx-auto max-w-3xl">
        {/* #1 — top collector with special font + profile + confetti */}
        <TopCollectorCard boy={topBoy} />

        {/* Positions 2+ */}
        {restBoys.length > 0 && (
          <div className="flex flex-col gap-3">
            {restBoys.map((boy, i) => (
              <RankingRow key={boy.id} boy={boy} rank={i + 2} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
