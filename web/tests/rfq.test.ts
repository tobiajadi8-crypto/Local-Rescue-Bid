/**
 * Unit tests for web/src/rfq.ts
 */
import { describe, it, expect } from 'vitest';
import { buildRfq, buildRfqFromState } from '../src/rfq';
import type { RfqInput } from '../src/rfq';
import type { Requirements, Overrides } from '../src/api/schemas';
import type { Shop } from '../src/shops';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHOP: Shop = {
  id: 'S02',
  displayName: 'Juniper Spindle Works',
  city: 'Livonia',
  state: 'MI',
  process: 'CNC milling',
  materials: ['6061-T6 aluminum', '7075-T6 aluminum'],
  tightestToleranceMm: 0.05,
  capacity: 220,
  baselineLotReadyAt: '2026-11-20T09:00:00-05:00',
  returnMinutesToDetroit: 45,
  cmmReportAvailable: true,
};

const REQUIREMENTS: Requirements = {
  process: 'CNC milling',
  material: '6061-T6 aluminum',
  remaining_quantity: 180,
  due_at: '2026-11-20T12:00:00-05:00',
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: 0.05,
};

const BASE_INPUT: RfqInput = {
  requirements: REQUIREMENTS,
  recommendedShop: SHOP,
  effectiveLotReadyAt: SHOP.baselineLotReadyAt,
  lotReadyAtOverridden: false,
};

// ---------------------------------------------------------------------------
// buildRfq
// ---------------------------------------------------------------------------

describe('buildRfq — basic content', () => {
  it('includes the RFQ header', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('REQUEST FOR QUOTE');
  });

  it('includes the shop name', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('Juniper Spindle Works');
  });

  it('includes the shop city and state', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('Livonia, MI');
  });

  it('includes the process', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('CNC milling');
  });

  it('includes the material', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('6061-T6 aluminum');
  });

  it('includes the quantity', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('180 parts');
  });

  it('includes the tolerance', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('±0.05 mm');
  });

  it('includes "Not required" for CMM when false', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toMatch(/CMM report\s*:.*Not required/i);
  });

  it('includes "Required" for CMM when true', () => {
    const input: RfqInput = {
      ...BASE_INPUT,
      requirements: { ...REQUIREMENTS, cmm_report_required: true },
    };
    const text = buildRfq(input);
    expect(text).toMatch(/CMM report\s*:.*Required/i);
  });

  it('includes the receiving inspection minutes', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('30 min');
  });

  it('includes the pickup time formatted as ET', () => {
    const text = buildRfq(BASE_INPUT);
    // 2026-11-20T09:00:00-05:00 → '9:00 AM ET'
    expect(text).toContain('9:00 AM ET');
  });

  it('includes the deadline formatted as ET', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).toContain('12:00 PM ET');
  });

  it('does NOT include "[adjusted]" when not overridden', () => {
    const text = buildRfq(BASE_INPUT);
    expect(text).not.toContain('[adjusted]');
  });
});

describe('buildRfq — override indicators', () => {
  it('includes "[adjusted]" when lotReadyAtOverridden is true', () => {
    const input: RfqInput = {
      ...BASE_INPUT,
      effectiveLotReadyAt: '2026-11-20T11:45:00-05:00',
      lotReadyAtOverridden: true,
    };
    const text = buildRfq(input);
    expect(text).toContain('[adjusted]');
    expect(text).toContain('11:45 AM ET');
  });
});

describe('buildRfq — null tolerance', () => {
  it('shows "(to be confirmed)" when tolerance is null', () => {
    const input: RfqInput = {
      ...BASE_INPUT,
      requirements: { ...REQUIREMENTS, tolerance_half_width_mm: null },
    };
    const text = buildRfq(input);
    expect(text).toContain('(to be confirmed)');
  });
});

// ---------------------------------------------------------------------------
// buildRfqFromState
// ---------------------------------------------------------------------------

describe('buildRfqFromState', () => {
  it('uses baseline lot_ready_at when no override is set', () => {
    const noOverrides: Overrides = {};
    const text = buildRfqFromState(REQUIREMENTS, SHOP, noOverrides);
    // 9:00 AM baseline
    expect(text).toContain('9:00 AM ET');
    expect(text).not.toContain('[adjusted]');
  });

  it('uses overridden lot_ready_at when S02 override is set', () => {
    const overrides: Overrides = {
      S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' },
    };
    const text = buildRfqFromState(REQUIREMENTS, SHOP, overrides);
    expect(text).toContain('11:45 AM ET');
    expect(text).toContain('[adjusted]');
  });

  it('uses baseline when only a different shop is overridden', () => {
    const overrides: Overrides = {
      S08: { max_parts_in_slot: 100 },
    };
    const text = buildRfqFromState(REQUIREMENTS, SHOP, overrides);
    expect(text).toContain('9:00 AM ET');
    expect(text).not.toContain('[adjusted]');
  });
});
