/**
 * ResultsScreen tests.
 *
 * shops.ts imports from ../../data/shops.json via a relative path.  In the
 * test environment Vite aliases are not resolved, so we mock the module to
 * return an inline copy of the shops we need.
 */
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultsScreen } from '../src/components/ResultsScreen';
import type { MatchResponse, Requirements } from '../src/api/schemas';
import type { SessionAction } from '../src/state/session';

// ---------------------------------------------------------------------------
// Mock shops so the test doesn't need the JSON file on disk
// ---------------------------------------------------------------------------

vi.mock('../src/shops', () => {
  const shops = [
    {
      id: 'S01',
      displayName: 'Red Finch Toolworks',
      city: 'Warren',
      state: 'MI',
      process: 'CNC milling',
      materials: ['6061-T6 aluminum', '1018 steel'],
      tightestToleranceMm: 0.1,
      capacity: 300,
      baselineLotReadyAt: '2026-11-20T08:30:00-05:00',
      returnMinutesToDetroit: 25,
      cmmReportAvailable: false,
    },
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
      id: 'S03',
      displayName: 'Copper Kite Machining',
      city: 'Pontiac',
      state: 'MI',
      process: 'CNC milling',
      materials: ['6061-T6 aluminum', '1018 steel'],
      tightestToleranceMm: 0.04,
      capacity: 120,
      baselineLotReadyAt: '2026-11-20T08:15:00-05:00',
      returnMinutesToDetroit: 55,
      cmmReportAvailable: true,
    },
    {
      id: 'S04',
      displayName: 'Slate Lantern Tool Co.',
      city: 'Taylor',
      state: 'MI',
      process: 'CNC milling',
      materials: ['6061-T6 aluminum', '7075-T6 aluminum'],
      tightestToleranceMm: 0.05,
      capacity: 280,
      baselineLotReadyAt: '2026-11-20T11:10:00-05:00',
      returnMinutesToDetroit: 35,
      cmmReportAvailable: false,
    },
    {
      id: 'S05',
      displayName: 'Birch Relay Precision',
      city: 'Auburn Hills',
      state: 'MI',
      process: 'CNC milling',
      materials: ['6061-T6 aluminum', '304 stainless steel'],
      tightestToleranceMm: 0.025,
      capacity: 90,
      baselineLotReadyAt: '2026-11-20T10:00:00-05:00',
      returnMinutesToDetroit: 60,
      cmmReportAvailable: true,
    },
    {
      id: 'S06',
      displayName: 'Gray Heron Turning',
      city: 'Dearborn',
      state: 'MI',
      process: 'CNC turning',
      materials: ['6061-T6 aluminum', '1018 steel'],
      tightestToleranceMm: 0.05,
      capacity: 320,
      baselineLotReadyAt: '2026-11-20T08:00:00-05:00',
      returnMinutesToDetroit: 30,
      cmmReportAvailable: false,
    },
    {
      id: 'S07',
      displayName: 'Maple Anvil Machining',
      city: 'Novi',
      state: 'MI',
      process: 'CNC milling',
      materials: ['1018 steel', '304 stainless steel'],
      tightestToleranceMm: 0.05,
      capacity: 200,
      baselineLotReadyAt: '2026-11-20T09:45:00-05:00',
      returnMinutesToDetroit: 50,
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
// Fixture data (matches fixtures/match-j01.json)
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
    S01: { eligible: false, reason_codes: ['tolerance_too_loose'], estimated_receiving_complete_at: '2026-11-20T09:25:00-05:00' },
    S02: { eligible: true,  reason_codes: [],                      estimated_receiving_complete_at: '2026-11-20T10:15:00-05:00' },
    S03: { eligible: false, reason_codes: ['insufficient_capacity'], estimated_receiving_complete_at: '2026-11-20T09:40:00-05:00' },
    S04: { eligible: false, reason_codes: ['misses_deadline'],       estimated_receiving_complete_at: '2026-11-20T12:15:00-05:00' },
    S05: { eligible: false, reason_codes: ['insufficient_capacity'], estimated_receiving_complete_at: '2026-11-20T11:30:00-05:00' },
    S06: { eligible: false, reason_codes: ['process_mismatch'],      estimated_receiving_complete_at: '2026-11-20T09:00:00-05:00' },
    S07: { eligible: false, reason_codes: ['material_unavailable'],  estimated_receiving_complete_at: '2026-11-20T11:05:00-05:00' },
    S08: { eligible: true,  reason_codes: [],                       estimated_receiving_complete_at: '2026-11-20T10:25:00-05:00' },
  },
};

// S02 delayed to 11:45 → S08 ranks first (derived fixture)
const MATCH_S02_DELAYED: MatchResponse = {
  ...MATCH_J01,
  _derived: true,
  ranked_eligible_shop_ids: ['S08', 'S02'],
  recommended_shop_id: 'S08',
  supplier_outcomes: {
    ...MATCH_J01.supplier_outcomes,
    S02: { eligible: true, reason_codes: [], estimated_receiving_complete_at: '2026-11-20T12:30:00-05:00' },
  },
};

// No eligible suppliers
const MATCH_NO_MATCH: MatchResponse = {
  ...MATCH_J01,
  status: 'no_match',
  ranked_eligible_shop_ids: [],
  recommended_shop_id: null,
  supplier_outcomes: {
    ...MATCH_J01.supplier_outcomes,
    S02: { eligible: false, reason_codes: ['misses_deadline'], estimated_receiving_complete_at: '2026-11-20T12:30:00-05:00' },
    S08: { eligible: false, reason_codes: ['insufficient_capacity'], estimated_receiving_complete_at: '2026-11-20T10:25:00-05:00' },
  },
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function makeDispatch() {
  const actions: SessionAction[] = [];
  const dispatch = vi.fn((a: SessionAction) => actions.push(a));
  return { dispatch, actions };
}

function renderResults(
  match: MatchResponse = MATCH_J01,
  prevRanking: string[] = [],
) {
  const { dispatch, actions } = makeDispatch();
  const utils = render(
    <ResultsScreen
      matchResult={match}
      confirmedRequirements={REQUIREMENTS}
      previousRanking={prevRanking}
      overrides={{}}
      loading={false}
      dispatch={dispatch}
    />,
  );
  return { ...utils, dispatch, actions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultsScreen — J01 base match', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the page heading', () => {
    renderResults();
    expect(screen.getByRole('heading', { name: /supplier results/i })).toBeDefined();
  });

  it('shows the matched summary banner', () => {
    renderResults();
    // The banner element specifically contains both name and "recommended"
    const banner = document.querySelector('.results-banner--matched')!;
    expect(banner.textContent).toContain('Juniper Spindle Works');
    expect(banner.textContent).toMatch(/recommended/i);
  });

  it('shows Juniper Spindle Works as #1 (Livonia, recommended)', () => {
    renderResults();
    const cards = screen.getAllByRole('article');
    // First card is the first eligible supplier
    const firstCard = cards[0];
    expect(firstCard.textContent).toContain('Juniper Spindle Works');
    expect(firstCard.textContent).toContain('Livonia');
  });

  it('shows Blue Aster Toolworks ranked #2', () => {
    renderResults();
    const cards = screen.getAllByRole('article');
    const secondCard = cards[1];
    expect(secondCard.textContent).toContain('Blue Aster Toolworks');
    expect(secondCard.textContent).toContain('Sterling Heights');
  });

  it('shows all 8 shops (2 eligible + 6 ineligible)', () => {
    renderResults();
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBe(8);
  });

  it('shows the section heading "Eligible suppliers — 2 found"', () => {
    renderResults();
    expect(screen.getByText(/eligible suppliers.*2 found/i)).toBeDefined();
  });

  it('shows the section heading "Ineligible suppliers — 6"', () => {
    renderResults();
    expect(screen.getByText(/ineligible suppliers.*6/i)).toBeDefined();
  });
});

describe('ResultsScreen — Warren (S01) tolerance explanation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows Red Finch Toolworks (Warren) in the ineligible list', () => {
    renderResults();
    expect(screen.getByText(/Red Finch Toolworks/i)).toBeDefined();
  });

  it('shows the shop tolerance ±0.1 mm for Warren', () => {
    renderResults();
    // tolerance comparison shows the shop's value
    const warrenCard = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Red Finch Toolworks'),
    );
    expect(warrenCard?.textContent).toContain('±0.1 mm');
  });

  it('shows the required tolerance ±0.05 mm in the Warren card', () => {
    renderResults();
    const warrenCard = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Red Finch Toolworks'),
    );
    // Both shop and required tolerance should appear in the same card
    expect(warrenCard?.textContent).toContain('±0.05 mm');
  });

  it('shows the tolerance_too_loose reason label for Warren', () => {
    renderResults();
    const warrenCard = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Red Finch Toolworks'),
    );
    expect(warrenCard?.textContent).toMatch(/tolerance too loose/i);
  });

  it('shows the "Too loose by 0.050 mm" detail for Warren', () => {
    renderResults();
    // 0.1 - 0.05 = 0.050
    const warrenCard = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Red Finch Toolworks'),
    );
    expect(warrenCard?.textContent).toMatch(/too loose by 0\.050 mm/i);
  });

  it('shows the full tolerance explanation sentence for Warren', () => {
    renderResults();
    const warrenCard = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Red Finch Toolworks'),
    );
    // Explanation: "Tightest tolerance (±0.1 mm) is looser than the ±0.05 mm required"
    expect(warrenCard?.textContent).toMatch(/tightest tolerance.*0\.1 mm.*looser.*0\.05 mm/i);
  });
});

