import { createClientId } from "@/lib/client-id"
/** Identificador operacional, NÃO é um token de autorização. O servidor valida o GM. */
let instanceCounter = 0
export function createCombatInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return createClientId()
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const values = new Uint32Array(4)
    globalThis.crypto.getRandomValues(values)
    return `combat-${Array.from(values, value => value.toString(16).padStart(8, "0")).join("")}`
  }
  // Apenas para IDs não secretos em navegadores HTTP sem Web Crypto.
  // Unicidade reforçada pelo contador; a API rejeita instanceId duplicado.
  instanceCounter += 1
  return `combat-${Date.now().toString(36)}-${instanceCounter.toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
