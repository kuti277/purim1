#!/usr/bin/env node
/**
 * PHASE 2 DIAGNOSTIC — Test SaveAchnasot (offline push)
 * Run: node test-push.js
 */
"use strict";

const fs   = require("fs");
const path = require("path");

// ── Load .env manually ─────────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
const envVars = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) envVars[m[1].trim()] = m[2].trim();
    });
}

const mosadId     = process.env.NEDARIM_MOSAD_ID     || envVars.NEDARIM_MOSAD_ID;
const apiPassword = process.env.NEDARIM_API_PASSWORD || envVars.NEDARIM_API_PASSWORD;

if (!mosadId || !apiPassword) {
    console.error("❌ Missing NEDARIM_MOSAD_ID or NEDARIM_API_PASSWORD");
    process.exit(1);
}

// ── Build date string DD/MM/YYYY ───────────────────────────────────────────
const now    = new Date();
const dd     = String(now.getDate()).padStart(2, "0");
const mm     = String(now.getMonth() + 1).padStart(2, "0");
const yyyy   = String(now.getFullYear());
const dateStr = `${dd}/${mm}/${yyyy}`;

// ── Build the EXACT same payload as pushOfflineDonationToNedarim ───────────
const params = new URLSearchParams({
    Action:      "SaveAchnasot",
    MosadNumber: mosadId,
    ApiPassword: apiPassword,
    Type:        "1",            // 1 = Cash / מזומן
    Zeout:       "000000000",    // required dummy ID
    Amount:      "1",            // 1 NIS test transaction
    Date:        dateStr,
    Currency:    "1",            // 1 = ILS
    Comments:    "[#TEST] diagnostic test push",
});

const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?${params.toString()}`;

console.log("\n=== PHASE 2: SaveAchnasot Diagnostic ===");
console.log("MosadNumber :", mosadId);
console.log("Date string :", dateStr);
console.log("Full URL    :", url);
console.log("\nSending request...\n");

(async () => {
    try {
        const response = await fetch(url);
        const rawText  = await response.text();

        console.log("HTTP status :", response.status);
        console.log("Raw response:");
        console.log("────────────────────────────────────────");
        console.log(rawText);
        console.log("────────────────────────────────────────");

        // Try to parse as JSON
        let parsed;
        try {
            parsed = JSON.parse(rawText);
            console.log("\nParsed JSON:");
            console.log(JSON.stringify(parsed, null, 2));
        } catch {
            console.log("\n⚠️  Response is NOT valid JSON — see raw text above");
            return;
        }

        if (parsed.Status === "Error" || parsed.Status === "error") {
            console.error("\n❌ NEDARIM RETURNED ERROR");
            console.error("Description:", parsed.Description ?? parsed.Message ?? "(none)");
        } else {
            console.log("\n✅ SUCCESS — New transaction ID:", parsed.ID ?? "(check raw)");
        }
    } catch (err) {
        console.error("\n❌ FETCH FAILED:", err);
    }
})();
