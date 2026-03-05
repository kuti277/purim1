#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path");

const envVars = {};
fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach((l) => {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) envVars[m[1].trim()] = m[2].trim();
});

const mosadId     = envVars.NEDARIM_MOSAD_ID;
const apiPassword = envVars.NEDARIM_API_PASSWORD;

console.log("MosadId:", mosadId);
console.log("");

(async () => {
  // ── PART 1: Check all candidate "list fundraisers" actions ─────────────────
  const ACTIONS = [
    "GetZehuim", "GetMatrimim", "GetFundraisers", "GetCollectors",
    "GetMatzrimim", "GetMeatzrimim", "GetMeagdim", "GetCampaigners",
    "GetBaaleiKampania", "ListFundraisers", "GetUsers", "GetWorkers",
    "GetMemantrimim", "GetMantrimim",
  ];

  console.log("═".repeat(64));
  console.log("PART 1 — scanning candidate action names");
  console.log("═".repeat(64));

  for (const action of ACTIONS) {
    const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=${action}&MosadId=${mosadId}&ApiPassword=${apiPassword}`;
    try {
      const r    = await fetch(url);
      const text = await r.text();
      const ok   = !text.includes("UNKNOW ACTION") && !text.includes("Error");
      console.log(`${ok ? "✅" : "❌"} ${action.padEnd(22)} → ${text.slice(0, 80)}`);
    } catch (e) {
      console.log(`❌ ${action.padEnd(22)} → fetch error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  // ── PART 2: Inspect full field set of a GetHistoryJson transaction ─────────
  console.log("\n" + "═".repeat(64));
  console.log("PART 2 — ALL fields in a GetHistoryJson transaction");
  console.log("═".repeat(64));

  // Use a very high lastId so we only get a small recent slice
  const recentUrl = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistoryJson&MosadId=${mosadId}&ApiPassword=${apiPassword}&LastId=67400000`;
  const r2   = await fetch(recentUrl);
  const raw2 = await r2.text();
  let txs;
  try { txs = JSON.parse(raw2); } catch { console.log("GetHistoryJson parse error:", raw2.slice(0,200)); return; }

  if (!Array.isArray(txs) || txs.length === 0) {
    console.log("No transactions above LastId=67400000. Trying 67000000...");
    const r3   = await fetch(recentUrl.replace("67400000", "67000000"));
    const raw3 = await r3.text();
    try { txs = JSON.parse(raw3); } catch { console.log("parse error:", raw3.slice(0,200)); return; }
  }

  if (!Array.isArray(txs) || txs.length === 0) {
    console.log("Still no transactions. GetHistoryJson returned:", raw2.slice(0,200));
    return;
  }

  console.log(`Got ${txs.length} transactions. Full field dump of first 3:\n`);
  txs.slice(0, 3).forEach((tx, i) => {
    console.log(`── tx[${i}] ─────────────────────────────────────────────`);
    Object.entries(tx).forEach(([k, v]) => {
      console.log(`  ${k.padEnd(24)} = ${JSON.stringify(v)}`);
    });
    console.log("");
  });

  console.log("═".repeat(64));
  console.log("Done.");
})();
