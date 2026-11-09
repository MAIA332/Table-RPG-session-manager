/** Dados do Manequim. Posições são APENAS visuais: não equipam, desequipam
 * nem recalculam bônus. O inventário segue sendo a autoridade dos itens. */
import type { Character } from "@/lib/types"
import { isItemState } from "@/lib/item-mechanics"

export const MANNEQUIN_ZONES = [
  { id: "head", name: "Cabeça" },
  { id: "face", name: "Rosto" },
  { id: "neck", name: "Pescoço" },
  { id: "shoulders", name: "Ombros" },
  { id: "chest", name: "Peito" },
  { id: "back", name: "Costas" },
  { id: "abdomen", name: "Abdômen" },
  { id: "waist", name: "Cintura" },
  { id: "hips", name: "Quadril" },
  { id: "leftUpperArm", name: "Braço esquerdo" },
  { id: "rightUpperArm", name: "Braço direito" },
  { id: "leftForearm", name: "Antebraço esquerdo" },
  { id: "rightForearm", name: "Antebraço direito" },
  { id: "leftHand", name: "Mão esquerda" },
  { id: "rightHand", name: "Mão direita" },
  { id: "leftThigh", name: "Coxa esquerda" },
  { id: "rightThigh", name: "Coxa direita" },
  { id: "leftShin", name: "Canela esquerda" },
  { id: "rightShin", name: "Canela direita" },
  { id: "leftFoot", name: "Pé esquerdo" },
  { id: "rightFoot", name: "Pé direito" },
] as const
export type MannequinZone = (typeof MANNEQUIN_ZONES)[number]["id"]
export type MannequinCategory = "weapon" | "armor" | "shield" | "accessory"
export type MannequinPlacement = { key: string; zone: MannequinZone; layer: number }
export type MannequinItem = { key: string; itemId: string; index: number; name: string; category: MannequinCategory; detail: string }

const validZones = new Set<string>(MANNEQUIN_ZONES.map(item => item.id))
const types = new Set<string>(["weapon", "armor", "shield", "accessory"])
const own = (item: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(item, key)

function itemIsWorn(character: Character, itemId: string, index: number): boolean {
  const metadata = character as Character & {
    customModifiers?: unknown; equippedItemIds?: unknown; wornItemIds?: unknown;
    npcEquippedIds?: unknown
  }
  // A lista oficial de itens vestidos, quando presente, tem precedência sobre
  // registros de fichas antigas; assim a mochila não vaza peças desativadas.
  for (const ids of [metadata.equippedItemIds, metadata.wornItemIds, metadata.npcEquippedIds]) {
    if (Array.isArray(ids)) return ids.includes(itemId)
  }
  const mods = metadata.customModifiers
  const records = Array.isArray(mods) ? mods.filter(item => item && isItemState(item)) as Record<string, unknown>[] : []
  const state = records.find(item => (item.itemId === itemId || item.equipmentId === itemId) &&
    (item.itemIndex === undefined || item.itemIndex === index))
  if (state) {
    // Respeita estados explícitos, inclusive acessórios sem bônus.
    for (const field of ["equipped", "worn", "isEquipped", "isWorn", "inUse", "active", "isActive"])
      if (own(state, field) && typeof state[field] === "boolean") return state[field] as boolean
    if (state.unequipped === true || state.stored === true) return false
    if (typeof state.status === "string") {
      if (["stored", "unequipped", "inventory", "inactive"].includes(state.status)) return false
      if (["equipped", "worn", "active"].includes(state.status)) return true
    }
    // Um registro de uso encontrado sem flag de desligamento ainda indica uso.
    return true
  }
  // Um estado de OUTRO item não define o uso desta ocorrência. Na versão
  // anterior, bastava existir qualquer item_state na ficha para TODAS as
  // peças sem registro individual desaparecerem do Manequim, embora a mochila
  // continuasse reconhecendo-as. Preserva a regra legada para a ocorrência
  // sem estado próprio; exclusões explícitas continuam sendo respeitadas acima.
  return true
}

/** Gera a identidade da OCORRÊNCIA, não apenas a ID do item; duplicatas são válidas. */
export function mannequinItems(character: Character, catalog: readonly any[]): MannequinItem[] {
  const known = new Map<string, any>(catalog.map(item => [String(item.id), item]))
  const count = new Map<string, number>()
  const equipment = Array.isArray(character.equipment) ? character.equipment : []
  return equipment.flatMap((rawId, index) => {
    if (typeof rawId !== "string") return []
    const occurrence = count.get(rawId) ?? 0
    count.set(rawId, occurrence + 1)
    const item = known.get(rawId)
    const category = String(item?.category || item?.type || "").toLowerCase()
    if (!item || !types.has(category) || !itemIsWorn(character, rawId, index)) return []
    if (item.bonusActive === false || item.equipped === false || item.active === false) return []
    return [{ key: `${encodeURIComponent(rawId)}#${occurrence}`, itemId: rawId, index,
      name: String(item.name || "Equipamento"), category: category as MannequinCategory,
      detail: typeof item.detail === "string" ? item.detail : "" }]
  })
}

export function normalizeMannequinPlacements(input: unknown): MannequinPlacement[] {
  if (!Array.isArray(input)) throw new Error("A lista de posições deve ser um array.")
  if (input.length > 200) throw new Error("Quantidade de itens excedida.")
  const used = new Set<string>()
  return input.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Posição inválida.")
    const item = raw as Record<string, unknown>
    if (typeof item.key !== "string" || !item.key || item.key.length > 400 || used.has(item.key) ||
        typeof item.zone !== "string" || !validZones.has(item.zone) ||
        !Number.isSafeInteger(item.layer) || (item.layer as number) < 0 || (item.layer as number) > 19)
      throw new Error("Posição, camada ou item inválido/duplicado.")
    used.add(item.key)
    return { key: item.key, zone: item.zone as MannequinZone, layer: item.layer as number }
  })
}

