import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SrdHubPage from '../page';

describe('SrdHubPage', () => {
  it('renders the SRD Reference heading', () => {
    render(<SrdHubPage />);
    expect(screen.getByRole('heading', { name: /SRD Reference/i })).toBeInTheDocument();
  });

  it('links to each category, including Spells', () => {
    render(<SrdHubPage />);

    const links: Record<string, string> = {
      Search: '/srd/search',
      Monsters: '/srd/monsters',
      Spells: '/srd/spells',
      Feats: '/srd/feats',
      Items: '/srd/items',
      Classes: '/srd/classes',
      Races: '/srd/races',
    };

    for (const [title, href] of Object.entries(links)) {
      // Match the card by its heading, then assert the wrapping link's href —
      // several descriptions contain words like "Search", so name matching the
      // link itself is ambiguous.
      const heading = screen.getByRole('heading', { name: title });
      expect(heading.closest('a')).toHaveAttribute('href', href);
    }
  });
});
