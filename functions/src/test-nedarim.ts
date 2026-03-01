/**
 * Local debug script — Nedarim sync tester
 *
 * Fetches real data from Nedarim, loads boys from Firestore, and runs the
 * exact same matching logic as syncNedarimTransactions — without deploying
 * anything or waiting for the 5-minute cron.
 *
 * Prerequisites:
 *   1. firebase-admin credentials:
 *        Option A — set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON:
 *                   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *        Option B — gcloud CLI: gcloud auth application-default login
 *   2. functions/.env must contain NEDARIM_MOSAD_ID and NEDARIM_API_PASSWORD
 *
 * Run from the `functions/` directory:
 *   npx tsx src/test-nedarim.ts
 *
 * Optionally override how many recent transactions to show:
 *   LAST_ID=66973900 npx tsx src/test-nedarim.ts
 */

import * as fs   from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

// ─── Load .env (no dotenv dependency — plain fs read) ────────────────────────

const envFile = path.resolve(__dirname, "../.env");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
  console.log("✅  Loaded .env from", envFile);
} else {
  console.warn("⚠️   No .env file found at", envFile, "— relying on shell environment");
}

// ─── Validate credentials ─────────────────────────────────────────────────────

const MOSAD_ID    = process.env["NEDARIM_MOSAD_ID"];
const API_PASSWORD = process.env["NEDARIM_API_PASSWORD"];

if (!MOSAD_ID || !API_PASSWORD) {
  console.error("❌  NEDARIM_MOSAD_ID or NEDARIM_API_PASSWORD is not set. Aborting.");
  process.exit(1);
}

// ─── Initialize firebase-admin ────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "kuti-purim",
  });
}
const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep(label: string) {
  console.log("\n" + "─".repeat(60));
  console.log(` ${label}`);
  console.log("─".repeat(60));
}

function fieldReport(tx: Record<string, unknown>) {
  const fields = ["TransactionId", "Amount", "ClientName", "Param1", "Param2", "Comments", "MatrimId", "Date"];
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = tx[f] ?? "(empty)";
  // Show any extra fields not in our list
  for (const [k, v] of Object.entries(tx)) {
    if (!fields.includes(k)) out[`[extra] ${k}`] = v;
  }
  return out;
}

// ─── Exact matching logic (mirrors syncNedarimTransactions) ───────────────────

function matchBoy(
  tx: Record<string, unknown>,
  allBoys: Array<Record<string, unknown> & { id: string }>
): (typeof allBoys)[0] | undefined {
  const txParam1   = String(tx["Param1"]   ?? "").trim();
  const txParam2   = String(tx["Param2"]   ?? "").trim();
  const txComments = String(tx["Comments"] ?? "").trim();

  return allBoys.find((b) => {
    const name  = String(b["nedarimName"] ?? "").trim();
    const donor = String(b["donorNumber"] ?? "").trim();
    if (!name && !donor) return false;
    return (
      (name  && (txParam1 === name  || txParam2 === name  || txComments.includes(name)))  ||
      (donor && (txParam1 === donor || txParam2 === donor))
    );
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Fetch transactions from Nedarim ──────────────────────────────────────
  const lastId = process.env["LAST_ID"] ?? "0";  // 0 = no filter (returns recent history)
  const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx` +
    `?Action=GetHistoryJson&MosadId=${MOSAD_ID}&ApiPassword=${API_PASSWORD}&LastId=${lastId}`;

  sep("STEP 1 — Fetch Nedarim GetHistoryJson");
  console.log("URL:", url.replace(API_PASSWORD!, "***"));

  let rawData: unknown;
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("\nHTTP status:", res.status);
    console.log("Raw response (first 500 chars):\n", text.slice(0, 500));
    rawData = JSON.parse(text);
  } catch (err) {
    console.error("❌  Failed to fetch or parse Nedarim response:", err);
    process.exit(1);
  }

  if (!rawData || !Array.isArray(rawData)) {
    console.error("❌  Unexpected response shape (not an array):", rawData);
    process.exit(1);
  }

  const txList = rawData as Array<Record<string, unknown>>;
  console.log(`\n✅  Total transactions returned: ${txList.length}`);

  // ── 2. Show raw fields of the 3 most recent transactions ────────────────────
  sep("STEP 2 — Raw fields of the 3 most recent transactions");
  const recent = txList.slice(-3).reverse();   // last 3, newest first

  for (const [i, tx] of recent.entries()) {
    console.log(`\n[Transaction ${i + 1} of 3]`);
    console.dir(fieldReport(tx), { depth: null });
  }

  // ── 3. Load all boys from Firestore ─────────────────────────────────────────
  sep("STEP 3 — Load boys from Firestore");
  const boysSnap = await db.collection("boys").get();
  const allBoys = boysSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
  console.log(`✅  Loaded ${allBoys.length} boys from Firestore`);

  console.log("\nBoys nedarimName / donorNumber index:");
  for (const b of allBoys) {
    const name   = b["nedarimName"]  ?? "(none)";
    const donor  = b["donorNumber"]  ?? "(none)";
    console.log(`  • ${b["name"]}  →  nedarimName="${name}"  donorNumber="${donor}"`);
  }

  // ── 4. Run matching on all fetched transactions ──────────────────────────────
  sep("STEP 4 — Matching logic run on all transactions");

  let matched = 0, unmatched = 0;

  for (const tx of txList) {
    const txId     = tx["TransactionId"] ?? "?";
    const txParam1 = String(tx["Param1"]    ?? "").trim();
    const txParam2 = String(tx["Param2"]    ?? "").trim();
    const txComments = String(tx["Comments"] ?? "").trim();
    const amount   = parseFloat(String(tx["Amount"] ?? "0"));

    const boy = matchBoy(tx, allBoys);

    if (boy) {
      matched++;
      console.log(
        `✅  TX ${txId}  (₪${amount})` +
        `  →  MATCHED "${boy["name"]}"` +
        `  [Param1="${txParam1}" Param2="${txParam2}" Comments="${txComments.slice(0, 40)}"]`
      );
    } else {
      unmatched++;
      console.log(
        `❌  TX ${txId}  (₪${amount})` +
        `  →  NO MATCH` +
        `  ClientName="${tx["ClientName"] ?? ""}"` +
        `  Param1="${txParam1}"` +
        `  Param2="${txParam2}"` +
        `  Comments="${txComments.slice(0, 40)}"`
      );
    }
  }

  sep("SUMMARY");
  console.log(`Total transactions : ${txList.length}`);
  console.log(`✅  Matched         : ${matched}`);
  console.log(`❌  Unmatched       : ${unmatched}`);

  if (unmatched > 0) {
    console.log(
      "\n💡  Tip: for each unmatched tx above, check that the boy's nedarimName in" +
      "\n         Firestore matches exactly what appears in Param1 or Param2 (case-sensitive)."
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
