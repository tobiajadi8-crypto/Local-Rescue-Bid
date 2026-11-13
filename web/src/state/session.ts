import type { ExtractResponse, MatchResponse, Overrides, Requirements } from '../api/schemas';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type Step = 'upload' | 'review' | 'results';

export interface SessionState {
  step: Step;
  packetText: string;
  extraction: ExtractResponse | null;
  confirmedRequirements: Requirements | null;
  matchResult: MatchResponse | null;
  /** Ranked shop ids from the previous match, used to detect rank changes. */
  previousRanking: string[];
  overrides: Overrides;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type SessionAction =
  | { type: 'SET_PACKET_TEXT'; text: string }
  | { type: 'EXTRACT_START' }
  | { type: 'EXTRACT_SUCCESS'; result: ExtractResponse }
  | { type: 'EXTRACT_ERROR'; message: string }
  | { type: 'CONFIRM_REQUIREMENTS'; requirements: Requirements }
  | { type: 'MATCH_START' }
  | { type: 'MATCH_SUCCESS'; result: MatchResponse }
  | { type: 'MATCH_ERROR'; message: string }
  | { type: 'SET_OVERRIDE'; shopId: string; override: Overrides[string] }
  | { type: 'CLEAR_OVERRIDE'; shopId: string }
  | { type: 'CLEAR_ALL_OVERRIDES' }
  | { type: 'GO_TO_STEP'; step: Step }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialState: SessionState = {
  step: 'upload',
  packetText: '',
  extraction: null,
  confirmedRequirements: null,
  matchResult: null,
  previousRanking: [],
  overrides: {},
  loading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_PACKET_TEXT':
      return { ...state, packetText: action.text };

    case 'EXTRACT_START':
      return { ...state, loading: true, error: null };

    case 'EXTRACT_SUCCESS':
      return {
        ...state,
        loading: false,
        extraction: action.result,
        step: 'review',
      };

    case 'EXTRACT_ERROR':
      return { ...state, loading: false, error: action.message };

    case 'CONFIRM_REQUIREMENTS':
      return {
        ...state,
        confirmedRequirements: action.requirements,
      };

    case 'MATCH_START':
      return { ...state, loading: true, error: null };

    case 'MATCH_SUCCESS':
      return {
        ...state,
        loading: false,
        matchResult: action.result,
        previousRanking: state.matchResult?.ranked_eligible_shop_ids ?? [],
        step: 'results',
      };

    case 'MATCH_ERROR':
      return { ...state, loading: false, error: action.message };

    case 'SET_OVERRIDE':
      return {
        ...state,
        overrides: { ...state.overrides, [action.shopId]: action.override },
      };

    case 'CLEAR_OVERRIDE': {
      const { [action.shopId]: _, ...rest } = state.overrides;
      return { ...state, overrides: rest };
    }

    case 'CLEAR_ALL_OVERRIDES':
      return { ...state, overrides: {} };

    case 'GO_TO_STEP':
      return { ...state, step: action.step };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
