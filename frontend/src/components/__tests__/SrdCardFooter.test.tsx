import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SrdCardFooter from '../SrdCardFooter';

/** The footer row itself, which is the link's parent. */
function row(): HTMLElement {
  const link = screen.getByRole('link', { name: /^Open / });
  const parent = link.parentElement;
  if (!parent) throw new Error('the footer link has no parent row');
  return parent;
}

describe('SrdCardFooter', () => {
  it('links to the entity page with the kind in the visible text', () => {
    render(<SrdCardFooter href="/srd/races/race-1" kind="race" name="Dragonborn" />);

    const link = screen.getByRole('link', { name: /^Open / });
    expect(link).toHaveAttribute('href', '/srd/races/race-1');
    expect(link).toHaveTextContent('Open race page');
  });

  it('names the entity in the accessible name, so a link list tells rows apart', () => {
    render(
      <>
        <SrdCardFooter href="/srd/races/race-1" kind="race" name="Dragonborn" />
        <SrdCardFooter href="/srd/races/race-2" kind="race" name="Dwarf" />
      </>
    );

    expect(screen.getByRole('link', { name: 'Open Dragonborn race page' })).toHaveAttribute(
      'href',
      '/srd/races/race-1'
    );
    expect(screen.getByRole('link', { name: 'Open Dwarf race page' })).toHaveAttribute(
      'href',
      '/srd/races/race-2'
    );
  });

  it('renders actions beside the link, right-aligned', () => {
    render(
      <SrdCardFooter
        href="/srd/classes/class-1"
        kind="class"
        name="Fighter"
        actions={
          <>
            <button type="button">Edit</button>
            <button type="button">Delete</button>
          </>
        }
      />
    );

    const actions = screen.getByRole('button', { name: 'Edit' }).parentElement;
    expect(actions).toHaveClass('ml-auto');
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Delete' }));
    expect(row()).toContainElement(actions);
    expect(row().children).toHaveLength(2);
  });

  it('renders no actions wrapper when no actions are given', () => {
    render(<SrdCardFooter href="/srd/races/race-1" kind="race" name="Dragonborn" />);

    expect(row().children).toHaveLength(1);
  });

  // `canManage(x) && <>…</>` passes `false` when the caller may not manage the row.
  it('renders no actions wrapper for a false actions prop', () => {
    render(
      <SrdCardFooter href="/srd/classes/class-1" kind="class" name="Fighter" actions={false} />
    );

    expect(row().children).toHaveLength(1);
  });
});
