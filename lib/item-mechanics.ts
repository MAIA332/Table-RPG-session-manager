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
  /** Template opcional. Ausente = habilidade original. */
  template?: "attribute-inverter"
  inversion?: {
    operation: "swap" | "copy"
    source: ItemStatKey
    target: ItemStatKey
    /** null = permanece até desativação manual. */
    durationSeconds: number | null
  }
  /** Ausente / zero = sem cooldown. */
  cooldownSeconds?: number
}

export type ItemStatKey = "dex" | "ins" | "mig" | "wlp" | "defense" | "magicDefense"
export type ItemInversionModifier = {
  id: string
  name: string
  type: "item_attribute_inversion"
  target: string
  value: number
  itemId: string
  actionId: string
  active: boolean
  operation: "swap" | "copy"
  source: ItemStatKey
  destination: ItemStatKey
  sourceValue: string | number
  destinationValue: string | number
  expiresAt?: number
}
export const ITEM_INVERSION_PREFIX = "item_attribute_inversion:"
export const ITEM_COOLDOWN_PREFIX = "item_action_cooldown:"
export const ITEM_REQUEST_PREFIX = "item_action_request:"

const ITEM_ATTRIBUTE_KEYS = ["dex", "ins", "mig", "wlp"] as const
export const isItemStatKey = (value: unknown): value is ItemStatKey =>
  typeof value === "string" && ([...ITEM_ATTRIBUTE_KEYS, "defense", "magicDefense"] as string[]).includes(value)
export const isItemInversionModifier = (mod: any): mod is ItemInversionModifier =>
  mod?.type === "item_attribute_inversion" && typeof mod?.id === "string" && mod.id.startsWith(ITEM_INVERSION_PREFIX)
export const isItemActionRuntimeMarker = (mod: any): boolean =>
  isItemInversionModifier(mod) || mod?.type === "item_action_cooldown" || mod?.type === "item_action_request"
export const isActiveItemInversion = (mod: any, now = Date.now()): mod is ItemInversionModifier =>
  isItemInversionModifier(mod) && mod.active === true && (typeof mod.expiresAt !== "number" || mod.expiresAt > now)

/** Dano de um equipamento: legado numérico ou fórmula com dados. */
export function itemDamageDefinition(value: unknown): { kind: "none" | "fixed" | "dice"; label: string; fixed?: number; dice?: string } {
  const source = String(value ?? "").trim()
  if (!source) return { kind: "none", label: "" }
  if (/^\d{1,6}$/.test(source)) {
    const fixed = Number(source)
    if (fixed > 100000) throw new Error("Dano fixo máximo: 100000.")
    return { kind: "fixed", fixed, label: String(fixed) }
  }
  const parsed = parseItemDice(source)
  if (!parsed.dice.length) throw new Error("Informe um valor fixo ou dados válidos (ex.: 2d4+d8).")
  if (parsed.dice.length > 30 || parsed.dice.some(sides => ![4, 6, 8, 10, 12, 20].includes(sides)))
    throw new Error("O dano admite até 30 dados d4, d6, d8, d10, d12 ou d20.")
  return { kind: "dice", dice: source, label: parsed.label }
}

/** Sobreposição reversível: não altera atributos originais nem defesas manuais salvas. */
export function itemResolvedStats(character: any, catalog: any[], now = Date.now()) {
  const attrs = { ...(character?.attributes || {}) } as Record<string, string>
  const modifiers = Array.isArray(character?.customModifiers) ? character.customModifiers : []
  const readManual = (id: string, die: string) => {
    const saved = modifiers.find((m: any) => m.id === id)?.value
    const fallback = Number(String(die || "d6").replace(/^d/i, "")) || 6
    return Number.isSafeInteger(saved) && saved >= 0 ? saved : fallback
  }
  const itemBonus = wornDefenseBonuses(character, catalog)
  const stats: Record<ItemStatKey, string | number> = {
    dex: attrs.dex || "d6", ins: attrs.ins || "d6", mig: attrs.mig || "d6", wlp: attrs.wlp || "d6",
    defense: readManual("sheet_defense:physical", attrs.dex) + itemBonus.physical,
    magicDefense: readManual("sheet_defense:magical", attrs.ins) + itemBonus.magical,
  }
  for (const mod of modifiers) {
    if (!isActiveItemInversion(mod, now)) continue
    if (!Array.isArray(character?.equipment) || !character.equipment.includes(mod.itemId)) continue
    if (!isItemStatKey(mod.source) || !isItemStatKey(mod.destination)) continue
    if (mod.operation === "swap") {
      stats[mod.source] = mod.destinationValue
      stats[mod.destination] = mod.sourceValue
    } else {
      stats[mod.destination] = mod.sourceValue
    }
  }
  return {
    attributes: { dex: String(stats.dex), ins: String(stats.ins), mig: String(stats.mig), wlp: String(stats.wlp) },
    defense: Number(stats.defense), magicDefense: Number(stats.magicDefense),
  }
}

export function itemCooldownRemaining(character: any, itemId: string, actionId: string, now = Date.now()): number {
  const marker = (character?.customModifiers || []).find((mod: any) => mod.id === `${ITEM_COOLDOWN_PREFIX}${itemId}:${actionId}`)
  return Math.max(0, Number(marker?.expiresAt || 0) - now)
}

