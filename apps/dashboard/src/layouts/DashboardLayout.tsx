import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// ─── Hebrew role labels ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:       "מנהל",
  coordinator: "רכז",
  volunteer:   "מתרים",
  recipient:   "נמען",
};

// ─── Nav link style ───────────────────────────────────────────────────────────
//
// Active:   left-side cyan accent bar + cyan-tinted gradient background.
//           The sidebar is physically on the right; the bar faces the content.
// Inactive: dim slate text that brightens cleanly on hover.

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base =
    "flex items-center gap-3 rounded-r-xl px-3 py-2.5 text-sm font-semibold " +
    "transition-all duration-150 border-l-[3px]";
  return isActive
    ? `${base} bg-gradient-to-r from-cyan-500/20 via-cyan-400/5 to-transparent border-l-cyan-400 text-white`
    : `${base} border-l-transparent text-slate-400 hover:bg-slate-800/60 hover:text-white`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 12l9-9 9 9M4.5 10.5V19a1 1 0 001 1h4v-5h5v5h4a1 1 0 001-1v-8.5" />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17 20h5v-1a4 4 0 00-5.916-3.517M17 20H7m10 0v-1c0-.653-.1-1.283-.284-1.874M7 20H2v-1a4 4 0 015.916-3.517M7 20v-1c0-.653.1-1.283.284-1.874m0 0a5.97 5.97 0 013.432-1.126 5.97 5.97 0 013.284 1.126M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconReceipt({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  );
}

function IconSettings({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconTicker({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
    </svg>
  );
}

function IconBinder({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

function IconAddressBank({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm0 0H21M12 2.25v19.5M2.25 8.25H21M2.25 15.75H21" />
    </svg>
  );
}

function IconFolder({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function IconSync({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function DashboardLayout() {
  const { user, signOut } = useAuth();

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 font-sans">

      {/* ── Fixed top header ──────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-20 flex flex-col bg-slate-950/95 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.04)]">

        {/* Main header row */}
        <div className="flex h-16 items-center justify-between px-6">

          {/* Brand — right side in RTL */}
          <div className="flex items-center gap-3">
            {/* Logo mark with multi-color gradient */}
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-lime-400 to-orange-500 shadow-[0_0_18px_rgba(34,211,238,0.6)]">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 3l2.5 5H20l-4.5 4 1.7 5.5L12 14.5 6.8 17.5 8.5 12 4 8h5.5L12 3z" />
              </svg>
            </div>
            <span className="text-base font-extrabold tracking-tight bg-gradient-to-l from-orange-400 via-lime-400 to-cyan-400 bg-clip-text text-transparent">
              פלטפורמת פורים
            </span>
          </div>

          {/* User info + sign-out — left side in RTL */}
          <div className="flex items-center gap-3">

            {/* User pill */}
            <div className="hidden sm:flex items-center gap-2.5 rounded-full bg-slate-800/90 border border-slate-700 py-1.5 px-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-pink-600 text-white text-xs font-bold">
                {user?.displayName?.charAt(0).toUpperCase() ?? "?"}
              </div>
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-white whitespace-nowrap">
                  {user?.displayName}
                </p>
                <p className="text-[11px] text-cyan-400 font-medium">
                  {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
                </p>
              </div>
            </div>

            {/* Sign-out */}
            <button
              onClick={() => void signOut()}
              className="
                flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-transparent
                px-3 py-2 text-sm font-semibold text-cyan-400
                transition-all hover:bg-cyan-500/15 hover:border-cyan-400/70
                focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-slate-950
              "
              title="יציאה מהמערכת"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">יציאה</span>
            </button>
          </div>
        </div>

        {/* Multi-color gradient bottom border — the visual "power line" */}
        <div className="h-[2px] shrink-0 bg-gradient-to-r from-cyan-500 via-lime-400 via-orange-400 to-pink-500" />
      </header>

      {/* ── Body: sidebar + main ──────────────────────────────────────────── */}
      <div className="flex pt-[66px] min-h-screen">

        {/* Sidebar — fixed, right side in RTL */}
        <aside className="fixed top-[66px] right-0 bottom-0 z-10 w-64 flex flex-col bg-slate-900 border-l border-slate-800">

          {/* Top gradient accent stripe */}
          <div className="h-[3px] shrink-0 bg-gradient-to-r from-cyan-500 via-lime-400 to-orange-500" />

          {/* Welcome block */}
          <div className="px-4 pt-5 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-400">
                מערכת פעילה
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              ברוכים הבאים לניהול מערכת של חברת{" "}
              <span className="font-bold text-white">קוטיס מערכות תקשורת</span>
            </p>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5 no-scrollbar" aria-label="ניווט ראשי">

            <NavLink to="/" end className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconHome active={isActive} />
                  <span>לוח בקרה</span>
                  {isActive && (
                    <span className="mr-auto inline-flex items-center justify-center h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/workers" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconUsers active={isActive} />
                  <span>ניהול מתרימים</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/binders" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconBinder active={isActive} />
                  <span>ניהול קלסרים</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/address-bank" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconAddressBank active={isActive} />
                  <span>מאגר כתובות</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/field" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconFolder active={isActive} />
                  <span>ניהול שטח</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/transactions" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconReceipt active={isActive} />
                  <span>תרומות ועסקאות</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/ticker" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconTicker active={isActive} />
                  <span>ניהול טיקר</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/sync-center" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconSync active={isActive} />
                  <span>מרכז סנכרון</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink to="/settings" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconSettings active={isActive} />
                  <span>חדר בקרה</span>
                  {isActive && (
                    <span className="mr-auto inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  )}
                </>
              )}
            </NavLink>

          </nav>

          {/* Sidebar footer */}
          <div className="p-4 border-t border-slate-800/80">
            <div className="h-px mb-3 bg-gradient-to-l from-cyan-500/40 via-lime-500/20 to-transparent" />
            <p className="text-center text-[10px] font-medium tracking-widest text-slate-600 uppercase">
              קוטיס · {new Date().getFullYear()}
            </p>
          </div>
        </aside>

        {/* Main content — ms-64 pushes away from the right sidebar */}
        <main className="flex-1 ms-64 overflow-y-auto bg-slate-950 min-h-[calc(100vh-66px)]">
          <div className="p-8">
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  );
}
