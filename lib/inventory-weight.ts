import { EQUIPMENT } from "./game-data"

// Regras da campanha: edite aqui para mudar a carga e a penalidade.
export const INVENTORY_RULES = {
  gramsPerPoint: 1000,
  migBonusKg: 2,
  fallbackGrams: 100,
  dexPenalty: -2,
} as const
/** Configurável por campanha e persistido no estado da campanha (validação também no servidor). */
export type CampaignInventoryRules = {
  startingZenitLimit: number
  zenitPerUpgrade: number
  startingCapacityKg: number
  capacityPerUpgradeKg: number
  overloadPercent: number
  dexPenalty: number
}
export const DEFAULT_CAMPAIGN_INVENTORY_RULES: CampaignInventoryRules = {
  startingZenitLimit: 800, zenitPerUpgrade: 800, startingCapacityKg: 6,
  capacityPerUpgradeKg: 2, overloadPercent: 100, dexPenalty: 2,
}
export function readCampaignInventoryRules(input: unknown): CampaignInventoryRules {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const result = { ...DEFAULT_CAMPAIGN_INVENTORY_RULES }
  for (const key of Object.keys(result) as (keyof CampaignInventoryRules)[]) {
    const value = raw[key]
    const range = key === "startingCapacityKg" ? [1, 1000] : key === "capacityPerUpgradeKg" ? [1, 1000]
      : key === "overloadPercent" ? [100, 200] : key === "dexPenalty" ? [0, 100] : [0, 100000000]
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= range[0] && value <= range[1]) result[key] = value
  }
  return result
}
export function validateCampaignInventoryRules(input: unknown): CampaignInventoryRules {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuração inválida.")
  const raw = input as Record<string, unknown>
  const value = readCampaignInventoryRules(input)
  if ((Object.keys(value) as (keyof CampaignInventoryRules)[]).some(key => raw[key] !== value[key]))
    throw new Error("Valores inválidos: informe números inteiros dentro dos limites permitidos.")
  return value
}
/** 6 kg = 800z; 8 kg = 1600z; 10 kg = 2400z, com padrões editáveis pelo Mestre. */
export function zenitCapacity(maxIp: number, rules: CampaignInventoryRules = DEFAULT_CAMPAIGN_INVENTORY_RULES): number {
  const capacity = Math.max(0, Number.isFinite(maxIp) ? maxIp : 0)
  const upgrades = Math.max(0, Math.floor((capacity - rules.startingCapacityKg) / rules.capacityPerUpgradeKg))
  return Math.min(Number.MAX_SAFE_INTEGER, rules.startingZenitLimit + upgrades * rules.zenitPerUpgrade)
}
export type ItemWeight = { weight?: number; weightUnit?: "g" | "kg" }
export type InventoryLike = {
  zenit?: number
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
  rules: CampaignInventoryRules = DEFAULT_CAMPAIGN_INVENTORY_RULES,
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
  const thresholdGrams = Math.round(capacityGrams * rules.overloadPercent / 100)
  const zenitLimit = zenitCapacity(Number(character.resources?.maxIp) || 0, rules)
  const zenit = Math.max(0, Number(character.zenit) || 0)
  const zenitOverflow = Math.max(0, zenit - zenitLimit)
  // A carga física nunca pode ativar Peso quando a ficha ainda indica kg livres.
  // Configurações antigas de 1..99% são migradas para 100% por readCampaignInventoryRules.
  const effectiveThresholdGrams = Math.max(capacityGrams, Math.min(carryLimitGrams, thresholdGrams))
  const weightOverloaded = grams > effectiveThresholdGrams
  return {
    grams,
    capacityGrams,
    zenitLimit,
    zenitOverflow,
    zenitOverloaded: zenitOverflow > 0,
    weightOverloaded,
    overloadThresholdGrams: effectiveThresholdGrams,
    carryLimitGrams,
    freeGrams: Math.max(0, capacityGrams - grams),
    freePoints:
      Math.max(0, capacityGrams - grams) / INVENTORY_RULES.gramsPerPoint,
    // Uma única condição Peso: moedas acima do limite OU itens acima da carga.
    overloaded: weightOverloaded || zenitOverflow > 0,
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
