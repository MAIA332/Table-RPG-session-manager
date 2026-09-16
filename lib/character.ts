import { BASE_HP, BASE_MP, BASE_MAX_IP, getClass } from "./game-data"
import type { AttributeKey, Character, ClassLevel, DieSize } from "./types"
import {
  inventoryStatus,
  INVENTORY_RULES,
  type ItemWeight,
} from "./inventory-weight"
export const OVERWEIGHT_MODIFIER_ID = "system:inventory-overweight"
export function applyInventoryRules<T extends Character>(
  character: T,
  catalog: ItemWeight[] = [],
): T {
  const equipment = Array.isArray(character.equipment)
    ? character.equipment
    : []
  const status = inventoryStatus(character, catalog)
  const modifiers = Array.isArray((character as any).customModifiers)
    ? (character as any).customModifiers.filter(
        (m: any) => m?.id !== OVERWEIGHT_MODIFIER_ID,
      )
    : []
  if (status.overloaded)
    modifiers.push({
      id: OVERWEIGHT_MODIFIER_ID,
      name: "Peso da mochila",
      target: "dex",
      value: INVENTORY_RULES.dexPenalty,
      system: true,
    })
  return {
    ...character,
    equipment,
    resources: { ...character.resources, ip: status.freePoints },
    customModifiers: modifiers,
  } as T
}
export function dieValue(die: DieSize): number {
  return Number(die.slice(1))
}
export function computeMaxResources(
  classes: ClassLevel[],
  attributes: Record<AttributeKey, DieSize>,
): { maxHp: number; maxMp: number; maxIp: number } {
  let hp = BASE_HP + dieValue(attributes.mig),
    mp = BASE_MP + dieValue(attributes.ins)
  for (const cl of classes) {
    const gc = getClass(cl.classId)
    if (!gc) continue
    hp += gc.hpPerLevel * cl.level
    mp += gc.mpPerLevel * cl.level
  }
  return { maxHp: hp, maxMp: mp, maxIp: BASE_MAX_IP }
}
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
export function normalizeResources(
  character: Character,
  catalog: ItemWeight[] = [],
): Character {
  const { resources } = character
  return applyInventoryRules(
    {
      ...character,
      resources: {
        ...resources,
        hp: clamp(resources.hp, 0, resources.maxHp),
        mp: clamp(resources.mp, 0, resources.maxMp),
        ip: clamp(resources.ip, 0, resources.maxIp),
        fp: Math.max(0, resources.fp),
      },
    },
    catalog,
  )
}
