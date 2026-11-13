import { describe, it, expect } from 'vitest';
import {
  formatET,
  formatETDate,
  minutesBetween,
  formatDuration,
  etLocalToIso,
} from '../src/time';

describe('formatET', () => {
  it('formats 10:15 AM ET', () => {
    expect(formatET('2026-11-20T10:15:00-05:00')).toBe('10:15 AM ET');
  });

  it('formats 12:00 PM (noon) ET', () => {
    expect(formatET('2026-11-20T12:00:00-05:00')).toBe('12:00 PM ET');
  });

  it('formats 9:00 AM ET', () => {
    expect(formatET('2026-11-20T09:00:00-05:00')).toBe('9:00 AM ET');
  });

  it('formats 11:45 AM ET', () => {
    expect(formatET('2026-11-20T11:45:00-05:00')).toBe('11:45 AM ET');
  });
});

describe('formatETDate', () => {
  it('formats Fri Nov 20', () => {
    expect(formatETDate('2026-11-20T10:15:00-05:00')).toBe('Fri Nov 20');
  });
});

describe('minutesBetween', () => {
  it('returns 60 for one hour apart', () => {
    expect(minutesBetween('2026-11-20T09:00:00-05:00', '2026-11-20T10:00:00-05:00')).toBe(60);
  });

  it('is symmetric', () => {
    expect(minutesBetween('2026-11-20T10:00:00-05:00', '2026-11-20T09:00:00-05:00')).toBe(60);
  });

  it('returns 45 for 45 minutes', () => {
    expect(minutesBetween('2026-11-20T09:00:00-05:00', '2026-11-20T09:45:00-05:00')).toBe(45);
  });
});

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(30)).toBe('30 min');
  });

  it('formats hours only', () => {
    expect(formatDuration(60)).toBe('1 h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(105)).toBe('1 h 45 min');
  });

  it('formats 0 as 0 min', () => {
    expect(formatDuration(0)).toBe('0 min');
  });
});

describe('etLocalToIso', () => {
  it('11:45 AM ET on 2026-11-20 → EST offset -05:00', () => {
    expect(etLocalToIso('2026-11-20', '11:45')).toBe('2026-11-20T11:45:00-05:00');
  });

  it('12:00 on 2026-11-20 → -05:00', () => {
    expect(etLocalToIso('2026-11-20', '12:00')).toBe('2026-11-20T12:00:00-05:00');
  });

  it('summer date uses EDT offset -04:00', () => {
    expect(etLocalToIso('2026-07-04', '12:00')).toBe('2026-07-04T12:00:00-04:00');
  });

  it('09:15 on 2026-11-20 → -05:00', () => {
    expect(etLocalToIso('2026-11-20', '09:15')).toBe('2026-11-20T09:15:00-05:00');
  });
});
