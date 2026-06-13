import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton from '../Skeleton';

describe('Skeleton', () => {
  it('renders a pulsing placeholder', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('animate-pulse');
  });

  it('merges caller-provided sizing classes (so it can reserve real footprints)', () => {
    render(<Skeleton className="h-9 w-36" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveClass('h-9', 'w-36');
  });

  it('is hidden from the accessibility tree (decorative)', () => {
    render(<Skeleton />);
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
  });
});
