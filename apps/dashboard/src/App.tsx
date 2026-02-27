import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./router/ProtectedRoute";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { BoysPage } from "./pages/BoysPage";
import { FoldersPage } from "./pages/FoldersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { BindersPage } from "./pages/BindersPage";
import { TickerPage } from "./pages/TickerPage";
import { AddressBankPage } from "./pages/AddressBankPage";
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
 *      /workers          →     BoysPage             (collectors / boys management)
 *      /settings         →     SettingsPage         (control room — TV showcase settings)
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
              <Route path="workers" element={<BoysPage />} />
              <Route path="binders" element={<BindersPage />} />
              <Route path="address-bank" element={<AddressBankPage />} />
              <Route path="ticker" element={<TickerPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
