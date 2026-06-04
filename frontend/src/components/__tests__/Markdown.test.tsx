import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Markdown from '../Markdown';

describe('Markdown', () => {
  it('renders plain prose as a paragraph', () => {
    render(<Markdown>A shimmering green arrow streaks toward a target.</Markdown>);
    expect(screen.getByText(/A shimmering green arrow/)).toBeInTheDocument();
  });

  it('keeps single-newline-separated lines in one paragraph (soft break reflows to a space)', () => {
    const { container } = render(<Markdown>{'first line\nsecond line'}</Markdown>);
    const paras = container.querySelectorAll('p');
    expect(paras).toHaveLength(1);
    // A CommonMark soft break renders as whitespace, so the two source lines read as one line.
    expect(paras[0].textContent).toMatch(/first line\s+second line/);
  });

  it('splits blank-line-separated text into separate paragraphs', () => {
    const { container } = render(<Markdown>{'para one\n\npara two'}</Markdown>);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('renders a GFM table as a real <table> with header and body cells', () => {
    const md = [
      'Roll on the table.',
      '',
      '| Omen | For Results That Will Be … |',
      '| --- | --- |',
      '| Weal | Good |',
      '| Weal and woe | Good and bad |',
    ].join('\n');
    render(<Markdown>{md}</Markdown>);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Omen')).toBeInTheDocument();
    expect(within(table).getByText('For Results That Will Be …')).toBeInTheDocument();
    // The multi-word first-column cell stays in one cell (not split on the space).
    const cell = within(table).getByText('Weal and woe');
    expect(cell.tagName).toBe('TD');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 body rows
  });

  it('renders bullet lists', () => {
    render(<Markdown>{'- one\n- two'}</Markdown>);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
