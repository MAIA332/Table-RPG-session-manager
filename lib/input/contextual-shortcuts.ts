import type { GamepadButtonName, InputAction } from './actions'

/**
 * Overrides de botões FÍSICOS, não do perfil de comandos do jogador.
 * A camada proprietária só existe enquanto o painel correspondente estiver
 * aberto; ao fechá-lo as preferências mapeadas voltam a valer imediatamente.
 */
export type ContextualScope = 'bestiary' | 'combat' | 'gm' | null

const BESTIARY_BUTTONS: Partial<Record<GamepadButtonName, InputAction>> = {
  RB: 'bestiary.spawn',
  LB: 'bestiary.edit',
}
const COMBAT_BUTTONS: Partial<Record<GamepadButtonName, InputAction>> = {
  LS: 'combat.toggle',
  RS: 'combat.creature.remove',
}

export function contextualShortcut(button: GamepadButtonName, scope: ContextualScope, hasCreature = true): InputAction | undefined {
  if (scope === 'gm') return button === 'LB' ? 'gm.edit' : undefined
  if (scope === 'bestiary') return BESTIARY_BUTTONS[button]
  if (scope === 'combat') return button === 'RS' && !hasCreature ? undefined : COMBAT_BUTTONS[button]
  return undefined
}

/** Remove só o comando originado pelo botão físico substituído. */
export function replaceContextualActions(
  actions: InputAction[],
  pressed: ReadonlySet<GamepadButtonName>,
  newlyPressed: ReadonlySet<GamepadButtonName>,
  scope: ContextualScope,
  hasCreature: boolean,
  mappedAction: (button: GamepadButtonName) => InputAction | undefined,
): InputAction[] {
  if (!scope || pressed.has('LT')) return actions
  const next = [...actions]
  const buttons: GamepadButtonName[] = scope === 'bestiary' ? ['LB', 'RB'] : scope === 'gm' ? ['LB'] : ['LS', 'RS']
  for (const button of buttons) {
    const replacement = contextualShortcut(button, scope, hasCreature)
    if (!replacement || !pressed.has(button)) continue
    const original = mappedAction(button)
    if (original) {
      const index = next.indexOf(original)
      if (index >= 0) next.splice(index, 1)
    }
    // Apenas na borda de pressão: sem repetir invocações/remoções ao segurar.
    if (newlyPressed.has(button)) next.push(replacement)
  }
  return next
}
