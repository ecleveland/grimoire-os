'use client';

import Link from 'next/link';

const categories = [
  { href: '/srd/spells', title: 'Spells', description: 'Browse spells by class, level, and school of magic.' },
  { href: '/srd/monsters', title: 'Monsters', description: 'Find monsters by type, challenge rating, and abilities.' },
  { href: '/srd/items', title: 'Items', description: 'Search weapons, armor, adventuring gear, and more.' },
  { href: '/srd/classes', title: 'Classes', description: 'View class features, hit dice, and proficiencies.' },
  { href: '/srd/races', title: 'Races', description: 'Explore racial traits, ability bonuses, and languages.' },
];

export default function SrdHubPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">SRD Reference</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Link
            key={cat.href}
            href={cat.href}
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{cat.title}</h2>
            <p className="text-gray-600 dark:text-gray-400">{cat.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