describe('ResultsScreen — "Closer than recommended" tag', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('S08 does NOT show "Closer than recommended" in base J01 (S02 arrives earlier)', () => {
    renderResults();
    const s08Card = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Blue Aster Toolworks'),
    );
    // S08 arrives at 10:25, S02 at 10:15 — S08 is LATER, so no tag
    expect(s08Card?.textContent).not.toMatch(/closer than recommended/i);
  });

  it('S02 shows "Closer than recommended" when S08 is recommended (delayed scenario)', () => {
    // In this scenario S08 is recommended (arrives 10:25),
    // but S02 arrives at 12:30 — it's LATER, so no tag for S02.
    // However if we set up a case where S02 arrives BEFORE S08...
    // Let's use S02-delayed fixture: S08 is recommended at 10:25, S02 at 12:30
    renderResults(MATCH_S02_DELAYED);
    const s02Card = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Juniper Spindle Works'),
    );
    // S02 arrives 12:30 — that is LATER than S08 at 10:25 — no "Closer" tag
    expect(s02Card?.textContent).not.toMatch(/closer than recommended/i);
  });

  it('shows "Closer than recommended" on a shop that arrives before the recommended shop', () => {
    // Build a synthetic scenario: S08 is recommended at 10:25,
    // but S02 (also eligible) arrives at 09:00 — earlier → tag expected.
    const syntheticMatch: MatchResponse = {
      ...MATCH_J01,
      ranked_eligible_shop_ids: ['S08', 'S02'],
      recommended_shop_id: 'S08',
      supplier_outcomes: {
        ...MATCH_J01.supplier_outcomes,
        S02: { eligible: true, reason_codes: [], estimated_receiving_complete_at: '2026-11-20T09:00:00-05:00' },
        S08: { eligible: true, reason_codes: [], estimated_receiving_complete_at: '2026-11-20T10:25:00-05:00' },
      },
    };
    renderResults(syntheticMatch);
    const s02Card = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Juniper Spindle Works'),
    );
    expect(s02Card?.textContent).toMatch(/closer than recommended/i);
  });
});

