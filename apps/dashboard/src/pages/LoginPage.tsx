import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";

// ─── Firebase error → human-readable message ──────────────────────────────────

function parseFirebaseError(err: unknown): string {
  if (err !== null && typeof err === "object" && "code" in err) {
    switch ((err as { code: string }).code) {
      // v9+ modular SDK unifies wrong-password and user-not-found into this code.
      case "auth/invalid-credential":
      // Legacy codes kept for emulator compatibility.
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Invalid email or password. Please try again.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Please wait a few minutes and try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Contact your administrator.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      default:
        return "An unexpected error occurred. Please try again.";
    }
  }
  return "An unexpected error occurred. Please try again.";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      // On success, AuthContext.onAuthStateChanged fires and App.tsx re-renders
      // the authenticated view automatically. No manual navigation needed here.
    } catch (err) {
      setError(parseFirebaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">

      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
          {/* Star-of-David-ish decorative mark */}
          <svg
            className="w-7 h-7 text-white"
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Purim Platform
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Campaign Management Dashboard
        </p>
      </div>

      {/* ── Login card ───────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 px-8 py-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-6">
          Sign in to your account
        </h2>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              placeholder="admin@example.com"
              className="
                block w-full rounded-lg border border-gray-300 bg-white
                px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400
                shadow-sm transition
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
              "
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              placeholder="••••••••"
              className="
                block w-full rounded-lg border border-gray-300 bg-white
                px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400
                shadow-sm transition
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
              "
            />
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || !email || !password}
            className="
              mt-1 flex w-full items-center justify-center gap-2
              rounded-lg bg-indigo-600 px-4 py-2.5
              text-sm font-semibold text-white shadow-sm
              transition hover:bg-indigo-700
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isSubmitting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
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
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <p className="mt-8 text-center text-xs text-gray-400">
        Admin access only.&nbsp;
        Contact your administrator to reset your password.
      </p>
    </div>
  );
}
