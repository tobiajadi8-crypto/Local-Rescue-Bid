import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractResponse, Issue, Requirements, ToleranceSourceValue } from '../api/schemas';
import type { SessionAction } from '../state/session';
import { matchSuppliers, ApiError } from '../api/client';
import type { ApiErrorKind } from '../api/client';
import { etLocalToIso, formatET, formatETDate } from '../time';

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function kindMessage(kind: ApiErrorKind, serverMsg: string, status?: number): string {
  switch (kind) {
    case 'network':
      return "Can't reach the server. Check your connection and try again.";
    case 'timeout':
      return 'The server took too long to respond. Try again.';
    case 'http':
      return `Server error ${status ?? ''}: ${serverMsg}`.trim();
    case 'invalid_response':
      return 'The server returned something unexpected.';
  }
}

// ---------------------------------------------------------------------------
// Local form state shape (all fields as strings for editing)
// ---------------------------------------------------------------------------

interface LocalField<T> {
  value: T;
  edited: boolean;
}

interface LocalRequirements {
  process: LocalField<string>;
  material: LocalField<string>;
  remaining_quantity: LocalField<string>; // string while editing
  tolerance_half_width_mm: LocalField<string>; // string while editing, '' = null
  due_date: LocalField<string>; // 'YYYY-MM-DD' in ET
  due_time: LocalField<string>; // 'HH:mm' in ET
  receiving_inspection_minutes: LocalField<string>;
  cmm_report_required: LocalField<boolean>;
}

type FieldKey = keyof LocalRequirements;

// Pull ET date/time strings out of an ISO offset string
function isoToEtParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Detroit',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function extractionToLocal(ext: ExtractResponse): LocalRequirements {
  const { date, time } = isoToEtParts(ext.due_at);
  return {
    process: { value: ext.process, edited: false },
    material: { value: ext.material, edited: false },
    remaining_quantity: { value: String(ext.remaining_quantity), edited: false },
    tolerance_half_width_mm: {
      value: ext.tolerance_half_width_mm !== null ? String(ext.tolerance_half_width_mm) : '',
      edited: false,
    },
    due_date: { value: date, edited: false },
    due_time: { value: time, edited: false },
    receiving_inspection_minutes: { value: String(ext.receiving_inspection_minutes), edited: false },
    cmm_report_required: { value: ext.cmm_report_required, edited: false },
  };
}

// ---------------------------------------------------------------------------
// Validation — returns null if valid, an error string if not
// ---------------------------------------------------------------------------

function validateLocal(fields: LocalRequirements): Partial<Record<FieldKey, string>> {
  const errs: Partial<Record<FieldKey, string>> = {};

  if (!fields.process.value.trim()) errs.process = 'Required';
  if (!fields.material.value.trim()) errs.material = 'Required';

  const qty = Number(fields.remaining_quantity.value);
  if (!fields.remaining_quantity.value.trim() || !Number.isInteger(qty) || qty <= 0)
    errs.remaining_quantity = 'Must be a positive whole number';

  const tol = fields.tolerance_half_width_mm.value;
  if (tol === '' || tol === null) {
    errs.tolerance_half_width_mm = 'Required — enter a value or choose one below';
  } else {
    const n = Number(tol);
    if (isNaN(n) || n <= 0) errs.tolerance_half_width_mm = 'Must be greater than 0';
  }

  if (!fields.due_date.value) errs.due_date = 'Required';
  else {
    const d = new Date(fields.due_date.value);
    if (isNaN(d.getTime())) errs.due_date = 'Invalid date';
  }
  if (!fields.due_time.value || !/^\d{2}:\d{2}$/.test(fields.due_time.value))
    errs.due_time = 'Enter time as HH:MM';

  const insp = Number(fields.receiving_inspection_minutes.value);
  if (!fields.receiving_inspection_minutes.value.trim() || !Number.isInteger(insp) || insp < 0)
    errs.receiving_inspection_minutes = 'Must be 0 or a positive whole number';

  return errs;
}

// Build a confirmed Requirements from local fields (call only when valid)
function localToRequirements(fields: LocalRequirements): Requirements {
  return {
    process: fields.process.value.trim(),
    material: fields.material.value.trim(),
    remaining_quantity: Number(fields.remaining_quantity.value),
    tolerance_half_width_mm: Number(fields.tolerance_half_width_mm.value),
    due_at: etLocalToIso(fields.due_date.value, fields.due_time.value),
    receiving_inspection_minutes: Number(fields.receiving_inspection_minutes.value),
    cmm_report_required: fields.cmm_report_required.value,
  };
}

