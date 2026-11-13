/**
 * Human-readable explanations for every reason_code that appears in the
 * fixtures and evaluation data.
 *
 * Template tokens:
 *   {shop}  — the shop's value (tolerance, process, material …)
 *   {job}   — the job's required value
 *
 * Unknown codes fall back to the raw code string so nothing is hidden.
 */

export interface ReasonTemplate {
  /** Short label suitable for a badge / tag. */
  label: string;
  /**
   * Full explanation. Call explain() to substitute {shop} and {job} tokens.
   */
  template: string;
}

const REASONS: Record<string, ReasonTemplate> = {
  tolerance_too_loose: {
    label: 'Tolerance too loose',
    template:
      'Tightest tolerance (±{shop} mm) is looser than the ±{job} mm required',
  },
  misses_deadline: {
    label: 'Misses deadline',
    template:
      'Estimated receiving completion ({shop}) is after the {job} deadline',
  },
  insufficient_capacity: {
    label: 'Insufficient capacity',
    template:
      'Shop capacity ({shop} parts/slot) is below the {job} pieces needed',
  },
  process_mismatch: {
    label: 'Process mismatch',
    template:
      'Shop process ({shop}) does not match the required process ({job})',
  },
  material_unavailable: {
    label: 'Material unavailable',
    template: 'Shop does not stock {job}',
  },
  cmm_report_unavailable: {
    label: 'No CMM report',
    template:
      'Job requires a CMM report but this shop ({shop}) cannot provide one',
  },
};

/**
 * Returns the template for a reason code, or a fallback for unknown codes.
 */
export function getReasonTemplate(code: string): ReasonTemplate {
  return (
    REASONS[code] ?? {
      label: code,
      template: code,
    }
  );
}

/**
 * Substitutes {shop} and {job} tokens into a template string.
 */
export function explain(
  code: string,
  tokens: { shop?: string | number; job?: string | number } = {},
): string {
  const tpl = getReasonTemplate(code).template;
  return tpl
    .replace('{shop}', tokens.shop !== undefined ? String(tokens.shop) : '{shop}')
    .replace('{job}', tokens.job !== undefined ? String(tokens.job) : '{job}');
}

/**
 * Short label for a badge/tag. Unknown codes return the raw code.
 */
export function reasonLabel(code: string): string {
  return getReasonTemplate(code).label;
}
