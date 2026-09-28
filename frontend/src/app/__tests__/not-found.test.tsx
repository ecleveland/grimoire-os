import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '../not-found';

describe('root not-found page', () => {
  it('says the page does not exist and links home', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });
});
