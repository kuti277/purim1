import { useState } from "react";
import { useSip } from "../hooks/useSip";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge() {
  const { isConnected, isRegistered } = useSip();

  if (isRegistered) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        רשום
      </span>
    );
  }
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-yellow-600/20">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        מחובר
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      מנותק
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function SipSettingsCard() {
  const sipCtx = useSip();

  const [isOpen, setIsOpen] = useState(true);
  const [wsUrl, setWsUrl] = useState("wss://sip.yemot.co.il/ws");
  const [sipUser, setSipUser] = useState("");
  const [sipPassword, setSipPassword] = useState("");

  const canConnect = wsUrl.trim() !== "" && sipUser.trim() !== "" && sipPassword.trim() !== "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-right hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 text-indigo-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
            />
          </svg>
          <span className="text-sm font-semibold text-gray-800">הגדרות SIP</span>
          <StatusBadge />
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* WSS URL */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600" htmlFor="sip-wss">
                כתובת WSS
              </label>
              <input
                id="sip-wss"
                type="text"
                dir="ltr"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="wss://sip.yemot.co.il/ws"
              />
            </div>

            {/* SIP User */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600" htmlFor="sip-user">
                משתמש SIP
              </label>
              <input
                id="sip-user"
                type="text"
                dir="ltr"
                value={sipUser}
                onChange={(e) => setSipUser(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="extension@domain"
              />
            </div>

            {/* SIP Password */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600" htmlFor="sip-pass">
                סיסמת SIP
              </label>
              <input
                id="sip-pass"
                type="password"
                dir="ltr"
                value={sipPassword}
                onChange={(e) => setSipPassword(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => sipCtx.connect(wsUrl.trim(), sipUser.trim(), sipPassword.trim())}
              disabled={!canConnect}
              className="
                rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                shadow-sm transition-colors hover:bg-indigo-500
                disabled:cursor-not-allowed disabled:opacity-50
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
              "
            >
              התחבר
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
