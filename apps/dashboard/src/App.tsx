import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";

// ─── Inner content (must be inside AuthProvider to call useAuth) ──────────────

function AppContent() {
  const { user, loading } = useAuth();

  // Show a centered spinner while onAuthStateChanged resolves.
  // This prevents a flash of the login page for already-authenticated users.
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg
          className="h-8 w-8 animate-spin text-indigo-600"
          viewBox="0 0 24 24"
          fill="none"
          aria-label="Loading"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
          />
        </svg>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // ── Authenticated placeholder (Step 2.4 will replace this with the full layout) ──
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-800">
          Dashboard Authenticated
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Signed in as{" "}
          <span className="font-medium text-gray-700">{user.displayName}</span>
          &nbsp;·&nbsp;
          <span className="capitalize">{user.role}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
