/**
 * PHASE 3 DIAGNOSTIC — Test GetHistoryJson (cron pull)
 *
 * 1. Reads the current lastId from Firestore system/nedarim_sync
 * 2. Optionally resets it to 40_000_000 (uncomment RESET block)
 * 3. Hits GetHistoryJson and prints the full response
 * 4. Attempts to match each transaction against boys in Firestore
 *
 * Run with:
 *   npx ts-node --project tsconfig.test.json src/test-pull.ts
 *
 * To reset lastId, set RESET_LAST_ID=true in env or change the flag below.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as admin from "firebase-admin";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ── Init Firebase Admin ────────────────────────────────────────────────────
// Uses Application Default Credentials (gcloud auth application-default login)
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const mosadId     = process.env.NEDARIM_MOSAD_ID;
const apiPassword = process.env.NEDARIM_API_PASSWORD;

// Set to true to reset lastId back to 40_000_000 before pulling
const RESET_LAST_ID = process.env.RESET_LAST_ID === "true";

if (!mosadId || !apiPassword) {
    console.error("❌ Missing NEDARIM_MOSAD_ID or NEDARIM_API_PASSWORD in .env");
    process.exit(1);
}

(async () => {
    console.log("\n=== PHASE 3: GetHistoryJson Diagnostic ===\n");

    // ── Step 1: Read current lastId ─────────────────────────────────────────
    const syncDocRef = db.collection("system").doc("nedarim_sync");
    const syncDoc    = await syncDocRef.get();
    const currentLastId = syncDoc.exists ? (syncDoc.data()?.lastId ?? 0) : 0;
    console.log("Current lastId in Firestore:", currentLastId);

    if (RESET_LAST_ID) {
        console.log("⚠️  RESET_LAST_ID=true — resetting to 40,000,000...");
        await syncDocRef.set({ lastId: 40_000_000 }, { merge: true });
        console.log("✅ lastId reset to 40,000,000");
    }

    const lastId = RESET_LAST_ID ? 40_000_000 : currentLastId;

    // ── Step 2: Hit GetHistoryJson ──────────────────────────────────────────
    const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistoryJson&MosadId=${mosadId}&ApiPassword=${apiPassword}&LastId=${lastId}`;
    console.log(`\nFetching from Nedarim with LastId=${lastId}...`);
    console.log("URL:", url);

    let rawText: string;
    try {
        const response = await fetch(url);
        rawText = await response.text();
        console.log("\nHTTP status:", response.status);
    } catch (err) {
        console.error("❌ FETCH FAILED:", err);
        process.exit(1);
    }

    // Print first 1000 chars of raw response
    console.log("\nRaw response (first 1000 chars):");
    console.log("---");
    console.log(rawText.slice(0, 1000));
    console.log("---");

    // ── Step 3: Parse response ──────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
        data = JSON.parse(rawText);
    } catch {
        console.error("❌ Response is NOT valid JSON");
        process.exit(1);
    }

    if (!data || data.Status === "Error" || !Array.isArray(data) || data.length === 0) {
        console.log("\n⚠️  No transactions returned (empty array or error status)");
        console.log("Parsed:", JSON.stringify(data, null, 2).slice(0, 500));
        process.exit(0);
    }

    console.log(`\n✅ Received ${data.length} transactions from Nedarim`);
    console.log("First 3 transactions:");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.slice(0, 3).forEach((tx: any, i: number) => {
        console.log(`\n  [${i}] TransactionId=${tx.TransactionId}  Amount=${tx.Amount}  Comments="${tx.Comments}"  ClientName="${tx.ClientName}"`);
    });

    // ── Step 4: Load boys and attempt matching ──────────────────────────────
    const boysSnap = await db.collection("boys").get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allBoys  = boysSnap.docs.map((d) => ({ ref: d.ref, ...d.data() } as any));
    console.log(`\nLoaded ${allBoys.length} boys from Firestore`);

    let matched = 0, unmatched = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tx of data as any[]) {
        const txComments = String(tx.Comments ?? "").trim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let matchedBoy: any = undefined;

        // Step A — deterministic [#ID] tag
        const tagMatch = txComments.match(/\[#(\d+)\]/);
        if (tagMatch) {
            const extractedId = tagMatch[1];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            matchedBoy = allBoys.find((b: any) => {
                const dn = String(b.donorNumber ?? b.matrimId ?? "").trim();
                return dn !== "" && dn === extractedId;
            });
        }

        // Step B — fuzzy word-count match
        if (!matchedBoy && txComments) {
            const lowerComments = txComments.toLowerCase();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            matchedBoy = allBoys.find((b: any) => {
                const name  = String(b.nedarimName ?? "").trim();
                if (!name) return false;
                const words = name.split(/\s+/).filter(Boolean);
                if (words.length === 0) return false;
                if (words.length === 1) return lowerComments.includes(words[0].toLowerCase());
                const hits  = words.filter((w: string) => lowerComments.includes(w.toLowerCase())).length;
                return hits >= 2;
            });
        }

        if (matchedBoy) {
            matched++;
        } else {
            unmatched++;
            console.log(`  ⚠️  UNMATCHED: id=${tx.TransactionId} amt=${tx.Amount} comments="${txComments.slice(0, 80)}"`);
        }
    }

    console.log(`\n=== Match results: ${matched} matched, ${unmatched} unmatched out of ${data.length} total ===`);
    process.exit(0);
})();