// ---------------------------------------------------------------------------
// Helpers for issue/conflict detection
// ---------------------------------------------------------------------------

function getIssue(issues: Issue[], field: string): Issue | undefined {
  return issues.find((i) => i.field === field);
}

// Map tolerance_source_values to a list of conflict option strings
function conflictOptions(tsvs: ToleranceSourceValue[]): Array<{ value: number; label: string; quote: string }> {
  return tsvs.map((tsv) => ({
    value: tsv.unit === 'mm' ? tsv.half_width : tsv.half_width * 25.4,
    label: `±${tsv.unit === 'mm' ? tsv.half_width : (tsv.half_width * 25.4).toFixed(4)} mm`,
    quote: tsv.source,
  }));
}

// ---------------------------------------------------------------------------
// Source quote block
// ---------------------------------------------------------------------------

interface SourceQuoteProps {
  quote: string | undefined;
  field: string;
  extraction: ExtractResponse;
}

function SourceQuote({ quote, field, extraction }: SourceQuoteProps) {
  // remaining_quantity special case: show arithmetic
  if (field === 'remaining_quantity') {
    const q = quote ?? (extraction.sources?.['remaining_quantity'] as string | undefined);
    const match = q ? /(\d+)[^0-9]+(\d+)/.exec(q) : null;
    const a = match ? Number(match[1]) : null;
    const b = match ? Number(match[2]) : null;
    return (
      <blockquote className="source-quote">
        <span className="source-quote__label">From the packet</span>
        {q ? (
          <>
            {q}
            {a !== null && b !== null && (
              <div className="source-quote__arithmetic">
                {a} ordered − {b} accepted = {a - b} remaining
              </div>
            )}
          </>
        ) : (
          <span className="source-quote__none">No quote found</span>
        )}
      </blockquote>
    );
  }

  if (!quote) {
    return (
      <blockquote className="source-quote">
        <span className="source-quote__label">From the packet</span>
        <span className="source-quote__none">No quote found</span>
      </blockquote>
    );
  }

  return (
    <blockquote className="source-quote">
      <span className="source-quote__label">From the packet</span>
      {quote}
    </blockquote>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  extraction: ExtractResponse;
  packetText: string;
  loading: boolean;
  overrides: Record<string, unknown>;
  dispatch: React.Dispatch<SessionAction>;
}

// ---------------------------------------------------------------------------
// ReviewScreen
// ---------------------------------------------------------------------------

export function ReviewScreen({ extraction, loading, overrides, dispatch }: Props) {
  const [fields, setFields] = useState<LocalRequirements>(() => extractionToLocal(extraction));
  const [validationErrors, setValidationErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [matchError, setMatchError] = useState<{ msg: string } | null>(null);
  const firstErrorRef = useRef<HTMLElement | null>(null);

  // Track which fields still have unresolved issues from extraction
  const [unresolvedIssues, setUnresolvedIssues] = useState<Set<string>>(
    () => new Set(extraction.issues.map((i) => i.field)),
  );

  // -------------------------------------------------------------------------
  // Field update helpers
  // -------------------------------------------------------------------------

  function updateField<K extends FieldKey>(
    key: K,
    value: LocalRequirements[K]['value'],
  ) {
    setFields((prev) => ({
      ...prev,
      [key]: { value, edited: true },
    }));
    // Clear the unresolved issue for this field
    setUnresolvedIssues((prev) => {
      const next = new Set(prev);
      // Map due_date/due_time → due_at field name
      const issueField = key === 'due_date' || key === 'due_time' ? 'due_at' : key;
      next.delete(issueField);
      next.delete(key as string);
      return next;
    });
    // Clear validation error
    setValidationErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    setFields(extractionToLocal(extraction));
    setUnresolvedIssues(new Set(extraction.issues.map((i) => i.field)));
    setValidationErrors({});
    setMatchError(null);
  }, [extraction]);

  // -------------------------------------------------------------------------
  // Confirm + match
  // -------------------------------------------------------------------------

  const fieldsWithUnresolved = unresolvedIssues.size > 0;
  const errs = validateLocal(fields);
  const hasValidationErrors = Object.keys(errs).some((k) => errs[k as FieldKey]);
  const confirmDisabled = loading || fieldsWithUnresolved || hasValidationErrors;

  async function handleConfirm() {
    const errs2 = validateLocal(fields);
    if (Object.keys(errs2).some((k) => errs2[k as FieldKey])) {
      setValidationErrors(errs2);
      // Focus first errored field
      requestAnimationFrame(() => {
        const el = firstErrorRef.current;
        if (el) el.focus();
      });
      return;
    }

    const requirements = localToRequirements(fields);
    dispatch({ type: 'CONFIRM_REQUIREMENTS', requirements });
    dispatch({ type: 'MATCH_START' });
    setMatchError(null);

    try {
      const result = await matchSuppliers(requirements, overrides as Parameters<typeof matchSuppliers>[1]);
      dispatch({ type: 'MATCH_SUCCESS', result });
    } catch (err) {
      const isApiErr = err instanceof ApiError;
      const kind: ApiErrorKind = isApiErr ? err.kind : 'network';
      const technical = err instanceof Error ? err.message : String(err);
      const msg = kindMessage(kind, technical, isApiErr ? err.status : undefined);
      if (!isApiErr) console.error('[match]', err);
      else console.error('[match]', kind, technical);
      dispatch({ type: 'MATCH_ERROR', message: msg });
      setMatchError({ msg });
    }
  }

  // -------------------------------------------------------------------------
  // Summary bar
  // -------------------------------------------------------------------------

  const attentionCount = unresolvedIssues.size + Object.values(errs).filter(Boolean).length;

  // -------------------------------------------------------------------------
  // Field-level issue helpers
  // -------------------------------------------------------------------------

  const sources = extraction.sources as Record<string, string> | undefined;
  const tsvConflicts = conflictOptions(extraction.tolerance_source_values);

  function fieldIssue(apiField: string): Issue | undefined {
    return getIssue(extraction.issues, apiField);
  }

  function isBadField(apiField: string): boolean {
    return unresolvedIssues.has(apiField);
  }

  // Set firstErrorRef to the first field that needs attention
  const firstErrorFieldRef = useCallback((el: HTMLElement | null) => {
    if (el && !firstErrorRef.current) firstErrorRef.current = el;
  }, []);
  // Reset between renders
  useEffect(() => { firstErrorRef.current = null; }, [fields, unresolvedIssues]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderBadges(apiField: string, fieldKey: FieldKey) {
    const issue = fieldIssue(apiField);
    const isUnresolved = isBadField(apiField);
    const isEdited = fields[fieldKey].edited;
    return (
      <div className="field__badges">
        {isUnresolved && issue?.reason === 'missing' && (
          <span className="badge badge--danger">Missing</span>
        )}
        {isUnresolved && issue?.reason === 'conflicting' && (
          <span className="badge badge--warning">Conflicting</span>
        )}
        {isEdited && !isUnresolved && (
          <span className="badge badge--info">Edited by you</span>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------

  return (
    <div className="review-screen">
      <div className="review-screen__back">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 'upload' })}
          disabled={loading}
        >
          ← Back to upload
        </button>
      </div>

      <h2 className="review-screen__title">Review extracted requirements</h2>

      <div className="review-screen__reset">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={handleReset}
          disabled={loading}
        >
          Reset to extracted values
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Process                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label" htmlFor="field-process">
          Process
          {renderBadges('process', 'process')}
        </label>
        <input
          id="field-process"
          className={`field__input${isBadField('process') ? ' field__input--error' : ''}`}
          type="text"
          value={fields.process.value}
          placeholder={isBadField('process') ? 'Enter the manufacturing process' : ''}
          onChange={(e) => updateField('process', e.target.value)}
          disabled={loading}
          ref={isBadField('process') ? firstErrorFieldRef : undefined}
          aria-invalid={isBadField('process')}
          aria-describedby={validationErrors.process ? 'err-process' : undefined}
        />
        {validationErrors.process && (
          <span id="err-process" className="field__error">{validationErrors.process}</span>
        )}
        <SourceQuote quote={sources?.['process']} field="process" extraction={extraction} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Material                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label" htmlFor="field-material">
          Material
          {renderBadges('material', 'material')}
        </label>
        <input
          id="field-material"
          className={`field__input${isBadField('material') ? ' field__input--error' : ''}`}
          type="text"
          value={fields.material.value}
          placeholder={isBadField('material') ? 'Enter the material' : ''}
          onChange={(e) => updateField('material', e.target.value)}
          disabled={loading}
          ref={isBadField('material') ? firstErrorFieldRef : undefined}
          aria-invalid={isBadField('material')}
          aria-describedby={validationErrors.material ? 'err-material' : undefined}
        />
        {validationErrors.material && (
          <span id="err-material" className="field__error">{validationErrors.material}</span>
        )}
        <SourceQuote quote={sources?.['material']} field="material" extraction={extraction} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Remaining quantity                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label" htmlFor="field-qty">
          Remaining quantity
          <span className="field__unit">parts</span>
          {renderBadges('remaining_quantity', 'remaining_quantity')}
        </label>
        <input
          id="field-qty"
          className={`field__input${isBadField('remaining_quantity') ? ' field__input--error' : ''}`}
          type="number"
          min={1}
          step={1}
          value={fields.remaining_quantity.value}
          placeholder={isBadField('remaining_quantity') ? 'Enter quantity' : ''}
          onChange={(e) => updateField('remaining_quantity', e.target.value)}
          disabled={loading}
          ref={isBadField('remaining_quantity') ? firstErrorFieldRef : undefined}
          aria-invalid={isBadField('remaining_quantity')}
          aria-describedby={validationErrors.remaining_quantity ? 'err-qty' : undefined}
        />
        {validationErrors.remaining_quantity && (
          <span id="err-qty" className="field__error">{validationErrors.remaining_quantity}</span>
        )}
        <SourceQuote quote={sources?.['remaining_quantity']} field="remaining_quantity" extraction={extraction} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tolerance                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label" htmlFor="field-tol">
          Tolerance (bilateral half-width)
          <span className="field__unit">mm</span>
          {renderBadges('tolerance_half_width_mm', 'tolerance_half_width_mm')}
        </label>

        {/* Conflict options — show when conflicting and unresolved */}
        {fieldIssue('tolerance_half_width_mm')?.reason === 'conflicting' &&
          isBadField('tolerance_half_width_mm') &&
          tsvConflicts.length > 0 && (
            <div className="conflict-options" role="group" aria-label="Choose a tolerance value">
              {tsvConflicts.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="conflict-option"
                  onClick={() => updateField('tolerance_half_width_mm', String(opt.value))}
                  disabled={loading}
                >
                  <span className="conflict-option__value">{opt.label}</span>
                  <span className="conflict-option__quote">"{opt.quote}"</span>
                  <span className="btn btn--secondary" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                    Use this value
                  </span>
                </button>
              ))}
            </div>
          )}

        <div className="field__input-wrap">
          <span className="field__input-prefix">±</span>
          <input
            id="field-tol"
            className={`field__input${isBadField('tolerance_half_width_mm') ? ' field__input--error' : ''}`}
            type="number"
            min={0.001}
            step={0.005}
            value={fields.tolerance_half_width_mm.value}
            placeholder={isBadField('tolerance_half_width_mm') ? 'Enter value in mm' : ''}
            onChange={(e) => updateField('tolerance_half_width_mm', e.target.value)}
            disabled={loading}
            ref={isBadField('tolerance_half_width_mm') ? firstErrorFieldRef : undefined}
            aria-invalid={isBadField('tolerance_half_width_mm')}
            aria-describedby={validationErrors.tolerance_half_width_mm ? 'err-tol' : undefined}
          />
        </div>
        {validationErrors.tolerance_half_width_mm && (
          <span id="err-tol" className="field__error">{validationErrors.tolerance_half_width_mm}</span>
        )}
        {/* Show all tolerance source quotes */}
        {extraction.tolerance_source_values.map((tsv, i) => (
          <blockquote key={i} className="source-quote">
            <span className="source-quote__label">From the packet — {tsv.source}</span>
            ±{tsv.half_width} {tsv.unit}
          </blockquote>
        ))}
        {extraction.tolerance_source_values.length === 0 && (
          <SourceQuote quote={undefined} field="tolerance_half_width_mm" extraction={extraction} />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Due at                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label">
          Deadline (ET)
          {renderBadges('due_at', 'due_date')}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label htmlFor="field-due-date" className="visually-hidden">Date</label>
            <input
              id="field-due-date"
              className={`field__input${isBadField('due_at') ? ' field__input--error' : ''}`}
              type="date"
              value={fields.due_date.value}
              onChange={(e) => updateField('due_date', e.target.value)}
              disabled={loading}
              aria-invalid={isBadField('due_at')}
              aria-describedby={validationErrors.due_date ? 'err-duedate' : undefined}
            />
            {validationErrors.due_date && (
              <span id="err-duedate" className="field__error">{validationErrors.due_date}</span>
            )}
          </div>
          <div style={{ flex: '1', minWidth: '100px' }}>
            <label htmlFor="field-due-time" className="visually-hidden">Time (HH:MM)</label>
            <input
              id="field-due-time"
              className={`field__input${isBadField('due_at') ? ' field__input--error' : ''}`}
              type="time"
              value={fields.due_time.value}
              onChange={(e) => updateField('due_time', e.target.value)}
              disabled={loading}
              aria-invalid={isBadField('due_at')}
              aria-describedby={validationErrors.due_time ? 'err-duetime' : undefined}
            />
            {validationErrors.due_time && (
              <span id="err-duetime" className="field__error">{validationErrors.due_time}</span>
            )}
          </div>
        </div>
        {/* Show formatted preview when valid */}
        {fields.due_date.value && fields.due_time.value && (
          <p className="field__help">
            {(() => {
              try {
                const iso = etLocalToIso(fields.due_date.value, fields.due_time.value);
                return `${formatETDate(iso)} at ${formatET(iso)}`;
              } catch {
                return null;
              }
            })()}
          </p>
        )}
        <SourceQuote quote={sources?.['due_at']} field="due_at" extraction={extraction} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Receiving inspection minutes                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label" htmlFor="field-insp">
          Receiving inspection time
          <span className="field__unit">minutes</span>
          {renderBadges('receiving_inspection_minutes', 'receiving_inspection_minutes')}
        </label>
        <input
          id="field-insp"
          className={`field__input${isBadField('receiving_inspection_minutes') ? ' field__input--error' : ''}`}
          type="number"
          min={0}
          step={1}
          value={fields.receiving_inspection_minutes.value}
          onChange={(e) => updateField('receiving_inspection_minutes', e.target.value)}
          disabled={loading}
          ref={isBadField('receiving_inspection_minutes') ? firstErrorFieldRef : undefined}
          aria-invalid={isBadField('receiving_inspection_minutes')}
          aria-describedby={validationErrors.receiving_inspection_minutes ? 'err-insp' : undefined}
        />
        {validationErrors.receiving_inspection_minutes && (
          <span id="err-insp" className="field__error">{validationErrors.receiving_inspection_minutes}</span>
        )}
        <SourceQuote quote={sources?.['receiving_inspection_minutes']} field="receiving_inspection_minutes" extraction={extraction} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CMM report required                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="field">
        <label className="field__label" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <input
            id="field-cmm"
            type="checkbox"
            checked={fields.cmm_report_required.value}
            onChange={(e) => updateField('cmm_report_required', e.target.checked)}
            disabled={loading}
            style={{ width: 'auto', accentColor: 'var(--color-accent)' }}
          />
          <span>CMM report required</span>
          {renderBadges('cmm_report_required', 'cmm_report_required')}
        </label>
        <SourceQuote quote={sources?.['cmm_report_required']} field="cmm_report_required" extraction={extraction} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Match error                                                         */}
      {/* ------------------------------------------------------------------ */}
      {matchError && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <span className="error-banner__message">{matchError.msg}</span>
          <div className="error-banner__actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleConfirm}
              disabled={loading}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Sticky summary bar                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="review-summary-bar" role="status" aria-live="polite">
        <span
          className={`review-summary-bar__status${attentionCount === 0 ? ' review-summary-bar__status--ok' : ''}`}
        >
          {attentionCount === 0
            ? '✓ All fields confirmed'
            : `${attentionCount} field${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} attention`}
        </span>
        <div className="review-summary-bar__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => dispatch({ type: 'GO_TO_STEP', step: 'upload' })}
            disabled={loading}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            aria-busy={loading}
            aria-label={
              loading
                ? 'Finding suppliers…'
                : confirmDisabled
                  ? `Confirm and find suppliers (${attentionCount} field${attentionCount !== 1 ? 's' : ''} need attention)`
                  : 'Confirm and find suppliers'
            }
          >
            {loading ? 'Finding suppliers…' : 'Confirm and find suppliers'}
          </button>
        </div>
      </div>
    </div>
  );
}
