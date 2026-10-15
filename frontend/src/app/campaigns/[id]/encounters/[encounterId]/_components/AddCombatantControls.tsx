'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { PartyCharacter } from '@/lib/types';
import type { ManualCombatantInput, PartyCombatantEntry } from '@/lib/encounter-combatants';
import Modal from '@/components/Modal';
import AddCombatantDialog from '@/components/AddCombatantDialog';
import AddPartyDialog from '@/components/AddPartyDialog';

export interface AddCombatantControlsProps {
  campaignId: string;
  existingNames: string[];
  writePending: boolean;
  /** Resolves true when the combatant was added, which closes the form. */
  onAddManual: (input: ManualCombatantInput) => Promise<boolean>;
  /** Resolves true when the party was added, which closes the picker. */
  onAddParty: (entries: PartyCombatantEntry[]) => Promise<boolean>;
}

/** The "Add combatant" and "Add party" buttons and the dialogs they open. */
export default function AddCombatantControls({
  campaignId,
  existingNames,
  writePending,
  onAddManual,
  onAddParty,
}: AddCombatantControlsProps) {
  // Manual add-combatant form (VEG-282).
  const [addCombatantOpen, setAddCombatantOpen] = useState(false);
  // Party picker (VEG-283). `partyRoster` is null while the fetch is in flight.
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [partyRoster, setPartyRoster] = useState<PartyCharacter[] | null>(null);

  // Open the party picker and fetch the campaign roster (VEG-283). Mirrors the
  // stat-block viewer's open-then-load pattern: the modal opens immediately
  // with a loading state, and a failed fetch toasts and closes it.
  const openAddParty = () => {
    setPartyRoster(null);
    setAddPartyOpen(true);
    apiFetch<PartyCharacter[]>(`/campaigns/${campaignId}/characters`)
      .then(setPartyRoster)
      .catch(() => {
        toast.error('Failed to load party');
        setAddPartyOpen(false);
      });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAddCombatantOpen(true)}
        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
      >
        Add combatant
      </button>
      <button
        type="button"
        onClick={openAddParty}
        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
      >
        Add party
      </button>

      <Modal
        open={addCombatantOpen}
        onClose={() => setAddCombatantOpen(false)}
        label="Add combatant"
      >
        <AddCombatantDialog
          onConfirm={async input => {
            if (await onAddManual(input)) setAddCombatantOpen(false);
          }}
          onCancel={() => setAddCombatantOpen(false)}
          submitting={writePending}
        />
      </Modal>

      <Modal open={addPartyOpen} onClose={() => setAddPartyOpen(false)} label="Add party">
        {partyRoster === null ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading party…
          </p>
        ) : (
          <AddPartyDialog
            characters={partyRoster}
            existingNames={existingNames}
            onConfirm={async entries => {
              if (await onAddParty(entries)) setAddPartyOpen(false);
            }}
            onCancel={() => setAddPartyOpen(false)}
            submitting={writePending}
          />
        )}
      </Modal>
    </>
  );
}
