import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Initialise the Firebase Admin SDK exactly once.
 *
 * The `getApps().length` guard prevents double-initialisation when the module
 * is hot-reloaded in the emulator or imported by multiple entry points.
 * When deployed, `initializeApp()` with no arguments picks up credentials
 * automatically from the Cloud Functions runtime environment.
 */
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
