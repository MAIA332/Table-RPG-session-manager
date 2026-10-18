import { createClientId } from "./client-id"

export type ItemResource = "hp" | "mp" | "ip"
export interface ItemAction {
  id: string
  name: string
  kind: "attack" | "utility" | "heal"
  attackDice: string
  damageDice: string
  cost: number
  costResource: ItemResource
  restoreAmount: number
  restoreResource: ItemResource
  consume: boolean
  requirement: string
  effect: string
}
export interface ItemBonus { target: string; value: number }
export const ITEM_EQUIPPED_PREFIX = "item_equipped:"

/** Quantidade máxima de modelos distintos vestidos ao mesmo tempo. */
export const EQUIPMENT_LIMITS = { armor: 5, accessory: 8 } as const
export type WearableKind = keyof typeof EQUIPMENT_LIMITS
/** Categorias do Baú do Mestre. Aceita grafias antigas sem afetar armas e escudos. */
export function wearableKind(item: any): WearableKind | null {
  const category = normalizeItemTarget(String(item?.category ?? ""))
  if (["armor", "armadura", "armour"].includes(category)) return "armor"
  if (["accessory", "acessorio", "acessorios", "accessories"].includes(category)) return "accessory"
  return null
}
/** Uma cópia por ID pode ser vestida. A mesma definição nunca multiplica bônus. */
export function wornItems(character: any, catalog: any[]) {
  const owned = new Set<string>(Array.isArray(character?.equipment) ? character.equipment : [])
  const active = new Set<string>((character?.customModifiers || [])
    .filter((mod: any) => isItemState(mod) && mod.value === 1)
    .map((mod: any) => String(mod.id).slice(ITEM_EQUIPPED_PREFIX.length)))
  return catalog.filter((item: any, index: number) =>
    item && typeof item.id === "string" &&
    catalog.findIndex((entry: any) => entry.id === item.id) === index &&
    owned.has(item.id) && active.has(item.id) && wearableKind(item))
}
export function wornCounts(character: any, catalog: any[]) {
  const counts = { armor: 0, accessory: 0 }
  for (const item of wornItems(character, catalog)) counts[wearableKind(item)!]++
  return counts
}
export function assertWornLimits(character: any, catalog: any[]) {
  const counts = wornCounts(character, catalog)
  if (counts.armor > EQUIPMENT_LIMITS.armor)
    throw new Error(`Limite de armaduras em uso: ${EQUIPMENT_LIMITS.armor}. Retire uma armadura antes de usar outra.`)
  if (counts.accessory > EQUIPMENT_LIMITS.accessory)
    throw new Error(`Limite de acessórios em uso: ${EQUIPMENT_LIMITS.accessory}. Retire um acessório antes de usar outro.`)
}

/** Pontos de DEF/M.DEF são efetivos apenas quando o item está em uso. */
export function wornDefenseBonuses(character: any, catalog: any[]) {
  const items = wornItems(character, catalog)
  // Escudos e itens de outras categorias podem manter a ativação legada.
  const otherActive = [...new Set<string>(character?.equipment || [])]
    .filter(id => (character?.customModifiers || []).some((m: any) => m.id === ITEM_EQUIPPED_PREFIX + id && m.value === 1))
    .map(id => catalog.find((it: any) => it.id === id))
    .filter((it: any) => it && !wearableKind(it))
  const active = [...items, ...otherActive]
  const raw = (value: unknown) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?\d+$/.test(value.trim()))) return 0
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 100000 ? parsed : 0
  }
  const passive = active.flatMap((item: any) => itemBonusEntries(item))
  return {
    physical: active.reduce((acc: number, item: any) => acc + raw(item.defense), 0) +
      sumItemBonus(passive, ["defesa", "def", "defesa fisica", "physical defense", "physical", "sheet_defense:physical"]),
    magical: active.reduce((acc: number, item: any) => acc + raw(item.mdef), 0) +
      sumItemBonus(passive, ["defesa magica", "def magica", "m.def", "mdef", "magic defense", "magical", "sheet_defense:magical"]),
  }
}

