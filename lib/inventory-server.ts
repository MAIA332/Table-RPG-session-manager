import type { Character } from "./types"
import { assertInventoryChange, type ItemWeight } from "./inventory-weight"
import { applyInventoryRules } from "./character"
import { assertWornLimits } from "./item-mechanics"
import { EQUIPMENT } from "./game-data"

type InventoryDatabase = {
  characters: Map<string, Character>
  campaignState: Map<string, Record<string, unknown>>
}

/**
 * Os registros do catálogo possuem ID; ItemWeight, por si só, representa
 * apenas os campos de peso e também é usado em outros contextos.
 */
export type CatalogItemWeight = ItemWeight & { id: string }

function hasCatalogId(value: unknown): value is CatalogItemWeight {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim().length > 0
  )
}

export function campaignItemCatalog(
  db: InventoryDatabase,
  campaignId: string,
): CatalogItemWeight[] {
  const value = db.campaignState.get(campaignId)?.customEquipment
  return Array.isArray(value) ? value.filter(hasCatalogId) : []
}

export function enforceInventoryDatabase(
  db: InventoryDatabase,
  previous?: InventoryDatabase,
) {
  // Valide todas as fichas antes de modificar qualquer uma delas.
  for (const [id, character] of db.characters) {
    const catalog = campaignItemCatalog(db, character.campaignId)

    assertInventoryChange(previous?.characters.get(id), character, catalog)

    // Validação no servidor: chamadas diretas ao PATCH não burlam os limites.
    // O catálogo personalizado prevalece sobre equipamentos oficiais com o mesmo ID.
    const completeCatalog = [
      ...catalog,
      ...EQUIPMENT.filter(
        (base) => !catalog.some((item) => item.id === base.id),
      ),
    ]
    assertWornLimits(character, completeCatalog)
  }

  for (const [id, character] of db.characters) {
    db.characters.set(
      id,
      applyInventoryRules(
        character,
        campaignItemCatalog(db, character.campaignId),
      ),
    )
  }
}
