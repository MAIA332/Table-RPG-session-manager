import type { Character } from "./types"
import { assertInventoryChange, type ItemWeight } from "./inventory-weight"
import { applyInventoryRules } from "./character"
import { assertWornLimits } from "./item-mechanics"
import { EQUIPMENT } from "./game-data"
import { activeClassBookModifiers } from "./class-books"

type InventoryDatabase = {
  characters: Map<string, Character>
  campaignState: Map<string, Record<string, unknown>>
}

export type CatalogItemWeight = ItemWeight & { id: string }

function hasCatalogId(value: unknown): value is CatalogItemWeight {
  return (
    typeof value === "object" && value !== null && "id" in value &&
    typeof value.id === "string" && value.id.trim().length > 0
  )
}

export function campaignItemCatalog(
  db: InventoryDatabase,
  campaignId: string,
): CatalogItemWeight[] {
  const value = db.campaignState.get(campaignId)?.customEquipment
  return Array.isArray(value) ? value.filter(hasCatalogId) : []
}

function removeExpiredMagicEffects(character: Character, now: number): Character {
  const withModifiers = character as Character & { customModifiers?: unknown }
  const modifiers = withModifiers.customModifiers
  if (!Array.isArray(modifiers)) return character
  const retained = activeClassBookModifiers(modifiers, now)
  if (retained.length === modifiers.length) return character
  return {
    ...character,
    customModifiers: retained,
    updatedAt: Math.max(Date.now(), Number(character.updatedAt || 0) + 1),
  } as Character
}

export function enforceInventoryDatabase(
  db: InventoryDatabase,
  previous?: InventoryDatabase,
) {
  for (const [id, character] of db.characters) {
    const catalog = campaignItemCatalog(db, character.campaignId)
    assertInventoryChange(previous?.characters.get(id), character, catalog)
    const completeCatalog = [
      ...catalog,
      ...EQUIPMENT.filter(base => !catalog.some(item => item.id === base.id)),
    ]
    assertWornLimits(character, completeCatalog)
  }

  const now = Date.now()
  for (const [id, character] of db.characters) {
    db.characters.set(
      id,
      applyInventoryRules(
        removeExpiredMagicEffects(character, now),
        campaignItemCatalog(db, character.campaignId),
      ),
    )
  }
}
