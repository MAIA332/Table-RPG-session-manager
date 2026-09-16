import { EQUIPMENT } from "./game-data"

// Regras da campanha: edite aqui para mudar a carga e a penalidade.
export const INVENTORY_RULES = {
  gramsPerPoint: 1000,
  migBonusKg: 2,
  fallbackGrams: 100,
  dexPenalty: -2,
} as const
export type ItemWeight = { weight?: number; weightUnit?: "g" | "kg" }
export type InventoryLike = {
  equipment?: string[]
  customItems?: Array<ItemWeight & { id: string }>
  resources: { maxIp: number }
  attributes?: { mig?: string }
}
export class InventoryCapacityError extends Error {
  readonly status = 409
}
export function itemWeightGrams(item?: ItemWeight): number {
  if (item?.weight === undefined || item.weight === null)
    return INVENTORY_RULES.fallbackGrams
  if (
    typeof item.weight !== "number" ||
    !Number.isFinite(item.weight) ||
    item.weight < 0 ||
    (item.weightUnit !== "g" && item.weightUnit !== "kg")
  )
    throw new Error(
      "Peso inválido. Informe um número não negativo e a unidade g ou kg.",
    )
  const grams = item.weight * (item.weightUnit === "kg" ? 1000 : 1)
  const rounded = Math.round(grams)
  if (!Number.isSafeInteger(rounded) || Math.abs(grams - rounded) > 0.000001)
    throw new Error(
      "Informe o peso com precisão de 1 grama (ex.: 100 g ou 0,1 kg).",
    )
  return rounded
}
export function weightFields(
  value: unknown,
  unit: unknown,
): Required<ItemWeight> {
  const weight =
    typeof value === "string" ? Number(value.replace(",", ".")) : value
  if (value === "" || value === null || value === undefined)
    throw new Error("Preencha o peso do item.")
  const result = { weight: weight as number, weightUnit: unit as "g" | "kg" }
  itemWeightGrams(result)
  return result
}
export function inventoryStatus(
  character: InventoryLike,
  customCatalog: ItemWeight[] = [],
) {
  const catalog = new Map<string, ItemWeight>(
    EQUIPMENT.map((item) => [item.id, item]),
  )
  for (const item of customCatalog as Array<ItemWeight & { id?: string }>)
    if (item.id) catalog.set(item.id, item)
  const equipment = Array.isArray(character.equipment)
    ? character.equipment
    : []
  const customItems = Array.isArray(character.customItems)
    ? character.customItems
    : []
  const grams =
    equipment.reduce((sum, id) => sum + itemWeightGrams(catalog.get(id)), 0) +
    customItems.reduce((sum, item) => sum + itemWeightGrams(item), 0)
  const capacityGrams = Math.max(
    0,
    Math.round(
      (Number(character.resources?.maxIp) || 0) * INVENTORY_RULES.gramsPerPoint,
    ),
  )
  const mig = /^d(\d+)$/i.exec(character.attributes?.mig || "d6")
  const carryLimitGrams =
    ((mig ? Number(mig[1]) : 6) + INVENTORY_RULES.migBonusKg) * 1000
  return {
    grams,
    capacityGrams,
    carryLimitGrams,
    freeGrams: Math.max(0, capacityGrams - grams),
    freePoints:
      Math.max(0, capacityGrams - grams) / INVENTORY_RULES.gramsPerPoint,
    overloaded: grams > carryLimitGrams,
  }
}
export const formatWeight = (grams: number) =>
  `${(grams / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`
export function assertInventoryFits(
  character: InventoryLike,
  catalog: ItemWeight[] = [],
): void {
  const status = inventoryStatus(character, catalog)
  if (status.grams > status.capacityGrams)
    throw new InventoryCapacityError(
      `Mochila sem capacidade: ${formatWeight(status.grams)} de itens para ${formatWeight(status.capacityGrams)} disponíveis no total. Remova peso ou peça ao Mestre para aumentar a capacidade.`,
    )
}
// Alterações que removem peso e edições de fichas legadas continuam permitidas.
// Uma mochila cheia bloqueia até a entrada de um item cadastrado com peso zero.
export function assertInventoryChange(
  before: InventoryLike | undefined,
  after: InventoryLike,
  catalog: ItemWeight[] = [],
): void {
  if (!before) {
    assertInventoryFits(after, catalog)
    return
  }
  const counts = new Map<string, number>()
  const keys = (c: InventoryLike) => [
    ...(c.equipment || []).map((id) => `eq:${id}`),
    ...(c.customItems || []).map((item) => `custom:${item.id}`),
  ]
  for (const id of keys(before)) counts.set(id, (counts.get(id) || 0) + 1)
  let added = false
  for (const id of keys(after)) {
    const count = counts.get(id) || 0
    if (count === 0) added = true
    else counts.set(id, count - 1)
  }
  const previous = inventoryStatus(before, catalog),
    next = inventoryStatus(after, catalog)
  if (added && previous.freeGrams === 0)
    throw new InventoryCapacityError(
      "Mochila cheia: os pontos de inventário acabaram. Remova peso antes de adicionar qualquer item.",
    )
  if (added || next.grams > previous.grams) assertInventoryFits(after, catalog)
}
