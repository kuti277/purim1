/**
 * @purim/firebase-config
 *
 * Client-side Firebase SDK initialization for all browser apps in the monorepo.
 *
 * ⚠️  This package is BROWSER-ONLY.
 *     It must NEVER be imported in firebase-functions or any Node.js context.
 *     The Admin SDK (firebase-admin) lives exclusively inside functions/.
 *
 * Usage:
 *   import { clientAuth, clientDb } from "@purim/firebase-config";
 */
export {
  clientApp,
  clientAuth,
  clientDb,
  clientStorage,
} from "./client";
