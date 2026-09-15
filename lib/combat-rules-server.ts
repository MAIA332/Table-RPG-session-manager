import "server-only"
import { randomInt } from "node:crypto"
import { ATTRIBUTE_META, EQUIPMENT } from "./game-data"
import { applyInventoryRules } from "./character"
import { equippedItemBonuses, sumItemBonus } from "./item-mechanics"
import { QTE_CHECKS } from "./combat-checks"
import { ATTRIBUTES, type Attack, type Attribute } from "./combat-model"
import type { Character } from "./types"
export const random = () => randomInt(0, 0x100000000) / 0x100000000
export const CHECK_MINIMUMS: Record<string, number> = {
  c1: 9,
  c2: 13,
  c3: 6,
  c20: 12,
  c22: 11,
  c23: 12,
  c27: 9,
  c28: 10,
  c29: 10,
}
export function characterDefense(character: Character, magical: boolean) {
  const mods = (character as any).customModifiers || []
  const id = magical ? "sheet_defense:magical" : "sheet_defense:physical"
  const manual = mods.find((m: any) => m.id === id)?.value
  if (Number.isSafeInteger(manual) && manual >= 0) return manual
  const die = String(character.attributes[magical ? "ins" : "dex"])
  const value = /^d(\d+)$/i.exec(die)
  if (!value) throw new Error("Defesa base inválida na ficha")
  return +value[1]
}
export function characterRoll(
  character: Character,
  attrs: string[],
  name: string,
  equipment: any[],
  ownerName: string,
  checkId?: string,
  bondId?: string,
) {
  const normalized = applyInventoryRules(character)
  const catalog = [
    ...equipment,
    ...EQUIPMENT.filter(
      (base) => !equipment.some((item) => item.id === base.id),
    ),
  ]
  const bonuses = equippedItemBonuses(normalized, catalog)
  const aliases =
    attrs.length === 1
      ? [attrs[0], ATTRIBUTE_META[attrs[0] as Attribute].label]
      : [name, ...attrs]
  let modifier = sumItemBonus(bonuses, aliases)
  const mods: any[] = (normalized as any).customModifiers || []
  for (const m of mods)
    if (
      m.type !== "bond" &&
      (m.target === "all" || attrs.includes(m.target) || m.target === name)
    )
      modifier += Number(m.value) || 0
  if (bondId) {
    const bond =
      mods.find((m) => m.id === bondId && m.type === "bond") ||
      ((normalized as any).bonds || []).find((b: any) => b.id === bondId)
    if (!bond) throw new Error("Laço não encontrado na ficha")
    modifier += Number(bond.value) || 0
  }
  const sizes = attrs.map((a) => {
    if (!ATTRIBUTES.includes(a as Attribute))
      throw new Error("Atributo inválido")
    const m = /^d(\d+)$/i.exec(String(normalized.attributes[a as Attribute]))
    if (!m || ![4, 6, 8, 10, 12, 20].includes(+m[1]))
      throw new Error("Dado inválido na ficha")
    return +m[1]
  })
  const minimum =
    normalized.name === "Kael Veyr" &&
    ownerName === "Mateus Lopes de Deus" &&
    checkId
      ? CHECK_MINIMUMS[checkId]
      : undefined
  let rolls = sizes.map((size) => randomInt(1, size + 1))
  // Preserve the sheet's conditional minimum rule without enumerating the entire dice pool.
  if (minimum !== undefined) {
    const maximum = sizes.reduce((a, b) => a + b, 0)
    if (maximum + modifier <= minimum) {
      rolls = sizes
      modifier = minimum + 1 - maximum
    } else {
      const memo = new Map<string, number>()
      const ways = (index: number, sum: number): number => {
        if (index === sizes.length) return sum + modifier > minimum ? 1 : 0
        const key = `${index}:${sum}`
        if (memo.has(key)) return memo.get(key)!
        let result = 0
        for (let d = 1; d <= sizes[index]; d++)
          result += ways(index + 1, sum + d)
        memo.set(key, result)
        return result
      }
      rolls = []
      let sum = 0
      for (let i = 0; i < sizes.length; i++) {
        let ticket = random() * ways(i, sum)
        for (let d = 1; d <= sizes[i]; d++) {
          ticket -= ways(i + 1, sum + d)
          if (ticket < 0) {
            rolls.push(d)
            sum += d
            break
          }
        }
      }
    }
  }
  return { rolls, modifier, total: rolls.reduce((a, b) => a + b, 0) + modifier }
}
export function checkDefinition(id: string) {
  const check = QTE_CHECKS.find((c) => c.id === id)
  if (!check) throw new Error("Teste desconhecido")
  return check
}
const elements: Record<string, string> = {
  físico: "physical",
  fisico: "physical",
  fogo: "fire",
  gelo: "ice",
  raio: "bolt",
  ar: "air",
  terra: "earth",
  luz: "light",
  trevas: "dark",
  veneno: "poison",
}
export function affinityDamage(
  damage: number,
  type: string,
  affinities: Record<string, string> = {},
) {
  const affinity =
    affinities[elements[type.toLowerCase()] || type.toLowerCase()]
  if (affinity === "IM") return 0
  if (affinity === "AB") return -damage
  if (affinity === "RS") return Math.floor(damage / 2)
  if (affinity === "VU") return damage * 2
  return damage
}
export function legacyAttacks(creature: {
  basicAttacksV2?: Attack[]
  basicAttacks?: any[]
}): Attack[] {
  if (creature.basicAttacksV2?.length) return creature.basicAttacksV2
  return (creature.basicAttacks || []).map((a) => ({
    name: a.name,
    attributes: a.attributes,
    damage: String(a.damage),
    type: a.type,
    description: a.description,
    targetDefense: "physical",
  }))
}
