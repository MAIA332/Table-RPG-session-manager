/** Registro de rolagem feito exclusivamente no servidor. */
export const MONSTER_ATTRIBUTES = ["dex", "ins", "mig", "wlp"] as const
export type MonsterAttribute = (typeof MONSTER_ATTRIBUTES)[number]
export type MonsterAttributeRoll = {
  id: string
  instanceId: string
  creatureName: string
  attribute: MonsterAttribute
  die: string
  result: number
  at: number
  /** Decisão do Mestre no instante da rolagem; nunca retroativa. */
  shared: boolean
}
export type MonsterDiceState = {
  shareMonsterRolls?: boolean
  monsterAttributeRolls?: MonsterAttributeRoll[]
}
export const isMonsterAttribute = (value: unknown): value is MonsterAttribute =>
  MONSTER_ATTRIBUTES.some(attribute => attribute === value)
