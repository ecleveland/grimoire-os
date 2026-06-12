import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'neutral' | 'homebrew';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  success: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300',
  neutral: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  homebrew: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs font-medium',
};

export default function Badge({
  variant = 'default',
  size = 'sm',
  className,
  children,
}: BadgeProps) {
  const classes = ['rounded-full', sizeClasses[size], variantClasses[variant], className]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{children}</span>;
}
