/**
 * testRoute.ts
 *
 * Integration test for POST /api/match against the live IBM Cloudant database.
 *
 * What it tests
 * ─────────────
 * REQUEST 1 — J01 baseline (original shops)
 *   • Cloudant is reachable and returns supplier documents.
 *   • Livonia (S02) ranks first.
 *   • Warren (S01) is ineligible with reason_code "tolerance_too_loose".
 *
 * REQUEST 2 — J01 with override: S02.lot_ready_at = 2026-11-20T11:45:00-05:00
 *   • Sterling Heights (S08) moves into first place.
 *   • S02 becomes ineligible with reason_code "misses_deadline".
 *   • The override is NOT persisted — Cloudant data is unchanged.
 *
 * REQUEST 3 — J01 baseline again (no overrides)
 *   • S02 is back in first place, confirming the override had no side-effects.
 *
 * Usage
 * ─────
 *   cd server
 *   npx ts-node src/testRoute.ts
 *
 * Required environment variables (set in server/.env or the shell):
 *   CLOUDANT_URL    — https://<instance>.cloudantnosqldb.appdomain.cloud
 *   CLOUDANT_APIKEY — IBM Cloud IAM API key
 *   CLOUDANT_DB     — name of the suppliers database (e.g. "suppliers")
 */

// ---------------------------------------------------------------------------
// 1. Load .env BEFORE importing cloudantClient so the guard sees the values.
// ---------------------------------------------------------------------------

import * as dotenv from "dotenv";
import * as path from "path";

// Accept .env next to this file (server/src/.env) or one directory up (server/.env).
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") }); // workspace root fallback

// ---------------------------------------------------------------------------
// 2. Check credentials early — print clear guidance if any are missing.
// ---------------------------------------------------------------------------

const REQUIRED_VARS = ["CLOUDANT_URL", "CLOUDANT_APIKEY", "CLOUDANT_DB"] as const;
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error("\n[testRoute] ✗ Cannot run live test — missing environment variables:\n");
  for (const v of missing) {
    console.error(`  ${v}  ← not set`);
  }
  console.error(`
To fix this:
  1. Copy  server/.env.example  →  server/.env
  2. Fill in the real values:

     CLOUDANT_URL    https://<your-instance>.cloudantnosqldb.appdomain.cloud
     CLOUDANT_APIKEY <your-iam-api-key>
     CLOUDANT_DB     suppliers   (or the actual database name you created)

  3. Re-run:  npx ts-node src/testRoute.ts
`);
  process.exit(1);
}

// Env vars are present — safe to import cloudantClient now.
import * as http from "http";
import { app } from "./app";

// ---------------------------------------------------------------------------
// 3. Helpers
// ---------------------------------------------------------------------------

