import { BASE_HP, BASE_MP, BASE_MAX_IP, getClass } from "./game-data"
import type { AttributeKey, Character, ClassLevel, DieSize } from "./types"

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
  return {
    ...character,
    resources: {
      ...resources,
      hp: clamp(resources.hp, 0, resources.maxHp),
      mp: clamp(resources.mp, 0, resources.maxMp),
      ip: clamp(resources.ip, 0, resources.maxIp),
      fp: Math.max(0, resources.fp),
    },
  }
}
