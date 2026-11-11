import { isTargetAction } from './targeted-actions'
import { sanitizeSoundpadBindings, type SoundpadBindings } from './soundpad-commands'
/** Ações semânticas: dispositivos não executam regras de jogo diretamente. */
export type InputAction =
  | 'ui.confirm' | 'ui.back' | 'ui.up' | 'ui.down' | 'ui.left' | 'ui.right'
  | 'ui.previous' | 'ui.next' | 'ui.settings'
  | 'character.sheet' | `character.sheet.${string}` | 'character.inventory' | 'character.restore' | `character.restore.${string}` | 'map.open' | 'map.mode'
  | 'map.select' | 'map.panUp' | 'map.panDown' | 'map.panLeft' | 'map.panRight'
  | 'map.zoomIn' | 'map.zoomOut'
  | 'world.lore' | 'gm.panel' | 'gm.soundpad' | 'gm.bestiary' | 'gallery.open' | 'combat.focus'
  | 'skill.slot1' | 'skill.slot2' | 'skill.slot3' | 'skill.slot4' | 'skill.nextPage'
  | 'skill.ability1' | 'skill.ability2' | 'skill.ability3' | 'skill.ability4'
  | 'gm.scenes' | 'gm.poll' | 'gm.custom' | 'gm.loots' | 'gm.battleGrid'
  | 'gm.crisis' | 'gm.mapImporter' | 'gm.weather' | 'gm.difficulty'
  | 'player.hand' | 'player.notes' | 'player.mixer' | 'player.gallery' | 'player.maps'
  | `panel.${string}`
  | 'special.manager' | `special.manager.${string}` | 'character.training' | 'character.affinities' | 'character.bonds' | 'character.store' | 'character.mannequin' | 'player.theme'
  | `skill.open.${string}` | `special.open.${string}` | `skill.ability1.${string}` | `skill.ability2.${string}` | `skill.ability3.${string}` | `skill.ability4.${string}`
  | 'audio.play' | 'audio.pause' | 'audio.toggle' | 'audio.stop' | 'audio.previous' | 'audio.next'
  | 'voice.join' | 'voice.leave' | 'voice.mute.toggle' | 'voice.deafen.toggle'
  | 'voice.ptt' | 'voice.panel.toggle' | 'voice.chat.toggle' | 'voice.noise.toggle'
  | 'voice.volume.up' | 'voice.volume.down'
  | 'qte.react'

export type GamepadButtonName = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' |
  'VIEW' | 'MENU' | 'LS' | 'RS' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' |
  'RUP' | 'RDOWN' | 'RLEFT' | 'RRIGHT' | `BTN${number}`

export const BUTTON_INDICES: Partial<Record<GamepadButtonName, number>> = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
}

export const DEFAULT_BINDINGS: Readonly<Record<string, InputAction>> = {
  A: 'ui.confirm', B: 'ui.back', X: 'character.inventory', Y: 'character.sheet',
  LB: 'ui.previous', RB: 'ui.next', RT: 'combat.focus', VIEW: 'map.open',
  MENU: 'ui.settings', UP: 'ui.up', DOWN: 'ui.down', LEFT: 'ui.left', RIGHT: 'ui.right',
  'LT+A': 'skill.slot1', 'LT+B': 'skill.slot2', 'LT+X': 'skill.slot3',
  'LT+Y': 'skill.slot4', 'LT+RB': 'skill.nextPage',
  RUP: 'map.panUp', RDOWN: 'map.panDown', RLEFT: 'map.panLeft', RRIGHT: 'map.panRight',
  'LT+UP': 'ui.up', 'LT+DOWN': 'ui.down',
  'LT+LS': 'voice.panel.toggle', 'LT+RS': 'voice.mute.toggle',
} as const

