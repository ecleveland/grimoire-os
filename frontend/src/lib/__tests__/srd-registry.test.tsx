import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SRD_KINDS, SRD_REGISTRY } from '@/lib/srd-registry';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('SRD_REGISTRY', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // BackgroundForm loads its origin feat options on mount.
    mockApiFetch.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });
  });

  it('has exactly one entry per kind', () => {
    expect(Object.keys(SRD_REGISTRY).sort()).toEqual([...SRD_KINDS].sort());
  });

  describe.each(SRD_KINDS)('%s', kind => {
    const entry = SRD_REGISTRY[kind];

    it('is keyed by its own kind', () => {
      expect(entry.kind).toBe(kind);
    });

    it('names the kind and points the API and list at the same path', () => {
      expect(entry.label).not.toBe('');
      expect(entry.plural).not.toBe('');
      expect(entry.createBlurb).not.toBe('');
      expect(entry.apiPath).toMatch(/^\/srd\//);
      expect(entry.apiPath).toBe(entry.listPath);
    });

    it('renders a form whose submit button carries the submit label', () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={client}>
          {entry.renderForm({
            submitting: false,
            submitLabel: 'Go ahead',
            onSubmit: () => {},
            onCancel: () => {},
          })}
        </QueryClientProvider>
      );

      const submit = screen.getByRole('button', { name: 'Go ahead' });
      expect(submit).toHaveAttribute('type', 'submit');
      expect(submit.closest('form')).not.toBeNull();
    });
  });
});
