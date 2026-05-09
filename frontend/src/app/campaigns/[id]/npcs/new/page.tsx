'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import LootOddsAdvanced from '@/components/LootOddsAdvanced';
import { NPC_ALIGNMENTS, NPC_HOSTILITIES, NPC_PROFESSIONS, NPC_RACES } from '@/lib/npc-constants';
import type { GenerateNpcRequest, GeneratedNpcPreview, Npc, NpcLootOverrides } from '@/lib/types';

const PROFESSION_OTHER = '__other__';

interface Constraints {
  race: string;
  background: string;
  profession: string;
  customProfession: string;
  alignment: string;
  hostility: '' | 'friendly' | 'neutral' | 'hostile';
  setting: string;
  combatRelevant: boolean;
  lootOverrides: NpcLootOverrides | null;
}

const emptyConstraints: Constraints = {
  race: '',
  background: '',
  profession: '',
  customProfession: '',
  alignment: '',
  hostility: '',
  setting: '',
  combatRelevant: false,
  lootOverrides: null,
};

interface ManualFields {
  name: string;
  age: string;
  gender: string;
  appearance: string;
}

export default function NewNpcPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<'generate' | 'manual'>('generate');
  const [constraints, setConstraints] = useState<Constraints>(emptyConstraints);
  const [manualFields, setManualFields] = useState<ManualFields>({
    name: '',
    age: '',
    gender: '',
    appearance: '',
  });
  const [preview, setPreview] = useState<GeneratedNpcPreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateConstraint = <K extends keyof Constraints>(key: K, value: Constraints[K]) => {
    setConstraints(prev => ({ ...prev, [key]: value }));
  };

  const resolvedProfession = (): string | undefined => {
    if (!constraints.profession) return undefined;
    if (constraints.profession === PROFESSION_OTHER) {
      return constraints.customProfession.trim() || undefined;
    }
    return constraints.profession;
  };

  const buildGenerateRequest = (): GenerateNpcRequest => {
    const req: GenerateNpcRequest = { campaignId };
    if (constraints.race) req.race = constraints.race;
    if (constraints.background) req.background = constraints.background;
    const prof = resolvedProfession();
    if (prof) req.profession = prof;
    if (constraints.alignment) req.alignment = constraints.alignment;
    if (constraints.setting) req.setting = constraints.setting;
    if (constraints.hostility) req.hostility = constraints.hostility;
    if (constraints.combatRelevant) req.combatRelevant = true;
    if (constraints.lootOverrides) req.lootOverrides = constraints.lootOverrides;
    return req;
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const result = await apiFetch<GeneratedNpcPreview>('/npcs/generate', {
        method: 'POST',
        body: JSON.stringify(buildGenerateRequest()),
      });
      setPreview(result);
      toast.success('Preview generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate NPC');
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePreview = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const npc = await apiFetch<Npc>('/npcs', {
        method: 'POST',
        body: JSON.stringify(preview),
      });
      toast.success('NPC saved');
      router.push(`/campaigns/${campaignId}/npcs/${npc.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save NPC');
      setSaving(false);
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        campaignId,
        name: manualFields.name.trim(),
        race: constraints.race,
        ...(constraints.background ? { background: constraints.background } : {}),
        ...(resolvedProfession() ? { profession: resolvedProfession() } : {}),
        ...(constraints.alignment ? { alignment: constraints.alignment } : {}),
        ...(manualFields.age ? { age: Number(manualFields.age) } : {}),
        ...(manualFields.gender ? { gender: manualFields.gender } : {}),
        ...(manualFields.appearance ? { appearance: manualFields.appearance } : {}),
        ...(constraints.lootOverrides ? { lootOverrides: constraints.lootOverrides } : {}),
        isManual: true,
      };
      const npc = await apiFetch<Npc>('/npcs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success('NPC saved');
      router.push(`/campaigns/${campaignId}/npcs/${npc.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save NPC');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        {mode === 'generate' ? 'Generate NPC' : 'Create NPC'}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {mode === 'generate'
          ? 'Set generation constraints, then preview and save.'
          : 'Manually create an NPC with custom values.'}
      </p>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('generate');
            setPreview(null);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            mode === 'generate'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
          }`}
        >
          Generate
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('manual');
            setPreview(null);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            mode === 'manual'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
          }`}
        >
          Create Manually
        </button>
      </div>

      <form
        onSubmit={mode === 'generate' ? handleGenerate : handleManualSave}
        className="space-y-4"
      >
        {mode === 'manual' && (
          <FormField
            label="Name"
            required
            value={manualFields.name}
            onChange={e => setManualFields(p => ({ ...p, name: e.target.value }))}
          />
        )}

        <FormField
          as="select"
          label="Race"
          required={mode === 'manual'}
          value={constraints.race}
          onChange={e => updateConstraint('race', e.target.value)}
        >
          <option value="">{mode === 'manual' ? '— select —' : 'Random'}</option>
          {NPC_RACES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </FormField>

        <FormField
          label="Background"
          value={constraints.background}
          onChange={e => updateConstraint('background', e.target.value)}
          helperText='e.g. "Folk Hero", "Acolyte"'
        />

        <FormField
          as="select"
          label="Profession"
          value={constraints.profession}
          onChange={e => updateConstraint('profession', e.target.value)}
        >
          <option value="">{mode === 'manual' ? '— none —' : 'Random'}</option>
          {NPC_PROFESSIONS.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={PROFESSION_OTHER}>Other…</option>
        </FormField>

        {constraints.profession === PROFESSION_OTHER && (
          <FormField
            label="Custom profession"
            value={constraints.customProfession}
            onChange={e => updateConstraint('customProfession', e.target.value)}
          />
        )}

        <FormField
          as="select"
          label="Alignment"
          value={constraints.alignment}
          onChange={e => updateConstraint('alignment', e.target.value)}
        >
          <option value="">{mode === 'manual' ? '— none —' : 'Random'}</option>
          {NPC_ALIGNMENTS.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </FormField>

        {mode === 'generate' && (
          <>
            <FormField
              as="select"
              label="Hostility"
              value={constraints.hostility}
              onChange={e =>
                updateConstraint('hostility', e.target.value as Constraints['hostility'])
              }
            >
              <option value="">Random</option>
              {NPC_HOSTILITIES.map(h => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </FormField>
            <FormField
              label="Setting / Region"
              value={constraints.setting}
              onChange={e => updateConstraint('setting', e.target.value)}
              helperText='e.g. "dwarven mine", "coastal village"'
            />
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={constraints.combatRelevant}
                onChange={e => updateConstraint('combatRelevant', e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Combat-relevant (generate stat block)
            </label>
          </>
        )}

        {mode === 'manual' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Age"
                type="number"
                min={0}
                value={manualFields.age}
                onChange={e => setManualFields(p => ({ ...p, age: e.target.value }))}
              />
              <FormField
                label="Gender"
                value={manualFields.gender}
                onChange={e => setManualFields(p => ({ ...p, gender: e.target.value }))}
              />
            </div>
            <FormField
              as="textarea"
              label="Appearance"
              value={manualFields.appearance}
              onChange={e => setManualFields(p => ({ ...p, appearance: e.target.value }))}
              rows={3}
            />
          </>
        )}

        <LootOddsAdvanced
          value={constraints.lootOverrides}
          onChange={v => updateConstraint('lootOverrides', v)}
        />

        <div className="flex gap-3 pt-2">
          {mode === 'generate' ? (
            <button
              type="submit"
              disabled={generating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating...' : 'Generate Preview'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>

      {mode === 'generate' && preview && (
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-3">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {preview.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {preview.race}
                {preview.profession ? ` · ${preview.profession}` : ''}
                {preview.alignment ? ` · ${preview.alignment}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleSavePreview}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <PreviewSection title="Background">{preview.background ?? '—'}</PreviewSection>
          <PreviewSection title="Appearance">{preview.appearance ?? '—'}</PreviewSection>

          {preview.personalityTraits.length > 0 && (
            <PreviewSection title="Personality">
              <ul className="list-disc list-inside space-y-1">
                {preview.personalityTraits.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </PreviewSection>
          )}

          <PreviewSection title="Coinage">
            {preview.goldPieces} gp · {preview.silverPieces} sp · {preview.copperPieces} cp
          </PreviewSection>

          {preview.loot.length > 0 && (
            <PreviewSection title="Loot">
              <ul className="list-disc list-inside space-y-1">
                {preview.loot.map((item, i) => (
                  <li key={i}>
                    {item.quantity}× {item.name}
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </div>
      <div className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{children}</div>
    </div>
  );
}
