import type { Character } from "./types"
import { assertInventoryChange, type ItemWeight } from "./inventory-weight"
import { applyInventoryRules } from "./character"
type InventoryDatabase = {
  characters: Map<string, Character>
  campaignState: Map<string, Record<string, unknown>>
}
export function campaignItemCatalog(
  db: InventoryDatabase,
  campaignId: string,
): ItemWeight[] {
  const value = db.campaignState.get(campaignId)?.customEquipment
  return Array.isArray(value) ? value : []
}
export function enforceInventoryDatabase(
  db: InventoryDatabase,
  previous?: InventoryDatabase,
) {
  // Valide todas as fichas antes de modificar qualquer uma.
  for (const [id, character] of db.characters)
    assertInventoryChange(
      previous?.characters.get(id),
      character,
      campaignItemCatalog(db, character.campaignId),
    )
  for (const [id, character] of db.characters)
    db.characters.set(
      id,
      applyInventoryRules(
        character,
        campaignItemCatalog(db, character.campaignId),
      ),
    )
}
