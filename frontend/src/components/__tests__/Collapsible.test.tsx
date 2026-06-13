import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Collapsible from '../Collapsible';

describe('Collapsible', () => {
  it('renders the summary and starts collapsed (detail not accessible)', () => {
    render(
      <Collapsible summary={<span>Fighter</span>}>
        <p>Hit Die details</p>
      </Collapsible>
    );

    expect(screen.getByRole('button', { name: /Fighter/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    // Detail is in the DOM (crawlable) but hidden, so role/visible queries skip it.
    expect(screen.getByText('Hit Die details')).not.toBeVisible();
  });

  it('expands and collapses the detail on toggle', async () => {
    const user = userEvent.setup();
    render(
      <Collapsible summary={<span>Fighter</span>}>
        <p>Hit Die details</p>
      </Collapsible>
    );
    const button = screen.getByRole('button', { name: /Fighter/ });

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hit Die details')).toBeVisible();

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Hit Die details')).not.toBeVisible();
  });

  it('renders headerAside as a sibling of the toggle button', () => {
    render(
      <Collapsible summary={<span>Elf</span>} headerAside={<button>Print</button>}>
        <p>traits</p>
      </Collapsible>
    );

    // Both the toggle and the aside are reachable; the aside is not nested in the toggle.
    const toggle = screen.getByRole('button', { name: /Elf/ });
    const aside = screen.getByRole('button', { name: 'Print' });
    expect(toggle).not.toContainElement(aside);
  });
});
