import { useSip } from "../hooks/useSip";

// ─── Status label helpers ─────────────────────────────────────────────────────

function statusLabel(status: string): string {
  switch (status) {
    case "connecting":
      return "מתחבר...";
    case "ringing":
      return "מצלצל...";
    case "active":
      return "שיחה פעילה";
    default:
      return "";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CallOverlay() {
  const sipCtx = useSip();
  const { activeCallStatus, calledLabel, calledNumber, isMuted, hangUp, toggleMute } = sipCtx;

  if (activeCallStatus === "idle") return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-6 left-6 z-50 w-72 rounded-xl shadow-xl bg-white ring-1 ring-gray-200 overflow-hidden"
    >
      {/* Header bar */}
      <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">שיחה פעילה</span>
        {/* Animated ping dot */}
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>
      </div>

      {/* Call info */}
      <div className="px-4 py-4 space-y-1">
        <p className="text-sm font-semibold text-gray-900">{calledLabel}</p>
        <p dir="ltr" className="text-xs font-mono text-gray-500 tabular-nums">
          {calledNumber}
        </p>
        <p className="text-xs text-indigo-600 font-medium">{statusLabel(activeCallStatus)}</p>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 flex items-center gap-2">
        {/* Mute / unmute */}
        <button
          type="button"
          onClick={toggleMute}
          className={`
            flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2
            text-xs font-semibold transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-1
            ${
              isMuted
                ? "bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400"
            }
          `}
        >
          {isMuted ? (
            <>
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 19L5 5M12 18.75A6.75 6.75 0 015.25 12v-.75M12 18.75V21m0 0H9m3 0h3M12 3a3 3 0 013 3v5.25M9 9.75V12a3 3 0 005.879.928"
                />
              </svg>
              בטל השתקה
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75A6.75 6.75 0 015.25 12v-.75m13.5 0V12a6.75 6.75 0 01-13.5 0m13.5 0v.75M12 18.75V21m0 0H9m3 0h3M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3z"
                />
              </svg>
              השתק
            </>
          )}
        </button>

        {/* Hang up */}
        <button
          type="button"
          onClick={hangUp}
          className="
            flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2
            bg-red-600 text-xs font-semibold text-white
            hover:bg-red-500 transition-colors
            focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1
          "
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          נתק
        </button>
      </div>
    </div>
  );
}
