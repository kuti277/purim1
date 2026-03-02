/**
 * PHASE 2 DIAGNOSTIC — Test SaveAchnasot (offline push)
 *
 * Sends a real 1-NIS cash transaction to Nedarim Plus using the
 * same payload as pushOfflineDonationToNedarim, then prints the
 * EXACT raw text response so we can confirm success/failure.
 *
 * Run with:
 *   npx ts-node --project tsconfig.test.json src/test-push.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const mosadId     = process.env.NEDARIM_MOSAD_ID;
const apiPassword = process.env.NEDARIM_API_PASSWORD;

if (!mosadId || !apiPassword) {
    console.error("❌ Missing NEDARIM_MOSAD_ID or NEDARIM_API_PASSWORD in .env");
    process.exit(1);
}

const now   = new Date();
const dd    = String(now.getDate()).padStart(2, "0");
const mm    = String(now.getMonth() + 1).padStart(2, "0");
const yyyy  = String(now.getFullYear());
const dateStr = `${dd}/${mm}/${yyyy}`;

// Use the exact same payload as pushOfflineDonationToNedarim
const params = new URLSearchParams({
    Action:      "SaveAchnasot",
    MosadNumber: mosadId,
    ApiPassword: apiPassword,
    Type:        "1",           // 1 = Cash / מזומן
    Zeout:       "000000000",   // required dummy ID
    Amount:      "1",           // 1 NIS test amount
    Date:        dateStr,
    Currency:    "1",           // 1 = ILS
    Comments:    "[#TEST] diagnostic test push",
});

const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?${params.toString()}`;

console.log("\n=== PHASE 2: SaveAchnasot Diagnostic ===");
console.log("Date string sent:", dateStr);
console.log("Full URL:", url);
console.log("\nSending request...\n");

(async () => {
    try {
        const response = await fetch(url);
        const rawText  = await response.text();

        console.log("HTTP status:", response.status);
        console.log("Raw response text:");
        console.log("---");
        console.log(rawText);
        console.log("---");

        // Try to parse as JSON
        try {
            const parsed = JSON.parse(rawText);
            console.log("\nParsed JSON:");
            console.log(JSON.stringify(parsed, null, 2));

            if (parsed.Status === "Error" || parsed.Status === "error") {
                console.error("\n❌ NEDARIM RETURNED ERROR");
                console.error("Description:", parsed.Description ?? parsed.Message ?? "(none)");
            } else {
                console.log("\n✅ SUCCESS — Transaction ID:", parsed.ID ?? parsed.id ?? "(check raw)");
            }
        } catch {
            console.log("\n⚠️  Response is NOT valid JSON — raw text shown above");
        }
    } catch (err) {
        console.error("\n❌ FETCH FAILED:", err);
    }
})();
