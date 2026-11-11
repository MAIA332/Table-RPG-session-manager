'use client'

import { focusControllerElement } from './focus'

type Opener = HTMLElement | null
let pointerOrigin: { element: Opener; at: number } = { element: null, at: 0 }
let commandOrigin: { element: Opener; at: number } = { element: null, at: 0 }

function asFocusable(value: EventTarget | null): Opener {
  if (!(value instanceof Element)) return null
  const element = value.closest<HTMLElement>('button,a[href],input,select,textarea,summary,[role="button"],[tabindex]')
  return element || (value instanceof HTMLElement ? value : null)
}
/** Chamado ANTES do clique; também funciona com botões que contêm ícones SVG. */
export function recordControllerPointerOrigin(target: EventTarget | null) {
  pointerOrigin = { element: asFocusable(target), at: performance.now() }
}
/** Chamado antes de despachar uma ação do controle. */
export function recordControllerCommandOrigin(target: EventTarget | null) {
  commandOrigin = { element: asFocusable(target), at: performance.now() }
}
export function captureControllerOpener(): Opener {
  const now = performance.now()
  const recentPointer = now - pointerOrigin.at < 650 && pointerOrigin.element?.isConnected
  if (recentPointer) return pointerOrigin.element
  if (now - commandOrigin.at < 650 && commandOrigin.element?.isConnected) return commandOrigin.element
  return asFocusable(document.activeElement)
}
export function restoreControllerOpener(element: Opener) {
  if (!element) return
  // Aguarda AnimatePresence e outros portais saírem de cena. Não rouba o
  // foco se outra janela está por cima (ex.: Manequim -> Mochila).
  const started = performance.now()
  const tryRestore = () => {
    if (!element.isConnected) return
    const visibleDialogs = [...document.querySelectorAll<HTMLElement>(
      '[aria-modal="true"],[data-controller-layer="active"]',
    )].filter(layer => {
      const rect = layer.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(layer).visibility !== 'hidden'
    })
    const topmost = visibleDialogs.at(-1)
    if (topmost && !topmost.contains(element)) {
      // O diálogo fechado pode ainda estar animando; se outra modal continua
      // aberta, não trazemos um elemento escondido para a frente.
      if (performance.now() - started < 650) window.setTimeout(tryRestore, 80)
      return
    }
    if (!focusControllerElement(element)) element.focus({ preventScroll: true })
  }
  window.setTimeout(tryRestore, 220)
}

