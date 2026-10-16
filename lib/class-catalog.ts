import { CLASSES, type GameClass } from "./game-data"
import { characterClassIds } from "./class-books"

/**
 * Catálogo por campanha: nunca oferece uma classe oficial antiga a uma campanha
 * em que ela não esteja sendo utilizada. Os dados antigos permanecem no código
 * para que fichas e perícias já existentes não percam seus identificadores.
 */
export function getCampaignClassCatalog(
  characters: readonly unknown[],
  customClasses: readonly GameClass[],
  preserveClassIds: readonly string[] = [],
): GameClass[] {
  const used = new Set([...preserveClassIds, ...characters.flatMap(characterClassIds)])
  const custom = customClasses.filter(
    (cls): cls is GameClass => Boolean(cls && typeof cls.id === "string" && cls.id && typeof cls.name === "string"),
  )
  for (const cls of custom) {
    if (cls.parentClassId && CLASSES.some(base => base.id === cls.parentClassId)) {
      used.add(cls.parentClassId)
    }
  }
  const unique = new Map<string, GameClass>()
  for (const cls of CLASSES) {
    if (used.has(cls.id)) unique.set(cls.id, cls)
  }
  for (const cls of custom) unique.set(cls.id, cls)
  return [...unique.values()]
}

export function baseGameClasses(classes: readonly GameClass[]): GameClass[] {
  return classes.filter(cls => !cls.parentClassId)
}

export function subclassesFor(classes: readonly GameClass[], parentId: string): GameClass[] {
  return classes.filter(cls => cls.parentClassId === parentId)
}

/** Subclasses são especializações; não adicionam um novo nível independente. */
export function classLevelsFromSkills(
  skills: Readonly<Record<string, number>>,
  classes: readonly GameClass[],
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const cls of classes) {
    if (cls.parentClassId) continue
    const level = (cls.skills || []).reduce((sum, s) => sum + Math.max(0, Number(skills[s.id]) || 0), 0)
    if (level > 0) result[cls.id] = level
  }
  return result
}
