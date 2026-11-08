import type { Character } from "./types"
import type { GameClass } from "./game-data"

const rank = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0

export function xpClassBudget(xp: number): number {
  let level = 5, remaining = Math.max(0, Number(xp) || 0), required = 10
  while (remaining >= required && level < 1000) { remaining -= required; level++; required = Math.floor(required * 1.5) }
  return level
}

export function adjustedClassPoints(budget: number, spent: number, adjustment = 0): number {
  return Math.max(0, budget + (Number.isSafeInteger(adjustment) ? adjustment : 0) - spent)
}

/** Mesmas regras de ranks pagos/gratuitos usadas na ficha e no aprendizado. */
export function spentClassPoints(character: Character, catalog: GameClass[], customIds: Set<string>): number {
  const skills = character.skills || {}
  const modifiers: any[] = (character as any).customModifiers || []
  const counted = new Set<string>()
  const free = (id: string, level: number) => {
    const marker = modifiers.find(mod => mod.id === `free_skill:${id}`)
    return Math.min(level, marker ? rank(marker.value) : customIds.has(id) ? level : 0)
  }
  let spent = 0
  for (const owned of character.classes || []) {
    const classId = owned.classId ?? (owned as any).id
    const definition = catalog.find(cls => cls.id === classId)
    const classSkills = [...(definition?.skills || []), ...catalog.filter(cls => cls.parentClassId === classId).flatMap(cls => cls.skills || [])].filter(skill => !counted.has(skill.id))
    let levels = 0, grants = 0
    for (const skill of classSkills) { counted.add(skill.id); const value = rank(skills[skill.id]); levels += value; grants += free(skill.id, value) }
    const legacyCustom = definition && classSkills.length > 0 && classSkills.every(skill => customIds.has(skill.id))
    spent += levels - grants + (legacyCustom ? 0 : Math.max(0, rank(owned.level) - levels))
  }
  for (const [id, value] of Object.entries(skills)) if (!counted.has(id)) spent += rank(value) - free(id, rank(value))
  return spent
}
