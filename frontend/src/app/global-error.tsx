'use client';

import './globals.css';
import RouteError, { type RouteErrorProps } from '@/components/RouteError';

/**
 * Catches errors thrown by the root layout itself (the providers, the header,
 * the print tray bar), which `error.tsx` cannot see. It replaces the whole
 * document, so it renders its own html and body.
 */
export default function GlobalError({ error, reset }: Omit<RouteErrorProps, 'scope'>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 dark:bg-gray-900">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <RouteError error={error} reset={reset} />
        </main>
      </body>
    </html>
  );
}
