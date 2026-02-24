import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./router/ProtectedRoute";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { FoldersPage } from "./pages/FoldersPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { LoginPage } from "./pages/LoginPage";

/**
 * Route map:
 *
 *  /login                → LoginPage          (public — redirects to / if already authed)
 *  /                     → ProtectedRoute      (auth guard + loading state)
 *    /                   →   DashboardLayout   (persistent shell with header + sidebar)
 *      / (index)         →     DashboardHomePage
 *      /field            →     FoldersPage          (field & folders management with SIP dialer)
 *      /transactions     →     TransactionsPage     (manual donations + transaction history)
 *      /workers          →     WorkersPage          (added in Step 2.7)
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes — ProtectedRoute handles auth check + loading */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<DashboardHomePage />} />
              <Route path="field" element={<FoldersPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              {/* Step 2.7: <Route path="workers" element={<WorkersPage />} /> */}
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
