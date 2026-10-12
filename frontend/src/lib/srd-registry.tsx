import type { ComponentType, ReactElement } from 'react';
import BackgroundForm from '@/components/BackgroundForm';
import ClassForm from '@/components/ClassForm';
import FeatForm from '@/components/FeatForm';
import ItemForm from '@/components/ItemForm';
import MonsterForm from '@/components/MonsterForm';
import SpellForm from '@/components/SpellForm';
import type { BackgroundPayload } from '@/lib/background-form';
import type { ClassPayload } from '@/lib/class-form';
import type { FeatPayload } from '@/lib/feat-form';
import type { ItemPayload } from '@/lib/item-form';
import type { MonsterPayload } from '@/lib/monster-form';
import type { SpellPayload } from '@/lib/spell-form';
import type {
  ContentSource,
  SrdBackground,
  SrdClass,
  SrdFeat,
  SrdItem,
  SrdMonster,
  SrdSpell,
} from '@/lib/types';

export const SRD_KINDS = ['spell', 'monster', 'item', 'feat', 'background', 'class'] as const;
export type SrdKind = (typeof SRD_KINDS)[number];

/** The columns the edit page reads before the form takes over. */
export interface SrdEditable {
  id: string;
  contentSource: ContentSource;
  createdById?: string | null;
}

export interface SrdFormProps {
  initial?: SrdEditable;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: unknown) => void;
  onCancel: () => void;
}

export interface SrdKindEntry {
  kind: SrdKind;
  /** Capitalized singular, as in "Create Spell". */
  label: string;
  /** Lowercase plural, as in "Back to spells". */
  plural: string;
  /** The collection endpoint, and the prefix invalidated after a write. */
  apiPath: string;
  listPath: string;
  /** The paragraph under the "Create <Label>" heading. */
  createBlurb: string;
  renderForm(props: SrdFormProps): ReactElement;
}

interface KindConfig<E extends SrdEditable, P> {
  kind: SrdKind;
  label: string;
  plural: string;
  apiPath: string;
  listPath: string;
  createBlurb: string;
  Form: ComponentType<{
    initial?: E;
    submitting: boolean;
    submitLabel: string;
    onSubmit: (payload: P) => void;
    onCancel: () => void;
  }>;
}

function defineKind<E extends SrdEditable, P>({ Form, ...entry }: KindConfig<E, P>): SrdKindEntry {
  return {
    ...entry,
    renderForm: ({ initial, onSubmit, ...rest }) => (
      // The form's props are narrower than SrdFormProps, and function parameters
      // are contravariant, so without this cast the registry would need a map
      // generic over every kind. The cast holds because the edit page only ever
      // hands a form the row it fetched from that form's own apiPath, and the
      // page passes the form's payload straight to the API.
      <Form
        initial={initial as E | undefined}
        onSubmit={onSubmit as (payload: P) => void}
        {...rest}
      />
    ),
  };
}

export const SRD_REGISTRY: Record<SrdKind, SrdKindEntry> = {
  spell: defineKind<SrdSpell, SpellPayload>({
    kind: 'spell',
    label: 'Spell',
    plural: 'spells',
    apiPath: '/srd/spells',
    listPath: '/srd/spells',
    createBlurb:
      'Homebrew spells are visible only to you and appear alongside the SRD everywhere spells do.',
    Form: SpellForm,
  }),
  monster: defineKind<SrdMonster, MonsterPayload>({
    kind: 'monster',
    label: 'Monster',
    plural: 'monsters',
    apiPath: '/srd/monsters',
    listPath: '/srd/monsters',
    createBlurb:
      'Homebrew monsters are visible only to you and appear alongside the SRD everywhere monsters do, including the encounter tracker.',
    Form: MonsterForm,
  }),
  item: defineKind<SrdItem, ItemPayload>({
    kind: 'item',
    label: 'Item',
    plural: 'items',
    apiPath: '/srd/items',
    listPath: '/srd/items',
    createBlurb:
      'Homebrew items are visible only to you and appear alongside the SRD everywhere items do.',
    Form: ItemForm,
  }),
  feat: defineKind<SrdFeat, FeatPayload>({
    kind: 'feat',
    label: 'Feat',
    plural: 'feats',
    apiPath: '/srd/feats',
    listPath: '/srd/feats',
    createBlurb:
      'Homebrew feats are visible only to you and appear alongside the SRD everywhere feats do.',
    Form: FeatForm,
  }),
  background: defineKind<SrdBackground, BackgroundPayload>({
    kind: 'background',
    label: 'Background',
    plural: 'backgrounds',
    apiPath: '/srd/backgrounds',
    listPath: '/srd/backgrounds',
    createBlurb:
      'Homebrew backgrounds are visible only to you and appear alongside the SRD everywhere backgrounds do, including the character builder. The origin feat may be an SRD feat or one of your own homebrew feats.',
    Form: BackgroundForm,
  }),
  class: defineKind<SrdClass, ClassPayload>({
    kind: 'class',
    label: 'Class',
    plural: 'classes',
    apiPath: '/srd/classes',
    listPath: '/srd/classes',
    createBlurb:
      'Homebrew classes are visible only to you and appear alongside the SRD classes everywhere classes do, including the character builder.',
    Form: ClassForm,
  }),
};