/** Botões além do mapeamento padrão, quando expostos individualmente pelo navegador. */
export const RESERVED_BUTTONS = new Set<string>(['A','B','MENU','LT','UP','DOWN','LEFT','RIGHT','RUP','RDOWN','RLEFT','RRIGHT'])
export function isRemappableButton(button: string): boolean {
  const extra = /^BTN([1-9]\d?)$/.exec(button)
  return (REMAPPABLE_BUTTONS as readonly string[]).includes(button) || !!(extra && Number(extra[1]) >= 16 && Number(extra[1]) < 64)
}
export function detectedButtonNames(count: number): GamepadButtonName[] {
  const standard: GamepadButtonName[] = ['A','B','X','Y','LB','RB','LT','RT','VIEW','MENU','LS','RS','UP','DOWN','LEFT','RIGHT']
  return [...standard.slice(0, Math.min(count,16)), ...Array.from({length:Math.max(0,Math.min(64,count)-16)},(_,index)=>`BTN${index+16}` as GamepadButtonName)]
}
export const REPEATABLE_ACTIONS = new Set<InputAction>([
  'ui.up', 'ui.down', 'ui.left', 'ui.right',
  'map.panUp', 'map.panDown', 'map.panLeft', 'map.panRight',
])
export const SETTABLE_COMMANDS: readonly InputAction[] = [
  'skill.ability1', 'skill.ability2', 'skill.ability3', 'skill.ability4',
  'gm.scenes', 'gm.poll', 'gm.custom', 'gm.loots', 'gm.battleGrid',
  'gm.crisis', 'gm.mapImporter', 'gm.weather', 'gm.difficulty',
  'player.hand', 'player.notes', 'player.mixer', 'player.gallery', 'player.maps',
  'audio.play', 'audio.pause', 'audio.toggle', 'audio.stop', 'audio.previous', 'audio.next',
  'voice.join', 'voice.leave', 'voice.mute.toggle', 'voice.deafen.toggle', 'voice.ptt',
  'voice.panel.toggle', 'voice.chat.toggle', 'voice.noise.toggle', 'voice.volume.up', 'voice.volume.down',
  'character.sheet', 'character.inventory', 'character.restore', 'map.open', 'world.lore',
  'special.manager', 'character.training', 'character.affinities', 'character.bonds', 'character.store', 'character.mannequin', 'player.theme',
  'combat.focus', 'gm.panel', 'gm.soundpad', 'gm.bestiary', 'gallery.open', 'ui.settings',
]

/** A/B, MENU e D-pad são reservados para manter navegação e saída sempre acessíveis. */
export const REMAPPABLE_BUTTONS = ['X', 'Y', 'LB', 'RB', 'RT', 'VIEW', 'LS', 'RS'] as const
export const REMAPPABLE_LT_BUTTONS = ['LT+LS', 'LT+RS'] as const
export const MAX_SKILL_PAGES = 5
export type RemappableButton = typeof REMAPPABLE_BUTTONS[number]
export const BASE_COMMANDS: readonly InputAction[] = [
  'ui.previous', 'ui.next', 'character.sheet', 'character.inventory', 'character.restore', 'map.open',
  'gallery.open', 'gm.bestiary', 'world.lore', 'combat.focus', 'gm.panel', 'gm.soundpad',
  'ui.settings', 'special.manager', 'character.training', 'character.affinities', 'character.bonds', 'character.store', 'character.mannequin', 'player.theme', 'gm.scenes', 'gm.poll', 'gm.custom', 'gm.loots', 'gm.battleGrid',
  'gm.crisis', 'gm.mapImporter', 'gm.weather', 'gm.difficulty',
  'player.hand', 'player.notes', 'player.mixer', 'player.gallery', 'player.maps',
  'audio.play', 'audio.pause', 'audio.toggle', 'audio.stop', 'audio.previous', 'audio.next',
  'voice.join', 'voice.leave', 'voice.mute.toggle', 'voice.deafen.toggle', 'voice.ptt',
  'voice.panel.toggle', 'voice.chat.toggle', 'voice.noise.toggle', 'voice.volume.up', 'voice.volume.down',
]
export function getBindings(settings: InputSettings): Readonly<Record<string, InputAction>> {
  return { ...DEFAULT_BINDINGS, ...settings.buttonBindings }
}

