import type { InputAction } from './actions'

/** IDs estáveis de habilidades/golpes, sem nomes ou permissões armazenadas no atalho. */
export type ControllerTarget = { id: string; name: string }
export const TARGETED_SKILL = 'skill.open.'
export const TARGETED_SPECIAL = 'special.open.'
export function targetedAction(kind: 'skill' | 'special', id: string): InputAction {
  return `${kind === 'skill' ? TARGETED_SKILL : TARGETED_SPECIAL}${id}` as InputAction
}
export function targetOfAction(action: string): { kind: 'skill' | 'special'; id: string } | null {
  const match = /^(skill|special)\.open\.([a-zA-Z0-9_-]{1,100})$/.exec(action)
  return match ? {kind: match[1] as 'skill' | 'special', id: match[2]} : null
}
/** Personagem escolhido no editor de atalhos; a API valida a posse ao executar. */
export const RESTORE_PREFIX = 'character.restore.'
export function targetedRestoreAction(id: string): InputAction {
  return `${RESTORE_PREFIX}${id}` as InputAction
}
export function restoreTargetOfAction(action: string): string | null {
  return /^character\.restore\.([a-zA-Z0-9_-]{1,100})$/.exec(action)?.[1] || null
}
export function isTargetAction(action: unknown): boolean {
  return typeof action === 'string' && (targetOfAction(action) !== null || restoreTargetOfAction(action) !== null)
}

