/**
 * Local debug script — Nedarim sync tester
 *
 * Fetches real data from Nedarim, dumps the FULL raw JSON of the 5 most
 * recent transactions, then runs matching logic against Firestore boys.
 *
 * Prerequisites:
 *   1. firebase-admin credentials:
 *        Option A — set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON
 *        Option B — gcloud CLI: gcloud auth application-default login
 *   2. functions/.env must contain NEDARIM_MOSAD_ID and NEDARIM_API_PASSWORD
 *
 * Run from the `functions/` directory:
 *   npx tsx src/test-nedarim.ts
 *
 * Override the anchor ID to load a specific window:
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

const MOSAD_ID     = process.env["NEDARIM_MOSAD_ID"];
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
  console.log("\n" + "═".repeat(70));
  console.log(` ${label}`);
  console.log("═".repeat(70));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Fetch transactions from Nedarim ──────────────────────────────────────
  const lastId = process.env["LAST_ID"] ?? "0";  // 0 = no filter (returns recent history)
  const url =
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx` +
    `?Action=GetHistoryJson&MosadId=${MOSAD_ID}&ApiPassword=${API_PASSWORD}&LastId=${lastId}`;

  sep("STEP 1 — Fetch Nedarim GetHistoryJson");
  console.log("URL:", url.replace(API_PASSWORD!, "***"));

  let rawData: unknown;
  try {
    const res  = await fetch(url);
    const text = await res.text();
    console.log("\nHTTP status:", res.status);
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

  // ── 2. Dump COMPLETE raw JSON of the 5 most recent transactions ─────────────
  sep("STEP 2 — COMPLETE RAW JSON of the 5 most recent transactions");
  const recent5 = txList.slice(-5).reverse();   // last 5, newest first

  for (const [i, tx] of recent5.entries()) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(` [Transaction ${i + 1} of 5]  — every key Nedarim returns:`);
    console.log("─".repeat(60));
    // Print all keys with their exact values (not truncated)
    for (const [k, v] of Object.entries(tx)) {
      const display = v === null ? "null"
                    : v === ""   ? '""  ← EMPTY STRING'
                    : String(v);
      console.log(`  ${k.padEnd(20)} = ${display}`);
    }
  }

  // ── 3. Field-presence matrix across ALL transactions ─────────────────────────
  sep("STEP 3 — Field presence across ALL transactions (non-empty count)");
  const fieldCounts: Record<string, number> = {};
  for (const tx of txList) {
    for (const [k, v] of Object.entries(tx)) {
      if (v !== null && v !== "" && v !== undefined) {
        fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;
      }
    }
  }
  const total = txList.length;
  for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(0);
    const bar = "█".repeat(Math.round(count / total * 20));
    console.log(`  ${field.padEnd(22)} ${String(count).padStart(4)}/${total}  (${pct.padStart(3)}%)  ${bar}`);
  }

  // ── 4. Load all boys from Firestore ─────────────────────────────────────────
  sep("STEP 4 — Load boys from Firestore");
  const boysSnap = await db.collection("boys").get();
  const allBoys = boysSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string })
  );
  console.log(`✅  Loaded ${allBoys.length} boys from Firestore\n`);
  for (const b of allBoys) {
    console.log(
      `  • ${String(b["name"]).padEnd(20)}` +
      `  nedarimName="${b["nedarimName"] ?? "(none)"}"` +
      `  donorNumber="${b["donorNumber"] ?? "(none)"}"` +
      `  matrimId="${b["matrimId"] ?? "(none)"}"`
    );
  }

  // ── 5. Run matching against ALL transactions using EVERY strategy ────────────
  sep("STEP 5 — Match each transaction against boys (all field strategies)");

  // Collect all unique string-ish field names from the transactions
  const allFields = [...new Set(txList.flatMap((t) => Object.keys(t)))];

  let matched = 0, unmatched = 0;

  for (const tx of txList) {
    const txId   = tx["TransactionId"] ?? "?";
    const amount = parseFloat(String(tx["Amount"] ?? "0"));

    // Try every known candidate field for fundraiser attribution
    const candidates: Array<{ field: string; value: string }> = allFields
      .map((f) => ({ field: f, value: String(tx[f] ?? "").trim() }))
      .filter((c) => c.value !== "");

    let matchedBoy: (typeof allBoys)[number] | undefined;
    let matchedVia = "";

    for (const b of allBoys) {
      const nedarimName = String(b["nedarimName"] ?? "").trim();
      const donorNumber = String(b["donorNumber"]  ?? "").trim();
      const matrimId    = String(b["matrimId"]     ?? "").trim();

      for (const { field, value } of candidates) {
        if (nedarimName && (value === nedarimName || value.includes(nedarimName))) {
          matchedBoy = b; matchedVia = `${field}="${value}" ⊇ nedarimName="${nedarimName}"`;
          break;
        }
        if (donorNumber && value === donorNumber) {
          matchedBoy = b; matchedVia = `${field}="${value}" == donorNumber`;
          break;
        }
        if (matrimId && value === matrimId) {
          matchedBoy = b; matchedVia = `${field}="${value}" == matrimId`;
          break;
        }
      }
      if (matchedBoy) break;
    }

    if (matchedBoy) {
      matched++;
      console.log(`✅  TX ${txId}  (₪${amount})  →  MATCHED "${matchedBoy["name"]}"  via  ${matchedVia}`);
    } else {
      unmatched++;
      // Show all non-empty fields for easy diagnosis
      const nonEmpty = candidates.map((c) => `${c.field}="${c.value.slice(0, 30)}"`).join("  ");
      console.log(`❌  TX ${txId}  (₪${amount})  →  NO MATCH  [${nonEmpty}]`);
    }
  }

  sep("SUMMARY");
  console.log(`Total transactions : ${total}`);
  console.log(`✅  Matched         : ${matched}`);
  console.log(`❌  Unmatched       : ${unmatched}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
