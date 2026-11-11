/**
 * Contextual right-stick axis routing.
 * A mounted immersive workspace may consume the axes before the provider
 * applies its default page scroll or map-pan actions. Mouse/wheel are untouched.
 */
export type RightStickHandler = (x: number, y: number, elapsedMs: number) => boolean
const listeners = new Map<number, { priority: number; handle: RightStickHandler }>()
let id = 0

export function registerRightStickHandler(handle: RightStickHandler, priority = 0): () => void {
  const key = ++id
  listeners.set(key, {priority, handle})
  return () => { listeners.delete(key) }
}

export function dispatchRightStick(x: number, y: number, elapsedMs: number): boolean {
  for (const { handle } of [...listeners.values()].sort((a, b) => b.priority - a.priority)) {
    if (handle(x, y, elapsedMs)) return true
  }
  return false
}
