/**
 * One-off script — reset Nedarim sync anchor and backfill historical transactions.
 *
 * What it does:
 *   1. Overwrites system/nedarim_sync.lastId with LAST_ID (default 0 = all history
 *      that Nedarim's GetHistoryJson window allows, typically up to 2000 records).
 *   2. Runs the EXACT same two-step matching logic as syncNedarimTransactions.
 *   3. Writes matched transactions to `transactions` and increments boys' totalRaised.
 *   4. Updates system/nedarim_sync.lastId to the highest TransactionId seen.
 *
 * Prerequisites:
 *   Firebase Admin credentials (one of):
 *     Option A — service-account JSON:
 *                export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *     Option B — gcloud CLI: gcloud auth application-default login
 *   functions/.env must contain NEDARIM_MOSAD_ID and NEDARIM_API_PASSWORD.
 *
 * Run from the `functions/` directory:
 *   npx tsx src/reset-sync.ts
 *
 * To start from a specific ID instead of 0:
 *   LAST_ID=40000000 npx tsx src/reset-sync.ts
 *
 * DRY_RUN=true npx tsx src/reset-sync.ts
 *   → Runs the full matching logic and prints results but writes NOTHING to Firestore.
 */

import * as fs   from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

// ─── Load .env ────────────────────────────────────────────────────────────────

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
  console.warn("⚠️   No .env at", envFile, "— relying on shell environment");
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MOSAD_ID     = process.env["NEDARIM_MOSAD_ID"];
const API_PASSWORD = process.env["NEDARIM_API_PASSWORD"];
const LAST_ID      = parseInt(process.env["LAST_ID"] ?? "0", 10);
const DRY_RUN      = process.env["DRY_RUN"] === "true";

if (!MOSAD_ID || !API_PASSWORD) {
  console.error("❌  NEDARIM_MOSAD_ID or NEDARIM_API_PASSWORD missing. Aborting.");
  process.exit(1);
}

// ─── Firebase Admin ───────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId:  "kuti-purim",
  });
}
const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep(label: string) {
  console.log("\n" + "═".repeat(70));
  console.log(` ${label}`);
  console.log("═".repeat(70));
}

/** Read Firestore docs in parallel, chunked to avoid overwhelming the connection pool. */
async function batchGet(
  refs: admin.firestore.DocumentReference[]
): Promise<admin.firestore.DocumentSnapshot[]> {
  const CHUNK = 100;
  const results: admin.firestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    const snaps = await Promise.all(chunk.map((r) => r.get()));
    results.push(...snaps);
  }
  return results;
}

