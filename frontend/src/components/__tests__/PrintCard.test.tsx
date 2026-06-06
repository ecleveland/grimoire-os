import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintCard from '../PrintCard';

describe('PrintCard', () => {
  it('renders the header band with name and type tag, and the body children', () => {
    render(
      <PrintCard name="Goblin" tag="CR 1/4">
        <p>body content</p>
      </PrintCard>
    );

    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText('CR 1/4')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('has a fixed 3×5 inch footprint that clips overflow', () => {
    render(
      <PrintCard name="Goblin" tag="CR 1/4">
        <p>body</p>
      </PrintCard>
    );

    const card = screen.getByTestId('print-card');
    expect(card.className).toContain('w-[5in]');
    expect(card.className).toContain('h-[3in]');
    expect(card.className).toContain('overflow-hidden');
  });

  it('uses light-theme-only styling (no dark: variants)', () => {
    const { container } = render(
      <PrintCard name="Goblin" tag="CR 1/4">
        <p>body</p>
      </PrintCard>
    );

    expect(container.innerHTML).not.toContain('dark:');
  });
});
