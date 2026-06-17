'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/npc-data', label: 'NPC Data' },
  { href: '/admin/loot-odds', label: 'Loot Odds' },
  { href: '/admin/equipment', label: 'Equipment' },
];

export default function AdminSubnav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Admin sections"
      className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-3"
    >
      {LINKS.map(l => {
        const active = pathname === l.href || pathname?.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`text-sm px-3 py-1.5 rounded-lg border ${
              active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
