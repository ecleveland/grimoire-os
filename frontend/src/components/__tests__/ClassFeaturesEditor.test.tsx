import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassFeaturesEditor, { MAX_FEATURE_LEVEL } from '../ClassFeaturesEditor';
import type { ClassFeature } from '@/lib/types';

const f = (over: Partial<ClassFeature> = {}): ClassFeature => ({
  name: 'Rage',
  level: 1,
  description: 'Primal ferocity.',
  ...over,
});

describe('ClassFeaturesEditor', () => {
  describe('empty state', () => {
    it('says the class has no features yet, and offers only the add button', () => {
      render(<ClassFeaturesEditor value={[]} onChange={vi.fn()} />);

      expect(screen.getByText(/no features yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add feature/i })).toBeInTheDocument();
      expect(screen.queryByLabelText('Feature name')).toBeNull();
    });

    it('drops the empty-state copy once a row exists', () => {
      render(<ClassFeaturesEditor value={[f()]} onChange={vi.fn()} />);

      expect(screen.queryByText(/no features yet/i)).toBeNull();
    });
  });

  describe('add, edit, remove', () => {
    it('appends a blank row at level 1', async () => {
      const onChange = vi.fn();
      render(<ClassFeaturesEditor value={[]} onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: /add feature/i }));

      expect(onChange).toHaveBeenCalledWith([{ name: '', level: 1, description: '' }]);
    });

    it('prefills every field from the value', () => {
      render(<ClassFeaturesEditor value={[f()]} onChange={vi.fn()} />);

      expect((screen.getByLabelText('Feature name') as HTMLInputElement).value).toBe('Rage');
      expect((screen.getByLabelText('Feature level') as HTMLInputElement).value).toBe('1');
      expect((screen.getByLabelText('Feature description') as HTMLTextAreaElement).value).toBe(
        'Primal ferocity.'
      );
    });

    it('edits one field without disturbing its siblings', () => {
      const onChange = vi.fn();
      const rows = [f({ name: 'A' }), f({ name: 'B' }), f({ name: 'C' })];
      render(<ClassFeaturesEditor value={rows} onChange={onChange} />);

      fireEvent.change(screen.getAllByLabelText('Feature description')[1], {
        target: { value: 'Rewritten.' },
      });

      expect(onChange).toHaveBeenCalledWith([
        rows[0],
        f({ name: 'B', description: 'Rewritten.' }),
        rows[2],
      ]);
    });

    it('removes the targeted row', async () => {
      const onChange = vi.fn();
      render(
        <ClassFeaturesEditor
          value={[f({ name: 'Rage' }), f({ name: 'Reckless Attack' })]}
          onChange={onChange}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Remove feature 1' }));

      expect(onChange).toHaveBeenCalledWith([f({ name: 'Reckless Attack' })]);
    });
  });

  describe('reordering', () => {
    it('swaps a row with the one above it', async () => {
      const onChange = vi.fn();
      const rows = [f({ name: 'A' }), f({ name: 'B' }), f({ name: 'C' })];
      render(<ClassFeaturesEditor value={rows} onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: 'Move feature 2 up' }));

      expect(onChange).toHaveBeenCalledWith([rows[1], rows[0], rows[2]]);
    });

    it('swaps a row with the one below it', async () => {
      const onChange = vi.fn();
      const rows = [f({ name: 'A' }), f({ name: 'B' }), f({ name: 'C' })];
      render(<ClassFeaturesEditor value={rows} onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: 'Move feature 2 down' }));

      expect(onChange).toHaveBeenCalledWith([rows[0], rows[2], rows[1]]);
    });

    // Disabled rather than absent, so the row's controls stay in the same
    // columns down the whole list instead of shifting on the first and last.
    it('disables the moves that would run off either end', () => {
      const rows = [f({ name: 'A' }), f({ name: 'B' })];
      render(<ClassFeaturesEditor value={rows} onChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Move feature 1 up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move feature 1 down' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Move feature 2 up' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Move feature 2 down' })).toBeDisabled();
    });

    it('disables both directions on a lone row', () => {
      render(<ClassFeaturesEditor value={[f()]} onChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Move feature 1 up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move feature 1 down' })).toBeDisabled();
    });
  });

  describe('level bounds', () => {
    it('clamps a level above the maximum back to it', () => {
      const onChange = vi.fn();
      render(<ClassFeaturesEditor value={[f()]} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Feature level'), { target: { value: '99' } });

      expect(onChange).toHaveBeenCalledWith([f({ level: MAX_FEATURE_LEVEL })]);
    });

    it('clamps a level below 1 up to 1', () => {
      const onChange = vi.fn();
      render(<ClassFeaturesEditor value={[f({ level: 5 })]} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Feature level'), { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith([f({ level: 1 })]);
    });

    it('truncates a fractional level — the column is an Int', () => {
      const onChange = vi.fn();
      render(<ClassFeaturesEditor value={[f()]} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Feature level'), { target: { value: '3.7' } });

      expect(onChange).toHaveBeenCalledWith([f({ level: 3 })]);
    });

    // Clearing the box mid-edit is normal; falling back to the old value would
    // fight the keystroke, and writing NaN would fail validation at submit.
    it('falls back to 1 when the box is cleared', () => {
      const onChange = vi.fn();
      render(<ClassFeaturesEditor value={[f({ level: 7 })]} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Feature level'), { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith([f({ level: 1 })]);
    });

    it('advertises the bounds to the browser as well as enforcing them', () => {
      render(<ClassFeaturesEditor value={[f()]} onChange={vi.fn()} />);

      const input = screen.getByLabelText('Feature level');
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', String(MAX_FEATURE_LEVEL));
    });
  });

  // The API rejects a repeated (name, level) pair with a 400, because the
  // class_features unique index refuses it. Surfacing it here means the author
  // sees it while typing rather than on submit.
  describe('duplicate detection', () => {
    it('flags both rows sharing a name at the same level', () => {
      render(
        <ClassFeaturesEditor
          value={[f({ name: 'Extra Attack', level: 5 }), f({ name: 'Extra Attack', level: 5 })]}
          onChange={vi.fn()}
        />
      );

      expect(screen.getAllByText(/already used at this level/i)).toHaveLength(2);
    });

    // The whole point of widening the key (VEG-507): a recurring feature name is
    // how real classes are written, so this must NOT be flagged.
    it('leaves one name recurring at different levels alone', () => {
      render(
        <ClassFeaturesEditor
          value={[
            f({ name: 'Ability Score Improvement', level: 4 }),
            f({ name: 'Ability Score Improvement', level: 8 }),
            f({ name: 'Ability Score Improvement', level: 12 }),
          ]}
          onChange={vi.fn()}
        />
      );

      expect(screen.queryByText(/already used at this level/i)).toBeNull();
    });

    // Case-sensitive, matching the btree index and the DTO's @ArrayUnique. A
    // warning the server would not act on is worse than none.
    it('treats names differing only by case as distinct, as the server does', () => {
      render(
        <ClassFeaturesEditor
          value={[f({ name: 'Rage', level: 1 }), f({ name: 'rage', level: 1 })]}
          onChange={vi.fn()}
        />
      );

      expect(screen.queryByText(/already used at this level/i)).toBeNull();
    });

    it('ignores blank names, which are a half-typed row and not a collision', () => {
      render(
        <ClassFeaturesEditor
          value={[f({ name: '', level: 1 }), f({ name: '', level: 1 })]}
          onChange={vi.fn()}
        />
      );

      expect(screen.queryByText(/already used at this level/i)).toBeNull();
    });

    it('clears the flag once the level is changed apart', () => {
      const rows = [f({ name: 'Extra Attack', level: 5 }), f({ name: 'Extra Attack', level: 5 })];
      const { rerender } = render(<ClassFeaturesEditor value={rows} onChange={vi.fn()} />);
      expect(screen.getAllByText(/already used at this level/i)).toHaveLength(2);

      rerender(
        <ClassFeaturesEditor
          value={[rows[0], f({ name: 'Extra Attack', level: 11 })]}
          onChange={vi.fn()}
        />
      );

      expect(screen.queryByText(/already used at this level/i)).toBeNull();
    });
  });
});
