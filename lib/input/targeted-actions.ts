import type { InputAction } from './actions'

/** IDs estáveis. Atalhos antigos sem personagem continuam válidos. */
export type ControllerTarget = { id: string; name: string; characterId?: string }
export const TARGETED_SKILL = 'skill.open.'
export const TARGETED_SPECIAL = 'special.open.'
const ID = '[a-zA-Z0-9_-]{1,100}'
const SPECIAL_PATTERN = new RegExp(String.raw`^(skill|special)\.open\.(${ID})(?:\.(${ID}))?$`)
const BOUND_PATTERN = new RegExp(String.raw`^(character\.sheet|special\.manager|skill\.ability[1-4])\.(${ID})$`)

/** IDs com personagem: kind.open.characterId.id. Sem personagem: formato legado. */
export function targetedAction(kind: 'skill' | 'special', id: string, characterId?: string): InputAction {
  return `${kind === 'skill' ? TARGETED_SKILL : TARGETED_SPECIAL}${characterId ? `${characterId}.` : ''}${id}` as InputAction
}
export function targetOfAction(action: string): { kind: 'skill' | 'special'; id: string; characterId?: string } | null {
  const match = SPECIAL_PATTERN.exec(action)
  return match ? { kind: match[1] as 'skill' | 'special', id: match[3] || match[2], ...(match[3] ? { characterId: match[2] } : {}) } : null
}
export type CharacterBoundCommand = 'character.sheet' | 'special.manager' | 'skill.ability1' | 'skill.ability2' | 'skill.ability3' | 'skill.ability4'
export function characterBoundAction(command: CharacterBoundCommand, characterId: string): InputAction {
  return `${command}.${characterId}` as InputAction
}
export function characterBoundOfAction(action: string): { command: CharacterBoundCommand; characterId: string } | null {
  const match = BOUND_PATTERN.exec(action)
  return match ? { command: match[1] as CharacterBoundCommand, characterId: match[2] } : null
}
/** Personagem selecionado para comandos que suportam o segundo seletor. */
export function actionCharacterId(action: string): string | null {
  return targetOfAction(action)?.characterId || characterBoundOfAction(action)?.characterId || restoreTargetOfAction(action)
}

export const RESTORE_PREFIX = 'character.restore.'
export function targetedRestoreAction(id: string): InputAction {
  return `${RESTORE_PREFIX}${id}` as InputAction
}
export function restoreTargetOfAction(action: string): string | null {
  return new RegExp(String.raw`^character\.restore\.(${ID})$`).exec(action)?.[1] || null
}
export function isTargetAction(action: unknown): boolean {
  return typeof action === 'string' && (targetOfAction(action) !== null || characterBoundOfAction(action) !== null || restoreTargetOfAction(action) !== null)
}
