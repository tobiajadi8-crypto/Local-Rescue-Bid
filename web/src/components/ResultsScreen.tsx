import { useState, useCallback } from 'react';
import type { MatchResponse, Requirements, Overrides } from '../api/schemas';
import type { SessionAction } from '../state/session';
import { shopById } from '../shops';
import { explain, reasonLabel } from '../reasons';
import { formatET, formatETDate, minutesBetween, etLocalToIso } from '../time';
import { matchSuppliers } from '../api/client';
import { buildRfqFromState } from '../rfq';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  matchResult: MatchResponse;
  confirmedRequirements: Requirements;
  previousRanking: string[];
  overrides: Overrides;
  loading: boolean;
  dispatch: React.Dispatch<SessionAction>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable explanation string for a reason code, filling in
 * the shop-specific and job-specific values wherever possible.
 */
function buildExplanation(
  code: string,
  shopId: string,
  requirements: Requirements,
): string {
  const shop = shopById[shopId];
  if (!shop) return reasonLabel(code);

  switch (code) {
    case 'tolerance_too_loose':
      return explain(code, {
        shop: shop.tightestToleranceMm,
        job: requirements.tolerance_half_width_mm ?? '?',
      });
    case 'insufficient_capacity':
      return explain(code, {
        shop: shop.capacity,
        job: requirements.remaining_quantity,
      });
    case 'process_mismatch':
      return explain(code, {
        shop: shop.process,
        job: requirements.process,
      });
    case 'material_unavailable':
      return explain(code, { job: requirements.material });
    case 'misses_deadline':
      return explain(code, {
        shop: '(see time above)',
        job: formatET(requirements.due_at),
      });
    case 'cmm_report_unavailable':
      return explain(code, { shop: shop.displayName });
    default:
      return explain(code);
  }
}

/**
 * True when a shop that is NOT recommended arrives earlier than the
 * recommended shop — i.e. it is physically closer but was ranked lower
 * for another reason (e.g. the delayed-S02 scenario where S08 is earlier).
 */
function isCloserThanRecommended(
  shopId: string,
  recommendedId: string | null,
  outcomes: MatchResponse['supplier_outcomes'],
): boolean {
  if (!recommendedId || shopId === recommendedId) return false;
  const thisTime = outcomes[shopId]?.estimated_receiving_complete_at;
  const recTime = outcomes[recommendedId]?.estimated_receiving_complete_at;
  if (!thisTime || !recTime) return false;
  return new Date(thisTime) < new Date(recTime);
}

