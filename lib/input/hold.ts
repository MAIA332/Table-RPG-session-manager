import type { InputAction } from './actions'

/** Complemento ao dispatcher: só transições reais de pressionar/soltar. */
type HoldHandler = (action: InputAction, held: boolean) => void
const handlers = new Set<HoldHandler>()
export function registerInputHoldHandler(handler: HoldHandler): () => void {
  handlers.add(handler)
  return () => { handlers.delete(handler) }
}
export function dispatchInputHoldAction(action: InputAction, held: boolean): void {
  for (const handler of handlers) handler(action, held)
}
