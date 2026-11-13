/**
 * matchSuppliers.ts
 *
 * Pure supplier-matching function for Local Rescue Bid.
 * No side effects, no I/O — takes requirements + shops, returns a ranked result.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Confirmed job requirements extracted from the job packet. */
export interface JobRequirements {
  /** e.g. "CNC milling" */
  process: string;
  /** Exact material grade string, e.g. "6061-T6 aluminum" */
  material: string;
  /** Number of parts still needing to be produced. */
  remaining_quantity: number;
  /** ISO 8601 datetime — latest acceptable receiving-complete timestamp. */
  due_at: string;
  /** Minutes needed for incoming inspection after the courier arrives. */
  receiving_inspection_minutes: number;
  /** Whether a CMM report must accompany the lot. */
  cmm_report_required: boolean;
  /** Maximum acceptable bilateral tolerance half-width, in mm. */
  tolerance_half_width_mm: number;
}

/** One row from shops.json. */
export interface Shop {
  shop_id: string;
  shop_name: string;
  city: string;
  state: string;
  process: string;
  materials: string[];
  min_supported_bilateral_half_width_mm: number;
  max_parts_in_slot: number;
  /** ISO 8601 datetime — when the finished lot is ready for courier pickup. */
  lot_ready_at: string;
  /** Drive time from the shop back to the originating Detroit plant, in minutes. */
  return_minutes_to_detroit: number;
  cmm_report_available: boolean;
}

// ---------------------------------------------------------------------------
// Reason codes
// ---------------------------------------------------------------------------

export type ReasonCode =
  | "not_in_michigan"
  | "process_mismatch"
  | "material_unavailable"
  | "insufficient_capacity"
  | "tolerance_too_loose"
  | "cmm_report_unavailable"
  | "misses_deadline";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface SupplierOutcome {
  eligible: boolean;
  reason_codes: ReasonCode[];
  /** ISO 8601 — lot_ready_at + return travel + incoming inspection. */
  estimated_receiving_complete_at: string;
}

export interface MatchResult {
  /** "matched" if at least one eligible shop exists, otherwise "no_match". */
  status: "matched" | "no_match";
  /** Eligible shop IDs ordered by earliest receiving completion, then shop_id. */
  ranked_eligible_shop_ids: string[];
  /** First entry in ranked_eligible_shop_ids, or null when no match. */
  recommended_shop_id: string | null;
  /** One entry per shop in the input array. */
  supplier_outcomes: Record<string, SupplierOutcome>;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Add `minutes` to an ISO 8601 datetime string and return a new ISO string
 * that preserves the original UTC offset.
 */
function addMinutes(isoString: string, minutes: number): string {
  // Parse the UTC wall-clock instant.
  const base = new Date(isoString);
  const result = new Date(base.getTime() + minutes * 60_000);

  // Preserve the original fixed offset so the returned string uses the same
  // timezone as the input (e.g. -05:00 stays -05:00).
  const offsetMatch = isoString.match(/([+-]\d{2}:\d{2})$/);
  if (!offsetMatch) {
    // No explicit offset — return plain ISO string.
    return result.toISOString();
  }

  const offsetStr = offsetMatch[1]; // e.g. "-05:00"
  const sign = offsetStr[0] === "-" ? -1 : 1;
  const [offH, offM] = offsetStr.slice(1).split(":").map(Number);
  const totalOffsetMin = sign * (offH * 60 + offM);

  // Shift to local wall-clock time, then format manually.
  const localMs = result.getTime() + totalOffsetMin * 60_000;
  const local = new Date(localMs);

  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const formatted =
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    offsetStr;

  return formatted;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Match a set of candidate shops against confirmed job requirements.
 *
 * @param requirements - Confirmed job requirements (not mutated).
 * @param shops        - Candidate supplier list (not mutated).
 * @returns            - Ranked match result.
 */
export function matchSuppliers(
  requirements: JobRequirements,
  shops: Shop[]
): MatchResult {
  const dueAt = new Date(requirements.due_at).getTime();

  const supplier_outcomes: Record<string, SupplierOutcome> = {};
  const eligible: Array<{ shop_id: string; receivingComplete: number }> = [];

  for (const shop of shops) {
    const reasons: ReasonCode[] = [];

    // --- Qualification checks (collect ALL failing reasons) ----------------

    if (shop.state !== "MI") {
      reasons.push("not_in_michigan");
    }

    if (shop.process !== requirements.process) {
      reasons.push("process_mismatch");
    }

    if (!shop.materials.includes(requirements.material)) {
      reasons.push("material_unavailable");
    }

    if (shop.max_parts_in_slot < requirements.remaining_quantity) {
      reasons.push("insufficient_capacity");
    }

    // Tolerance: shop's tightest capability must be <= job requirement.
    // A shop whose min_supported half-width is GREATER than the requirement
    // cannot hit the specified tolerance.
    if (
      shop.min_supported_bilateral_half_width_mm >
      requirements.tolerance_half_width_mm
    ) {
      reasons.push("tolerance_too_loose");
    }

    if (requirements.cmm_report_required && !shop.cmm_report_available) {
      reasons.push("cmm_report_unavailable");
    }

    // --- Receiving completion time (always computed) -----------------------

    const totalTravelAndInspectionMin =
      shop.return_minutes_to_detroit + requirements.receiving_inspection_minutes;

    const estimatedReceivingCompleteAt = addMinutes(
      shop.lot_ready_at,
      totalTravelAndInspectionMin
    );

    const receivingCompleteMs = new Date(estimatedReceivingCompleteAt).getTime();

    // --- Deadline check (only relevant when other checks pass) -------------
    // We still report the time for every shop, but only flag "misses_deadline"
    // when the shop would otherwise qualify.
    if (reasons.length === 0 && receivingCompleteMs > dueAt) {
      reasons.push("misses_deadline");
    }

    // --- Record outcome ----------------------------------------------------

    const isEligible = reasons.length === 0;

    supplier_outcomes[shop.shop_id] = {
      eligible: isEligible,
      reason_codes: reasons,
      estimated_receiving_complete_at: estimatedReceivingCompleteAt,
    };

    if (isEligible) {
      eligible.push({ shop_id: shop.shop_id, receivingComplete: receivingCompleteMs });
    }
  }

  // --- Rank eligible shops: earliest receiving completion, then shop_id ----
  eligible.sort((a, b) => {
    if (a.receivingComplete !== b.receivingComplete) {
      return a.receivingComplete - b.receivingComplete;
    }
    return a.shop_id.localeCompare(b.shop_id);
  });

  const ranked_eligible_shop_ids = eligible.map((e) => e.shop_id);
  const recommended_shop_id = ranked_eligible_shop_ids[0] ?? null;
  const status: "matched" | "no_match" =
    ranked_eligible_shop_ids.length > 0 ? "matched" : "no_match";

  return {
    status,
    ranked_eligible_shop_ids,
    recommended_shop_id,
    supplier_outcomes,
  };
}
