import type { Character } from "./types"
import { assertInventoryChange, type ItemWeight } from "./inventory-weight"
import { applyInventoryRules } from "./character"
import { assertWornLimits, isItemActionRuntimeMarker } from "./item-mechanics"
import { EQUIPMENT } from "./game-data"
import { activeClassBookModifiers } from "./class-books"

type InventoryDatabase = {
  characters: Map<string, Character>
  campaignState: Map<string, Record<string, unknown>>
}
export type CatalogItemWeight = ItemWeight & { id: string }
function hasCatalogId(value: unknown): value is CatalogItemWeight {
  return typeof value === "object" && value !== null && "id" in value &&
    typeof value.id === "string" && value.id.trim().length > 0
}
export function campaignItemCatalog(db: InventoryDatabase, campaignId: string): CatalogItemWeight[] {
  const value = db.campaignState.get(campaignId)?.customEquipment
  return Array.isArray(value) ? value.filter(hasCatalogId) : []
}

function reconcileActionRuntime(character: Character, previous: Character | undefined, now: number): Character {
  const current = character as Character & { customModifiers?: any[] }
  const old = previous as (Character & { customModifiers?: any[] }) | undefined
  const currentMods = Array.isArray(current.customModifiers) ? current.customModifiers : []
  const older = Array.isArray(old?.customModifiers) ? old.customModifiers : []
  const retained = [...currentMods]
  // PATCHs antigos enviam a lista inteira de modificadores (às vezes defasada).
  // Preserva os registros internos de cooldown/inversão quando não foram alterados,
  // mas não restaura efeitos já expirados nem de itens que saíram da mochila.
  for (const mod of older) {
    if (!isItemActionRuntimeMarker(mod) || retained.some(entry => entry.id === mod.id)) continue
    if (typeof mod.expiresAt === "number" && mod.expiresAt <= now) continue
    if (mod.itemId && !character.equipment.includes(mod.itemId)) continue
    retained.push(mod)
  }
  const clean = activeClassBookModifiers(retained, now).filter(mod =>
    !(isItemActionRuntimeMarker(mod) && typeof mod.expiresAt === "number" && mod.expiresAt <= now) &&
    !(isItemActionRuntimeMarker(mod) && mod.itemId && !character.equipment.includes(mod.itemId))
  )
  if (JSON.stringify(clean) === JSON.stringify(currentMods)) return character
  return { ...character, customModifiers: clean, updatedAt: Math.max(now, Number(character.updatedAt || 0) + 1) } as Character
}

export function enforceInventoryDatabase(db: InventoryDatabase, previous?: InventoryDatabase) {
  for (const [id, character] of db.characters) {
    const catalog = campaignItemCatalog(db, character.campaignId)
    assertInventoryChange(previous?.characters.get(id), character, catalog)
    const completeCatalog = [...catalog, ...EQUIPMENT.filter(base => !catalog.some(item => item.id === base.id))]
    assertWornLimits(character, completeCatalog)
  }
  const now = Date.now()
  for (const [id, character] of db.characters) {
    db.characters.set(id, applyInventoryRules(
      reconcileActionRuntime(character, previous?.characters.get(id), now),
      campaignItemCatalog(db, character.campaignId),
    ))
  }
}
