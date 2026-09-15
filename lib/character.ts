import { BASE_HP, BASE_MP, BASE_MAX_IP, getClass } from "./game-data"
import type { AttributeKey, Character, ClassLevel, DieSize } from "./types"

export const OVERWEIGHT_MODIFIER_ID = "system:inventory-overweight"

export function applyInventoryRules<T extends Character>(character: T): T {
  const equipment = Array.isArray(character.equipment) ? character.equipment : []
  const maxIp = Math.max(0, Number(character.resources?.maxIp) || 0)
  const customItems = Array.isArray((character as any).customItems) ? (character as any).customItems : []
  const overloaded = equipment.length + customItems.length > maxIp
  const modifiers = Array.isArray((character as any).customModifiers)
    ? (character as any).customModifiers.filter((modifier: any) => modifier?.id !== OVERWEIGHT_MODIFIER_ID)
    : []

  if (overloaded) {
    modifiers.push({
      id: OVERWEIGHT_MODIFIER_ID,
      name: "Peso da mochila",
      target: "dex",
      value: -2,
      system: true,
    })
  }

  return {
    ...character,
    equipment,
    resources: { ...character.resources, ip: Math.max(0, maxIp - equipment.length - customItems.length) },
    customModifiers: modifiers,
  } as T
}

export function dieValue(die: DieSize): number {
  return Number(die.slice(1))
}

// Calcula os recursos maximos a partir de classes e atributos (nivel 5)
export function computeMaxResources(
  classes: ClassLevel[],
  attributes: Record<AttributeKey, DieSize>,
): { maxHp: number; maxMp: number; maxIp: number } {
  let hp = BASE_HP + dieValue(attributes.mig)
  let mp = BASE_MP + dieValue(attributes.ins)
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

// Garante que os recursos atuais respeitem os limites
export function normalizeResources(character: Character): Character {
  const { resources } = character
  return applyInventoryRules({
    ...character,
    resources: {
      ...resources,
      hp: clamp(resources.hp, 0, resources.maxHp),
      mp: clamp(resources.mp, 0, resources.maxMp),
      ip: clamp(resources.ip, 0, resources.maxIp),
      fp: Math.max(0, resources.fp),
    },
  })
}
