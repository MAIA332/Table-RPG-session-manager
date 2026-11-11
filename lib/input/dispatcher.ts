import type { InputAction } from './actions'

export type InputHandler = (action: InputAction) => boolean | void
const handlers = new Map<number, { priority: number; handler: InputHandler }>()
let sequence = 0

/** Prioridade maior primeiro; retornar true impede execução por escopos abaixo. */
export function registerInputHandler(handler: InputHandler, priority = 0): () => void {
  const id = ++sequence
  handlers.set(id, { handler, priority })
  return () => { handlers.delete(id) }
}
export function dispatchInputAction(action: InputAction): boolean {
  const entries = [...handlers.values()].sort((a, b) => b.priority - a.priority)
  for (const { handler } of entries) {
    if (handler(action) === true) return true
  }
  return false
}
