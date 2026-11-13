/** Leitura independente de gamepads da arena; não altera o perfil global do RPG. */
import type { ArenaInput } from './model'

/** Estrutura reduzida para permitir testes sem navegador. */
export type ArenaPad = {
  axes: readonly number[]
  buttons: readonly { pressed: boolean; value?: number }[]
}

const held = (pad: ArenaPad, index: number) => pad.buttons[index]?.pressed === true || (pad.buttons[index]?.value ?? 0) > 0.65
const axis = (pad: ArenaPad, index: number) => pad.axes[index] || 0
const DEADZONE = 0.35

export function readArenaPadInput(pad: ArenaPad): ArenaInput {
  return {
    left: axis(pad, 0) < -DEADZONE || held(pad, 14),
    right: axis(pad, 0) > DEADZONE || held(pad, 15),
    jump: axis(pad,1)<-DEADZONE || held(pad,12),
    light: held(pad, 2),
    heavy: held(pad, 3),
    kick: held(pad, 0),
    lowKick: held(pad, 1),
    special: held(pad, 5),
    special2: held(pad, 6),
    special3: held(pad, 7),
    guard: false,
    dodge: held(pad, 4),
    crouch: axis(pad, 1) > DEADZONE || held(pad, 13),
  }
}

export type ArenaPadMenu = { direction: -2 | -1 | 0 | 1 | 2; confirm: boolean; back: boolean; start: boolean }
export function readArenaPadMenu(pad: ArenaPad): ArenaPadMenu {
  const x = axis(pad, 0)
  const y = axis(pad, 1)
  // Direcional, analógico esquerdo e ombros: todos navegam na seleção.
  const horizontal = (held(pad, 15) || held(pad, 5) || x > 0.5 ? 1 : 0) -
    (held(pad, 14) || held(pad, 4) || x < -0.5 ? 1 : 0)
  const vertical = (held(pad, 13) || y > 0.55 ? 1 : 0) -
    (held(pad, 12) || y < -0.55 ? 1 : 0)
  return {
    direction: horizontal > 0 ? 1 : horizontal < 0 ? -1 : vertical > 0 ? 2 : vertical < 0 ? -2 : 0,
    confirm: held(pad, 0),
    back: held(pad, 1),
    start: held(pad, 9),
  }
}

/** Repetição de navegação com atraso inicial, independente de FPS e do React. */
export type MenuRepeat = { direction: number; nextAt: number }
export function menuRepeatStep(previous: MenuRepeat, direction: number, now: number): {next: MenuRepeat; move: number} {
  if (!direction) return {next: {direction: 0, nextAt: 0}, move: 0}
  if (direction !== previous.direction) return {next: {direction, nextAt: now + 280}, move: direction}
  if (now >= previous.nextAt) return {next: {direction, nextAt: now + 140}, move: direction}
  return {next: previous, move: 0}
}

export function wrapSelection(index: number, direction: number, length: number, columns: number): number {
  if (length <= 0) return 0
  const delta = Math.abs(direction) === 2 ? Math.sign(direction) * columns : direction
  return ((index + delta) % length + length) % length
}
