import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../contexts/AuthContext";

/**
 * Returns the current auth context value.
 *
 * Must be called from a component that is a descendant of <AuthProvider>.
 * Throws a descriptive error if used outside the provider so misconfiguration
 * is caught immediately during development.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (ctx === null) {
    throw new Error(
      "useAuth() must be called inside <AuthProvider>. " +
        "Ensure the component tree is wrapped with <AuthProvider> in App.tsx."
    );
  }

  return ctx;
}
