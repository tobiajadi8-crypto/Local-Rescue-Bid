/**
 * app.ts
 *
 * Express application.  Only routing logic lives here; the HTTP listener is
 * started in server.ts so this module can also be imported in tests.
 *
 * Route:  POST /api/match
 *
 * Request body (JSON):
 *   {
 *     "process": "CNC milling",
 *     "material": "6061-T6 aluminum",
 *     "remaining_quantity": 180,
 *     "due_at": "2026-11-20T12:00:00-05:00",
 *     "receiving_inspection_minutes": 30,
 *     "cmm_report_required": false,
 *     "tolerance_half_width_mm": 0.05,
 *
 *     // Optional — request-scoped field patches applied before matching.
 *     // Keys are shop_id strings; values are partial Shop objects whose
 *     // fields are shallow-merged onto the fetched document.  Nothing is
 *     // written back to Cloudant.
 *     "overrides": {
 *       "S02": { "lot_ready_at": "2026-11-20T11:45:00-05:00" }
 *     }
 *   }
 *
 * Response body (JSON):
 *   MatchResult — see matchSuppliers.ts
 *
 * The route fetches all supplier documents from Cloudant, optionally applies
 * request-scoped overrides, then runs matchSuppliers and returns the result.
 */

import express, { Request, Response, NextFunction } from "express";
import extractRouter from "./extraction/extract.route";
import { CloudantV1 } from "@ibm-cloud/cloudant";
import { cloudant, cloudantDb } from "./cloudantClient";
import {
  matchSuppliers,
  JobRequirements,
  Shop,
} from "./matchSuppliers";

export const app = express();

app.use(express.json());
app.use(extractRouter);

// ---------------------------------------------------------------------------
// POST /api/match
// ---------------------------------------------------------------------------

interface MatchRequestBody extends JobRequirements {
  /** Optional request-scoped field patches keyed by shop_id. Never persisted. */
  overrides?: Record<string, Partial<Shop>>;
}

app.post(
  "/api/match",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // --- Basic input validation ------------------------------------------

    const body = req.body as Partial<MatchRequestBody>;

    const requiredFields: Array<keyof JobRequirements> = [
      "process",
      "material",
      "remaining_quantity",
      "due_at",
      "receiving_inspection_minutes",
      "cmm_report_required",
      "tolerance_half_width_mm",
    ];

    const missing = requiredFields.filter((f) => body[f] === undefined);
    if (missing.length > 0) {
      res.status(400).json({
        error: "missing_fields",
        message: `Required fields missing: ${missing.join(", ")}`,
      });
      return;
    }

    const { overrides, ...requirementsRaw } = body as MatchRequestBody;
    const requirements = requirementsRaw as JobRequirements;

    // --- Fetch all supplier documents from Cloudant ----------------------

    let shops: Shop[];
    try {
      const response = await cloudant.postAllDocs({
        db: cloudantDb,
        includeDocs: true,
      } as CloudantV1.PostAllDocsParams);

      // Each row has a `doc` field containing the full document.
      // Filter out design documents (IDs starting with "_design/").
      shops = (response.result.rows ?? [])
        .filter((row) => row.id && !row.id.startsWith("_design/"))
        .map((row) => row.doc as unknown as Shop);
    } catch (err) {
      next(err);
      return;
    }

    // --- Apply request-scoped overrides (never written to Cloudant) ------

    if (overrides && typeof overrides === "object") {
      shops = shops.map((shop) =>
        overrides[shop.shop_id]
          ? { ...shop, ...overrides[shop.shop_id] }
          : shop
      );
    }

    // --- Run the matcher -------------------------------------------------

    const result = matchSuppliers(requirements, shops);

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// Error handler — catches anything passed to next(err)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", err.message);
  res.status(502).json({
    error: "upstream_error",
    message: err.message,
  });
});
