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

    expect(screen.getByRole('link', { name: 'Open race page (Dragonborn)' })).toHaveAttribute(
      'href',
      '/srd/races/race-1'
    );
    expect(screen.getByRole('link', { name: 'Open race page (Dwarf)' })).toHaveAttribute(
      'href',
      '/srd/races/race-2'
    );
  });

  // WCAG 2.5.3 Label in Name: someone saying "click Open race page" to a voice
  // control matches only if the visible phrase opens the accessible name.
  it('keeps the visible text at the start of the accessible name', () => {
    render(<SrdCardFooter href="/srd/races/race-1" kind="race" name="Dragonborn" />);

    const link = screen.getByRole('link', { name: 'Open race page (Dragonborn)' });
    expect(link.textContent?.startsWith('Open race page')).toBe(true);
  });

  // Chrome inserts a space where jsdom trims one at an element boundary, so a
  // visible run plus a hidden span computes two different names. One string
  // gives every engine the same answer.
  it('computes the accessible name from a single string', () => {
    render(<SrdCardFooter href="/srd/races/race-1" kind="race" name="Dragonborn" />);

    const link = screen.getByRole('link', { name: 'Open race page (Dragonborn)' });
    expect(link).toHaveAccessibleName('Open race page (Dragonborn)');
    expect(link.textContent).toBe('Open race page');
  });

  // A homebrew row may copy an SRD row's name, leaving two identical links.
  it('marks a homebrew row in the accessible name', () => {
    render(<SrdCardFooter href="/srd/classes/class-hb" kind="class" name="Fighter" homebrew />);

    expect(
      screen.getByRole('link', { name: 'Open class page (Fighter, homebrew)' })
    ).toBeInTheDocument();
  });

  it('leaves the homebrew marker off a catalog row', () => {
    render(<SrdCardFooter href="/srd/classes/class-1" kind="class" name="Fighter" />);

    expect(screen.getByRole('link', { name: 'Open class page (Fighter)' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /homebrew/ })).not.toBeInTheDocument();
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
