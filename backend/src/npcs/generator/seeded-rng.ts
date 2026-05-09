// Tiny deterministic PRNG used by the NPC generator. Mulberry32 over a 32-bit
// state hashed from a string seed (FNV-1a). Determinism matters because we
// persist the seed on Npc.generationParams and reroll a single field by
// replaying that step against the same RNG sequence.

export type WeightedEntry<T> = { value: T; weight: number };

export class SeededRng {
  private state: number;

  constructor(seed: string) {
    this.state = SeededRng.hashSeed(seed);
  }

  static hashSeed(seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  static generateSeed(): string {
    const a = Math.floor(Math.random() * 0xffffffff).toString(16);
    const b = Date.now().toString(16);
    return `${a}-${b}`;
  }

  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  intInRange(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  rollDie(spec: string): number {
    const match = /^(\d*)d(\d+)$/i.exec(spec.trim());
    if (!match) throw new Error(`Invalid die spec: "${spec}"`);
    const count = match[1] === '' ? 1 : parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    if (count <= 0 || sides <= 0) throw new Error(`Invalid die spec: "${spec}"`);
    let total = 0;
    for (let i = 0; i < count; i++) total += this.intInRange(1, sides);
    return total;
  }

  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.nextFloat() < p;
  }

  pickOne<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pickOne called on empty array');
    return items[this.intInRange(0, items.length - 1)];
  }

  weightedPick<T>(entries: readonly WeightedEntry<T>[]): T {
    if (entries.length === 0) throw new Error('weightedPick called on empty array');
    let total = 0;
    for (const e of entries) {
      if (e.weight > 0) total += e.weight;
    }
    if (total <= 0) throw new Error('weightedPick called with no positive weights');
    const target = this.nextFloat() * total;
    let acc = 0;
    for (const e of entries) {
      if (e.weight <= 0) continue;
      acc += e.weight;
      if (target < acc) return e.value;
    }
    // Fallthrough for floating-point rounding
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].weight > 0) return entries[i].value;
    }
    throw new Error('weightedPick: unreachable');
  }

  sampleDistinct<T>(pool: readonly T[], n: number): T[] {
    if (n <= 0 || pool.length === 0) return [];
    const copy = pool.slice();
    const take = Math.min(n, copy.length);
    const out: T[] = [];
    for (let i = 0; i < take; i++) {
      const idx = this.intInRange(0, copy.length - 1);
      out.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return out;
  }
}
