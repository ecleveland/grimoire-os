import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorPage from '../error';

describe('app/srd error boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the thrown message under the SRD scope label', () => {
    render(<ErrorPage error={new Error('Render failed')} reset={vi.fn()} />);
    expect(screen.getByText('Render failed')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /this SRD page hit an error/i })
    ).toBeInTheDocument();
  });

  it('calls reset on retry', async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('Render failed')} reset={reset} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
