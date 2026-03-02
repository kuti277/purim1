#!/usr/bin/env node
/**
 * PHASE 3 DIAGNOSTIC — Test GetHistoryJson (cron pull)
 * Run: node test-pull.js
 *
 * Tests the Nedarim GetHistoryJson endpoint with multiple lastId values
 * to prove the API is returning data and pinpoint where the cron stalls.
 * Does NOT require Firebase admin credentials.
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

async function testGetHistory(lastId) {
    const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistoryJson&MosadId=${mosadId}&ApiPassword=${apiPassword}&LastId=${lastId}`;
    console.log(`\n--- Testing LastId=${lastId} ---`);
    console.log("URL:", url);

    const response = await fetch(url);
    const rawText  = await response.text();

    console.log("HTTP status:", response.status);
    console.log("Raw response (first 500 chars):", rawText.slice(0, 500));

    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        console.log("⚠️  NOT valid JSON");
        return null;
    }

    if (!data || data.Status === "Error" || !Array.isArray(data)) {
        console.log("⚠️  Error or non-array response:", JSON.stringify(data));
        return null;
    }

    if (data.length === 0) {
        console.log("ℹ️  Empty array — no transactions above this lastId");
        return [];
    }

    const ids = data.map(tx => parseInt(tx.TransactionId || "0"));
    const minId = Math.min(...ids);
    const maxId = Math.max(...ids);
    console.log(`✅ Got ${data.length} transactions  |  IDs: ${minId} → ${maxId}`);
    console.log("First 3:");
    data.slice(0, 3).forEach((tx, i) => {
        console.log(`  [${i}] id=${tx.TransactionId}  amt=${tx.Amount}  comments="${(tx.Comments||"").slice(0,60)}"`);
    });
    return data;
}

(async () => {
    console.log("\n=== PHASE 3: GetHistoryJson Diagnostic ===");
    console.log("MosadId:", mosadId);

    // Test 1: lastId=40_000_000 — should return many transactions (proves API works)
    await testGetHistory(40_000_000);

    // Test 2: lastId=49_000_000 — around backfill range
    await testGetHistory(49_000_000);

    // Test 3: lastId=60_000_000 — mid range
    await testGetHistory(60_000_000);

    // Test 4: lastId=66_000_000 — near top — this is where the cron may be stuck
    await testGetHistory(66_000_000);

    // Test 5: lastId=70_000_000 — above all known transactions?
    await testGetHistory(70_000_000);

    // Test 6: The ID of the test transaction we just pushed (372208)
    // This uses SaveAchnasot's ID which is in a different number space
    // GetHistoryJson uses a different sequential ID space — let's probe it
    await testGetHistory(370_000);

    console.log("\n=== Diagnostic complete ===");
})();
