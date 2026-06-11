// Single home for the "N gp · N sp · N cp" display convention, shared by the
// encounter tracker and the NPC loot views so the format can't drift.
export interface CoinagePieces {
  gp: number;
  sp: number;
  cp: number;
}

export const formatCoinage = ({ gp, sp, cp }: CoinagePieces) => `${gp} gp · ${sp} sp · ${cp} cp`;