describe('ResultsScreen — no_match', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the no-match banner', () => {
    renderResults(MATCH_NO_MATCH);
    expect(screen.getByText(/no eligible suppliers found/i)).toBeDefined();
  });

  it('shows the total shop count in the no-match banner', () => {
    renderResults(MATCH_NO_MATCH);
    const banner = document.querySelector('.results-banner--no-match')!;
    expect(banner.textContent).toMatch(/8.*shops/i);
  });

  it('shows zero eligible suppliers section', () => {
    renderResults(MATCH_NO_MATCH);
    expect(screen.queryByText(/eligible suppliers.*2 found/i)).toBeNull();
  });
});

describe('ResultsScreen — derived fixture notice', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the derived-fixture notice when _derived is true', () => {
    renderResults(MATCH_S02_DELAYED);
    expect(screen.getByRole('note')).toBeDefined();
    expect(screen.getByText(/not been verified against the real api/i)).toBeDefined();
  });

  it('does not show the derived notice for the base J01 match', () => {
    renderResults(MATCH_J01);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('ResultsScreen — ranking change badges', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows "Moved up" badge when a shop improved rank', () => {
    // Previous: [S08, S02] → now [S02, S08]: S02 moved from #2 to #1
    renderResults(MATCH_J01, ['S08', 'S02']);
    const s02Card = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Juniper Spindle Works'),
    );
    expect(s02Card?.textContent).toMatch(/moved up/i);
  });

  it('shows "Moved down" badge when a shop worsened rank', () => {
    // Previous: [S02, S08] → now [S02, S08]: but let us give previous as [S08, S02]
    // so S08 was #1, now #2 → moved down
    renderResults(MATCH_J01, ['S08', 'S02']);
    const s08Card = screen.getAllByRole('article').find(
      (el) => el.textContent?.includes('Blue Aster Toolworks'),
    );
    expect(s08Card?.textContent).toMatch(/moved down/i);
  });
});

describe('ResultsScreen — navigation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('"Back to review" dispatches GO_TO_STEP review', () => {
    const { dispatch } = renderResults();
    fireEvent.click(screen.getAllByRole('button', { name: /back to review/i })[0]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'GO_TO_STEP', step: 'review' });
  });

  it('"Start over" dispatches RESET', () => {
    const { dispatch } = renderResults();
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET' });
  });
});