export function suggestedZone(category: MannequinCategory): MannequinZone {
  return category === "weapon" ? "rightHand" : category === "shield" ? "leftForearm" :
    category === "accessory" ? "neck" : "chest"
}

/** Impede que duas ocorrências usem o mesmo espaço no mesmo estrato.
 * A restrição vale só para a representação visual: não modifica itens ou bônus. */
export function findMannequinSlotCollision(
  placements: readonly MannequinPlacement[],
  zone: MannequinZone,
  layer: number,
  exceptKey?: string,
): MannequinPlacement | undefined {
  return placements.find(entry => entry.key !== exceptKey && entry.zone === zone && entry.layer === layer)
}

/** Validação usada obrigatoriamente pela API antes da escrita no MongoDB. */
export function assertUniqueMannequinSlots(placements: readonly MannequinPlacement[]): void {
  const slots = new Set<string>()
  for (const entry of placements) {
    const slot = `${entry.zone}:${entry.layer}`
    if (slots.has(slot)) {
      const label = MANNEQUIN_ZONES.find(zone => zone.id === entry.zone)?.name || entry.zone
      throw new Error(`A região ${label} já possui um item na camada ${entry.layer + 1}. Escolha uma camada ou região diferente.`)
    }
    slots.add(slot)
  }
}

/** Recupera documentos legados com conflitos sem descartar peças. A primeira
 * atribuição prevalece; as seguintes ocupam a próxima camada LIVRE na mesma
 * região. Se as 20 estiverem cheias, procura outra região. Não salva automaticamente. */
export function initialMannequinPlacements(items: MannequinItem[], saved: MannequinPlacement[]): MannequinPlacement[] {
  const availableKeys = new Set(items.map(item => item.key))
  const assignedKeys = new Set<string>()
  const occupied = new Set<string>()
  const result: MannequinPlacement[] = []
  const zones = MANNEQUIN_ZONES.map(zone => zone.id)
  const firstFree = (preferred: MannequinZone): { zone: MannequinZone; layer: number } => {
    for (const zone of [preferred, ...zones.filter(zone => zone !== preferred)]) {
      for (let layer = 0; layer < 20; layer++) {
        if (!occupied.has(`${zone}:${layer}`)) return { zone, layer }
      }
    }
    throw new Error("O Manequim não possui mais posições livres.")
  }
  const append = (key: string, preferred: MannequinZone, layer?: number) => {
    if (assignedKeys.has(key)) return
    const requested = layer === undefined ? undefined : `${preferred}:${layer}`
    const slot = requested && !occupied.has(requested)
      ? { zone: preferred, layer: layer! }
      : firstFree(preferred)
    assignedKeys.add(key)
    occupied.add(`${slot.zone}:${slot.layer}`)
    result.push({ key, ...slot })
  }
  for (const entry of saved) {
    if (availableKeys.has(entry.key)) append(entry.key, entry.zone, entry.layer)
  }
  for (const item of items) append(item.key, suggestedZone(item.category))
  return result
}
