"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
/**
 * Initialise the Firebase Admin SDK exactly once.
 *
 * The `getApps().length` guard prevents double-initialisation when the module
 * is hot-reloaded in the emulator or imported by multiple entry points.
 * When deployed, `initializeApp()` with no arguments picks up credentials
 * automatically from the Cloud Functions runtime environment.
 */
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
exports.db = (0, firestore_1.getFirestore)();
//# sourceMappingURL=admin.js.map