/** Constrói a alteração persistida, limitando peças ativas sem mudar o inventário. */
export function wearItemUpdates(character: any, catalog: any[], itemId: string) {
  if (!Array.isArray(character?.equipment) || !character.equipment.includes(itemId))
    throw new Error("O item não está mais na mochila. Recarregue a ficha.")
  const item = catalog.find((it: any) => it.id === itemId)
  if (!item || !wearableKind(item)) throw new Error("Este item não é uma armadura ou acessório.")
  const marker = ITEM_EQUIPPED_PREFIX + itemId
  const current = character.customModifiers || []
  const mods = current.filter((mod: any) => mod.id !== marker)
  if (!hasItemBonuses(character, itemId))
    mods.push({ id: marker, name: `Bônus ativos: ${item.name}`, target: "item_state_hidden", value: 1 })
  const updated = { ...character, customModifiers: mods }
  assertWornLimits(updated, catalog)
  return { customModifiers: mods }
}

export const normalizeItemTarget = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
export const isItemState = (mod: any) => typeof mod.id === "string" && mod.id.startsWith(ITEM_EQUIPPED_PREFIX)
export const hasItemBonuses = (character: any, itemId: string) => (character.customModifiers || []).some((mod: any) => mod.id === ITEM_EQUIPPED_PREFIX + itemId && mod.value === 1)

