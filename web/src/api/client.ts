import {
  ExtractRequestSchema,
  ExtractResponseSchema,
  MatchRequestSchema,
  MatchResponseSchema,
  OutcomeSchema,
  type ExtractResponse,
  type MatchResponse,
  type Overrides,
  type Requirements,
} from './schemas';
import type { ZodTypeAny } from 'zod';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === 'true';
const TIMEOUT_MS = 15_000;
const FIXTURE_DELAY_MS = 400;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid_response';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises supplier_outcomes to a Record<shopId, Outcome>.
 * The API returns an object keyed by shop_id; the brief mentions an array
 * fallback — this handles both.
 */
export function normalizeOutcomes(
  raw: unknown,
): Record<string, import('./schemas').Outcome> {
  if (Array.isArray(raw)) {
    const result: Record<string, import('./schemas').Outcome> = {};
    for (const item of raw) {
      const parsed = OutcomeSchema.safeParse(item);
      if (parsed.success && typeof item === 'object' && item !== null && 'shop_id' in item) {
        result[String((item as Record<string, unknown>)['shop_id'])] = parsed.data;
      }
    }
    return result;
  }
  if (raw !== null && typeof raw === 'object') {
    const result: Record<string, import('./schemas').Outcome> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const parsed = OutcomeSchema.safeParse(value);
      if (parsed.success) result[key] = parsed.data;
    }
    return result;
  }
  return {};
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('timeout', `Request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new ApiError('network', err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(id);
  }
}

async function postJson<T>(path: string, body: unknown, schema: ZodTypeAny): Promise<T> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('network', String(err));
  }

  if (!response.ok) {
    throw new ApiError('http', `HTTP ${response.status}: ${response.statusText}`, response.status);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('invalid_response', 'Response body was not valid JSON');
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(
      'invalid_response',
      `Response did not match expected shape: ${result.error.message}`,
    );
  }
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extracts J01, J04, J08 … from free text. */
function detectJobId(packetText: string): string | null {
  const match = packetText.match(/\b(J\d{2})\b/);
  return match ? match[1] : null;
}

async function loadFixtureJson(path: string): Promise<unknown> {
  // Dynamic import so Vite can resolve the @fixtures alias at build time.
  const mod = await import(/* @vite-ignore */ `@fixtures/${path}`);
  return (mod as { default: unknown }).default;
}

async function extractFixture(packetText: string): Promise<ExtractResponse> {
  await delay(FIXTURE_DELAY_MS);
  const jobId = detectJobId(packetText);
  const fixtureId =
    jobId === 'J01'
      ? 'extract-j01.json'
      : jobId === 'J04'
        ? 'extract-j04.json'
        : jobId === 'J08'
          ? 'extract-j08.json'
          : null;

  if (!fixtureId) {
    throw new ApiError(
      'invalid_response',
      `No extract fixture for job id "${jobId ?? '(none found in text)'}"`,
    );
  }

  const raw = await loadFixtureJson(fixtureId);
  const result = ExtractResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new ApiError('invalid_response', `Fixture ${fixtureId} failed schema validation`);
  }
  return result.data;
}

/**
 * Determines which match fixture to serve based on the overrides passed in.
 *
 * Rules (applied top-to-bottom):
 *  1. S02 lot_ready_at >= 11:45 AND S08 max_parts_in_slot < 180 → no-match
 *  2. S02 lot_ready_at >= 11:45                                  → s02-delayed
 *  3. No overrides (or none of the above)                        → base match
 *  4. Any other override key/value                               → base match + fixtureNotice
 */
async function matchFixture(overrides?: Overrides): Promise<MatchResponse> {
  await delay(FIXTURE_DELAY_MS);

  const s02 = overrides?.['S02'];
  const s08 = overrides?.['S08'];

  const s02Delayed =
    s02?.lot_ready_at != null &&
    s02.lot_ready_at >= '2026-11-20T11:45:00-05:00';

  const s08Capped =
    s08?.max_parts_in_slot != null && s08.max_parts_in_slot < 180;

  let fixtureName: string;
  if (s02Delayed && s08Capped) {
    fixtureName = 'match-j01-no-match.json';
  } else if (s02Delayed) {
    fixtureName = 'match-j01-s02-delayed.json';
  } else {
    fixtureName = 'match-j01.json';
  }

  const raw = await loadFixtureJson(fixtureName);
  const result = MatchResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new ApiError('invalid_response', `Fixture ${fixtureName} failed schema validation`);
  }

  const data = result.data;

  // Check for overrides that the fixtures can't simulate
  const knownKeys = new Set(['S02', 'S08']);
  const unknownKeys = Object.keys(overrides ?? {}).filter((k) => !knownKeys.has(k));
  const unknownS02Fields = s02 ? Object.keys(s02).filter((f) => f !== 'lot_ready_at') : [];
  const unknownS08Fields = s08 ? Object.keys(s08).filter((f) => f !== 'max_parts_in_slot') : [];

  const unsimulated = [...unknownKeys, ...unknownS02Fields, ...unknownS08Fields];
  if (unsimulated.length > 0) {
    return {
      ...data,
      fixtureNotice: `Fixtures cannot simulate override(s): ${unsimulated.join(', ')}. Showing base match-j01.json result.`,
    };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractPacket(packetText: string): Promise<ExtractResponse> {
  if (USE_FIXTURES) return extractFixture(packetText);

  const reqBody = ExtractRequestSchema.parse({ packet_text: packetText });
  return postJson<ExtractResponse>('/api/extract', reqBody, ExtractResponseSchema);
}

export async function matchSuppliers(
  requirements: Requirements,
  overrides?: Overrides,
): Promise<MatchResponse> {
  if (USE_FIXTURES) return matchFixture(overrides);

  const reqBody = MatchRequestSchema.parse({ requirements, overrides });
  return postJson<MatchResponse>('/api/match', reqBody, MatchResponseSchema);
}
