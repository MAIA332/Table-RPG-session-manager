/** Progressão de dados bônus para golpes do jogador. Cada nível custa 2 LP. */
export const LORE_BONUS_DICE: readonly (readonly number[])[] = [
  [], [6], [8], [10], [12], [14], [18], [20],
  [20,6], [20,8], [20,10], [20,12], [20,14], [20,18], [20,20],
] as const
export const LORE_UPGRADE_COST = 2
export const MAX_LORE_BONUS_LEVEL = LORE_BONUS_DICE.length - 1
export function loreBonusDice(level: unknown): number[] {
  if (!Number.isSafeInteger(level) || Number(level) < 0 || Number(level) > MAX_LORE_BONUS_LEVEL) return []
  return [...LORE_BONUS_DICE[Number(level)]]
}
export function loreBonusLabel(level: number): string {
  const dice = loreBonusDice(level)
  if (dice.length === 2 && dice[0] === dice[1]) return `2d${dice[0]}`
  return dice.length ? dice.map(sides => `1d${sides}`).join(' + ') : 'Sem bônus de Lore'
}

/** Registro de compra visível ao Mestre, sem permitir editar o custo pelo cliente. */
export type LoreUpgradeRecord = {
  id: string; characterId: string; characterName: string; attackId: string;
  attackName: string; ownerId: string; cost: number; newLevel: number; at: number
}