/** Commit a WriteBatch and start a new one (Firestore batches cap at 500 ops). */
async function flushBatch(
  batch: admin.firestore.WriteBatch,
  count: number,
  dryRun: boolean
): Promise<admin.firestore.WriteBatch> {
  if (count === 0) return batch;
  if (dryRun) {
    console.log(`   [DRY RUN] Would have committed ${count} operations.`);
  } else {
    await batch.commit();
    console.log(`   ✅  Committed ${count} operations.`);
  }
  return db.batch();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    console.log("⚠️   DRY RUN mode — no Firestore writes will occur.\n");
  }

  // ── Step 1: Reset anchor ───────────────────────────────────────────────────
  sep(`STEP 1 — Reset system/nedarim_sync.lastId → ${LAST_ID}`);
  const syncDocRef = db.collection("system").doc("nedarim_sync");
  const currentSnap = await syncDocRef.get();
  const currentLastId = currentSnap.exists ? (currentSnap.data()?.lastId ?? "not set") : "document missing";
  console.log(`   Current lastId in Firestore : ${currentLastId}`);
  console.log(`   New lastId to use           : ${LAST_ID}`);

  if (!DRY_RUN) {
    await syncDocRef.set({ lastId: LAST_ID }, { merge: true });
    console.log("   ✅  system/nedarim_sync.lastId updated.");
  } else {
    console.log("   [DRY RUN] Skipping write.");
  }

  // ── Step 2: Fetch from Nedarim ─────────────────────────────────────────────
  sep("STEP 2 — Fetch transactions from Nedarim");
  const url =
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx` +
    `?Action=GetHistoryJson&MosadId=${MOSAD_ID}&ApiPassword=${API_PASSWORD}&LastId=${LAST_ID}`;

  console.log("   URL:", url.replace(API_PASSWORD!, "***"));

  let rawData: unknown;
  try {
    const res  = await fetch(url);
    const text = await res.text();
    console.log("   HTTP status:", res.status);
    rawData = JSON.parse(text);
  } catch (err) {
    console.error("❌  Failed to fetch or parse Nedarim response:", err);
    process.exit(1);
  }

  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    console.log("   No transactions returned (array empty or unexpected shape).");
    process.exit(0);
  }

  const txList = rawData as Array<Record<string, unknown>>;
  console.log(`   ✅  ${txList.length} transactions returned.`);

  // ── Step 3: Load all boys ──────────────────────────────────────────────────
  sep("STEP 3 — Load boys from Firestore");
  const boysSnap = await db.collection("boys").get();
  const allBoys = boysSnap.docs.map(
    (d) => ({ ref: d.ref, ...d.data() } as Record<string, unknown> & { ref: admin.firestore.DocumentReference })
  );
  console.log(`   ✅  ${allBoys.length} boys loaded.`);
  for (const b of allBoys) {
    const nName = b["nedarimName"]  ?? "(none)";
    const dNum  = b["donorNumber"]  ?? b["matrimId"] ?? "(none)";
    console.log(`      • ${String(b["name"]).padEnd(22)}  nedarimName="${nName}"  donorNumber="${dNum}"`);
  }

  // ── Step 4: Pre-fetch existing tx docs ────────────────────────────────────
  sep("STEP 4 — Pre-fetch existing transaction docs (double-count guard)");
  const txIds = txList
    .map((tx) => String(tx["TransactionId"] ?? "0"))
    .filter((id) => id !== "0");

  const txRefs = txIds.map((id) => db.collection("transactions").doc(id));
  const existingSnaps = await batchGet(txRefs);
  const alreadyExisting = new Set(
    existingSnaps.filter((s) => s.exists).map((s) => s.id)
  );
  console.log(`   ✅  ${alreadyExisting.size} of ${txIds.length} transactions already exist in Firestore.`);

  // ── Step 5: Matching + writes ──────────────────────────────────────────────
  sep("STEP 5 — Two-step matching and Firestore writes");

  let matched   = 0;
  let unmatched = 0;
  let skippedExisting = 0;
  let maxId = LAST_ID;

  // Counters for batch management (Firestore cap = 500 ops per batch)
  const MAX_OPS = 400;
  let   batch   = db.batch();
  let   batchOps = 0;

  for (const tx of txList) {
    const currentTxId = parseInt(String(tx["TransactionId"] ?? "0"), 10);
    if (currentTxId > maxId) maxId = currentTxId;

    const amount = parseFloat(String(tx["Amount"] ?? ""));
    if (isNaN(amount)) continue;

    const txComments = String(tx["Comments"] ?? "").trim();
    const donorName  = String(tx["ClientName"] ?? "").trim();

    // ── STEP A: deterministic [#ID] tag ───────────────────────────────────
    let matchedBoy: typeof allBoys[number] | undefined;
    const tagMatch = txComments.match(/\[#(\d+)\]/);
    if (tagMatch) {
      const extractedId = tagMatch[1];
      matchedBoy = allBoys.find((b) => {
        const dn = String(b["donorNumber"] ?? b["matrimId"] ?? "").trim();
        return dn !== "" && dn === extractedId;
      });
    }

    // ── STEP B: fuzzy word-count match ────────────────────────────────────
    if (!matchedBoy && txComments) {
      const lowerComments = txComments.toLowerCase();
      matchedBoy = allBoys.find((b) => {
        const name = String(b["nedarimName"] ?? "").trim();
        if (!name) return false;
        const words = name.split(/\s+/).filter(Boolean);
        if (words.length === 0) return false;
        if (words.length === 1) return lowerComments.includes(words[0].toLowerCase());
        const hits = words.filter((w) => lowerComments.includes(w.toLowerCase())).length;
        return hits >= 2;
      });
    }

    if (!matchedBoy) {
      unmatched++;
      console.log(
        `   ❌  TX ${currentTxId}  ₪${amount}` +
        `  ClientName="${donorName}"` +
        `  Comments="${txComments.slice(0, 50)}"`
      );
      continue;
    }

    matched++;
    const txDocId = String(currentTxId);
    const isNew   = !alreadyExisting.has(txDocId);
    if (!isNew) skippedExisting++;

    const matchedVia = tagMatch
      ? `[#${tagMatch[1]}] tag`
      : `word-count on nedarimName="${matchedBoy["nedarimName"]}"`;

    console.log(
      `   ✅  TX ${currentTxId}  ₪${amount}` +
      `  → "${matchedBoy["name"]}"  via ${matchedVia}` +
      (isNew ? "" : "  [already existed — skipping totalRaised increment]")
    );

    // Flush if approaching batch limit
    if (batchOps >= MAX_OPS) {
      batch = await flushBatch(batch, batchOps, DRY_RUN);
      batchOps = 0;
    }

    if (isNew) {
      batch.update(matchedBoy.ref, {
        totalRaised: admin.firestore.FieldValue.increment(amount),
      });
      batchOps++;
    }

    batch.set(
      db.collection("transactions").doc(txDocId),
      {
        nedarimTransactionId: currentTxId,
        boyId:         matchedBoy.ref.id,
        boyName:       String(matchedBoy["name"] ?? ""),
        amount,
        donorName,
        dedication:    txComments,
        paymentMethod: "credit",
        status:        "completed",
        source:        "nedarim",
        createdAt:     admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batchOps++;
  }

  // Flush the final batch + update lastId
  if (maxId > LAST_ID) {
    batch.set(syncDocRef, { lastId: maxId }, { merge: true });
    batchOps++;
  }
  await flushBatch(batch, batchOps, DRY_RUN);

  // ── Summary ───────────────────────────────────────────────────────────────
  sep("SUMMARY");
  console.log(`   Total from Nedarim      : ${txList.length}`);
  console.log(`   ✅  Matched & written   : ${matched}`);
  console.log(`      of which pre-existing: ${skippedExisting}  (totalRaised NOT re-incremented)`);
  console.log(`      of which new         : ${matched - skippedExisting}  (totalRaised incremented)`);
  console.log(`   ❌  Unmatched (skipped) : ${unmatched}`);
  console.log(`   New lastId saved        : ${maxId}`);

  if (unmatched > 0) {
    console.log(
      "\n   💡  Tip: for each unmatched TX above, check that the boy's nedarimName" +
      "\n            contains at least 2 words that appear in the Comments column," +
      "\n            OR set boy.donorNumber to the numeric Nedarim MatrimId."
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
