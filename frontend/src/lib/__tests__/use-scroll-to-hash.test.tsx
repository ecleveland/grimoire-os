import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useScrollToHash } from '../use-scroll-to-hash';

function Anchors({ ids }: { ids: string[] }) {
  useScrollToHash(ids);
  return (
    <ul>
      {ids.map(id => (
        <li key={id} id={id}>
          {id}
        </li>
      ))}
    </ul>
  );
}

// A feature search hit links to /srd/classes/<classId>#<id>. The class is
// fetched after the navigation, so the browser resolves the fragment against a
// page that is still "Loading class…" and never scrolls. The hook does it once
// the anchors are in the DOM.
describe('useScrollToHash', () => {
  // jsdom has no scrollIntoView, so there is nothing to spy on: install one,
  // and put the absence back afterwards the way the encounter page spec does.
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    window.location.hash = '';
  });

  it('scrolls the element the hash names into view', () => {
    window.location.hash = '#sc-deadeye';

    render(<Anchors ids={['sc-deadeye', 'sc-gunsmith']} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(document.getElementById('sc-deadeye')).toBe(scrollIntoView.mock.instances[0]);
  });

  it('stays put when the hash names no anchor on this page', () => {
    window.location.hash = '#sc-from-another-class';

    render(<Anchors ids={['sc-deadeye', 'sc-gunsmith']} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('waits for the anchor to arrive before scrolling', () => {
    window.location.hash = '#cf-grit';
    const { rerender } = render(<Anchors ids={[]} />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<Anchors ids={['cf-grit']} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.getElementById('cf-grit')).toBe(scrollIntoView.mock.instances[0]);
  });

  it('does not scroll again when the ids re-render under the same hash', () => {
    window.location.hash = '#sc-deadeye';
    const { rerender } = render(<Anchors ids={['sc-deadeye', 'sc-gunsmith']} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // A write lands, so the ids arrive as a fresh array. The reader is wherever
    // they scrolled to by now and must not be yanked back.
    rerender(<Anchors ids={['sc-deadeye', 'sc-gunsmith', 'sc-new']} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  // Anyone can put a stray percent sign in a URL, and decoding one throws.
  // The fragment is decoration on a public page, so a bad one costs the
  // reader the scroll and nothing else.
  it('renders anyway when the hash will not decode', () => {
    window.location.hash = '#%';

    const { getByText } = render(<Anchors ids={['sc-deadeye']} />);

    expect(getByText('sc-deadeye')).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
