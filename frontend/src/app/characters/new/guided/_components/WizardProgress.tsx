import type { WizardStepDef } from '../steps';

interface WizardProgressProps {
  steps: WizardStepDef[];
  currentIndex: number;
  /** Whether each step is currently complete (its `isValid` against the draft). */
  completed: boolean[];
  /** Whether the user may jump directly to a given step index. */
  canJumpTo: (index: number) => boolean;
  onJump: (index: number) => void;
}

/**
 * Horizontal step indicator. The current step is highlighted; completed steps get
 * a check; reachable steps are clickable to jump (back freely, forward only once
 * the intervening required steps are satisfied — enforced by `canJumpTo`).
 */
export default function WizardProgress({
  steps,
  currentIndex,
  completed,
  canJumpTo,
  onJump,
}: WizardProgressProps) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = completed[index];
          const reachable = canJumpTo(index);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onJump(index)}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isCurrent
                    ? 'bg-indigo-600 text-white'
                    : isComplete
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                  reachable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-60',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                    isCurrent ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10',
                  ].join(' ')}
                >
                  {isComplete && !isCurrent ? '✓' : index + 1}
                </span>
                {step.title}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
