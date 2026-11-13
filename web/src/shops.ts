/**
 * Typed shop list generated from ../../data/shops.json.
 *
 * Vite can reach files outside the web/ root when server.fs.allow includes '..'
 * (configured in vite.config.ts). The JSON is imported directly — no copy needed.
 */
import shopsRaw from '../../data/shops.json';

export interface Shop {
  /** e.g. "S01" */
  id: string;
  /** e.g. "Red Finch Toolworks" */
  displayName: string;
  city: string;
  state: string;
  /** e.g. "CNC milling" */
  process: string;
  /** Materials this shop supports */
  materials: string[];
  /**
   * Tightest (smallest) bilateral tolerance half-width the shop can hold, in mm.
   * Smaller = more capable.
   */
  tightestToleranceMm: number;
  /** Maximum parts per slot */
  capacity: number;
  /**
   * Baseline ISO-8601 datetime when the lot will be ready for pickup.
   * This is the shop's default value before any overrides.
   */
  baselineLotReadyAt: string;
  /** Travel time from the shop back to Detroit HQ, in minutes. */
  returnMinutesToDetroit: number;
  /** Whether the shop can produce a CMM report. */
  cmmReportAvailable: boolean;
}

export const shops: Shop[] = shopsRaw.map((s) => ({
  id: s.shop_id,
  displayName: s.shop_name,
  city: s.city,
  state: s.state,
  process: s.process,
  materials: s.materials,
  tightestToleranceMm: s.min_supported_bilateral_half_width_mm,
  capacity: s.max_parts_in_slot,
  baselineLotReadyAt: s.lot_ready_at,
  returnMinutesToDetroit: s.return_minutes_to_detroit,
  cmmReportAvailable: s.cmm_report_available,
}));

/** O(1) lookup by shop_id. */
export const shopById: Record<string, Shop> = Object.fromEntries(
  shops.map((s) => [s.id, s]),
);
