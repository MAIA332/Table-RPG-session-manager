/** Eventos Escape sintéticos podem nascer em Document/Window (sem closest).
 * Só inspecionamos a árvore quando o target é realmente um Element. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element &&
    !!target.closest('input,textarea,select,[contenteditable="true"]')
}
