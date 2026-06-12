import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('renders its children', () => {
      render(<Badge>Active</Badge>);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders as a span by default', () => {
      render(<Badge>Tag</Badge>);
      expect(screen.getByText('Tag').tagName).toBe('SPAN');
    });

    it('renders pill shape (rounded-full)', () => {
      render(<Badge>Tag</Badge>);
      expect(screen.getByText('Tag')).toHaveClass('rounded-full');
    });
  });

  describe('variants', () => {
    it('applies default (gray) variant when no variant prop given', () => {
      render(<Badge>Tag</Badge>);
      const el = screen.getByText('Tag');
      expect(el).toHaveClass('bg-gray-100', 'dark:bg-gray-700');
      expect(el).toHaveClass('text-gray-600', 'dark:text-gray-400');
    });

    it('applies success (green) variant', () => {
      render(<Badge variant="success">Active</Badge>);
      const el = screen.getByText('Active');
      expect(el).toHaveClass('bg-green-100', 'dark:bg-green-900');
      expect(el).toHaveClass('text-green-800', 'dark:text-green-300');
    });

    it('applies neutral (gray) variant for inactive/disabled states', () => {
      render(<Badge variant="neutral">Inactive</Badge>);
      const el = screen.getByText('Inactive');
      expect(el).toHaveClass('bg-gray-100', 'dark:bg-gray-700');
      expect(el).toHaveClass('text-gray-800', 'dark:text-gray-300');
    });

    it('applies homebrew (amber, font-medium) variant for user-created content', () => {
      render(<Badge variant="homebrew">Homebrew</Badge>);
      const el = screen.getByText('Homebrew');
      expect(el).toHaveClass('bg-amber-50', 'dark:bg-amber-900/30');
      expect(el).toHaveClass('text-amber-700', 'dark:text-amber-400');
      expect(el).toHaveClass('font-medium');
      // Visual parity with the hand-rolled spans it replaces.
      expect(el).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-xs');
    });
  });

  describe('size', () => {
    it('applies sm size by default (px-2 py-0.5, no font-medium)', () => {
      render(<Badge>Tag</Badge>);
      const el = screen.getByText('Tag');
      expect(el).toHaveClass('px-2', 'py-0.5', 'text-xs');
      expect(el).not.toHaveClass('font-medium');
    });

    it('applies md size when size="md" (px-2 py-1, font-medium)', () => {
      render(<Badge size="md">Tag</Badge>);
      const el = screen.getByText('Tag');
      expect(el).toHaveClass('px-2', 'py-1', 'text-xs', 'font-medium');
    });
  });

  describe('className passthrough', () => {
    it('appends additional className to the element', () => {
      render(<Badge className="ml-2">Tag</Badge>);
      expect(screen.getByText('Tag')).toHaveClass('ml-2');
    });
  });
});
