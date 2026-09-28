import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingState from '../LoadingState';

describe('LoadingState', () => {
  it('announces a default loading label as a polite status', () => {
    render(<LoadingState />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading…');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('accepts a custom label', () => {
    render(<LoadingState label="Loading campaign…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign…');
  });

  it('merges caller-provided classes', () => {
    render(<LoadingState className="max-w-2xl mx-auto" />);
    expect(screen.getByRole('status')).toHaveClass('max-w-2xl', 'mx-auto');
  });
});
