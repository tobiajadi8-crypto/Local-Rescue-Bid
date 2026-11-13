import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const IssueSchema = z.object({
  field: z.string(),
  reason: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

/**
 * Per-shop outcome inside supplier_outcomes.
 * supplier_outcomes is an OBJECT keyed by shop_id in the actual API responses
 * (not an array). The brief mentions "array or object" but every fixture uses
 * the object form — normalizeOutcomes() in client.ts handles the array fallback.
 */
export const OutcomeSchema = z.object({
  eligible: z.boolean(),
  reason_codes: z.array(z.string()),
  estimated_receiving_complete_at: z.string(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * Requirements extracted from a packet, or confirmed by the user.
 * tolerance_half_width_mm is nullable (missing / conflicting packets).
 *
 * DIFFERENCE FROM BRIEF: the brief lists "tolerance_half_width_mm" as always
 * a number; the actual fixtures (J04, J08) set it to null. Schema uses
 * z.number().nullable() to match the data.
 */
export const RequirementsSchema = z.object({
  process: z.string(),
  material: z.string(),
  remaining_quantity: z.number().int().positive(),
  due_at: z.string(),
  receiving_inspection_minutes: z.number().int().nonnegative(),
  cmm_report_required: z.boolean(),
  tolerance_half_width_mm: z.number().nullable(),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

/**
 * Overrides passed to the match endpoint to simulate shop-level changes.
 * DIFFERENCE FROM BRIEF: the brief does not describe the Overrides shape at
 * all; this schema is derived from fixtures/requests/match-j01-s02-delayed.request.json
 * and match-j01-no-match.request.json, where keys are shop_ids and values are
 * partial shop property maps (lot_ready_at and/or max_parts_in_slot).
 */
export const ShopOverrideSchema = z.object({
  lot_ready_at: z.string().optional(),
  max_parts_in_slot: z.number().int().positive().optional(),
});
export type ShopOverride = z.infer<typeof ShopOverrideSchema>;

export const OverridesSchema = z.record(z.string(), ShopOverrideSchema);
export type Overrides = z.infer<typeof OverridesSchema>;

// ---------------------------------------------------------------------------
// Extract endpoint
// ---------------------------------------------------------------------------

export const ExtractRequestSchema = z.object({
  packet_text: z.string().min(1),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

/**
 * DIFFERENCE FROM BRIEF: The brief does not mention a "sources" field on the
 * extraction response, but the fixtures include one. It is typed as a loose
 * record so the UI can surface it without tight coupling.
 *
 * DIFFERENCE FROM BRIEF: tolerance_source_values is an ARRAY of objects with
 * { half_width, unit, source } — the brief never explicitly names these sub-
 * fields; they come from the fixture data.
 */
export const ToleranceSourceValueSchema = z.object({
  half_width: z.number(),
  unit: z.string(),
  source: z.string(),
});
export type ToleranceSourceValue = z.infer<typeof ToleranceSourceValueSchema>;

/**
 * Flat schema — used for fixtures and as the canonical in-memory shape.
 * Requirement fields sit at the top level.
 */
export const ExtractResponseSchema = z.object({
  process: z.string(),
  material: z.string(),
  remaining_quantity: z.number().int().positive(),
  due_at: z.string(),
  receiving_inspection_minutes: z.number().int().nonnegative(),
  cmm_report_required: z.boolean(),
  tolerance_half_width_mm: z.number().nullable(),
  issues: z.array(IssueSchema),
  tolerance_source_values: z.array(ToleranceSourceValueSchema),
  sources: z.record(z.string(), z.unknown()).optional(),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

/**
 * Shape returned by the LIVE POST /api/extract endpoint:
 *   { requirements: { ... }, sources: { ... }, issues: [...],
 *     tolerance_source_values: [...] }
 *
 * client.ts normalizes this to ExtractResponse (flat) before returning to
 * the rest of the app.  Fixtures are already flat so they bypass this path.
 */
export const LiveExtractResponseSchema = z.object({
  requirements: z.object({
    process: z.string(),
    material: z.string(),
    remaining_quantity: z.number().int().positive(),
    due_at: z.string(),
    receiving_inspection_minutes: z.number().int().nonnegative(),
    cmm_report_required: z.boolean(),
    tolerance_half_width_mm: z.number().nullable(),
  }),
  issues: z.array(IssueSchema),
  tolerance_source_values: z.array(ToleranceSourceValueSchema).optional().default([]),
  sources: z.record(z.string(), z.unknown()).optional(),
});
export type LiveExtractResponse = z.infer<typeof LiveExtractResponseSchema>;

// ---------------------------------------------------------------------------
// Match endpoint
// ---------------------------------------------------------------------------

/**
 * The Express route expects requirement fields FLAT at the top level alongside
 * the optional overrides object — not nested under a "requirements" key.
 *
 * Shape sent to POST /api/match:
 *   { process, material, ..., tolerance_half_width_mm, overrides?: {...} }
 */
export const MatchRequestSchema = RequirementsSchema.extend({
  overrides: OverridesSchema.optional(),
});
export type MatchRequest = z.infer<typeof MatchRequestSchema>;

/**
 * supplier_outcomes: object keyed by shop_id. The brief says "array or object"
 * but every fixture uses the object form. client.ts normalizes both.
 *
 * DIFFERENCE FROM BRIEF: status includes 'review_required' (seen in J04/J08
 * fixtures) in addition to 'matched' and 'no_match'. The brief only mentions
 * 'matched' | 'no_match', but the actual data needs the third value.
 *
 * DIFFERENCE FROM BRIEF: _derived and fixtureNotice are fixture-only fields
 * that the real API will never return; they are marked optional so live
 * responses validate cleanly.
 *
 * DIFFERENCE FROM LIVE API: The live /api/match response does NOT return
 * requirements or review_reason. Both are optional so the schema validates
 * real responses. Confirmed requirements are kept in frontend session state
 * (confirmedRequirements) and passed to ResultsScreen independently.
 */
export const MatchResponseSchema = z.object({
  status: z.enum(['matched', 'no_match', 'review_required']),
  review_reason: z.string().nullable().optional(),
  ranked_eligible_shop_ids: z.array(z.string()),
  recommended_shop_id: z.string().nullable(),
  /** Present in fixtures; omitted by the live API. */
  requirements: RequirementsSchema.optional(),
  supplier_outcomes: z.record(z.string(), OutcomeSchema),
  _derived: z.boolean().optional(),
  fixtureNotice: z.string().optional(),
});
export type MatchResponse = z.infer<typeof MatchResponseSchema>;
