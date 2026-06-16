'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/query';
import type { Character } from '@/lib/types';
import {
  characterFormPayload,
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import { STEPS, type WizardStepId } from './steps';
import WizardProgress from './_components/WizardProgress';

export default function GuidedCharacterPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<CharacterFormValues>(() => emptyCharacterFormValues());
  const [rawStepIndex, setRawStepIndex] = useState(0);
  // Validity reported by steps whose answer depends on more than the draft
  // (e.g. the Class step's SRD-derived skill-count rule). Overrides isValid.
  const [reported, setReported] = useState<Partial<Record<WizardStepId, boolean>>>({});

  const onChange = useCallback(
    (patch: Partial<CharacterFormValues>) => setDraft(prev => ({ ...prev, ...patch })),
    []
  );

  // Steps can drop out for a given draft (e.g. the Spells step for a non-caster),
  // so the visible list — and thus indices — are derived from the draft.
  const visibleSteps = useMemo(() => STEPS.filter(s => s.isVisible?.(draft) ?? true), [draft]);
  // Clamp the stored index: a step disappearing can shrink the list under us.
  const stepIndex = Math.min(rawStepIndex, visibleSteps.length - 1);

  const isComplete = useCallback(
    (step: (typeof STEPS)[number]) => reported[step.id] ?? step.isValid(draft),
    [reported, draft]
  );

  const completed = useMemo(() => visibleSteps.map(isComplete), [visibleSteps, isComplete]);
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

  const goNext = () => {
    if (canAdvance && !isLast) setRawStepIndex(stepIndex + 1);
  };
  const goBack = () => {
    if (!isFirst) setRawStepIndex(stepIndex - 1);
  };
  const StepBody = step.Component;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Guided character build</h1>
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
        completed={completed}
        canJumpTo={canJumpTo}
        onJump={index => {
          if (canJumpTo(index)) setRawStepIndex(index);
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
  );
}
