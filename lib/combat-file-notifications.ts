import "server-only"

type Listener = () => void

type Notifications = {
  listeners: Set<Listener>
}

const shared = globalThis as unknown as {
  __combatStorageNotifications?: Notifications
}

const state = (shared.__combatStorageNotifications ??= {
  listeners: new Set(),
})

/**
 * Compatibilidade com o nome antigo do módulo.
 * A aplicação já não observa vtt-database.json: o disparo acontece após uma
 * gravação confirmada no MongoDB.
 */
export function subscribeCombatFile(listener: Listener): () => void {
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

export function notifyCombatStorageChanged(): void {
  for (const listener of state.listeners) {
    try {
      listener()
    } catch (error) {
      console.error("[combat notifications]", error)
    }
  }
}
