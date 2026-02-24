import { clientDb } from "@purim/firebase-config";
import { connectFirestoreEmulator } from "firebase/firestore";

/**
 * Connect to the Firestore emulator when VITE_USE_FIREBASE_EMULATOR=true.
 *
 * The window.__PURIM_EMULATORS_CONNECTED__ guard prevents duplicate calls
 * during Vite HMR, since connectFirestoreEmulator throws on a second call.
 */
declare global {
  interface Window {
    __PURIM_EMULATORS_CONNECTED__?: boolean;
  }
}

if (
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" &&
  !window.__PURIM_EMULATORS_CONNECTED__
) {
  connectFirestoreEmulator(clientDb, "127.0.0.1", 8080);
  window.__PURIM_EMULATORS_CONNECTED__ = true;
}

export { clientDb };
