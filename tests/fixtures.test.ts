import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readJson(rel: string) {
  return JSON.parse(readFileSync(join(root, rel), 'utf-8'));
}

function readText(rel: string) {
  return readFileSync(join(root, rel), 'utf-8');
}

// Map fixture id → packet file path
const packetPaths: Record<string, string> = {
  'extract-j01': 'data/job_packets/demo/J01.md',
  'extract-j04': 'data/job_packets/demo/J04.md',
  'extract-j08': 'data/job_packets/holdout/J08.md',
};

describe('source quotes are exact substrings of their packet files', () => {
  for (const [id, packetPath] of Object.entries(packetPaths)) {
    const fixture = readJson(`fixtures/${id}.json`);
    const packetText = readText(packetPath);

    it(`${id}: each tolerance_source_values[].source is a substring of the packet`, () => {
      for (const entry of fixture.tolerance_source_values ?? []) {
        expect(
          packetText,
          `tolerance_source_values source "${entry.source}" not found in ${packetPath}`
        ).toContain(entry.source);
      }
    });

    // For extract-j08 also check the conflict quotes
    if (id === 'extract-j08') {
      it('extract-j08: both conflicting tolerance quotes are substrings of J08.md', () => {
        const conflicts: string[] = fixture.sources?.tolerance_half_width_mm_conflict ?? [];
        expect(conflicts.length, 'expected 2 conflicting quotes').toBe(2);
        for (const quote of conflicts) {
          expect(
            packetText,
            `conflicting quote "${quote}" not found in ${packetPath}`
          ).toContain(quote);
        }
      });
    }

    // For extract-j01, verify the remaining_quantity source citation
    if (id === 'extract-j01') {
      it('extract-j01: remaining_quantity source citation is a substring of J01.md', () => {
        const citation: string = fixture.sources?.remaining_quantity ?? '';
        expect(
          packetText,
          `remaining_quantity source "${citation}" not found in ${packetPath}`
        ).toContain(citation);
      });
    }
  }
});

describe('extract-j01 field values match demo_expected.json J01.requirements', () => {
  const fixture = readJson('fixtures/extract-j01.json');

  it('process is "CNC milling"', () => {
    expect(fixture.process).toBe('CNC milling');
  });

  it('material is "6061-T6 aluminum"', () => {
    expect(fixture.material).toBe('6061-T6 aluminum');
  });

  it('remaining_quantity is 180', () => {
    expect(fixture.remaining_quantity).toBe(180);
  });

  it('tolerance_half_width_mm is 0.05', () => {
    expect(fixture.tolerance_half_width_mm).toBe(0.05);
  });

  it('due_at is 2026-11-20T12:00:00-05:00', () => {
    expect(fixture.due_at).toBe('2026-11-20T12:00:00-05:00');
  });

  it('receiving_inspection_minutes is 30', () => {
    expect(fixture.receiving_inspection_minutes).toBe(30);
  });

  it('cmm_report_required is false', () => {
    expect(fixture.cmm_report_required).toBe(false);
  });
});