export type InputSettings = {
  preference: 'auto' | 'controller' | 'desktop'
  deadzone: number
  repeatMs: number
  vibration: boolean
  soundFocus: boolean
  soundClick: boolean
  tvScale: boolean
  slots: InputAction[][]
  // Includes direct buttons and dedicated LT+L3/LT+R3 chords.
  buttonBindings: Partial<Record<GamepadButtonName | `LT+${GamepadButtonName}`, InputAction>>
  soundpadBindings: SoundpadBindings
}
export const DEFAULT_SETTINGS: InputSettings = {
  preference: 'auto', deadzone: 0.65, repeatMs: 235, vibration: true,
  soundFocus: true, soundClick: true,
  tvScale: true,
  slots: [
    ['skill.ability1', 'skill.ability2', 'skill.ability3', 'skill.ability4'],
    ['world.lore', 'character.inventory', 'gm.soundpad', 'gm.panel'],
  ],
  buttonBindings: {},
  soundpadBindings: sanitizeSoundpadBindings(undefined),
}
export const STORAGE_KEY = 'otms-controller-settings-v1'
export function sanitizeSettings(raw: unknown): InputSettings {
  const value = raw && typeof raw === 'object' ? raw as Partial<InputSettings> : {}
  const safeSlots = Array.isArray(value.slots) && value.slots.length >= 1 && value.slots.length <= MAX_SKILL_PAGES && value.slots.every(
    page => Array.isArray(page) && page.length === 4 && page.every(action => (SETTABLE_COMMANDS.includes(action) || isTargetAction(action)) || /^panel\.[a-z0-9-]+\.\d+$/.test(action)),
  ) ? value.slots : DEFAULT_SETTINGS.slots
  return {
    preference: ['auto', 'controller', 'desktop'].includes(String(value.preference)) ? value.preference! : 'auto',
    deadzone: typeof value.deadzone === 'number' && Number.isFinite(value.deadzone)
      ? Math.min(0.90, Math.max(0.12, value.deadzone)) : DEFAULT_SETTINGS.deadzone,
    repeatMs: typeof value.repeatMs === 'number' && Number.isFinite(value.repeatMs)
      ? Math.min(400, Math.max(85, value.repeatMs)) : DEFAULT_SETTINGS.repeatMs,
    vibration: value.vibration !== false,
    soundFocus: value.soundFocus !== false,
    soundClick: value.soundClick !== false,
    tvScale: value.tvScale !== false,
    slots: safeSlots.map(page => [...page]),
    soundpadBindings: sanitizeSoundpadBindings(value.soundpadBindings),
    buttonBindings: Object.fromEntries(Object.entries(value.buttonBindings ?? {})
      .filter(([button, action]) => (isRemappableButton(button) || (REMAPPABLE_LT_BUTTONS as readonly string[]).includes(button)) &&
        (BASE_COMMANDS.includes(action as InputAction) || isTargetAction(action) || (typeof action==='string' && /^panel\.[a-z0-9-]+\.\d+$/.test(action))))) as InputSettings['buttonBindings'],
  }
}

/** LT atua como modificador; combinacões substituem o comando simples. */
export function actionForButton(button: GamepadButtonName, pressed: ReadonlySet<GamepadButtonName>,
  bindings: Readonly<Record<string, InputAction>> = DEFAULT_BINDINGS): InputAction | undefined {
  if (button === 'LT') return undefined
  const chord = pressed.has('LT') ? bindings[`LT+${button}`] : undefined
  // L3/R3 have independent modifier assignments. Do not trigger their unmodified
  // shortcut while LT is held and the alternate shortcut is unassigned.
  if (pressed.has('LT') && (button === 'LS' || button === 'RS')) return chord
  return chord || bindings[button]
}

/** Borda de subida + repetição limitada; ao soltar LT não dispara B/A/XY. */
export function collectActions(
  pressed: ReadonlySet<GamepadButtonName>, previous: ReadonlySet<GamepadButtonName>,
  now: number, lastFire: Map<string, number>, repeatMs = 235,
  bindings: Readonly<Record<string, InputAction>> = DEFAULT_BINDINGS,
): InputAction[] {
  const actions: InputAction[] = []
  for (const button of pressed) {
    const action = actionForButton(button, pressed, bindings)
    if (!action) continue
    const key = pressed.has('LT') ? `LT+${button}` : button
    const wasPressedAsSameChord = previous.has(button) && (previous.has('LT') === pressed.has('LT'))
    const repeat = REPEATABLE_ACTIONS.has(action) && now - (lastFire.get(key) ?? now) >= repeatMs
    // Trocar o estado do modificador com botão já pressionado não dispara comando fantasma.
    if ((!previous.has(button) || (wasPressedAsSameChord && repeat))) {
      actions.push(action)
      lastFire.set(key, now)
    }
  }
  return actions
}

export function gamepadButtons(pad: Pick<Gamepad, 'buttons' | 'axes'>, deadzone: number): Set<GamepadButtonName> {
  const result = new Set<GamepadButtonName>()
  for (const [name, index] of Object.entries(BUTTON_INDICES)) {
    if (index !== undefined && (pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) >= 0.55))
      result.add(name as GamepadButtonName)
  }
  for (let index=16; index<Math.min(64,pad.buttons.length); index++) {
    if (pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) >= 0.55) result.add(`BTN${index}` as GamepadButtonName)
  }
  // Analógico esquerdo navega; o eixo direito é rolado continuamente pelo Provider
  // (e serve como pan do mapa quando não há painel rolável).
  if ((pad.axes[0] ?? 0) < -deadzone) result.add('LEFT')
  if ((pad.axes[0] ?? 0) > deadzone) result.add('RIGHT')
  if ((pad.axes[1] ?? 0) < -deadzone) result.add('UP')
  if ((pad.axes[1] ?? 0) > deadzone) result.add('DOWN')
  if ((pad.axes[2] ?? 0) < -deadzone) result.add('RLEFT')
  if ((pad.axes[2] ?? 0) > deadzone) result.add('RRIGHT')
  if ((pad.axes[3] ?? 0) < -deadzone) result.add('RUP')
  if ((pad.axes[3] ?? 0) > deadzone) result.add('RDOWN')
  return result
}
