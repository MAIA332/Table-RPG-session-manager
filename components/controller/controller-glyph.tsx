import type { GamepadButtonName } from '@/lib/input/actions'
export function ControllerGlyph({ button, small = false }: {button: GamepadButtonName | `LT+${GamepadButtonName}` | 'ESC'; small?: boolean}) {
  return <kbd aria-label={`Botão ${button === 'LS' ? 'L3' : button === 'RS' ? 'R3' : button === 'LT+LS' ? 'LT mais L3' : button === 'LT+RS' ? 'LT mais R3' : button}`} className={`otms-pad-glyph otms-pad-${button.toLowerCase()}${small ? ' otms-pad-glyph-small' : ''}`}>{button === 'LS' ? 'L3' : button === 'RS' ? 'R3' : button === 'LT+LS' ? 'LT+L3' : button === 'LT+RS' ? 'LT+R3' : button}</kbd>
}
