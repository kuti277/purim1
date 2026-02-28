/// <reference types="vite/client" />

// Explicit fallback — ensures import.meta.env is typed even when the vite
// package is not resolvable from this package's node_modules (e.g. Vercel CI).
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_USE_FIREBASE_EMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
