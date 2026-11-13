/**
 * Integration tests for the override panel and RFQ block in ResultsScreen.
 *
 * shops.ts imports from ../../data/shops.json via a relative path. In the test
 * environment Vite aliases are not resolved, so we mock the module to return an
 * inline copy of the shops we need.
 *
 * matchSuppliers (api/client) is mocked to verify recalculate dispatches.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultsScreen } from '../src/components/ResultsScreen';
import type { MatchResponse, Requirements, Overrides } from '../src/api/schemas';
import type { SessionAction } from '../src/state/session';

// ---------------------------------------------------------------------------
// Mock shops
// ---------------------------------------------------------------------------

vi.mock('../src/shops', () => {
  const shops = [
    {
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
    },
    {
      id: 'S08',
      displayName: 'Blue Aster Toolworks',
      city: 'Sterling Heights',
      state: 'MI',
      process: 'CNC milling',
      materials: ['6061-T6 aluminum', '1018 steel'],
      tightestToleranceMm: 0.05,
      capacity: 200,
      baselineLotReadyAt: '2026-11-20T09:15:00-05:00',
      returnMinutesToDetroit: 40,
      cmmReportAvailable: false,
    },
  ];
  return {
    shops,
    shopById: Object.fromEntries(shops.map((s) => [s.id, s])),
  };
});

// ---------------------------------------------------------------------------
// Mock matchSuppliers
// ---------------------------------------------------------------------------

const mockMatchSuppliers = vi.fn();
vi.mock('../src/api/client', () => ({
  matchSuppliers: (...args: unknown[]) => mockMatchSuppliers(...args),
  ApiError: class ApiError extends Error {
    kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const REQUIREMENTS: Requirements = {
  process: 'CNC milling',
  material: '6061-T6 aluminum',
  remaining_quantity: 180,
  due_at: '2026-11-20T12:00:00-05:00',
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: 0.05,
};

const MATCH_J01: MatchResponse = {
  status: 'matched',
  review_reason: null,
  ranked_eligible_shop_ids: ['S02', 'S08'],
  recommended_shop_id: 'S02',
  requirements: REQUIREMENTS,
  supplier_outcomes: {
    S02: { eligible: true,  reason_codes: [], estimated_receiving_complete_at: '2026-11-20T10:15:00-05:00' },
    S08: { eligible: true,  reason_codes: [], estimated_receiving_complete_at: '2026-11-20T10:25:00-05:00' },
  },
};

const MATCH_NO_MATCH: MatchResponse = {
  status: 'no_match',
  review_reason: null,
  ranked_eligible_shop_ids: [],
  recommended_shop_id: null,
  requirements: REQUIREMENTS,
  supplier_outcomes: {
    S02: { eligible: false, reason_codes: ['misses_deadline'], estimated_receiving_complete_at: '2026-11-20T12:30:00-05:00' },
    S08: { eligible: false, reason_codes: ['insufficient_capacity'], estimated_receiving_complete_at: '2026-11-20T10:25:00-05:00' },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDispatch() {
  const actions: SessionAction[] = [];
  const dispatch = vi.fn((a: SessionAction) => actions.push(a));
  return { dispatch, actions };
}

function renderResults(
  match: MatchResponse = MATCH_J01,
  overrides: Overrides = {},
  loading = false,
) {
  const { dispatch, actions } = makeDispatch();
  const utils = render(
    <ResultsScreen
      matchResult={match}
      confirmedRequirements={REQUIREMENTS}
      previousRanking={[]}
      overrides={overrides}
      loading={loading}
      dispatch={dispatch}
    />,
  );
  return { ...utils, dispatch, actions };
}

// ---------------------------------------------------------------------------
// Override panel visibility
// ---------------------------------------------------------------------------

describe('OverridePanel — visibility', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows an override panel for each eligible shop', () => {
    renderResults();
    // S02 and S08 are both eligible
    expect(document.querySelector('[data-testid="override-panel-S02"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="override-panel-S08"]')).not.toBeNull();
  });

  it('shows the baseline pickup time in the override panel', () => {
    renderResults();
    // S02 baseline: 2026-11-20T09:00:00-05:00 → '9:00 AM ET'
    const panel = document.querySelector('[data-testid="override-panel-S02"]')!;
    expect(panel.textContent).toContain('9:00 AM ET');
  });

  it('shows the "Set 11:45 AM ET" button for eligible shops', () => {
    renderResults();
    expect(screen.getAllByRole('button', { name: /set.*11:45/i }).length).toBeGreaterThan(0);
  });

  it('does NOT show a Reset button when no override is active', () => {
    renderResults();
    expect(screen.queryByRole('button', { name: /reset.*pickup/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Override panel — Set action
// ---------------------------------------------------------------------------

describe('OverridePanel — set action', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('dispatches SET_OVERRIDE with 11:45 AM ET iso when "Set 11:45 AM ET" is clicked', () => {
    const { dispatch } = renderResults();
    const setBtn = screen.getByRole('button', { name: /set.*juniper.*11:45/i });
    fireEvent.click(setBtn);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_OVERRIDE',
        shopId: 'S02',
        override: expect.objectContaining({
          lot_ready_at: '2026-11-20T11:45:00-05:00',
        }),
      }),
    );
  });

  it('shows the overridden time and "changed" badge when override is active', () => {
    const overrides: Overrides = {
      S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' },
    };
    renderResults(MATCH_J01, overrides);
    const valueEl = document.querySelector('[data-testid="override-value-S02"]')!;
    expect(valueEl.textContent).toContain('11:45 AM ET');
    // "changed" badge
    const panel = document.querySelector('[data-testid="override-panel-S02"]')!;
    expect(panel.textContent).toMatch(/changed/i);
  });
});

// ---------------------------------------------------------------------------
// Override panel — Reset action
// ---------------------------------------------------------------------------

describe('OverridePanel — reset action', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the Reset button when an override is active', () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    renderResults(MATCH_J01, overrides);
    expect(screen.getByRole('button', { name: /reset.*juniper/i })).toBeDefined();
  });

  it('dispatches CLEAR_OVERRIDE when Reset is clicked (no other override fields)', () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    const { dispatch } = renderResults(MATCH_J01, overrides);
    fireEvent.click(screen.getByRole('button', { name: /reset.*juniper/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_OVERRIDE', shopId: 'S02' });
  });
});

// ---------------------------------------------------------------------------
// Recalculate bar
// ---------------------------------------------------------------------------

describe('Recalculate bar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is NOT shown when there are no overrides', () => {
    renderResults();
    expect(document.querySelector('[data-testid="recalculate-bar"]')).toBeNull();
  });

  it('is shown when at least one override is active', () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    renderResults(MATCH_J01, overrides);
    expect(document.querySelector('[data-testid="recalculate-bar"]')).not.toBeNull();
  });

  it('shows the override count in the recalculate bar', () => {
    const overrides: Overrides = {
      S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' },
    };
    renderResults(MATCH_J01, overrides);
    const bar = document.querySelector('[data-testid="recalculate-bar"]')!;
    expect(bar.textContent).toMatch(/1 shop override/i);
  });

  it('shows "2 shop overrides" when two shops are overridden', () => {
    const overrides: Overrides = {
      S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' },
      S08: { max_parts_in_slot: 100 },
    };
    renderResults(MATCH_J01, overrides);
    const bar = document.querySelector('[data-testid="recalculate-bar"]')!;
    expect(bar.textContent).toMatch(/2 shop overrides/i);
  });

  it('"Clear overrides" dispatches CLEAR_ALL_OVERRIDES', () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    const { dispatch } = renderResults(MATCH_J01, overrides);
    fireEvent.click(screen.getByRole('button', { name: /clear all overrides/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_ALL_OVERRIDES' });
  });

  it('"Recalculate" button is disabled when loading=true', () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    renderResults(MATCH_J01, overrides, true);
    const btn = screen.getByRole('button', { name: /recalculate/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('dispatches MATCH_START then MATCH_SUCCESS when recalculate succeeds', async () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    const fakeResult: MatchResponse = { ...MATCH_J01 };
    mockMatchSuppliers.mockResolvedValueOnce(fakeResult);

    const { dispatch } = renderResults(MATCH_J01, overrides);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /recalculate with overrides/i }));
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MATCH_START' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MATCH_SUCCESS', result: fakeResult });
  });

  it('dispatches MATCH_ERROR when recalculate fails', async () => {
    const overrides: Overrides = { S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' } };
    mockMatchSuppliers.mockRejectedValueOnce(new Error('Network down'));

    const { dispatch } = renderResults(MATCH_J01, overrides);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /recalculate with overrides/i }));
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MATCH_START' });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MATCH_ERROR',
      message: 'Network down',
    });
  });
});

// ---------------------------------------------------------------------------
// RFQ block
// ---------------------------------------------------------------------------

describe('RFQ block', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the RFQ block when status is matched', () => {
    renderResults();
    expect(screen.getByRole('region', { name: /request for quote/i })).toBeDefined();
  });

  it('does NOT show the RFQ block when status is no_match', () => {
    renderResults(MATCH_NO_MATCH);
    expect(screen.queryByRole('region', { name: /request for quote/i })).toBeNull();
  });

  it('RFQ textarea contains the shop name', () => {
    renderResults();
    const ta = document.querySelector('[data-testid="rfq-textarea"]') as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    expect(ta.value).toContain('Juniper Spindle Works');
  });

  it('RFQ textarea contains the quantity', () => {
    renderResults();
    const ta = document.querySelector('[data-testid="rfq-textarea"]') as HTMLTextAreaElement;
    expect(ta.value).toContain('180 parts');
  });

  it('RFQ textarea shows overridden pickup time when override is active', () => {
    const overrides: Overrides = {
      S02: { lot_ready_at: '2026-11-20T11:45:00-05:00' },
    };
    renderResults(MATCH_J01, overrides);
    const ta = document.querySelector('[data-testid="rfq-textarea"]') as HTMLTextAreaElement;
    expect(ta.value).toContain('11:45 AM ET');
    expect(ta.value).toContain('[adjusted]');
  });

  it('RFQ textarea shows baseline pickup time when no override is set', () => {
    renderResults();
    const ta = document.querySelector('[data-testid="rfq-textarea"]') as HTMLTextAreaElement;
    expect(ta.value).toContain('9:00 AM ET');
    expect(ta.value).not.toContain('[adjusted]');
  });

  it('shows a Copy button in the RFQ section', () => {
    renderResults();
    expect(screen.getByRole('button', { name: /copy rfq/i })).toBeDefined();
  });
});
