// These are the persistent maps listed in the application's current store.ts.
export const COLLECTIONS = Object.freeze([
  "users", "sessions", "campaigns", "characters", "characterTombstones",
  "maps", "lore", "combatSessions", "campaignState", "personalNotes",
])

export async function ensureCollections(db, log = console.log) {
  const existing = new Map((await db.listCollections({}, { nameOnly: true }).toArray())
    .map(collection => [collection.name, collection.type]))
  for (const name of COLLECTIONS) {
    if (existing.has(name)) {
      if (existing.get(name) !== "collection") {
        throw new Error(`O namespace ${name} existe, mas não é uma coleção comum.`)
      }
      log(`[MongoDB] Coleção disponível: ${name}`)
      continue
    }
    try {
      await db.createCollection(name)
      log(`[MongoDB] Coleção criada: ${name}`)
    } catch (error) {
      // Another startup may have created the same collection concurrently.
      if (error?.code !== 48 && error?.codeName !== "NamespaceExists") throw error
      const current = await db.listCollections({ name }, { nameOnly: true }).toArray()
      if (current[0]?.type !== "collection") throw error
      log(`[MongoDB] Coleção disponível: ${name}`)
    }
  }
}
