import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loading from '../loading';

describe('root loading boundary', () => {
  it('renders the shared loading state', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
