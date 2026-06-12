import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import LinkMonsterDialog from '@/components/LinkMonsterDialog';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const goblin: SrdMonster = {
  id: 'monster-1',
  name: 'Goblin',
  size: 'Small',
  type: 'Humanoid',
  alignment: 'Neutral Evil',
  armorClass: 15,
  hitPoints: 7,
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 0.25,
  actions: [],
  source: 'SRD 5.2.1',
};

function makeResponse(
  monsters: SrdMonster[],
  total = monsters.length
): PaginatedResponse<SrdMonster> {
  return { data: monsters, total, page: 1, lastPage: 1 };
}

const onSelect = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  mockApiFetch.mockReset();
  vi.mocked(toast.error).mockReset();
  onSelect.mockReset();
  onCancel.mockReset();
});

function renderDialog(props: Partial<React.ComponentProps<typeof LinkMonsterDialog>> = {}) {
  return render(
    <LinkMonsterDialog combatantName="Trap" onSelect={onSelect} onCancel={onCancel} {...props} />
  );
}

describe('LinkMonsterDialog', () => {
  it('prompts for a search and names the combatant being linked', () => {
    renderDialog();
    expect(screen.getByText('Trap')).toBeInTheDocument();
    expect(screen.getByText(/to a monster stat block/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/search monsters/i)).toBeInTheDocument();
    expect(screen.getByText(/type to search/i)).toBeInTheDocument();
  });

  it('searches and renders compact results with CR', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([goblin]));
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/search monsters/i), 'gob');
    expect(await screen.findByTestId('link-result')).toHaveTextContent('Goblin');
    expect(screen.getByTestId('link-result')).toHaveTextContent('CR 1/4');
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/srd/monsters?q=gob'));
  });

  it('emits the picked monster via onSelect', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([goblin]));
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/search monsters/i), 'gob');
    await user.click(await screen.findByTestId('link-result'));
    expect(onSelect).toHaveBeenCalledWith(goblin);
  });

  it('shows the empty state when nothing matches', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/search monsters/i), 'zzz');
    expect(await screen.findByText(/no monsters found/i)).toBeInTheDocument();
  });

  it('toasts when the search fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/search monsters/i), 'gob');
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('disables result rows while the parent is persisting', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([goblin]));
    const user = userEvent.setup();
    renderDialog({ submitting: true });
    await user.type(screen.getByLabelText(/search monsters/i), 'gob');
    expect(await screen.findByTestId('link-result')).toBeDisabled();
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
