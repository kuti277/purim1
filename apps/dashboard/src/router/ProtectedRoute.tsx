import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Route guard for all authenticated pages.
 *
 * Render states:
 *  - loading  → centered spinner (prevents flash of /login for existing sessions)
 *  - no user  → redirect to /login (replace so Back button doesn't loop)
 *  - user ok  → render nested routes via <Outlet />
 *
 * Usage in router:
 *   <Route element={<ProtectedRoute />}>
 *     <Route element={<DashboardLayout />}>
 *       <Route index element={<DashboardHomePage />} />
 *     </Route>
 *   </Route>
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg
          className="h-8 w-8 animate-spin text-indigo-600"
          viewBox="0 0 24 24"
          fill="none"
          aria-label="טוען..."
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
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
