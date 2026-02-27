import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

type DisplayMode = "text" | "image" | "text_on_image";

interface PopupDoc {
  message?:     string;
  imageUrl?:    string;
  displayMode?: DisplayMode;
  duration?:    number;   // seconds
  isInfinite?:  boolean;
  triggeredAt?: Timestamp;
  isActive?:    boolean;
}

interface PopupState {
  message:     string;
  imageUrl:    string;
  displayMode: DisplayMode;
  durationMs:  number;
  isInfinite:  boolean;
}

// ─── Keyframes (injected once) ────────────────────────────────────────────────

const STYLES = `
  @keyframes popup-enter {
    0%   { opacity: 0; transform: scale(0.35) translateY(40px); }
    65%  { opacity: 1; transform: scale(1.04) translateY(-6px); }
    100% { opacity: 1; transform: scale(1)    translateY(0);    }
  }
  @keyframes popup-glow-pulse {
    0%, 100% { text-shadow: 0 0 24px rgba(255,255,255,0.75), 0 0 60px rgba(255,255,255,0.3); }
    50%       { text-shadow: 0 0 48px rgba(255,255,255,1),   0 0 120px rgba(255,255,255,0.6); }
  }
  @keyframes img-enter {
    0%   { opacity: 0; transform: scale(1.08); }
    100% { opacity: 1; transform: scale(1);    }
  }
  .popup-text-anim {
    animation:
      popup-enter      0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both,
      popup-glow-pulse 2.4s  ease-in-out 2s infinite;
  }
  .popup-img-anim {
    animation: img-enter 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  }
  @keyframes progress-shrink-var {
    from { width: 100%; }
    to   { width: 0%;   }
  }
`;

// ─── Sub-renders ──────────────────────────────────────────────────────────────

function GlowText({ text }: { text: string }) {
  return (
    <p
      className="popup-text-anim relative z-10 px-12 text-center font-black leading-tight text-white md:text-8xl"
      style={{
        fontSize: "clamp(3rem, 8vw, 7rem)",
        textShadow: "0 0 24px rgba(255,255,255,0.75), 0 0 60px rgba(255,255,255,0.3)",
      }}
      dir="rtl"
    >
      {text}
    </p>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShowcasePopupOverlay() {
  const [visible, setVisible] = useState(false);
  const [popup, setPopup]     = useState<PopupState>({
    message:     "",
    imageUrl:    "",
    displayMode: "text",
    durationMs:  7_000,
    isInfinite:  false,
  });
  // Incremented on every new push to force progress-bar CSS restart via key
  const [pushKey, setPushKey] = useState(0);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRef = useRef(true);
  const lastTsRef  = useRef<number | null>(null);

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      doc(clientDb, "settings", "showcase_popup"),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as PopupDoc;
        const triggeredMs = data.triggeredAt?.toMillis() ?? null;

        // Admin killed the popup → hide immediately regardless of state
        if (data.isActive === false) {
          if (timerRef.current) clearTimeout(timerRef.current);
          setVisible(false);
          // Still mark first-snapshot consumed so future pushes work
          if (isFirstRef.current) {
            isFirstRef.current = false;
            lastTsRef.current  = triggeredMs;
          }
          return;
        }

        // First snapshot: record timestamp, never show stale content
        if (isFirstRef.current) {
          isFirstRef.current = false;
          lastTsRef.current  = triggeredMs;
          return;
        }

        // New push detected
        if (triggeredMs !== null && triggeredMs !== lastTsRef.current) {
          lastTsRef.current = triggeredMs;

          if (timerRef.current) clearTimeout(timerRef.current);

          const durationMs = (data.duration ?? 7) * 1_000;
          const infinite   = data.isInfinite ?? false;

          setPopup({
            message:     data.message    ?? "",
            imageUrl:    data.imageUrl   ?? "",
            displayMode: data.displayMode ?? "text",
            durationMs,
            isInfinite:  infinite,
          });
          setPushKey((k) => k + 1);
          setVisible(true);

          if (!infinite) {
            timerRef.current = setTimeout(() => setVisible(false), durationMs);
          }
        }
      },
      (err) => console.error("[ShowcasePopupOverlay] snapshot error:", err)
    );

    return unsub;
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  const { message, imageUrl, displayMode, durationMs, isInfinite } = popup;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>

      <div className="fixed inset-0 z-[9999] overflow-hidden">

        {/* ── TEXT ONLY ── */}
        {displayMode === "text" && (
          <div className="flex h-full w-full items-center justify-center bg-black/85 backdrop-blur-md">
            {/* Radial spotlight */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255,255,255,0.08) 0%, transparent 70%)",
              }}
            />
            <GlowText text={message} />
          </div>
        )}

        {/* ── IMAGE ONLY ── */}
        {displayMode === "image" && (
          <div className="relative flex h-full w-full items-center justify-center bg-black">
            <img
              src={imageUrl}
              alt=""
              className="popup-img-anim absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
            {/* Subtle vignette */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
              }}
            />
          </div>
        )}

        {/* ── TEXT ON IMAGE ── */}
        {displayMode === "text_on_image" && (
          <div className="relative flex h-full w-full items-center justify-center">
            {/* Background image */}
            <img
              src={imageUrl}
              alt=""
              className="popup-img-anim absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            {/* Dark scrim so text pops */}
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
            {/* Radial spotlight over the scrim */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 70%)",
              }}
            />
            <GlowText text={message} />
          </div>
        )}

        {/* ── Progress bar (auto-dismiss only) ── */}
        {!isInfinite && (
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-white/10">
            <div
              key={pushKey}
              className="h-full bg-white/50 origin-right"
              style={{
                animationName:     "progress-shrink-var",
                animationDuration: `${durationMs}ms`,
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
              }}
            />
          </div>
        )}

        {/* ── Infinite badge ── */}
        {isInfinite && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-1.5 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/60">
              מוצג עד לכיבוי ידני
            </span>
          </div>
        )}

      </div>
    </>
  );
}
