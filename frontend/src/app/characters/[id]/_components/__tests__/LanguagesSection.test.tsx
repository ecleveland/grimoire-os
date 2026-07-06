import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LanguagesSection from '../LanguagesSection';
import { makeCharacter } from '@/test-utils/character';

const baseCharacter = makeCharacter({
  languages: ['Common', 'Dwarvish', 'Undercommon'],
});

describe('LanguagesSection', () => {
  it('renders the Languages header', () => {
    render(<LanguagesSection character={baseCharacter} />);
    expect(screen.getByText('Languages')).toBeInTheDocument();
  });

  it('renders all languages as tag chips', () => {
    render(<LanguagesSection character={baseCharacter} />);
    expect(screen.getByText('Common')).toBeInTheDocument();
    expect(screen.getByText('Dwarvish')).toBeInTheDocument();
    expect(screen.getByText('Undercommon')).toBeInTheDocument();
  });

  it('renders chips with correct styling', () => {
    render(<LanguagesSection character={baseCharacter} />);
    const chip = screen.getByText('Common');
    expect(chip.className).toContain('bg-gray-100');
    expect(chip.className).toContain('rounded');
  });

  it('renders nothing when languages array is empty', () => {
    const char = { ...baseCharacter, languages: [] };
    const { container } = render(<LanguagesSection character={char} />);
    expect(container.innerHTML).toBe('');
  });
});
