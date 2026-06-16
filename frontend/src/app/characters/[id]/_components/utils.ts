// Ability-score math + ability/skill maps moved to a neutral, route-agnostic
// home (@/lib/ability-math) so the guided builder can share them with the sheet.
// Re-exported here so existing sheet-component imports stay valid.
export * from '@/lib/ability-math';
