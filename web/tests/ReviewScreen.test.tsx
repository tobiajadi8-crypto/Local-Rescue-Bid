/**
 * ReviewScreen tests — covers the four required scenarios:
 *  1. J01 — no issues, Confirm enabled immediately
 *  2. J04 — missing tolerance, Confirm disabled until a value is typed
 *  3. J08 — conflicting tolerance, two "Use this value" options shown
 *  4. Extract failure shown as retry state (tested in UploadScreen, but
 *     we also cover the match-failure retry path here)
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewScreen } from '../src/components/ReviewScreen';
import type { ExtractResponse } from '../src/api/schemas';
import type { SessionAction } from '../src/state/session';

// ---------------------------------------------------------------------------
// Module mock
// ---------------------------------------------------------------------------

const mockMatch = vi.fn();
vi.mock('../src/api/client', () => ({
  matchSuppliers: (...args: unknown[]) => mockMatch(...args),
  ApiError: class ApiError extends Error {
    kind: string;
    status?: number;
    constructor(kind: string, msg: string, status?: number) {
      super(msg);
      this.kind = kind;
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Fixture extractions
// ---------------------------------------------------------------------------

const EXT_J01: ExtractResponse = {
  process: 'CNC milling',
  material: '6061-T6 aluminum',
  remaining_quantity: 180,
  due_at: '2026-11-20T12:00:00-05:00',
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: 0.05,
  issues: [],
  tolerance_source_values: [
    { half_width: 0.05, unit: 'mm', source: 'Drawing excerpt · Revision B' },
  ],
  sources: {
    process: 'CNC mill out of service. Open a rush request for a Michigan supplier.',
    material: 'Material: 6061-T6 aluminum',
    remaining_quantity:
      'Build quantity: 240 pieces. Finished and accepted before breakdown: 60.',
    due_at: 'receiving has to sign off by 12:00 ET Friday, November 20, 2026',
    receiving_inspection_minutes:
      'Allow 30 minutes for incoming inspection after the courier arrives.',
    cmm_report_required: 'A CMM report is optional.',
    tolerance_half_width_mm: 'Critical hole center spacing: 32.00 ±0.05 mm.',
  },
};

const EXT_J04: ExtractResponse = {
  process: 'CNC milling',
  material: '6061-T6 aluminum',
  remaining_quantity: 50,
  due_at: '2026-11-20T12:00:00-05:00',
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: null,
  issues: [{ field: 'tolerance_half_width_mm', reason: 'missing' }],
  tolerance_source_values: [],
  sources: {
    process: 'CNC mill out of service.',
    material: 'Material: 6061-T6 aluminum',
    remaining_quantity:
      'Build quantity: 100 pieces. Finished and accepted before breakdown: 50.',
    due_at: 'receiving has to sign off by 12:00 ET Friday, November 20, 2026',
    receiving_inspection_minutes:
      'Allow 30 minutes for incoming inspection after the courier arrives.',
    cmm_report_required: 'A CMM report is optional.',
  },
};

const EXT_J08: ExtractResponse = {
  process: 'CNC milling',
  material: '6061-T6 aluminum',
  remaining_quantity: 100,
  due_at: '2026-11-20T12:00:00-05:00',
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: null,
  issues: [{ field: 'tolerance_half_width_mm', reason: 'conflicting' }],
  tolerance_source_values: [
    { half_width: 0.05, unit: 'mm', source: 'Drawing excerpt · Revision B' },
    { half_width: 0.1, unit: 'mm', source: 'Work order and dispatch handoff' },
  ],
  sources: {
    tolerance_half_width_mm_conflict: [
      'Critical hole center spacing: 32.00 ±0.05 mm. All other dimensions have wider tolerances.',
      'The signed release also lists hole center spacing at 32.00 ±0.10 mm for Revision B.',
    ],
  },
};

const MATCH_RESULT = {
  status: 'matched' as const,
  review_reason: null,
  ranked_eligible_shop_ids: ['S02', 'S08'],
  recommended_shop_id: 'S02',
  requirements: EXT_J01,
  supplier_outcomes: {
    S01: { eligible: false, reason_codes: ['tolerance_too_loose'], estimated_receiving_complete_at: '2026-11-20T09:25:00-05:00' },
    S02: { eligible: true, reason_codes: [], estimated_receiving_complete_at: '2026-11-20T10:15:00-05:00' },
    S03: { eligible: false, reason_codes: ['insufficient_capacity'], estimated_receiving_complete_at: '2026-11-20T09:40:00-05:00' },
    S04: { eligible: false, reason_codes: ['misses_deadline'], estimated_receiving_complete_at: '2026-11-20T12:15:00-05:00' },
    S05: { eligible: false, reason_codes: ['insufficient_capacity'], estimated_receiving_complete_at: '2026-11-20T11:30:00-05:00' },
    S06: { eligible: false, reason_codes: ['process_mismatch'], estimated_receiving_complete_at: '2026-11-20T09:00:00-05:00' },
    S07: { eligible: false, reason_codes: ['material_unavailable'], estimated_receiving_complete_at: '2026-11-20T11:05:00-05:00' },
    S08: { eligible: true, reason_codes: [], estimated_receiving_complete_at: '2026-11-20T10:25:00-05:00' },
  },
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function makeDispatch() {
  const actions: SessionAction[] = [];
  const dispatch = vi.fn((action: SessionAction) => actions.push(action));
  return { dispatch, actions };
}

function renderReview(extraction: ExtractResponse, loading = false) {
  const { dispatch, actions } = makeDispatch();
  const utils = render(
    <ReviewScreen
      extraction={extraction}
      packetText="# test packet"
      loading={loading}
      overrides={{}}
      dispatch={dispatch}
    />,
  );
  return { ...utils, dispatch, actions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewScreen — J01 (no issues)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows all seven requirement fields', () => {
    renderReview(EXT_J01);
    expect(screen.getByLabelText(/process/i)).toBeDefined();
    expect(screen.getByLabelText(/material/i)).toBeDefined();
    expect(screen.getByLabelText(/remaining quantity/i)).toBeDefined();
    expect(screen.getByLabelText(/tolerance/i)).toBeDefined();
    expect(screen.getByLabelText(/^date$/i)).toBeDefined();
    expect(screen.getByLabelText(/^time \(hh:mm\)/i)).toBeDefined();
    expect(screen.getByLabelText(/receiving inspection time/i)).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /cmm report/i })).toBeDefined();
  });

  it('Confirm button is enabled immediately for J01 (no issues)', () => {
    renderReview(EXT_J01);
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /confirm and find suppliers/i });
    expect(btn.disabled).toBe(false);
  });

  it('shows source quote for remaining_quantity with arithmetic', () => {
    renderReview(EXT_J01);
    expect(screen.getByText(/240 ordered/i)).toBeDefined();
    expect(screen.getByText(/180 remaining/i)).toBeDefined();
  });

  it('dispatches MATCH_START and MATCH_SUCCESS on Confirm', async () => {
    mockMatch.mockResolvedValueOnce(MATCH_RESULT);
    const { dispatch } = renderReview(EXT_J01);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm and find suppliers/i }));
    });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'MATCH_START' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'MATCH_SUCCESS', result: MATCH_RESULT });
    });
  });

  it('shows "All fields confirmed" in summary bar', () => {
    renderReview(EXT_J01);
    expect(screen.getByText(/all fields confirmed/i)).toBeDefined();
  });

  it('marks a field as "Edited by you" after editing', () => {
    renderReview(EXT_J01);
    const processInput = screen.getByLabelText(/process/i);
    fireEvent.change(processInput, { target: { value: 'CNC turning' } });
    expect(screen.getByText(/edited by you/i)).toBeDefined();
  });

  it('Reset restores original values', () => {
    renderReview(EXT_J01);
    const processInput = screen.getByLabelText(/process/i) as HTMLInputElement;
    fireEvent.change(processInput, { target: { value: 'CNC turning' } });
    expect(processInput.value).toBe('CNC turning');

    fireEvent.click(screen.getByRole('button', { name: /reset to extracted values/i }));
    expect((screen.getByLabelText(/process/i) as HTMLInputElement).value).toBe('CNC milling');
    expect(screen.queryByText(/edited by you/i)).toBeNull();
  });

  it('Back button dispatches GO_TO_STEP upload', () => {
    const { dispatch } = renderReview(EXT_J01);
    fireEvent.click(screen.getByRole('button', { name: /back to upload/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'GO_TO_STEP', step: 'upload' });
  });
});

describe('ReviewScreen — J04 (missing tolerance)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows "Missing" badge on tolerance field', () => {
    renderReview(EXT_J04);
    expect(screen.getByText('Missing')).toBeDefined();
  });

  it('Confirm button is disabled when tolerance is missing', () => {
    renderReview(EXT_J04);
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /confirm and find suppliers/i });
    expect(btn.disabled).toBe(true);
  });

  it('shows attention count in summary bar', () => {
    renderReview(EXT_J04);
    expect(screen.getByText(/need/i)).toBeDefined();
  });

  it('Confirm becomes enabled after typing a tolerance value', async () => {
    renderReview(EXT_J04);
    const tolInput = screen.getByLabelText(/tolerance/i) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(tolInput, { target: { value: '0.05' } });
    });

    await waitFor(() => {
      const btn = screen.getByRole<HTMLButtonElement>('button', { name: /confirm and find suppliers/i });
      expect(btn.disabled).toBe(false);
    });
  });

  it('Missing badge disappears after a value is entered', async () => {
    renderReview(EXT_J04);
    expect(screen.getByText('Missing')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/tolerance/i), { target: { value: '0.05' } });
    });

    await waitFor(() => {
      expect(screen.queryByText('Missing')).toBeNull();
    });
  });
});

describe('ReviewScreen — J08 (conflicting tolerance)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows "Conflicting" badge on tolerance field', () => {
    renderReview(EXT_J08);
    expect(screen.getByText('Conflicting')).toBeDefined();
  });

  it('shows two "Use this value" buttons for the conflict', () => {
    renderReview(EXT_J08);
    const useBtns = screen.getAllByText(/use this value/i);
    expect(useBtns.length).toBe(2);
  });

  it('shows both conflicting source quotes', () => {
    renderReview(EXT_J08);
    expect(screen.getAllByText(/Drawing excerpt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Work order/i).length).toBeGreaterThanOrEqual(1);
  });

  it('Confirm is disabled while conflict is unresolved', () => {
    renderReview(EXT_J08);
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /confirm and find suppliers/i });
    expect(btn.disabled).toBe(true);
  });

  it('choosing a conflict option fills the field and enables Confirm', async () => {
    renderReview(EXT_J08);

    const useBtns = screen.getAllByText(/use this value/i);
    await act(async () => { fireEvent.click(useBtns[0]); });

    await waitFor(() => {
      const tolInput = screen.getByLabelText(/tolerance/i) as HTMLInputElement;
      expect(Number(tolInput.value)).toBeGreaterThan(0);
      const btn = screen.getByRole<HTMLButtonElement>('button', { name: /confirm and find suppliers/i });
      expect(btn.disabled).toBe(false);
    });
  });
});

describe('ReviewScreen — match failure', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows error banner on match network failure', async () => {
    const { ApiError } = await import('../src/api/client');
    mockMatch.mockRejectedValueOnce(new ApiError('network', 'down'));
    const { dispatch } = renderReview(EXT_J01);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm and find suppliers/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/can't reach the server/i)).toBeDefined();
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'MATCH_ERROR' }));
    });
  });

  it('retry button on match error re-calls match', async () => {
    const { ApiError } = await import('../src/api/client');
    mockMatch
      .mockRejectedValueOnce(new ApiError('network', 'down'))
      .mockResolvedValueOnce(MATCH_RESULT);

    const { dispatch } = renderReview(EXT_J01);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm and find suppliers/i }));
    });
    await waitFor(() => screen.getByRole('button', { name: /retry/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'MATCH_SUCCESS', result: MATCH_RESULT });
    });
  });
});