export function itemInversionState(character: any, itemId: string, actionId: string, now = Date.now()): ItemInversionModifier | undefined {
  return (character?.customModifiers || []).find((mod: any) => mod.id === `${ITEM_INVERSION_PREFIX}${itemId}:${actionId}` && isActiveItemInversion(mod, now))
}

export interface ItemBonus { target: string; value: number }
export const ITEM_EQUIPPED_PREFIX = "item_equipped:"
/** Itens de categoria Diversos não conferem efeitos mecânicos. */
export function isMiscItem(item: unknown): boolean {
  if (!item || typeof item !== "object") return false
  const category = String((item as { category?: unknown }).category ?? "")
  return ["misc", "diversos", "diverso", "miscellaneous"].includes(normalizeItemTarget(category))
}
export function isConsumableItem(item: unknown): boolean {
  return item !== null && typeof item === "object" && (item as { consumable?: unknown }).consumable === true
}
/** Remove exatamente uma unidade; mantém o marcador ativo até a última cópia. */
export function consumeInventoryItemUpdates(character: any, item: any, index: number): {
  equipment: string[]
  customModifiers?: any[]
} {
  if (!isConsumableItem(item)) throw new Error("Este item não é consumível.")
  const equipment: string[] = Array.isArray(character?.equipment) ? character.equipment : []
  if (!Number.isSafeInteger(index) || index < 0 || equipment[index] !== item.id)
    throw new Error("Item não encontrado nessa posição da mochila. Recarregue a ficha.")
  const remaining = equipment.filter((_: string, i: number) => i !== index)
  const updates: { equipment: string[]; customModifiers?: any[] } = { equipment: remaining }
  if (!remaining.includes(item.id))
    updates.customModifiers = (character.customModifiers || []).filter((mod: any) => mod.id !== ITEM_EQUIPPED_PREFIX + item.id)
  return updates
}

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
  const active = [...items, ...otherActive].filter(item => !isMiscItem(item))
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
  if (isMiscItem(item)) return []
  if (Array.isArray(item.passiveBonuses)) return item.passiveBonuses.filter((b: any) => typeof b.target === "string" && b.target.trim() && Number.isFinite(b.value))
  // Compatibilidade com "+6 Fôlego +3 Resistência +2 Força Bruta".
  return [...String(item.bonus || "").matchAll(/([+-]\s*\d+)\s+([^+\-;\n]+)/g)].map(match => ({ value: Number(match[1].replace(/\s/g, "")), target: match[2].replace(/[,\s]+$/, "").trim() })).filter(b => b.target)
}
export function equippedItemBonuses(character: any, catalog: any[]): ItemBonus[] {
  return [...new Set<string>(character.equipment || [])].flatMap(id => {
    if (!hasItemBonuses(character, id)) return []
    const item = catalog.find(entry => entry.id === id)
    return item && !isMiscItem(item) ? itemBonusEntries(item) : []
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
  if (isMiscItem(item)) return []
  if (Array.isArray(item.actions)) return item.actions.filter((action: any) => action && !(action.id === "legacy-use" && ["Usar item", "Rolar dano do item"].includes(action.name))).map((action: any, i: number) => ({ ...action, id: action.id || `action-${i}` }))
  return [] // Somente habilidades explicitamente cadastradas geram ações.

}
export function validateItemAction(action: ItemAction, attributes = { dex: "d6", ins: "d6", mig: "d6", wlp: "d6" }): void {
  if (!action.name?.trim()) throw new Error("Dê um nome à habilidade.")
  if (!["attack", "utility", "heal"].includes(action.kind)) throw new Error("Tipo de habilidade inválido.")
  if (!["hp", "mp", "ip"].includes(action.costResource) || !["hp", "mp", "ip"].includes(action.restoreResource)) throw new Error("Recurso inválido.")
  if (![action.cost, action.restoreAmount].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000)) throw new Error("Custo e recuperação devem ser inteiros entre 0 e 10000.")
  if (action.cooldownSeconds != null && (!Number.isSafeInteger(action.cooldownSeconds) || action.cooldownSeconds < 0 || action.cooldownSeconds > 86400))
    throw new Error("Cooldown deve ser de 0 a 86400 segundos.")
  if (action.template != null && action.template !== "attribute-inverter") throw new Error("Template inválido.")
  if (action.template === "attribute-inverter") {
    const cfg = action.inversion
    if (!cfg || !["swap", "copy"].includes(cfg.operation) || !isItemStatKey(cfg.source) || !isItemStatKey(cfg.target) || cfg.source === cfg.target)
      throw new Error("Configure dois atributos diferentes para o Inversor.")
    const isDice = (key: ItemStatKey) => ITEM_ATTRIBUTE_KEYS.some(value => value === key)
    if (isDice(cfg.source) !== isDice(cfg.target)) throw new Error("Não é permitido misturar dados e defesas numéricas.")
    if (cfg.durationSeconds !== null && (!Number.isSafeInteger(cfg.durationSeconds) || cfg.durationSeconds < 1 || cfg.durationSeconds > 86400))
      throw new Error("Duração deve ser de 1 a 86400 segundos, ou até desativar.")
  }
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
