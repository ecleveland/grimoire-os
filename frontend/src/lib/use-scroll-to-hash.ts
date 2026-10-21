import { useEffect, useRef } from 'react';

/**
 * Scroll the element the URL fragment names into view once it is on the page.
 *
 * A feature search hit links to a subclass card or a feature row as
 * /srd/classes/<classId>#<id>. The class is fetched after the navigation, so
 * the browser resolves the fragment against a page that still reads "Loading
 * class…" and scrolls nowhere. The page does it once the rows are in the DOM,
 * which is when `ids` first names the fragment.
 *
 * Once per hash: the rows arrive as a fresh array after every write, and a
 * second scroll would yank the reader back from wherever they are.
 */
export function useScrollToHash(ids: string[]): void {
  // The fragment already scrolled to, so a re-render does not scroll again.
  const scrolledToHash = useRef<string | null>(null);

  useEffect(() => {
    // A stray percent sign in the URL makes decoding throw, and the fragment is
    // decoration: a bad one costs the reader the scroll, not the page.
    let hash: string;
    try {
      hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    } catch {
      return;
    }
    if (!hash || hash === scrolledToHash.current) return;
    if (!ids.includes(hash)) return;
    scrolledToHash.current = hash;
    document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, [ids]);
}
