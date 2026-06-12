import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddPartyDialog from '@/components/AddPartyDialog';
import type { PartyCharacter } from '@/lib/types';

function makeCharacter(over: Partial<PartyCharacter> = {}): PartyCharacter {
  return {
    id: 'char-1',
    userId: 'user-2',
    name: 'Thia',
    race: 'Elf',
    class: 'Wizard',
    level: 5,
    armorClass: 12,
    initiative: 2,
    hitPoints: { max: 22, current: 17, temporary: 0 },
    ...over,
  };
}

const onConfirm = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onConfirm.mockReset();
  onCancel.mockReset();
});

function renderDialog(props: Partial<React.ComponentProps<typeof AddPartyDialog>> = {}) {
  return render(
    <AddPartyDialog
      characters={[makeCharacter()]}
      existingNames={[]}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
}

describe('AddPartyDialog', () => {
  it('renders a row per character with the sheet snapshot summary', () => {
    renderDialog({
      characters: [
        makeCharacter(),
        makeCharacter({ id: 'char-2', name: 'Mort', class: 'Rogue', level: 3 }),
      ],
    });
    expect(screen.getByText('Thia')).toBeInTheDocument();
    expect(screen.getByText('Mort')).toBeInTheDocument();
    expect(screen.getByText(/elf wizard 5/i)).toBeInTheDocument();
    expect(screen.getAllByText(/AC 12 · HP 17\/22/)).toHaveLength(2);
  });

  it('shows an empty state when the campaign has no characters', () => {
    renderDialog({ characters: [] });
    expect(screen.getByText(/no characters .* campaign/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add selected/i })).not.toBeInTheDocument();
  });

  it('selects every character by default, except ones already in the encounter', () => {
    renderDialog({
      characters: [makeCharacter(), makeCharacter({ id: 'char-2', name: 'Mort' })],
      existingNames: ['Mort'],
    });
    expect(screen.getByRole('checkbox', { name: /add thia/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /add mort/i })).not.toBeChecked();
  });

  it('disables confirm when nothing is selected', async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole('button', { name: /add selected/i });
    expect(confirm).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: /add thia/i }));
    expect(confirm).toBeDisabled();
  });

  it('emits the selected characters with parsed initiatives on confirm', async () => {
    const user = userEvent.setup();
    const thia = makeCharacter();
    const mort = makeCharacter({ id: 'char-2', name: 'Mort' });
    renderDialog({ characters: [thia, mort] });

    const mortInit = screen.getByRole('spinbutton', { name: /initiative for mort/i });
    await user.clear(mortInit);
    await user.type(mortInit, '17');
    await user.click(screen.getByRole('checkbox', { name: /add thia/i })); // deselect Thia
    await user.click(screen.getByRole('button', { name: /add selected/i }));

    expect(onConfirm).toHaveBeenCalledWith([{ character: mort, initiative: 17 }]);
  });

  it('rolls d20 + the sheet initiative modifier into the row input', async () => {
    const user = userEvent.setup();
    // rng 0.999 -> d20 face 20; Thia's sheet modifier is +2.
    renderDialog({ rng: () => 0.999 });
    await user.click(screen.getByRole('button', { name: /roll initiative for thia/i }));
    expect(
      (screen.getByRole('spinbutton', { name: /initiative for thia/i }) as HTMLInputElement).value
    ).toBe('22');
  });

  it('"Roll all" rolls every row at once', async () => {
    const user = userEvent.setup();
    renderDialog({
      characters: [makeCharacter(), makeCharacter({ id: 'char-2', name: 'Mort', initiative: 0 })],
      rng: () => 0, // d20 face 1
    });
    await user.click(screen.getByRole('button', { name: /roll all/i }));
    expect(
      (screen.getByRole('spinbutton', { name: /initiative for thia/i }) as HTMLInputElement).value
    ).toBe('3');
    expect(
      (screen.getByRole('spinbutton', { name: /initiative for mort/i }) as HTMLInputElement).value
    ).toBe('1');
  });

  it('treats a null sheet initiative modifier as +0 for rolls', async () => {
    const user = userEvent.setup();
    renderDialog({ characters: [makeCharacter({ initiative: null })], rng: () => 0.999 });
    await user.click(screen.getByRole('button', { name: /roll initiative for thia/i }));
    expect(
      (screen.getByRole('spinbutton', { name: /initiative for thia/i }) as HTMLInputElement).value
    ).toBe('20');
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables confirm while the parent is submitting', () => {
    renderDialog({ submitting: true });
    expect(screen.getByRole('button', { name: /add selected/i })).toBeDisabled();
  });
});
