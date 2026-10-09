import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadError from '../LoadError';

describe('LoadError', () => {
  it('announces the message as an alert', () => {
    render(<LoadError message="Failed to load spells" onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load spells');
  });

  it('falls back to a generic message', () => {
    render(<LoadError onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load.');
  });

  it('calls onRetry with no arguments when Retry is clicked', async () => {
    const onRetry = vi.fn();
    render(<LoadError message="Failed to load spells" onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith();
  });
});
