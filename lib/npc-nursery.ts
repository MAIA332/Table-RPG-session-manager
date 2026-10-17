/** Pure, browser/server compatible operations for nursery records. */
export interface NurseryIdentity {
  id: string
  name: string
  avatarUrl?: string
  origin?: string
  identity?: string
  sourceCharacterId?: string
  linkedCharacterIds?: string[]
}

const clean = (text: unknown) => String(text ?? "").trim().toLocaleLowerCase("pt-BR")
const safeIds = (ids: unknown): string[] => Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
const uniqueIds = (ids: (string | undefined)[]) =>
  [...new Set(ids.filter((id): id is string => typeof id === "string" && !!id.trim()))]

/**
 * First use exact references. Then recognize pre-migration NPCs by their
 * appearance and identity; never merge two named but visually different NPCs.
 */
export function sameNurseryCharacter(a: NurseryIdentity, b: NurseryIdentity): boolean {
  if (a.id === b.id) return true
  const aIds = uniqueIds([a.sourceCharacterId, ...safeIds(a.linkedCharacterIds)])
  const bIds = uniqueIds([b.sourceCharacterId, ...safeIds(b.linkedCharacterIds)])
  if (aIds.includes(b.id) || bIds.includes(a.id) || aIds.some(id => bIds.includes(id))) return true

  if (!clean(a.name) || clean(a.name) !== clean(b.name)) return false
  const aAvatar = clean(a.avatarUrl)
  const bAvatar = clean(b.avatarUrl)
  if (aAvatar || bAvatar) return !!aAvatar && aAvatar === bAvatar
  const aIdentity = clean(a.identity), bIdentity = clean(b.identity)
  const aOrigin = clean(a.origin), bOrigin = clean(b.origin)
  // Legacy NPCs with no portrait use at least one additional identifying field.
  return (!!aIdentity && aIdentity === bIdentity) || (!!aOrigin && aOrigin === bOrigin)
}

export function upsertArchivedNPC<T extends NurseryIdentity>(records: readonly T[], archived: T): T[] {
  const duplicates = records.filter(record => sameNurseryCharacter(record, archived))
  const keeper = duplicates[0]
  const linked = uniqueIds([
    archived.sourceCharacterId, ...safeIds(archived.linkedCharacterIds),
    ...duplicates.flatMap(record => [record.sourceCharacterId, ...safeIds(record.linkedCharacterIds)]),
  ])
  const merged = {
    ...keeper,
    ...archived,
    // Preserve the existing identity in the nursery; never create a new card.
    id: keeper?.id ?? archived.id,
    sourceCharacterId: keeper?.sourceCharacterId ?? archived.sourceCharacterId,
    linkedCharacterIds: linked,
  } as T
  return [merged, ...records.filter(record => !duplicates.includes(record))]
}

export function upsertNurseryNPC<T extends NurseryIdentity>(records: readonly T[], npc: T): T[] {
  const existing = records.find(record => record.id === npc.id)
  const updated = existing
    ? ({ ...existing, ...npc, id: existing.id,
      sourceCharacterId: existing.sourceCharacterId ?? npc.sourceCharacterId,
      linkedCharacterIds: uniqueIds([...safeIds(existing.linkedCharacterIds), ...safeIds(npc.linkedCharacterIds)]),
    } as T)
    : npc
  return [updated, ...records.filter(record => record.id !== npc.id)]
}

export function linkSpawnedCharacter<T extends NurseryIdentity>(records: readonly T[], npcId: string, characterId: string): T[] {
  return records.map(record => record.id === npcId
    ? ({ ...record, linkedCharacterIds: uniqueIds([...safeIds(record.linkedCharacterIds), characterId]) } as T)
    : record)
}
