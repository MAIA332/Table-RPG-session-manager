import "server-only"
import fs from "node:fs"
import path from "node:path"

const dbPath = process.env.VTT_DB_FILE
  ? path.resolve(process.env.VTT_DB_FILE)
  : path.join(process.cwd(), "vtt-database.json")
const parent = path.dirname(dbPath)
const basename = path.basename(dbPath)
type Listener = () => void
type Notifications = {
  path: string
  listeners: Set<Listener>
  watcher: fs.FSWatcher | null
  fallback: ReturnType<typeof setInterval> | null
  debounce: ReturnType<typeof setTimeout> | null
  signature: string
}
const shared = globalThis as unknown as {
  __combatFileNotifications?: Notifications
}
const state = (shared.__combatFileNotifications ??= {
  path: dbPath,
  listeners: new Set(),
  watcher: null,
  fallback: null,
  debounce: null,
  signature: "",
})
if (state.path !== dbPath)
  throw new Error("Reinicie o processo após mudar VTT_DB_FILE")

function signature() {
  try {
    const stat = fs.statSync(dbPath, { bigint: true })
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing"
    throw error
  }
}
function notify() {
  if (state.debounce) return
  state.debounce = setTimeout(() => {
    state.debounce = null
    for (const fn of state.listeners) {
      try {
        fn()
      } catch (error) {
        console.error("[combat notifications]", error)
      }
    }
  }, 25)
  state.debounce.unref?.()
}
function openWatcher() {
  if (state.watcher || !state.listeners.size) return
  try {
    // Watch the directory: store.ts replaces the database by rename, changing its inode.
    const watcher = fs.watch(
      parent,
      { persistent: false },
      (_event, filename) => {
        if (filename === null || String(filename) === basename) {
          try {
            state.signature = signature()
          } catch {
            /* fallback retries */
          }
          notify()
        }
      },
    )
    watcher.on("error", () => {
      watcher.close()
      if (state.watcher === watcher) state.watcher = null
    })
    state.watcher = watcher
  } catch {
    /* Directory may be unavailable; the shared metadata check retries. */
  }
}
export function subscribeCombatFile(listener: Listener): () => void {
  state.listeners.add(listener)
  if (!state.fallback) {
    try {
      state.signature = signature()
    } catch {
      state.signature = ""
    }
    state.fallback = setInterval(() => {
      openWatcher()
      try {
        const next = signature()
        if (next !== state.signature) {
          state.signature = next
          notify()
        }
      } catch {
        /* No DB read and no lock; retry on the next check. */
      }
    }, 2000)
    state.fallback.unref?.()
  }
  openWatcher()
  return () => {
    state.listeners.delete(listener)
    if (state.listeners.size) return
    state.watcher?.close()
    state.watcher = null
    if (state.fallback) clearInterval(state.fallback)
    if (state.debounce) clearTimeout(state.debounce)
    state.fallback = null
    state.debounce = null
  }
}
