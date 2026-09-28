import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import GlobalError from '../global-error';

describe('global error boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its own html and body around the error UI', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('Layout failed')} reset={vi.fn()} />
    );
    expect(html).toMatch(/^<html lang="en">/);
    expect(html).toContain('<body');
    expect(html).toContain('Layout failed');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/"');
  });
});
