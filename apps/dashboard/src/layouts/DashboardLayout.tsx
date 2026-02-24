import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// ─── Hebrew role labels ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "מנהל",
  coordinator: "רכז",
  volunteer: "מתרים",
  recipient: "נמען",
};

// ─── Nav link style helper ────────────────────────────────────────────────────

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base =
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150";
  return isActive
    ? `${base} bg-indigo-50 text-indigo-700`
    : `${base} text-gray-600 hover:bg-gray-50 hover:text-gray-900`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-indigo-600" : "text-gray-400"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l9-9 9 9M4.5 10.5V19a1 1 0 001 1h4v-5h5v5h4a1 1 0 001-1v-8.5"
      />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-indigo-600" : "text-gray-400"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-1a4 4 0 00-5.916-3.517M17 20H7m10 0v-1c0-.653-.1-1.283-.284-1.874M7 20H2v-1a4 4 0 015.916-3.517M7 20v-1c0-.653.1-1.283.284-1.874m0 0a5.97 5.97 0 013.432-1.126 5.97 5.97 0 013.284 1.126M15 7a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function IconFolder({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-indigo-600" : "text-gray-400"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function DashboardLayout() {
  const { user, signOut } = useAuth();

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 font-sans">

      {/* ── Fixed top header ──────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-20 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">

        {/* Brand — right side in RTL */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <svg
              className="h-4.5 w-4.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3l2.5 5H20l-4.5 4 1.7 5.5L12 14.5 6.8 17.5 8.5 12 4 8h5.5L12 3z"
              />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-gray-900">
            פלטפורמת פורים
          </span>
        </div>

        {/* User info + sign-out — left side in RTL */}
        <div className="flex items-center gap-4">
          {/* User pill */}
          <div className="hidden sm:flex items-center gap-2.5 rounded-full bg-gray-50 border border-gray-200 py-1.5 px-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold select-none">
              {user?.displayName?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-gray-800 whitespace-nowrap">
                {user?.displayName}
              </p>
              <p className="text-xs text-gray-400">
                {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
              </p>
            </div>
          </div>

          {/* Sign-out button */}
          <button
            onClick={() => void signOut()}
            className="
              flex items-center gap-1.5 rounded-lg border border-gray-200
              bg-white px-3 py-1.5 text-sm font-medium text-gray-600
              shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
            "
            title="יציאה מהמערכת"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
            <span className="hidden sm:inline">יציאה</span>
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + main ──────────────────────────────────────────── */}
      <div className="flex pt-16 min-h-screen">

        {/* Sidebar — fixed, right side in RTL */}
        <aside className="fixed top-16 right-0 bottom-0 z-10 w-64 bg-white border-s border-gray-200 flex flex-col">
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5" aria-label="ניווט ראשי">

            <NavLink to="/" end className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconHome active={isActive} />
                  ראשי
                </>
              )}
            </NavLink>

            <NavLink to="/workers" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconUsers active={isActive} />
                  ניהול מתרימים
                </>
              )}
            </NavLink>

            <NavLink to="/field" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  <IconFolder active={isActive} />
                  ניהול שטח
                </>
              )}
            </NavLink>

          </nav>

          {/* Sidebar footer */}
          <div className="p-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              פלטפורמת פורים · {new Date().getFullYear()}
            </p>
          </div>
        </aside>

        {/* Main content — pushed away from the right sidebar via ms-64 */}
        <main className="flex-1 ms-64 min-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-8">
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  );
}
