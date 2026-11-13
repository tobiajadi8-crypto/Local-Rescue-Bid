/**
 * extract.route.ts
 *
 * POST /api/extract
 *
 * Accepts { packet_text } and returns structured job requirements extracted
 * via the watsonx.ai LLM.
 *
 * Response shape:
 *   {
 *     requirements: {
 *       process, material, remaining_quantity, due_at,
 *       receiving_inspection_minutes, cmm_report_required,
 *       tolerance_half_width_mm   // number | null
 *     },
 *     issues: Array<{ field: string; reason: string }>,
 *     tolerance_source_values: Array<{ half_width, unit, source }>,
 *     sources: Record<string, unknown>
 *   }
 *
 * Environment variables required (see .env.example):
 *   WATSONX_URL, WATSONX_PROJECT_ID, WATSONX_API_KEY, WATSONX_MODEL_ID
 */

import { Router, Request, Response, NextFunction } from "express";

const router = Router();

router.post(
  "/api/extract",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // TODO: integrate watsonx.ai LLM call here.
      // For now, return a 501 so the client can distinguish "not implemented"
      // from a real server error.
      res.status(501).json({
        error: "not_implemented",
        message:
          "POST /api/extract is not yet implemented. " +
          "Run the frontend with VITE_USE_FIXTURES=true to use fixtures instead.",
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
