import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PopupDoc {
  message?: string;
  triggeredAt?: Timestamp;
  active?: boolean;
}

// ─── Auto-dismiss duration ────────────────────────────────────────────────────

const SHOW_MS = 7_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function ShowcasePopupOverlay() {
  const [visible, setVisible]   = useState(false);
  const [message, setMessage]   = useState("");

  // Ref-based bookkeeping — no state needed, no re-render side-effects
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRef  = useRef(true);          // skip the stale doc on mount
  const lastTsRef   = useRef<number | null>(null); // millis of last shown push

  // ── Listen to settings/showcase_popup ─────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      doc(clientDb, "settings", "showcase_popup"),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as PopupDoc;
        const triggeredMs = data.triggeredAt?.toMillis() ?? null;

        // First snapshot: just record the current timestamp as "already seen"
        // so a stale push from a previous session never fires the overlay.
        if (isFirstRef.current) {
          isFirstRef.current = false;
          lastTsRef.current  = triggeredMs;
          return;
        }

        // Only show when the timestamp is genuinely new
        if (
          triggeredMs !== null &&
          triggeredMs !== lastTsRef.current &&
          data.active !== false
        ) {
          lastTsRef.current = triggeredMs;

          // Clear any in-flight dismiss timer before showing again
          if (timerRef.current) clearTimeout(timerRef.current);

          setMessage(data.message ?? "");
          setVisible(true);

          timerRef.current = setTimeout(() => setVisible(false), SHOW_MS);
        }
      },
      (err) => console.error("[ShowcasePopupOverlay] snapshot error:", err)
    );

    return unsub;
  }, []);

  // ── Cleanup dismiss timer on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Keyframe injection — scoped so it doesn't pollute global styles */}
      <style>{`
        @keyframes popup-enter {
          0%   { opacity: 0;   transform: scale(0.35) translateY(40px); }
          65%  { opacity: 1;   transform: scale(1.04) translateY(-6px);  }
          100% { opacity: 1;   transform: scale(1)    translateY(0);     }
        }
        @keyframes popup-glow-pulse {
          0%, 100% { text-shadow: 0 0 20px rgba(255,255,255,0.7),  0 0 60px rgba(255,255,255,0.3); }
          50%       { text-shadow: 0 0 40px rgba(255,255,255,1),    0 0 120px rgba(255,255,255,0.6); }
        }
        .popup-enter-anim {
          animation:
            popup-enter      0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both,
            popup-glow-pulse 2s   ease-in-out                          2s infinite;
        }
      `}</style>

      {/* Full-screen backdrop */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">

        {/* Radial spotlight behind the text */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 70%)",
          }}
        />

        {/* Message */}
        <p
          className="popup-enter-anim relative z-10 px-12 text-center text-7xl font-black leading-tight text-white md:text-8xl"
          dir="rtl"
          style={{
            textShadow:
              "0 0 20px rgba(255,255,255,0.7), 0 0 60px rgba(255,255,255,0.3)",
          }}
        >
          {message}
        </p>

        {/* Progress bar — counts down the 7-second auto-dismiss */}
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div
            className="h-full bg-white/60 origin-right"
            style={{
              animation: `linear ${SHOW_MS}ms forwards`,
              animationName: "progress-shrink",
            }}
          />
        </div>
        <style>{`
          @keyframes progress-shrink {
            from { width: 100%; }
            to   { width: 0%;   }
          }
        `}</style>
      </div>
    </>
  );
}
