'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/query';
import type { Character } from '@/lib/types';
import { characterFormPayload } from '@/components/CharacterEditorForm';
import { STEPS, type WizardStepId } from './steps';
import { DraftProvider, useCharacterDraft } from './useCharacterDraft';
import WizardProgress from './_components/WizardProgress';

export default function GuidedCharacterPage() {
  const router = useRouter();
  // The draft's skills/proficiencies/languages are compiled from a source-tagged
  // grant registry (VEG-393) so cross-step grants reconcile by source; the rest
  // of the draft is plain state written via `onChange`.
  const draftApi = useCharacterDraft();
  const { draft, onChange } = draftApi;
  const [rawStepIndex, setRawStepIndex] = useState(0);
  // Furthest step index the user has navigated to. Drives the progress display:
  // a step shows as completed only once it's both valid AND visited, so optional
  // steps that are valid-by-default (Abilities/Equipment/Spells) don't render a
  // check before the user reaches them.
  const [maxVisited, setMaxVisited] = useState(0);
  // Validity reported by steps whose answer depends on more than the draft
  // (e.g. the Class step's SRD-derived skill-count rule). Overrides isValid.
  const [reported, setReported] = useState<Partial<Record<WizardStepId, boolean>>>({});

  // Steps can drop out for a given draft (e.g. the Spells step for a non-caster),
  // so the visible list — and thus indices — are derived from the draft.
  const visibleSteps = useMemo(() => STEPS.filter(s => s.isVisible?.(draft) ?? true), [draft]);
  // Clamp the stored index: a step disappearing can shrink the list under us.
  const stepIndex = Math.min(rawStepIndex, visibleSteps.length - 1);

  // A step is complete when its draft-derived predicate holds AND it hasn't
  // reported itself incomplete. A reported value can only further restrict
  // (never loosen) the draft default, so a stale `true` can't mask a draft that
  // has since regressed.
  const isComplete = useCallback(
    (step: (typeof STEPS)[number]) => step.isValid(draft) && (reported[step.id] ?? true),
    [reported, draft]
  );

  const completed = useMemo(() => visibleSteps.map(isComplete), [visibleSteps, isComplete]);
  const completedAndVisited = useMemo(
    () => completed.map((done, i) => done && i <= maxVisited),
    [completed, maxVisited]
  );

  const requiredComplete = useMemo(
    () => visibleSteps.every((step, i) => step.optional || completed[i]),
    [visibleSteps, completed]
  );

  const step = visibleSteps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === visibleSteps.length - 1;
  const canAdvance = step.optional || completed[stepIndex];

  // Back is always allowed; forward jumps require every intervening required step
  // to be satisfied so the user can't skip past a gate via the progress bar.
  const canJumpTo = useCallback(
    (index: number) =>
      index <= stepIndex || visibleSteps.slice(0, index).every(s => s.optional || isComplete(s)),
    [stepIndex, visibleSteps, isComplete]
  );

  const reportValidity = useCallback(
    (valid: boolean) =>
      setReported(prev => (prev[step.id] === valid ? prev : { ...prev, [step.id]: valid })),
    [step.id]
  );

  const createMutation = useApiMutation<Character, void>(
    () =>
      apiFetch<Character>('/characters', {
        method: 'POST',
        body: JSON.stringify(characterFormPayload(draft)),
      }),
    {
      onSuccess: character => {
        toast.success('Character created!');
        router.push(`/characters/${character.id}`);
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to create character');
      },
    }
  );

  // Navigate to a step and remember the furthest one reached (max never
  // decreases, so stepping back keeps already-visited steps marked complete).
  const goToStep = (index: number) => {
    setRawStepIndex(index);
    setMaxVisited(m => Math.max(m, index));
  };
  const goNext = () => {
    if (canAdvance && !isLast) goToStep(stepIndex + 1);
  };
  const goBack = () => {
    if (!isFirst) goToStep(stepIndex - 1);
  };
  const StepBody = step.Component;

  return (
    <DraftProvider api={draftApi}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Guided character build
          </h1>
          <Link
            href="/characters/new"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Prefer the classic form?
          </Link>
        </div>

        <WizardProgress
          steps={visibleSteps}
          currentIndex={stepIndex}
          completed={completedAndVisited}
          canJumpTo={canJumpTo}
          onJump={index => {
            if (canJumpTo(index)) goToStep(index);
          }}
        />

        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <StepBody value={draft} onChange={onChange} onValidChange={reportValidity} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Back
          </button>

          <div className="flex items-center gap-3">
            {step.optional && !isLast && (
              <button
                type="button"
                onClick={goNext}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Skip
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canAdvance}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            )}
            {isLast && (
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!requiredComplete || createMutation.isPending}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createMutation.isPending ? 'Creating…' : 'Create character'}
              </button>
            )}
          </div>
        </div>
      </div>
    </DraftProvider>
  );
}
