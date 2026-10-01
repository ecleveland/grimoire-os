import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useNextParam } from '../use-next-param';

function NextProbe() {
  const next = useNextParam();
  return <span data-testid="next">{next ?? 'null'}</span>;
}

describe('useNextParam', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('returns the decoded next query parameter', () => {
    window.history.replaceState({}, '', '/login?next=%2Fcampaigns%2F1');
    render(<NextProbe />);
    expect(screen.getByTestId('next')).toHaveTextContent('/campaigns/1');
  });

  it('returns null when the URL has no next parameter', () => {
    window.history.replaceState({}, '', '/login');
    render(<NextProbe />);
    expect(screen.getByTestId('next')).toHaveTextContent('null');
  });
});
