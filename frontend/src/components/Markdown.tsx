import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders GitHub-flavored markdown with Tailwind styling. Used for SRD text whose
// embedded reference tables were reconstructed as GFM markdown (VEG-271 spells), so
// they render as real tables instead of literal pipes. Single newlines reflow as
// spaces (markdown), which also tidies the SRD's hard-wrapped prose.
const components = {
  p: (props: ComponentPropsWithoutRef<'p'>) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-gray-700 dark:text-gray-300" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-xs" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th
      className="border border-gray-300 bg-gray-100 px-2 py-1 font-medium dark:border-gray-600 dark:bg-gray-700"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-gray-300 px-2 py-1 align-top dark:border-gray-600" {...props} />
  ),
};

export interface MarkdownProps {
  children: string;
  className?: string;
}

export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={['text-sm text-gray-600 dark:text-gray-400', className].filter(Boolean).join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
