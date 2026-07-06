import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConcentrationChip from '../ConcentrationChip';

describe('ConcentrationChip', () => {
  it('renders the spell name when present', () => {
    render(<ConcentrationChip concentration={{ spell: 'Bless' }} />);
    expect(screen.getByText('Concentrating: Bless')).toBeInTheDocument();
  });

  it('renders the bare label when the spell is unnamed', () => {
    render(<ConcentrationChip concentration={{}} />);
    expect(screen.getByText('Concentrating')).toBeInTheDocument();
  });

  it('carries the Concentration title for hover/locator use', () => {
    render(<ConcentrationChip concentration={{ spell: 'Bless' }} />);
    expect(screen.getByTitle('Concentration')).toBeInTheDocument();
  });
});
