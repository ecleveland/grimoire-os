import type { ReactNode } from 'react';

export interface PrintCardProps {
  /** Card title shown in the header band. */
  name: string;
  /** Type-specific tag shown opposite the name (e.g. "CR 1/4", "Level 3 · Evocation"). */
  tag: string;
  children: ReactNode;
}

/**
 * Shared chrome for printable SRD index cards (VEG-266): a fixed 3×5"
 * footprint that clips overflow, with a header band and consistent
 * typography. Deliberately light-theme-only — no dark variants, shadows, or
 * heavy fills — so the cards stay print-friendly. Card bodies (monster,
 * spell, …) render inside as children, pre-condensed to fit.
 *
 * The dashed outer border is the cut guide. It lives here (not on the print
 * page's grid items) so a card component may emit several physical cards —
 * overflow continuation cards (VEG-275) — and each gets its own guide and
 * grid cell. The body div carries `data-print-card-body` as the hook point
 * for that pagination's height measurement.
 */
export default function PrintCard({ name, tag, children }: PrintCardProps) {
  return (
    <div className="w-fit border border-dashed border-gray-300 break-inside-avoid">
      <div
        data-testid="print-card"
        className="w-[5in] h-[3in] overflow-hidden flex flex-col rounded-md border border-gray-400 bg-white text-gray-900 p-3"
      >
        <header className="flex items-baseline justify-between gap-2 border-b border-gray-300 pb-1">
          <h3 className="text-sm font-bold leading-tight truncate">{name}</h3>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
            {tag}
          </span>
        </header>
        <div data-print-card-body="" className="flex-1 min-h-0 overflow-hidden pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}
