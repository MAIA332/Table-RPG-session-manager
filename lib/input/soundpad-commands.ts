import type { GamepadButtonName, InputAction, InputSettings } from './actions'

/** Transport controls never alter a campaign's default bindings. */
export const SOUND_ACTIONS = [
  'audio.play', 'audio.pause', 'audio.toggle', 'audio.stop',
  'audio.previous', 'audio.next',
] as const satisfies readonly InputAction[]
export type SoundAction = typeof SOUND_ACTIONS[number]

export const SOUND_ACTION_LABELS: Record<SoundAction, string> = {
  'audio.play': 'Reproduzir / retomar',
  'audio.pause': 'Pausar',
  'audio.toggle': 'Play / Pause',
  'audio.stop': 'Parar áudio',
  'audio.previous': 'Faixa anterior',
  'audio.next': 'Próxima faixa',
}

/** Only while the fullscreen studio is open; A/B/D-pad/MENU stay reserved. */
export const DEFAULT_SOUNDPAD_BINDINGS: Readonly<Record<string, SoundAction>> = {
  X: 'audio.toggle', Y: 'audio.stop', LB: 'audio.previous', RB: 'audio.next',
  RT: 'audio.play', VIEW: 'audio.pause',
}
export const SOUNDPAD_BUTTONS: readonly string[] = ['X', 'Y', 'LB', 'RB', 'RT', 'VIEW', 'LS', 'RS', 'LT+LS', 'LT+RS']
export type SoundpadBindings = Partial<Record<GamepadButtonName | `LT+${GamepadButtonName}`, SoundAction | ''>>

const RESERVED = new Set(['A', 'B', 'MENU', 'LT', 'UP', 'DOWN', 'LEFT', 'RIGHT'])
export function isSoundpadBindingKey(value: string): boolean {
  if (RESERVED.has(value)) return false
  if (SOUNDPAD_BUTTONS.includes(value)) return true
  return /^BTN(?:1[6-9]|[2-5][0-9]|6[0-3])$/.test(value)
}

export function sanitizeSoundpadBindings(raw: unknown): SoundpadBindings {
  const overrides = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const result: Record<string, SoundAction | ''> = { ...DEFAULT_SOUNDPAD_BINDINGS }
  for (const [button, action] of Object.entries(overrides)) {
    if (isSoundpadBindingKey(button) && (action === '' || (SOUND_ACTIONS as readonly string[]).includes(String(action)))) {
      result[button] = action as SoundAction | ''
    }
  }
  return result as SoundpadBindings
}

/** Build an isolated mapping: unrelated campaign shortcuts never leak into Soundpad. */
export function soundpadRuntimeBindings(profile: SoundpadBindings): Readonly<Record<string, InputAction>> {
  const bindings: Record<string, InputAction> = {
    A: 'ui.confirm', B: 'ui.back', MENU: 'ui.settings',
    UP: 'ui.up', DOWN: 'ui.down', LEFT: 'ui.left', RIGHT: 'ui.right',
  }
  for (const [button, action] of Object.entries(sanitizeSoundpadBindings(profile))) {
    if (action) bindings[button] = action
  }
  return bindings
}

const HINT_ORDER = ['audio.play', 'audio.pause', 'audio.toggle', 'audio.stop', 'audio.previous', 'audio.next'] as const
/** Only show the commands the player actually configured for the floating player. */
export function floatingAudioHints(settings: Pick<InputSettings, 'buttonBindings' | 'slots'>, page: number) {
  const matches: Array<{action: SoundAction; button: string}> = []
  for (const [button, action] of Object.entries(settings.buttonBindings)) {
    if (action && (SOUND_ACTIONS as readonly string[]).includes(action)) {
      matches.push({ button, action: action as SoundAction })
    }
  }
  for (let i=0; i<4; i++) {
    const action=settings.slots[page]?.[i]
    if (action && (SOUND_ACTIONS as readonly string[]).includes(action)) {
      matches.push({ button: `LT+${['A','B','X','Y'][i]}`, action: action as SoundAction })
    }
  }
  return matches.sort((a,b) => HINT_ORDER.indexOf(a.action) - HINT_ORDER.indexOf(b.action))
}
