'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import LootOddsAdvanced from '@/components/LootOddsAdvanced';
import { NPC_ALIGNMENTS, NPC_PROFESSIONS, NPC_RACES } from '@/lib/npc-constants';
import type { Npc, NpcLootOverrides } from '@/lib/types';

const PROFESSION_OTHER = '__other__';

interface FormState {
  name: string;
  race: string;
  background: string;
  profession: string;
  customProfession: string;
  alignment: string;
  age: string;
  gender: string;
  appearance: string;
  goldPieces: string;
  silverPieces: string;
  copperPieces: string;
  lootOverrides: NpcLootOverrides | null;
}

function fromNpc(npc: Npc): FormState {
  const isCurated = (NPC_PROFESSIONS as readonly string[]).includes(npc.profession ?? '');
  return {
    name: npc.name,
    race: npc.race,
    background: npc.background ?? '',
    profession: npc.profession ? (isCurated ? npc.profession : PROFESSION_OTHER) : '',
    customProfession: npc.profession && !isCurated ? npc.profession : '',
    alignment: npc.alignment ?? '',
    age: npc.age != null ? String(npc.age) : '',
    gender: npc.gender ?? '',
    appearance: npc.appearance ?? '',
    goldPieces: String(npc.goldPieces ?? 0),
    silverPieces: String(npc.silverPieces ?? 0),
    copperPieces: String(npc.copperPieces ?? 0),
    lootOverrides: (npc.lootOverrides ?? null) as NpcLootOverrides | null,
  };
}

export default function EditNpcPage() {
  const { id: campaignId, npcId } = useParams<{ id: string; npcId: string }>();
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Npc>(`/npcs/${npcId}`)
      .then(npc => setForm(fromNpc(npc)))
      .catch(() => toast.error('Failed to load NPC'));
  }, [npcId]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const resolvedProfession = (state: FormState): string | null => {
    if (!state.profession) return null;
    if (state.profession === PROFESSION_OTHER) return state.customProfession.trim() || null;
    return state.profession;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const profession = resolvedProfession(form);
      const payload = {
        name: form.name.trim(),
        race: form.race,
        background: form.background || null,
        profession,
        alignment: form.alignment || null,
        age: form.age ? Number(form.age) : null,
        gender: form.gender || null,
        appearance: form.appearance || null,
        goldPieces: Number(form.goldPieces) || 0,
        silverPieces: Number(form.silverPieces) || 0,
        copperPieces: Number(form.copperPieces) || 0,
        lootOverrides: form.lootOverrides,
      };
      await apiFetch<Npc>(`/npcs/${npcId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('NPC updated');
      router.push(`/campaigns/${campaignId}/npcs/${npcId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update NPC');
      setSaving(false);
    }
  };

  if (!form) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit NPC</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Name"
          required
          value={form.name}
          onChange={e => update('name', e.target.value)}
        />
        <FormField
          as="select"
          label="Race"
          required
          value={form.race}
          onChange={e => update('race', e.target.value)}
        >
          <option value="">— select —</option>
          {NPC_RACES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </FormField>
        <FormField
          label="Background"
          value={form.background}
          onChange={e => update('background', e.target.value)}
        />
        <FormField
          as="select"
          label="Profession"
          value={form.profession}
          onChange={e => update('profession', e.target.value)}
        >
          <option value="">— none —</option>
          {NPC_PROFESSIONS.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={PROFESSION_OTHER}>Other…</option>
        </FormField>
        {form.profession === PROFESSION_OTHER && (
          <FormField
            label="Custom profession"
            value={form.customProfession}
            onChange={e => update('customProfession', e.target.value)}
          />
        )}
        <FormField
          as="select"
          label="Alignment"
          value={form.alignment}
          onChange={e => update('alignment', e.target.value)}
        >
          <option value="">— none —</option>
          {NPC_ALIGNMENTS.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Age"
            type="number"
            min={0}
            value={form.age}
            onChange={e => update('age', e.target.value)}
          />
          <FormField
            label="Gender"
            value={form.gender}
            onChange={e => update('gender', e.target.value)}
          />
        </div>
        <FormField
          as="textarea"
          label="Appearance"
          rows={3}
          value={form.appearance}
          onChange={e => update('appearance', e.target.value)}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            label="Gold pieces"
            type="number"
            min={0}
            value={form.goldPieces}
            onChange={e => update('goldPieces', e.target.value)}
          />
          <FormField
            label="Silver pieces"
            type="number"
            min={0}
            value={form.silverPieces}
            onChange={e => update('silverPieces', e.target.value)}
          />
          <FormField
            label="Copper pieces"
            type="number"
            min={0}
            value={form.copperPieces}
            onChange={e => update('copperPieces', e.target.value)}
          />
        </div>

        <LootOddsAdvanced value={form.lootOverrides} onChange={v => update('lootOverrides', v)} />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
