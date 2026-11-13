/**
 * Time utilities — all formatting uses Intl.DateTimeFormat only (no date-fns,
 * no dayjs, no moment). All ET formatting targets America/Detroit, which
 * switches between EST (−05:00) and EDT (−04:00) automatically.
 */

const TZ = 'America/Detroit';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Formats an ISO datetime string as a 12-hour time in ET.
 * @example formatET('2026-11-20T10:15:00-05:00') → '10:15 AM ET'
 */
export function formatET(iso: string): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TZ,
  }).format(d);
  return `${time} ET`;
}

/**
 * Formats an ISO datetime string as a short weekday + date in ET.
 * @example formatETDate('2026-11-20T10:15:00-05:00') → 'Fri Nov 20'
 */
export function formatETDate(iso: string): string {
  const d = new Date(iso);
  const raw = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: TZ,
  }).format(d);
  // Some Intl implementations produce "Fri, Nov 20"; normalise to "Fri Nov 20".
  return raw.replace(/,/g, '');
}

/**
 * Returns the absolute difference in whole minutes between two ISO strings.
 */
export function minutesBetween(a: string, b: string): number {
  return Math.abs(Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

/**
 * Formats a minute count as a human-readable duration.
 * @example formatDuration(105) → '1 h 45 min'
 * @example formatDuration(30)  → '30 min'
 * @example formatDuration(60)  → '1 h'
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// ---------------------------------------------------------------------------
// ET → ISO conversion
// ---------------------------------------------------------------------------

/**
 * Converts a date string (YYYY-MM-DD) and a local ET wall-clock time (HH:mm)
 * to a full ISO-8601 string with the correct America/Detroit UTC offset for
 * that date (accounting for DST).
 *
 * Strategy: use Intl.DateTimeFormat to discover the UTC offset that Detroit
 * uses on the given date, then construct the ISO string.
 *
 * @example etLocalToIso('2026-11-20', '11:45') → '2026-11-20T11:45:00-05:00'
 * @example etLocalToIso('2026-07-04', '12:00') → '2026-07-04T12:00:00-04:00'
 */
export function etLocalToIso(dateIso: string, time: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  // Build a UTC Date that approximates the local Detroit wall-clock time by
  // first trying UTC, then correcting for the offset on that date.
  // We iterate at most twice because one correction is always sufficient.
  let probe = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getDetroitOffsetMinutes(new Date(probe));
    // offsetMinutes is negative for UTC−N (e.g. −300 for EST)
    probe = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60_000;
  }

  const offsetMinutes = getDetroitOffsetMinutes(new Date(probe));
  const sign = offsetMinutes <= 0 ? '-' : '+';
  const absH = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const absM = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${dateIso}T${hh}:${mm}:00${sign}${absH}:${absM}`;
}

/**
 * Returns the UTC offset for America/Detroit at the given Date instant,
 * in minutes (negative means behind UTC, e.g. −300 for EST).
 */
function getDetroitOffsetMinutes(date: Date): number {
  // Intl gives us the wall-clock parts in Detroit time.
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).formatToParts(date);

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Handle midnight hour "24" that some engines emit
  const h = get('hour') % 24;
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return Math.round((localMs - date.getTime()) / 60_000);
}
