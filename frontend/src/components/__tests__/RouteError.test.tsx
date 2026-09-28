import { Component, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RouteError from '../RouteError';

// Mirrors how Next hands a caught render error to an error.tsx file.
class Boundary extends Component<
  { children: ReactNode; reset: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <RouteError error={this.state.error} reset={this.props.reset} scope="campaign" />;
    }
    return this.props.children;
  }
}

function Thrower(): ReactNode {
  throw new Error('Sheet section exploded');
}

describe('RouteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the message of an error thrown during render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Boundary reset={vi.fn()}>
        <Thrower />
      </Boundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Sheet section exploded')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /this campaign hit an error/i })
    ).toBeInTheDocument();
  });

  it('calls reset when the user retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(<RouteError error={new Error('boom')} reset={reset} scope="campaign" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('links home', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RouteError error={new Error('boom')} reset={vi.fn()} />);
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });

  it('uses a generic heading when no scope is given', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RouteError error={new Error('boom')} reset={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
  });

  it('falls back to a generic message when the error has none', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RouteError error={new Error('')} reset={vi.fn()} />);
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
  });

  it('shows the digest when the server redacted the message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('redacted'), { digest: 'abc123' });
    render(<RouteError error={error} reset={vi.fn()} />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('logs the error to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('logged');
    render(<RouteError error={error} reset={vi.fn()} />);
    expect(spy).toHaveBeenCalledWith(error);
  });
});
