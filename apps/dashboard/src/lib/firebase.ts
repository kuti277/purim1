import { clientAuth, clientDb, clientStorage } from "@purim/firebase-config";
import { connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectStorageEmulator } from "firebase/storage";

/**
 * Connect to the local Firebase Emulator Suite when VITE_USE_FIREBASE_EMULATOR=true.
 *
 * The window.__PURIM_EMULATORS_CONNECTED__ flag prevents duplicate connection
 * calls during Vite hot module replacement (HMR) — Firestore throws if
 * connectFirestoreEmulator is called more than once per SDK instance.
 */
declare global {
  interface Window {
    __PURIM_EMULATORS_CONNECTED__?: boolean;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useEmulator = (import.meta as any).env?.VITE_USE_FIREBASE_EMULATOR === "true";

if (
  useEmulator &&
  !window.__PURIM_EMULATORS_CONNECTED__
) {
  connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(clientDb, "127.0.0.1", 8080);
  connectStorageEmulator(clientStorage, "127.0.0.1", 9199);
  window.__PURIM_EMULATORS_CONNECTED__ = true;
}

export { clientAuth, clientDb, clientStorage };
