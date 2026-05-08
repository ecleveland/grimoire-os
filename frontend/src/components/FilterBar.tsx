'use client';

import { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  /** Tailwind grid columns. Defaults to a 1/2/4 responsive grid. */
  className?: string;
}

export default function FilterBar({
  children,
  className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6',
}: FilterBarProps) {
  return <div className={className}>{children}</div>;
}
