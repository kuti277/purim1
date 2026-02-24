import { useContext } from "react";
import { SipContext, type SipContextValue } from "../contexts/SipContext";

/**
 * Returns the current SIP context value.
 *
 * Must be called from a component that is a descendant of <SipProvider>.
 * Throws a descriptive error if used outside the provider so misconfiguration
 * is caught immediately during development.
 */
export function useSip(): SipContextValue {
  const ctx = useContext(SipContext);

  if (ctx === null) {
    throw new Error(
      "useSip() must be called inside <SipProvider>. " +
        "Ensure the component tree is wrapped with <SipProvider>."
    );
  }

  return ctx;
}
