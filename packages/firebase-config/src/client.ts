import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env as Record<string, string>;

/**
 * Firebase client configuration built from Vite environment variables.
 *
 * All variables are prefixed VITE_ so Vite statically replaces them at
 * bundle time. They are intentionally public — Firebase client config
 * is not secret (security is enforced by Firestore rules and Auth).
 *
 * Copy apps/<app-name>/.env.example → .env.local and fill in your values.
 */
const firebaseConfig = {
  apiKey:            env["VITE_FIREBASE_API_KEY"],
  authDomain:        env["VITE_FIREBASE_AUTH_DOMAIN"],
  projectId:         env["VITE_FIREBASE_PROJECT_ID"],
  storageBucket:     env["VITE_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
  appId:             env["VITE_FIREBASE_APP_ID"],
};

/**
 * Singleton Firebase client app.
 *
 * The `getApps().length` guard prevents "app already exists" errors during
 * Vite hot module replacement (HMR), where this module may be re-evaluated
 * without the browser tab reloading.
 */
export const clientApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Firebase Authentication instance.
 * Use for: onAuthStateChanged, signInWithEmailAndPassword, signOut, etc.
 */
export const clientAuth: Auth = getAuth(clientApp);

/**
 * Cloud Firestore instance.
 * Use for: collection, doc, onSnapshot, getDocs, setDoc, updateDoc, deleteDoc.
 */
export const clientDb: Firestore = getFirestore(clientApp);

/**
 * Firebase Storage instance.
 * Use for: ref, uploadBytes, getDownloadURL, deleteObject.
 */
export const clientStorage: FirebaseStorage = getStorage(clientApp);
