import { useReducer } from 'react';
import { sessionReducer, initialState } from './state/session';
import type { Step } from './state/session';
import { UploadScreen } from './components/UploadScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { ResultsScreen } from './components/ResultsScreen';
import './styles.css';

const BUILD_VERSION = (import.meta.env.VITE_BUILD_VERSION as string | undefined) ?? 'dev';
const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === 'true';

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
  { id: 'results', label: 'Suppliers' },
];

function stepIndex(step: Step): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const currentIndex = stepIndex(state.step);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-header__title">Local Rescue Bid</h1>
      </header>

      <nav className="stepper" aria-label="Progress">
        {STEPS.map((s, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          return (
            <div
              key={s.id}
              className={[
                'stepper__item',
                isDone ? 'stepper__item--done' : '',
                isActive ? 'stepper__item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="stepper__badge">{isDone ? '✓' : i + 1}</span>
              <span className="stepper__label">{s.label}</span>
            </div>
          );
        })}
      </nav>

      <main className="app-main">
        {state.step === 'upload' && (
          <UploadScreen
            packetText={state.packetText}
            loading={state.loading}
            dispatch={dispatch}
          />
        )}

        {state.step === 'review' && state.extraction !== null && (
          <ReviewScreen
            extraction={state.extraction}
            packetText={state.packetText}
            loading={state.loading}
            overrides={state.overrides}
            dispatch={dispatch}
          />
        )}

        {state.step === 'results' &&
          state.matchResult !== null &&
          state.confirmedRequirements !== null && (
            <ResultsScreen
              matchResult={state.matchResult}
              confirmedRequirements={state.confirmedRequirements}
              previousRanking={state.previousRanking}
              overrides={state.overrides}
              loading={state.loading}
              dispatch={dispatch}
            />
          )}
      </main>

      <footer className="app-footer">
        <span>{USE_FIXTURES ? '🔶 Fixtures' : '🟢 Live data'}</span>
        <span>v{BUILD_VERSION}</span>
      </footer>
    </div>
  );
}
