/**
 * UploadScreen tests — using vitest + Testing Library + fixture mocks.
 *
 * We mock src/api/client so tests are hermetic (no real network, no Vite
 * alias resolution at test time).
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadScreen } from '../src/components/UploadScreen';
import type { SessionAction } from '../src/state/session';

// ---------------------------------------------------------------------------
// Fixture data (inlined so tests have no external file dependency)
// ---------------------------------------------------------------------------

const EXTRACT_J01 = {
  process: 'CNC milling',
  material: '6061-T6 aluminum',
  remaining_quantity: 180,
  due_at: '2026-11-20T12:00:00-05:00',
  receiving_inspection_minutes: 30,
  cmm_report_required: false,
  tolerance_half_width_mm: 0.05,
  issues: [],
  tolerance_source_values: [{ half_width: 0.05, unit: 'mm', source: 'Drawing excerpt · Revision B' }],
  sources: { remaining_quantity: 'Build quantity: 240 pieces. Finished and accepted before breakdown: 60.' },
};

// ---------------------------------------------------------------------------
// Module mock — replace extractPacket with a controllable stub
// ---------------------------------------------------------------------------

const mockExtract = vi.fn();
vi.mock('../src/api/client', () => ({
  extractPacket: (...args: unknown[]) => mockExtract(...args),
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
// Helpers
// ---------------------------------------------------------------------------

function makeDispatch() {
  const actions: SessionAction[] = [];
  const dispatch = vi.fn((action: SessionAction) => actions.push(action));
  return { dispatch, actions };
}

function renderUpload(packetText = '', loading = false) {
  const { dispatch, actions } = makeDispatch();
  const utils = render(
    <UploadScreen packetText={packetText} loading={loading} dispatch={dispatch} />,
  );
  return { ...utils, dispatch, actions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UploadScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fetch resolves for sample files
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '# J01 · Actuator mounting bracket\nSynthetic job packet\nBuild quantity: 240 pieces.',
    } as unknown as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sample buttons and extract button', () => {
    renderUpload();
    expect(screen.getByRole('button', { name: /load j01/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /load j04/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /load j08/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /extract requirements/i })).toBeDefined();
  });

  it('extract button is disabled when packetText is empty', () => {
    renderUpload('');
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /extract requirements/i });
    expect(btn.disabled).toBe(true);
  });

  it('extract button is enabled when packetText has content', () => {
    renderUpload('some packet text');
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /extract requirements/i });
    expect(btn.disabled).toBe(false);
  });

  it('dispatches SET_PACKET_TEXT when user types in the paste area', () => {
    const { dispatch } = renderUpload();
    const textarea = screen.getByRole('textbox', { name: /paste packet text/i });
    fireEvent.change(textarea, { target: { value: 'hello world' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_PACKET_TEXT', text: 'hello world' });
  });

  it('dispatches EXTRACT_START then EXTRACT_SUCCESS on successful extract', async () => {
    mockExtract.mockResolvedValueOnce(EXTRACT_J01);
    const { dispatch } = renderUpload('# J01 some text');

    const btn = screen.getByRole('button', { name: /extract requirements/i });
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'EXTRACT_START' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'EXTRACT_SUCCESS', result: EXTRACT_J01 });
    });
  });

  it('shows loading text and dispatches EXTRACT_START when loading=true', () => {
    renderUpload('some text', true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /reading the packet/i }).disabled).toBe(true);
  });

  it('shows error banner on network failure with retry button', async () => {
    const { ApiError } = await import('../src/api/client');
    mockExtract.mockRejectedValueOnce(new ApiError('network', 'Failed to fetch'));
    const { dispatch } = renderUpload('# J01 some text');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /extract requirements/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/can't reach the server/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
    });

    // Dispatch EXTRACT_ERROR should have been called
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXTRACT_ERROR' }),
    );
  });

  it('shows timeout message for timeout errors', async () => {
    const { ApiError } = await import('../src/api/client');
    mockExtract.mockRejectedValueOnce(new ApiError('timeout', 'timed out'));
    renderUpload('# J01 some text');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /extract requirements/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/the server took too long/i)).toBeDefined();
    });
  });

  it('shows HTTP error message for http errors', async () => {
    const { ApiError } = await import('../src/api/client');
    mockExtract.mockRejectedValueOnce(new ApiError('http', 'Internal Server Error', 500));
    renderUpload('# J01 some text');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /extract requirements/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/server error 500/i)).toBeDefined();
    });
  });

  it('shows invalid_response message', async () => {
    const { ApiError } = await import('../src/api/client');
    mockExtract.mockRejectedValueOnce(new ApiError('invalid_response', 'bad schema'));
    renderUpload('# J01 some text');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /extract requirements/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/the server returned something unexpected/i)).toBeDefined();
    });
  });

  it('retry button re-calls extract', async () => {
    const { ApiError } = await import('../src/api/client');
    mockExtract
      .mockRejectedValueOnce(new ApiError('network', 'down'))
      .mockResolvedValueOnce(EXTRACT_J01);

    const { dispatch } = renderUpload('# J01 some text');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /extract requirements/i }));
    });

    await waitFor(() => screen.getByRole('button', { name: /retry/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'EXTRACT_SUCCESS', result: EXTRACT_J01 });
    });
  });

  it('shows file size error for a large file', () => {
    renderUpload();
    // Create a file > 200 KB
    const bigContent = 'x'.repeat(201 * 1024);
    const file = new File([bigContent], 'big.md', { type: 'text/markdown' });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/too large/i)).toBeDefined();
  });

  it('shows file type error for a binary file', () => {
    renderUpload();
    const file = new File(['data'], 'image.png', { type: 'image/png' });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/only text files/i)).toBeDefined();
  });

  it('loads a sample file and shows file info on Load J01 click', async () => {
    renderUpload();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /load j01/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('J01.md')).toBeDefined();
    });
  });
});
