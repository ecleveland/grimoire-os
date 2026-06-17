'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  rollD20,
  rollExpression,
  formatD20Result,
  formatExpressionResult,
  type RollMode,
} from '@/lib/dice';

/**
 * In-sheet dice rolls (VEG-349, slice 7). Rolls are ephemeral — they toast a
 * result and never mutate character state — so this just wraps the pure `dice`
 * helpers with a toast. Centralized so every roll site formats consistently.
 */
export function useDiceRoll() {
  const rollCheck = useCallback((label: string, modifier: number, mode: RollMode = 'normal') => {
    toast.message(formatD20Result(label, rollD20(modifier, mode)));
  }, []);

  const rollDamage = useCallback((label: string, expression: string) => {
    const result = rollExpression(expression);
    if (!result) return; // unparseable damage string — nothing to roll
    toast.message(formatExpressionResult(label, result));
  }, []);

  return { rollCheck, rollDamage };
}
