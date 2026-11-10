import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveIndicator from '../_components/LiveIndicator';

const UPDATED_AT = new Date(2026, 10, 10, 14, 5, 9).getTime();
const TIME = new Date(UPDATED_AT).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

describe('LiveIndicator (VEG-683)', () => {
  it('shows the time of the last refresh while live', () => {
    render(<LiveIndicator lastUpdatedAt={UPDATED_AT} refreshFailed={false} />);

    const status = screen.getByTestId('live-indicator');
    expect(status).toHaveTextContent(`Live · updated ${TIME}`);
    expect(status).not.toHaveAttribute('title');
    expect(status).not.toHaveClass('opacity-60');
  });

  // The time changes on every poll, so a live region would read it out every
  // few seconds.
  it('is not a live region', () => {
    render(<LiveIndicator lastUpdatedAt={UPDATED_AT} refreshFailed={false} />);

    const status = screen.getByTestId('live-indicator');
    expect(status).not.toHaveAttribute('role');
    expect(status).not.toHaveAttribute('aria-live');
  });

  it('dims and explains itself after a failed refresh', () => {
    render(<LiveIndicator lastUpdatedAt={UPDATED_AT} refreshFailed />);

    const status = screen.getByTestId('live-indicator');
    expect(status).toHaveTextContent(`Live · last update ${TIME}`);
    expect(status).toHaveAttribute(
      'title',
      'The last refresh failed. Showing the last state received.'
    );
    expect(status).toHaveClass('opacity-60');
  });
});