process.env.PORT = "0"; // OS assigns a free ephemeral port

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(url: string, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) });
          } catch {
            reject(new Error(`Failed to parse response: ${raw}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

let totalFailed = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function check(label: string, passed: boolean, detail?: any): void {
  const mark = passed ? "✓" : "✗ FAIL";
  const suffix = !passed && detail !== undefined ? `  (got: ${JSON.stringify(detail)})` : "";
  console.log(`  [${mark}] ${label}${suffix}`);
  if (!passed) totalFailed++;
}

function section(title: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(title);
  console.log("─".repeat(60));
}

// ---------------------------------------------------------------------------
// 4. J01 baseline requirements (no overrides)
// ---------------------------------------------------------------------------

const J01: Record<string, unknown> = {
  process: "CNC milling",
  material: "6061-T6 aluminum",
  remaining_quantity: 180,
  due_at: "2026-11-20T12:00:00-05:00",
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: 0.05,
};

// ---------------------------------------------------------------------------
// 5. Run
// ---------------------------------------------------------------------------

const server = http.createServer(app);

server.listen(0, "127.0.0.1", async () => {
  const address = server.address() as { port: number };
  const port = address.port;
  const url = `http://127.0.0.1:${port}/api/match`;

  console.log(`\n[testRoute] Server on port ${port}`);
  console.log(`[testRoute] Cloudant DB : ${process.env.CLOUDANT_DB}`);
  // Redact the URL host to avoid leaking instance names in shared logs,
  // but keep the scheme so it's clear whether TLS is in use.
  const rawUrl = process.env.CLOUDANT_URL ?? "";
  const safeUrl = rawUrl.replace(/(https?:\/\/)([^/]+)/, "$1<redacted>");
  console.log(`[testRoute] Cloudant URL: ${safeUrl}`);

  try {
    // ── REQUEST 1 — baseline ────────────────────────────────────────────────
    section("REQUEST 1 — J01 baseline (no overrides)");

    const r1 = await post(url, J01);

    // Print db + doc count from first successful response so we know the
    // live read worked.  The route doesn't return these; we infer from outcomes.
    if (r1.status === 200) {
      const docCount = Object.keys(r1.json.supplier_outcomes ?? {}).length;
      console.log(`\n  Cloudant DB       : ${process.env.CLOUDANT_DB}`);
      console.log(`  Documents fetched : ${docCount} supplier(s)`);
    }

    console.log(`\n  status            : ${r1.json.status}`);
    console.log(`  recommended       : ${r1.json.recommended_shop_id}`);
    console.log(`  ranked eligible   : ${JSON.stringify(r1.json.ranked_eligible_shop_ids)}`);
    console.log(`\n  Spot-checks:`);

    check("HTTP 200", r1.status === 200, r1.status);
    check("status = matched", r1.json.status === "matched", r1.json.status);
    check("S02 (Livonia) ranks first", r1.json.ranked_eligible_shop_ids?.[0] === "S02",
          r1.json.ranked_eligible_shop_ids?.[0]);
    check("S02 receiving_complete = 2026-11-20T10:15:00-05:00",
          r1.json.supplier_outcomes?.S02?.estimated_receiving_complete_at === "2026-11-20T10:15:00-05:00",
          r1.json.supplier_outcomes?.S02?.estimated_receiving_complete_at);
    check("S01 (Warren) ineligible",
          r1.json.supplier_outcomes?.S01?.eligible === false,
          r1.json.supplier_outcomes?.S01?.eligible);
    check('S01 reason_code = "tolerance_too_loose"',
          r1.json.supplier_outcomes?.S01?.reason_codes?.includes("tolerance_too_loose"),
          r1.json.supplier_outcomes?.S01?.reason_codes);

    // ── REQUEST 2 — override S02 lot_ready_at ───────────────────────────────
    section('REQUEST 2 — override S02.lot_ready_at = "2026-11-20T11:45:00-05:00"');

    const r2 = await post(url, {
      ...J01,
      overrides: {
        S02: { lot_ready_at: "2026-11-20T11:45:00-05:00" },
      },
    });

    console.log(`\n  status            : ${r2.json.status}`);
    console.log(`  recommended       : ${r2.json.recommended_shop_id}`);
    console.log(`  ranked eligible   : ${JSON.stringify(r2.json.ranked_eligible_shop_ids)}`);
    console.log(`  S02 eligible      : ${r2.json.supplier_outcomes?.S02?.eligible}`);
    console.log(`  S02 reason_codes  : ${JSON.stringify(r2.json.supplier_outcomes?.S02?.reason_codes)}`);
    console.log(`  S02 receiving_at  : ${r2.json.supplier_outcomes?.S02?.estimated_receiving_complete_at}`);
    console.log(`\n  Spot-checks:`);

    check("HTTP 200", r2.status === 200, r2.status);
    check("S08 (Sterling Heights) ranks first",
          r2.json.ranked_eligible_shop_ids?.[0] === "S08",
          r2.json.ranked_eligible_shop_ids?.[0]);
    check("S02 is ineligible after override",
          r2.json.supplier_outcomes?.S02?.eligible === false,
          r2.json.supplier_outcomes?.S02?.eligible);
    check('S02 reason_code = "misses_deadline"',
          r2.json.supplier_outcomes?.S02?.reason_codes?.includes("misses_deadline"),
          r2.json.supplier_outcomes?.S02?.reason_codes);
    check("S02 receiving_complete = 2026-11-20T13:00:00-05:00",
          r2.json.supplier_outcomes?.S02?.estimated_receiving_complete_at === "2026-11-20T13:00:00-05:00",
          r2.json.supplier_outcomes?.S02?.estimated_receiving_complete_at);

    // ── REQUEST 3 — baseline again (override must have no side-effects) ──────
    section("REQUEST 3 — J01 baseline again (confirms override was not persisted)");

    const r3 = await post(url, J01);

    console.log(`\n  status            : ${r3.json.status}`);
    console.log(`  recommended       : ${r3.json.recommended_shop_id}`);
    console.log(`  ranked eligible   : ${JSON.stringify(r3.json.ranked_eligible_shop_ids)}`);
    console.log(`\n  Spot-checks:`);

    check("HTTP 200", r3.status === 200, r3.status);
    check("S02 (Livonia) ranks first again",
          r3.json.ranked_eligible_shop_ids?.[0] === "S02",
          r3.json.ranked_eligible_shop_ids?.[0]);
    check("S02 eligible again",
          r3.json.supplier_outcomes?.S02?.eligible === true,
          r3.json.supplier_outcomes?.S02?.eligible);
    check("S02 receiving_complete restored to 2026-11-20T10:15:00-05:00",
          r3.json.supplier_outcomes?.S02?.estimated_receiving_complete_at === "2026-11-20T10:15:00-05:00",
          r3.json.supplier_outcomes?.S02?.estimated_receiving_complete_at);

  } catch (err) {
    console.error("\n[testRoute] Unexpected error:", (err as Error).message);
    totalFailed++;
  } finally {
    server.close();
    console.log(`\n${"═".repeat(60)}`);
    console.log(
      totalFailed === 0
        ? "ALL CHECKS PASSED ✓"
        : `${totalFailed} CHECK(S) FAILED ✗`
    );
    console.log("═".repeat(60) + "\n");
    process.exitCode = totalFailed === 0 ? 0 : 1;
  }
});
