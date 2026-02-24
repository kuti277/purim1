/**
 * Firestore + Auth Emulator Seed Script
 * ----------------------------------------
 * Seeds test data for manual E2E testing of the dashboard login and
 * TransactionsPage donation flow.
 *
 * Run from the `functions/` directory:
 *   node scripts/seed-emulator.js
 *
 * Requires BOTH emulators to be running:
 *   Auth      → localhost:9099
 *   Firestore → localhost:8080
 *
 * firebase-admin resolves from functions/node_modules/ automatically.
 */

"use strict";

// ── Point firebase-admin at the local emulators ───────────────────────────────
// Both env vars MUST be set before initializeApp() is called.
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST      = "127.0.0.1:8080";

const { initializeApp } = require("firebase-admin/app");
const { getAuth }       = require("firebase-admin/auth");
const { getFirestore }  = require("firebase-admin/firestore");

// 'demo-' prefix tells the emulator this is a local-only project —
// no real Firebase project or credentials are needed.
initializeApp({ projectId: "demo-purim1" });

const auth = getAuth();
const db   = getFirestore();

// ── Seed constants ────────────────────────────────────────────────────────────

const ADMIN_EMAIL        = "admin@example.com";
const ADMIN_PASSWORD     = "123456";
const ADMIN_DISPLAY_NAME = "Admin Admin";

const FOLDER_ID = "folder-001";

const BOYS = [
  { name: "ישראל ישראלי", shiur: "א" },
  { name: "משה כהן",      shiur: "ב" },
  { name: "דוד לוי",      shiur: "ג" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a Firebase Auth user, handling re-runs gracefully.
 * If the email already exists, fetches and returns the existing UID
 * instead of throwing.
 *
 * @returns {Promise<string>} The user's UID.
 */
async function upsertAuthUser(email, password, displayName) {
  try {
    const record = await auth.createUser({ email, password, displayName });
    console.log(`  ✓  Auth user created:         ${email}  (uid: ${record.uid})`);
    return record.uid;
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(email);
      console.log(`  ℹ  Auth user already exists:  ${email}  (uid: ${existing.uid})`);
      return existing.uid;
    }
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("\n🌱  Seeding Auth + Firestore emulators...\n");

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  // AuthContext reads users/{uid} from Firestore after sign-in to hydrate the
  // User record. Both the Auth entry and the Firestore doc are required.

  const uid = await upsertAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME);

  await db.collection("users").doc(uid).set({
    email:       ADMIN_EMAIL,
    role:        "admin",
    displayName: ADMIN_DISPLAY_NAME,
  });
  console.log(`  ✓  users/${uid}  { email: '${ADMIN_EMAIL}', role: 'admin', displayName: '${ADMIN_DISPLAY_NAME}' }`);

  // ── 2. Folder ──────────────────────────────────────────────────────────────

  await db.collection("folders").doc(FOLDER_ID).set({
    status:      "released",
    phoneNumber: "0501234567",
  });
  console.log(`\n  ✓  folders/${FOLDER_ID}  { status: 'released', phoneNumber: '0501234567' }`);

  // ── 3. Boys ────────────────────────────────────────────────────────────────

  for (const boy of BOYS) {
    const ref = await db.collection("boys").add({
      name:        boy.name,
      shiur:       boy.shiur,
      status:      "in_field",
      totalRaised: 0,
      folderId:    FOLDER_ID,
    });
    console.log(`  ✓  boys/${ref.id}  { name: '${boy.name}', shiur: '${boy.shiur}', totalRaised: 0 }`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n✅  Seed complete.\n");
  console.log("   Login credentials:");
  console.log(`     Email:    ${ADMIN_EMAIL}`);
  console.log(`     Password: ${ADMIN_PASSWORD}\n`);
  console.log("   Expected split for a 100 ₪ folder donation (3 boys):");
  console.log("     boys[0] → 33.34 ₪   (receives the 1-agora remainder)");
  console.log("     boys[1] → 33.33 ₪");
  console.log("     boys[2] → 33.33 ₪");
  console.log("     total   = 100.00 ₪  ✓\n");
  console.log("   Emulator UI → http://localhost:4000\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("\n❌  Seed failed:", err.message ?? err);
  process.exit(1);
});
