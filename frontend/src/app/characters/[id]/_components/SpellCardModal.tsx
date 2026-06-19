'use client';

import type { SpellEntry, SrdSpell } from '@/lib/types';
import { useApiQuery } from '@/lib/query';
import { levelLabel } from '@/lib/spell-constants';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import SpellDetail from '@/components/SpellDetail';

interface SpellCardModalProps {
  /** The spell to show, or null when the card is closed. */
  entry: SpellEntry | null;
  onClose: () => void;
}

/**
 * Read-only spell-card popover for the live sheet (VEG-413). Catalog-linked
 * entries (`spellId` set, incl. homebrew) fetch the full row via
 * `GET /srd/spells/:id` and reuse the SRD browser's `SpellDetail`; free-typed
 * entries fall back to the limited metadata stored on the sheet. The shared
 * `Modal` supplies the focus trap / Esc-to-close, so the card only renders its
 * body when open — keeping the catalog fetch from firing while closed.
 */
export default function SpellCardModal({ entry, onClose }: SpellCardModalProps) {
  return (
    <Modal
      open={entry !== null}
      onClose={onClose}
      label={entry?.name ?? 'Spell'}
      testId="spell-card-modal"
    >
      {entry &&
        (entry.spellId ? <CatalogSpellCard entry={entry} /> : <FreeTypedSpellCard entry={entry} />)}
    </Modal>
  );
}

/** Header shared by the catalog and free-typed cards: name + level · school. */
function CardHeader({
  name,
  level,
  school,
  concentration,
  ritual,
  homebrew,
}: {
  name: string;
  level: number;
  school?: string;
  concentration?: boolean;
  ritual?: boolean;
  homebrew?: boolean;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
        {name}
        {concentration && (
          <span className="ml-2 text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded align-middle">
            Concentration
          </span>
        )}
        {ritual && (
          <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded align-middle">
            Ritual
          </span>
        )}
        {homebrew && (
          <Badge variant="homebrew" className="ml-2 inline-block align-middle">
            Homebrew
          </Badge>
        )}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {levelLabel(level)}
        {school ? ` · ${school}` : ''}
      </p>
    </div>
  );
}

/** Catalog-linked card: fetch the full SRD row and render the reused detail. */
function CatalogSpellCard({ entry }: { entry: SpellEntry }) {
  const { data, isLoading, isError } = useApiQuery<SrdSpell>(`/srd/spells/${entry.spellId}`);

  if (isLoading) {
    return (
      <p
        data-testid="spell-card-loading"
        className="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
      >
        Loading spell…
      </p>
    );
  }

  // On failure, surface the error but still fall back to the stored metadata so
  // the player isn't left with an empty card.
  if (isError || !data) {
    return (
      <div className="space-y-3">
        <p
          data-testid="spell-card-error"
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          Couldn&apos;t load the full spell details. Showing what&apos;s saved on your sheet.
        </p>
        <FreeTypedSpellCard entry={entry} hideHint />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <CardHeader
        name={data.name}
        level={data.level}
        school={data.school}
        concentration={data.concentration}
        ritual={data.ritual}
        homebrew={data.contentSource === 'homebrew'}
      />
      <SpellDetail spell={data} />
    </div>
  );
}

/** Free-typed card: render only the metadata stored on the sheet entry. */
function FreeTypedSpellCard({
  entry,
  hideHint = false,
}: {
  entry: SpellEntry;
  hideHint?: boolean;
}) {
  return (
    <div className="space-y-3">
      <CardHeader
        name={entry.name}
        level={entry.level}
        concentration={entry.concentration}
        ritual={entry.ritual}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Casting Time</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{entry.castingTime ?? '—'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Range</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{entry.range ?? '—'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Components</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {entry.material ? 'Material' : '—'}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Prepared</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {entry.level === 0 ? 'Cantrip' : entry.prepared ? 'Yes' : 'No'}
          </p>
        </div>
      </div>
      {entry.notes && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{entry.notes}</p>
        </div>
      )}
      {!hideHint && (
        <p
          data-testid="not-linked-hint"
          className="text-xs italic text-gray-400 dark:text-gray-500"
        >
          This spell isn&apos;t linked to the catalog — only the details saved on your sheet are
          shown.
        </p>
      )}
    </div>
  );
}