/** Returns the previous numeric rank (1-based) of a shop, or null if not ranked. */
function previousRank(shopId: string, prevRanking: string[]): number | null {
  const idx = prevRanking.indexOf(shopId);
  return idx >= 0 ? idx + 1 : null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Tolerance comparison badge: shows shop value vs required value */
function TolCompare({
  shopTol,
  reqTol,
  eligible,
}: {
  shopTol: number;
  reqTol: number;
  eligible: boolean;
}) {
  const cls = `tol-compare${eligible ? ' tol-compare--ok' : ' tol-compare--fail'}`;
  return (
    <span className={cls}>
      <span className="tol-compare__shop">±{shopTol} mm</span>
      <span className="tol-compare__arrow" aria-hidden>→</span>
      <span className="tol-compare__req">required ±{reqTol} mm</span>
    </span>
  );
}

/** One reason bullet inside the ineligibility list */
function ReasonItem({
  code,
  shopId,
  requirements,
}: {
  code: string;
  shopId: string;
  requirements: Requirements;
}) {
  return (
    <li className="reason-item" role="listitem">
      <span className="reason-item__bullet" aria-hidden>●</span>
      <span className="reason-item__text">
        <strong>{reasonLabel(code)}:</strong>{' '}
        {buildExplanation(code, shopId, requirements)}
      </span>
    </li>
  );
}

/**
 * Override panel rendered at the bottom of each eligible supplier card.
 * Lets the dispatcher adjust lot_ready_at to 11:45 AM ET on the job date.
 */
function OverridePanel({
  shopId,
  overrides,
  dispatch,
}: {
  shopId: string;
  overrides: Overrides;
  dispatch: React.Dispatch<SessionAction>;
}) {
  const shop = shopById[shopId];
  if (!shop) return null;

  const override = overrides[shopId];
  const effectiveLotReadyAt = override?.lot_ready_at ?? shop.baselineLotReadyAt;
  const isChanged = override?.lot_ready_at != null;

  // Extract the date part from the baseline for use in etLocalToIso
  const dateIso = shop.baselineLotReadyAt.slice(0, 10);
  const TARGET_TIME = '11:45';
  const targetIso = etLocalToIso(dateIso, TARGET_TIME);

  function handleSet() {
    dispatch({
      type: 'SET_OVERRIDE',
      shopId,
      override: { ...override, lot_ready_at: targetIso },
    });
  }

  function handleReset() {
    if (override?.lot_ready_at != null) {
      // Remove lot_ready_at; keep other override fields if any
      const { lot_ready_at: _removed, ...rest } = override;
      const hasOther = Object.keys(rest).length > 0;
      if (hasOther) {
        dispatch({ type: 'SET_OVERRIDE', shopId, override: rest });
      } else {
        dispatch({ type: 'CLEAR_OVERRIDE', shopId });
      }
    }
  }

  return (
    <div className="override-panel" data-testid={`override-panel-${shopId}`}>
      <p className="override-panel__heading">Override — lot ready time</p>
      <div className="override-panel__row">
        <span className="override-panel__label">Pickup time</span>
        <span
          className={`override-panel__value${isChanged ? ' override-panel__value--changed' : ''}`}
          data-testid={`override-value-${shopId}`}
        >
          {formatET(effectiveLotReadyAt)}
        </span>
        {isChanged && (
          <span className="override-panel__changed-badge" aria-label="changed">
            changed
          </span>
        )}
        <div className="override-panel__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleSet}
            disabled={effectiveLotReadyAt === targetIso}
            aria-label={`Set ${shop.displayName} pickup to 11:45 AM ET`}
          >
            Set 11:45 AM ET
          </button>
          {isChanged && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleReset}
              aria-label={`Reset ${shop.displayName} pickup time`}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full card for a single supplier */
function SupplierCard({
  shopId,
  rank,
  matchResult,
  requirements,
  previousRanking,
  overrides,
  dispatch,
}: {
  shopId: string;
  rank: number | null; // null = ineligible
  matchResult: MatchResponse;
  requirements: Requirements;
  previousRanking: string[];
  overrides: Overrides;
  dispatch: React.Dispatch<SessionAction>;
}) {
  const outcome = matchResult.supplier_outcomes[shopId];
  const shop = shopById[shopId];
  const isRecommended = shopId === matchResult.recommended_shop_id;
  const eligible = outcome?.eligible ?? false;

  const receivingAt = outcome?.estimated_receiving_complete_at ?? '';
  const deadlineAt = requirements.due_at;
  const isLate = receivingAt ? new Date(receivingAt) > new Date(deadlineAt) : false;
  const minBeforeDeadline = receivingAt
    ? minutesBetween(receivingAt, deadlineAt)
    : 0;

  const closer = isCloserThanRecommended(
    shopId,
    matchResult.recommended_shop_id,
    matchResult.supplier_outcomes,
  );

  const prevRank = previousRank(shopId, previousRanking);
  const rankChanged =
    prevRank !== null && rank !== null && prevRank !== rank;
  const rankImproved = rankChanged && rank !== null && rank < (prevRank ?? Infinity);
  const rankWorsened = rankChanged && rank !== null && rank > (prevRank ?? 0);

  // Card modifier class
  const cardClass = [
    'supplier-card',
    isRecommended
      ? 'supplier-card--recommended'
      : eligible
        ? 'supplier-card--eligible'
        : 'supplier-card--ineligible',
  ].join(' ');

  return (
    <article className={cardClass} aria-label={`${shop?.displayName ?? shopId} — ${eligible ? 'eligible' : 'ineligible'}`}>
      {/* Header */}
      <div className="supplier-card__header">
        {/* Rank circle */}
        <div
          className="supplier-card__rank"
          aria-label={rank ? `Rank ${rank}` : 'Not ranked'}
        >
          {rank ?? '—'}
        </div>

        {/* Name + location */}
        <div className="supplier-card__name-block">
          <div className="supplier-card__name">
            {shop?.displayName ?? shopId}
            {isRecommended && (
              <span className="badge badge--success" role="status">
                Recommended
              </span>
            )}
            {closer && !isRecommended && eligible && (
              <span className="badge badge--info">
                Closer than recommended
              </span>
            )}
            {rankImproved && (
              <span className="badge badge--success" title={`Was #${prevRank}`}>
                ▲ Moved up
              </span>
            )}
            {rankWorsened && (
              <span className="badge badge--warning" title={`Was #${prevRank}`}>
                ▼ Moved down
              </span>
            )}
          </div>
          <div className="supplier-card__location">
            {shop ? `${shop.city}, ${shop.state}` : shopId}
          </div>
        </div>

        {/* Receiving time */}
        {receivingAt && (
          <div
            className={`supplier-card__time${isLate ? ' supplier-card__time--late' : eligible ? ' supplier-card__time--ok' : ''}`}
            aria-label={`Receiving complete at ${formatET(receivingAt)}`}
          >
            {isLate ? '⚠ ' : ''}
            {formatET(receivingAt)}
            <div style={{ fontWeight: 400, fontSize: 'var(--font-size-xs)', color: 'var(--color-muted)' }}>
              {isLate
                ? `${minutesBetween(deadlineAt, receivingAt)} min past deadline`
                : `${minBeforeDeadline} min before deadline`}
            </div>
          </div>
        )}
      </div>

      {/* Body: comparison details */}
      <div className="supplier-card__body">
        {/* Tolerance row — always shown; side-by-side when failing */}
        {shop && requirements.tolerance_half_width_mm !== null && (
          <div className="comparison-row">
            <span className="comparison-row__label">Tolerance</span>
            <span className={`comparison-row__shop${
              outcome?.reason_codes.includes('tolerance_too_loose')
                ? ' comparison-row__shop--fail'
                : ' comparison-row__shop--ok'
            }`}>
              <TolCompare
                shopTol={shop.tightestToleranceMm}
                reqTol={requirements.tolerance_half_width_mm}
                eligible={!outcome?.reason_codes.includes('tolerance_too_loose')}
              />
            </span>
            <span className="comparison-row__status">
              {outcome?.reason_codes.includes('tolerance_too_loose')
                ? `Too loose by ${(shop.tightestToleranceMm - requirements.tolerance_half_width_mm).toFixed(3)} mm`
                : 'Meets spec'}
            </span>
          </div>
        )}

        {/* Capacity row */}
        {shop && (
          <div className="comparison-row">
            <span className="comparison-row__label">Capacity</span>
            <span className={`comparison-row__shop${
              outcome?.reason_codes.includes('insufficient_capacity')
                ? ' comparison-row__shop--fail'
                : ' comparison-row__shop--ok'
            }`}>
              {shop.capacity} parts/slot
            </span>
            <span className="comparison-row__status">
              {outcome?.reason_codes.includes('insufficient_capacity')
                ? `Need ${requirements.remaining_quantity}`
                : `Need ${requirements.remaining_quantity} ✓`}
            </span>
          </div>
        )}

        {/* Deadline row */}
        {receivingAt && (
          <div className="comparison-row">
            <span className="comparison-row__label">Deadline</span>
            <span className={`comparison-row__shop${isLate ? ' comparison-row__shop--fail' : ' comparison-row__shop--ok'}`}>
              {formatETDate(receivingAt)} {formatET(receivingAt)}
            </span>
            <span className="comparison-row__status">
              Deadline: {formatETDate(deadlineAt)} {formatET(deadlineAt)}
            </span>
          </div>
        )}
      </div>

      {/* Ineligibility reasons */}
      {!eligible && outcome && outcome.reason_codes.length > 0 && (
        <ul className="reason-list" aria-label="Why ineligible">
          {outcome.reason_codes.map((code) => (
            <ReasonItem
              key={code}
              code={code}
              shopId={shopId}
              requirements={requirements}
            />
          ))}
        </ul>
      )}

      {/* Override panel — eligible shops only */}
      {eligible && (
        <OverridePanel
          shopId={shopId}
          overrides={overrides}
          dispatch={dispatch}
        />
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// RFQ block
// ---------------------------------------------------------------------------

function RfqBlock({
  requirements,
  recommendedShopId,
  overrides,
}: {
  requirements: Requirements;
  recommendedShopId: string;
  overrides: Overrides;
}) {
  const shop = shopById[recommendedShopId];
  const [copied, setCopied] = useState(false);

  const rfqText = shop
    ? buildRfqFromState(requirements, shop, overrides)
    : '';

  const handleCopy = useCallback(() => {
    if (!rfqText) return;
    void navigator.clipboard.writeText(rfqText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [rfqText]);

  if (!shop) return null;

  return (
    <section className="rfq-section" aria-label="Request for quote">
      <div className="rfq-section__header">
        <div>
          <p className="rfq-section__title">Request for Quote</p>
          <p className="rfq-section__subtitle">
            Copy and send to {shop.displayName}
          </p>
        </div>
        <div className="rfq-section__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleCopy}
            aria-label="Copy RFQ to clipboard"
          >
            Copy
          </button>
        </div>
      </div>
      <div className="rfq-body">
        <textarea
          className="rfq-text"
          readOnly
          value={rfqText}
          aria-label="RFQ text"
          data-testid="rfq-textarea"
        />
        <div
          className={`rfq-copy-toast${copied ? '' : ' rfq-copy-toast--hidden'}`}
          aria-live="polite"
        >
          Copied!
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ResultsScreen
// ---------------------------------------------------------------------------

export function ResultsScreen({
  matchResult,
  confirmedRequirements,
  previousRanking,
  overrides,
  loading,
  dispatch,
}: Props) {
  const { status, ranked_eligible_shop_ids, recommended_shop_id, supplier_outcomes } = matchResult;
  const [recalcError, setRecalcError] = useState<string | null>(null);

  // All shop ids, eligible first (in rank order), then ineligible
  const eligibleIds = ranked_eligible_shop_ids;
  const ineligibleIds = Object.keys(supplier_outcomes).filter(
    (id) => !supplier_outcomes[id].eligible,
  );

  const recommendedShop = recommended_shop_id ? shopById[recommended_shop_id] : null;
  const deadline = confirmedRequirements.due_at;

  const hasOverrides = Object.keys(overrides).length > 0;

  async function handleRecalculate() {
    setRecalcError(null);
    dispatch({ type: 'MATCH_START' });
    try {
      const result = await matchSuppliers(confirmedRequirements, overrides);
      dispatch({ type: 'MATCH_SUCCESS', result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'MATCH_ERROR', message: msg });
      setRecalcError(msg);
    }
  }

  return (
    <div className="results-screen">
      {/* Back nav */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 'review' })}
        >
          ← Back to review
        </button>
      </div>

      <div className="results-screen__header">
        <h2 className="results-screen__title">Supplier results</h2>
        <p className="results-screen__subtitle">
          Deadline: {formatETDate(deadline)} at {formatET(deadline)} ·{' '}
          {confirmedRequirements.remaining_quantity} parts ·{' '}
          ±{confirmedRequirements.tolerance_half_width_mm} mm tolerance
        </p>
      </div>

      {/* Fixture-derived notice */}
      {matchResult.fixtureNotice && (
        <p className="fixture-notice" role="note">
          ℹ {matchResult.fixtureNotice}
        </p>
      )}
      {matchResult._derived && (
        <p className="fixture-notice" role="note">
          ℹ This result is derived from the base fixture and has not been verified against the real API.
        </p>
      )}

      {/* Summary banner */}
      {status === 'matched' && recommendedShop && (
        <div className="results-banner results-banner--matched" role="status">
          <span className="results-banner__icon" aria-hidden>✅</span>
          <div className="results-banner__body">
            <p className="results-banner__heading">
              {recommendedShop.displayName} ({recommendedShop.city}) recommended
            </p>
            <p className="results-banner__detail">
              Receiving complete by{' '}
              {formatET(supplier_outcomes[recommended_shop_id!]?.estimated_receiving_complete_at ?? deadline)}{' '}
              — {minutesBetween(
                supplier_outcomes[recommended_shop_id!]?.estimated_receiving_complete_at ?? deadline,
                deadline,
              )} min before the deadline
            </p>
          </div>
        </div>
      )}

      {status === 'no_match' && (
        <div className="results-banner results-banner--no-match" role="status">
          <span className="results-banner__icon" aria-hidden>⚠️</span>
          <div className="results-banner__body">
            <p className="results-banner__heading">No eligible suppliers found</p>
            <p className="results-banner__detail">
              None of the {Object.keys(supplier_outcomes).length} shops can meet all requirements.
              Review the reasons below and consider adjusting requirements.
            </p>
          </div>
        </div>
      )}

      {/* Eligible suppliers */}
      {eligibleIds.length > 0 && (
        <>
          <p className="results-section-title">
            Eligible suppliers — {eligibleIds.length} found
          </p>
          <div className="supplier-list" role="list">
            {eligibleIds.map((id, idx) => (
              <SupplierCard
                key={id}
                shopId={id}
                rank={idx + 1}
                matchResult={matchResult}
                requirements={confirmedRequirements}
                previousRanking={previousRanking}
                overrides={overrides}
                dispatch={dispatch}
              />
            ))}
          </div>
        </>
      )}

      {/* Ineligible suppliers */}
      {ineligibleIds.length > 0 && (
        <>
          <p className="results-section-title">
            Ineligible suppliers — {ineligibleIds.length} shops could not meet requirements
          </p>
          <div className="supplier-list" role="list">
            {ineligibleIds.map((id) => (
              <SupplierCard
                key={id}
                shopId={id}
                rank={null}
                matchResult={matchResult}
                requirements={confirmedRequirements}
                previousRanking={previousRanking}
                overrides={overrides}
                dispatch={dispatch}
              />
            ))}
          </div>
        </>
      )}

      {/* Recalculate bar — shown when overrides are active */}
      {hasOverrides && (
        <div className="recalculate-bar" data-testid="recalculate-bar">
          <span className="recalculate-bar__label">
            {Object.keys(overrides).length} shop override{Object.keys(overrides).length !== 1 ? 's' : ''} active
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { void handleRecalculate(); }}
            disabled={loading}
            aria-label="Recalculate with overrides"
          >
            {loading ? 'Recalculating…' : 'Recalculate'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => dispatch({ type: 'CLEAR_ALL_OVERRIDES' })}
            aria-label="Clear all overrides"
          >
            Clear overrides
          </button>
        </div>
      )}

      {recalcError && (
        <p className="field-error" role="alert">
          Recalculate failed: {recalcError}
        </p>
      )}

      {/* RFQ block — shown when a shop is recommended */}
      {status === 'matched' && recommended_shop_id && (
        <RfqBlock
          requirements={confirmedRequirements}
          recommendedShopId={recommended_shop_id}
          overrides={overrides}
        />
      )}

      {/* Footer actions */}
      <div className="results-footer-bar">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 'review' })}
        >
          Adjust requirements
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'RESET' })}
        >
          Start over
        </button>
      </div>
    </div>
  );
}
