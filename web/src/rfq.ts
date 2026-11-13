/**
 * Builds a plain-text RFQ (Request for Quote) from confirmed requirements,
 * the recommended shop, and any per-shop overrides that are in effect.
 */
import type { Requirements, Overrides } from './api/schemas';
import type { Shop } from './shops';
import { formatET, formatETDate } from './time';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RfqInput {
  requirements: Requirements;
  recommendedShop: Shop;
  /** Effective lot_ready_at for the recommended shop (may be overridden). */
  effectiveLotReadyAt: string;
  /** True when the dispatcher has changed lot_ready_at via an override. */
  lotReadyAtOverridden: boolean;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable RFQ text block.
 *
 * @param input - requirements, recommended shop, effective pickup time, and
 *                whether the pickup time was overridden.
 */
export function buildRfq(input: RfqInput): string {
  const { requirements, recommendedShop, effectiveLotReadyAt, lotReadyAtOverridden } = input;

  const lines: string[] = [];

  lines.push('REQUEST FOR QUOTE — RUSH CNC ORDER');
  lines.push('='.repeat(40));
  lines.push('');

  lines.push('SUPPLIER');
  lines.push(`  ${recommendedShop.displayName}`);
  lines.push(`  ${recommendedShop.city}, ${recommendedShop.state}`);
  lines.push('');

  lines.push('JOB REQUIREMENTS');
  lines.push(`  Process           : ${requirements.process}`);
  lines.push(`  Material          : ${requirements.material}`);
  lines.push(`  Quantity          : ${requirements.remaining_quantity} parts`);

  if (requirements.tolerance_half_width_mm !== null) {
    lines.push(`  Tolerance         : ±${requirements.tolerance_half_width_mm} mm bilateral`);
  } else {
    lines.push('  Tolerance         : (to be confirmed)');
  }

  lines.push(`  CMM report        : ${requirements.cmm_report_required ? 'Required' : 'Not required'}`);
  lines.push(`  Receiving insp.   : ${requirements.receiving_inspection_minutes} min`);
  lines.push('');

  lines.push('SCHEDULE');
  const pickupLine = `  Requested pickup  : ${formatETDate(effectiveLotReadyAt)} at ${formatET(effectiveLotReadyAt)}`;
  lines.push(lotReadyAtOverridden ? `${pickupLine}  [adjusted]` : pickupLine);
  lines.push(`  Parts needed by   : ${formatETDate(requirements.due_at)} at ${formatET(requirements.due_at)}`);
  lines.push('');

  lines.push('Please confirm availability and pricing at your earliest convenience.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Derives `effectiveLotReadyAt` and `lotReadyAtOverridden` from `overrides`
 * and delegates to `buildRfq`.
 */
export function buildRfqFromState(
  requirements: Requirements,
  recommendedShop: Shop,
  overrides: Overrides,
): string {
  const shopOverride = overrides[recommendedShop.id];
  const lotReadyAtOverridden = shopOverride?.lot_ready_at != null;
  const effectiveLotReadyAt = lotReadyAtOverridden
    ? shopOverride!.lot_ready_at!
    : recommendedShop.baselineLotReadyAt;

  return buildRfq({
    requirements,
    recommendedShop,
    effectiveLotReadyAt,
    lotReadyAtOverridden,
  });
}
