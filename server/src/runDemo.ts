/**
 * runDemo.ts
 *
 * Exercises matchSuppliers against J01 requirements using the eight shops
 * from shops.json, then re-runs with Livonia's lot_ready_at set to
 * 2026-11-20T11:45:00-05:00 to verify that Sterling Heights (S08) moves
 * into first place.
 */

import * as path from "path";
import * as fs from "fs";
import { matchSuppliers, JobRequirements, Shop } from "./matchSuppliers";

// ---------------------------------------------------------------------------
// Load data files relative to this script
// ---------------------------------------------------------------------------

const dataDir = path.resolve(__dirname, "../../data");

const shops: Shop[] = JSON.parse(
  fs.readFileSync(path.join(dataDir, "shops.json"), "utf8")
);

// J01 requirements taken from the job packet and confirmed by demo_expected.json
const j01Requirements: JobRequirements = {
  process: "CNC milling",
  material: "6061-T6 aluminum",
  remaining_quantity: 180, // 240 build - 60 finished
  due_at: "2026-11-20T12:00:00-05:00",
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: 0.05,
};

// ---------------------------------------------------------------------------
// RUN 1 — Baseline with original shop data
// ---------------------------------------------------------------------------

console.log("=".repeat(60));
console.log("RUN 1 — Baseline (original shops.json)");
console.log("=".repeat(60));

const result1 = matchSuppliers(j01Requirements, shops);

console.log("\nstatus                   :", result1.status);
console.log("recommended_shop_id      :", result1.recommended_shop_id);
console.log("ranked_eligible_shop_ids :", result1.ranked_eligible_shop_ids);

console.log("\nAll supplier outcomes:");
for (const [shopId, outcome] of Object.entries(result1.supplier_outcomes)) {
  const shop = shops.find((s) => s.shop_id === shopId)!;
  const eligStr = outcome.eligible ? "✓ ELIGIBLE" : "✗ ineligible";
  const reasons =
    outcome.reason_codes.length > 0
      ? `  reasons: ${outcome.reason_codes.join(", ")}`
      : "";
  console.log(
    `  ${shopId} (${shop.city.padEnd(16)}) ${eligStr}  receiving_complete: ${outcome.estimated_receiving_complete_at}${reasons}`
  );
}

// Spot-checks
const checks1: Array<[boolean, string]> = [
  [
    result1.recommended_shop_id === "S02",
    "S02 (Livonia) is recommended",
  ],
  [
    result1.ranked_eligible_shop_ids[0] === "S02",
    "S02 ranks first",
  ],
  [
    result1.ranked_eligible_shop_ids[1] === "S08",
    "S08 (Sterling Heights) ranks second",
  ],
  [
    result1.supplier_outcomes["S02"].estimated_receiving_complete_at ===
      "2026-11-20T10:15:00-05:00",
    "S02 receiving complete at 10:15 ET",
  ],
  [
    result1.supplier_outcomes["S01"].reason_codes.includes("tolerance_too_loose"),
    "S01 (Warren) has reason_code tolerance_too_loose",
  ],
];

console.log("\nSpot-checks:");
let allPassed1 = true;
for (const [passed, label] of checks1) {
  const mark = passed ? "✓" : "✗ FAIL";
  console.log(`  [${mark}] ${label}`);
  if (!passed) allPassed1 = false;
}

// ---------------------------------------------------------------------------
// RUN 2 — Livonia's lot_ready_at pushed to 11:45 ET
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(60));
console.log("RUN 2 — Livonia (S02) lot_ready_at = 2026-11-20T11:45:00-05:00");
console.log("=".repeat(60));

// Deep-clone the shop list; leave original untouched.
const shopsRun2: Shop[] = shops.map((s) =>
  s.shop_id === "S02"
    ? { ...s, lot_ready_at: "2026-11-20T11:45:00-05:00" }
    : { ...s }
);

const result2 = matchSuppliers(j01Requirements, shopsRun2);

console.log("\nstatus                   :", result2.status);
console.log("recommended_shop_id      :", result2.recommended_shop_id);
console.log("ranked_eligible_shop_ids :", result2.ranked_eligible_shop_ids);

console.log("\nAll supplier outcomes:");
for (const [shopId, outcome] of Object.entries(result2.supplier_outcomes)) {
  const shop = shopsRun2.find((s) => s.shop_id === shopId)!;
  const eligStr = outcome.eligible ? "✓ ELIGIBLE" : "✗ ineligible";
  const reasons =
    outcome.reason_codes.length > 0
      ? `  reasons: ${outcome.reason_codes.join(", ")}`
      : "";
  console.log(
    `  ${shopId} (${shop.city.padEnd(16)}) ${eligStr}  receiving_complete: ${outcome.estimated_receiving_complete_at}${reasons}`
  );
}

// What changed
const s02Run1 = result1.supplier_outcomes["S02"];
const s02Run2 = result2.supplier_outcomes["S02"];
console.log("\nWhat changed for S02:");
console.log(`  lot_ready_at         : 2026-11-20T09:00:00-05:00  →  2026-11-20T11:45:00-05:00`);
console.log(`  receiving_complete_at: ${s02Run1.estimated_receiving_complete_at}  →  ${s02Run2.estimated_receiving_complete_at}`);
console.log(`  eligible             : ${s02Run1.eligible}  →  ${s02Run2.eligible}`);
if (s02Run2.reason_codes.length > 0) {
  console.log(`  reason_codes         : ${s02Run2.reason_codes.join(", ")}`);
}

// Spot-checks
const checks2: Array<[boolean, string]> = [
  [
    result2.recommended_shop_id === "S08",
    "S08 (Sterling Heights) is now recommended",
  ],
  [
    result2.ranked_eligible_shop_ids[0] === "S08",
    "S08 ranks first",
  ],
  [
    !result2.supplier_outcomes["S02"].eligible,
    "S02 is now ineligible (misses deadline)",
  ],
  [
    result2.supplier_outcomes["S02"].reason_codes.includes("misses_deadline"),
    "S02 reason_code is misses_deadline",
  ],
];

console.log("\nSpot-checks:");
let allPassed2 = true;
for (const [passed, label] of checks2) {
  const mark = passed ? "✓" : "✗ FAIL";
  console.log(`  [${mark}] ${label}`);
  if (!passed) allPassed2 = false;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(60));
console.log(
  "Overall:",
  allPassed1 && allPassed2 ? "ALL CHECKS PASSED ✓" : "SOME CHECKS FAILED ✗"
);
console.log("=".repeat(60));

if (!allPassed1 || !allPassed2) {
  process.exitCode = 1;
}
