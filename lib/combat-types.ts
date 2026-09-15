import type { Attack, Ability, SpotlightState } from "./combat-model"
import type { QteState } from "./qte-model"
export type CombatCreature = {
  id: string
  instanceId: string
  name: string
  imageUrl: string
  level: number
  species: string
  maxHp: number
  maxMp: number
  currentHp: number
  currentMp: number
  def: number
  mdef: number
  attributes: Record<"dex" | "ins" | "mig" | "wlp", string>
  basicAttacksV2?: Attack[]
  basicAttacks?: Array<{
    name: string
    attributes: string[]
    damage: number
    type: string
    description?: string
  }>
  abilities?: Ability[]
  spells?: string[]
  equipment?: string[]
  affinities?: Record<string, string>
  [key: string]: unknown
}
export type CombatLog = {
  id: string
  at: number
  text: string
  roll?: Extract<import("./types").RealtimeEvent, { type: "dice:roll" }>
  damage?: number
  characterId?: string
}
export type CombatSession = {
  revision: number
  updatedAt: number
  enabled: boolean
  spotlight: SpotlightState
  actorCharacterId: string | null
  participantCharacterIds: string[]
  creatures: CombatCreature[]
  playerAttacks: Record<string, Attack[]>
  qte: QteState | null
  log: CombatLog[]
  receipts: string[]
}
export type CombatSnapshot = Omit<CombatSession, "receipts"> & {
  serverNow: number
  viewerRole: string
  characters: Array<{
    id: string
    name: string
    ownerId: string
    avatarUrl?: string
    resources: { hp: number; maxHp: number; mp: number; maxMp: number }
    updatedAt?: number
  }>
}
export type CombatCommand = {
  commandId: string
  expectedRevision: number
  type: string
  [key: string]: unknown
}
export type CombatEvent = { type: "combat:invalidate"; revision: number }