// Gramática fechada; não executa texto como código. Aceita 2d6+d8+3 ou DEX+INS.
export function parseItemDice(expression: string, attributes: Record<string, string> = {}): { dice: number[]; modifier: number; label: string } {
  let source = String(expression).replace(/\s+/g, "").toLowerCase()
  source = source.replace(/\b(dex|ins|mig|wlp)\b/g, key => attributes[key] || key)
  if (!source || source.length > 120 || !/^(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(source)) throw new Error("Dados inválidos. Use d12, 2d6+3, d8+d10 ou DEX+INS.")
  const dice: number[] = []
  let modifier = 0
  for (const token of source.match(/[+-]?[^+-]+/g) || []) {
    const die = token.match(/^([+]?)(\d*)d(\d+)$/)
    if (die) {
      const count = Number(die[2] || 1), sides = Number(die[3])
      if (!Number.isSafeInteger(count) || count < 1 || count > 30 || !Number.isSafeInteger(sides) || sides < 2 || sides > 100 || dice.length + count > 30) throw new Error("Use no máximo 30 dados, de d2 a d100.")
      dice.push(...Array(count).fill(sides))
    } else {
      if (token.includes("d")) throw new Error("Subtração de dados não é suportada; use um modificador fixo negativo.")
      modifier += Number(token)
      if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 10000) throw new Error("Modificador fora do limite de 10000.")
    }
  }
  return { dice, modifier, label: source }
}
export function rollItemDice(expression: string, attributes: Record<string, string>, bonus = 0, random = Math.random) {
  const parsed = parseItemDice(expression, attributes)
  const values = parsed.dice.map(sides => Math.floor(random() * sides) + 1)
  return { ...parsed, values, modifier: parsed.modifier + bonus, total: values.reduce((a, b) => a + b, 0) + parsed.modifier + bonus }
}
export function itemBonusEntries(item: any): ItemBonus[] {
  if (Array.isArray(item.passiveBonuses)) return item.passiveBonuses.filter((b: any) => typeof b.target === "string" && b.target.trim() && Number.isFinite(b.value))
  // Compatibilidade com "+6 Fôlego +3 Resistência +2 Força Bruta".
  return [...String(item.bonus || "").matchAll(/([+-]\s*\d+)\s+([^+\-;\n]+)/g)].map(match => ({ value: Number(match[1].replace(/\s/g, "")), target: match[2].replace(/[,\s]+$/, "").trim() })).filter(b => b.target)
}
export function equippedItemBonuses(character: any, catalog: any[]): ItemBonus[] {
  return [...new Set<string>(character.equipment || [])].flatMap(id => {
    if (!hasItemBonuses(character, id)) return []
    const item = catalog.find(entry => entry.id === id)
    return item ? itemBonusEntries(item) : []
  })
}
export function sumItemBonus(bonuses: ItemBonus[], targets: string[]): number {
  const accepted = new Set(targets.map(normalizeItemTarget))
  return bonuses.reduce((sum, bonus) => sum + (accepted.has(normalizeItemTarget(bonus.target)) ? bonus.value : 0), 0)
}
export function blankItemAction(): ItemAction {
  return { id: `action-${createClientId()}`, name: "Nova habilidade", kind: "utility", attackDice: "", damageDice: "", cost: 0, costResource: "mp", restoreAmount: 0, restoreResource: "hp", consume: false, requirement: "", effect: "" }
}
export function getItemActions(item: any): ItemAction[] {
  if (Array.isArray(item.actions)) return item.actions.filter((action: any) => action && !(action.id === "legacy-use" && ["Usar item", "Rolar dano do item"].includes(action.name))).map((action: any, i: number) => ({ ...action, id: action.id || `action-${i}` }))
  return [] // Somente habilidades explicitamente cadastradas geram ações.

}
export function validateItemAction(action: ItemAction, attributes = { dex: "d6", ins: "d6", mig: "d6", wlp: "d6" }): void {
  if (!action.name?.trim()) throw new Error("Dê um nome à habilidade.")
  if (!["attack", "utility", "heal"].includes(action.kind)) throw new Error("Tipo de habilidade inválido.")
  if (!["hp", "mp", "ip"].includes(action.costResource) || !["hp", "mp", "ip"].includes(action.restoreResource)) throw new Error("Recurso inválido.")
  if (![action.cost, action.restoreAmount].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000)) throw new Error("Custo e recuperação devem ser inteiros entre 0 e 10000.")
  if (action.kind === "attack" && !action.attackDice?.trim() && !action.damageDice?.trim()) throw new Error("Ataques precisam especificar dados de acerto e/ou dano.")
  if (action.attackDice?.trim()) parseItemDice(action.attackDice, attributes)
  if (action.damageDice?.trim()) parseItemDice(action.damageDice, attributes)
  if (action.kind === "attack" && ![action.attackDice, action.damageDice].some(expression => expression?.trim() && parseItemDice(expression, attributes).dice.length > 0)) throw new Error("Especifique pelo menos um dado para o ataque (ex.: acerto DEX+INS ou dano d12).")
}
export function buildItemUseUpdates(character: any, itemId: string, index: number, action: ItemAction) {
  validateItemAction(action, character.attributes)
  if (character.equipment?.[index] !== itemId) throw new Error("O item não está mais nesta posição da mochila. Abra-a novamente.")
  const available = character.resources[action.costResource]
  if (!Number.isFinite(available) || available < action.cost) throw new Error(`${action.costResource.toUpperCase()} insuficiente.`)
  const resources: Record<string, number> = {}
  if (action.cost > 0) resources[action.costResource] = available - action.cost
  if (action.kind === "heal" && action.restoreAmount > 0) {
    const key = action.restoreResource
    const maximum = character.resources[{ hp: "maxHp", mp: "maxMp", ip: "maxIp" }[key]]
    const current = resources[key] ?? character.resources[key]
    if (!Number.isFinite(maximum) || !Number.isFinite(current)) throw new Error("Limite de recurso inválido na ficha.")
    resources[key] = Math.max(current, Math.min(maximum, current + action.restoreAmount))
  }
  const updates: any = {}
  if (Object.keys(resources).length) updates.resources = resources
  if (action.consume) {
    updates.equipment = character.equipment.filter((_: string, i: number) => i !== index)
    if (!updates.equipment.includes(itemId)) updates.customModifiers = (character.customModifiers || []).filter((mod: any) => mod.id !== ITEM_EQUIPPED_PREFIX + itemId)
  }
  return updates
}
