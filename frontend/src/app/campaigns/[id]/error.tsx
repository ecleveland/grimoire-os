'use client';

import RouteError, { type RouteErrorProps } from '@/components/RouteError';

export default function SegmentError({ error, reset }: Omit<RouteErrorProps, 'scope'>) {
  return <RouteError error={error} reset={reset} scope="campaign" />;
}
