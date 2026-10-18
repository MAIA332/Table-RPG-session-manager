import { CLASSES, type GameClass } from "./game-data"

/**
 * Catálogo completo de classes da campanha.
 *
 * As classes oficiais de game-data são SEMPRE ofertadas, mesmo quando nenhum
 * viajante da campanha as escolheu. O filtro de publicação aplica-se SOMENTE
 * às classes personalizadas e deve ser executado na camada de permissão.
 *
 * Mantemos os argumentos legados para compatibilidade com os criadores de
 * personagens/NPCs, fichas, livros e rotas existentes.
 */
export function getCampaignClassCatalog(
  _characters: readonly unknown[],
  customClasses: readonly GameClass[],
  _preserveClassIds: readonly string[] = [],
): GameClass[] {
  // Prioridade para os registros oficiais: uma classe personalizada não pode
  // sobrescrever, por colisão de ID, a definição estável do game-data.
  const unique = new Map<string, GameClass>()
  for (const cls of CLASSES) unique.set(cls.id, cls)

  for (const cls of customClasses) {
    if (!cls || typeof cls.id !== "string" || !cls.id.trim() ||
        typeof cls.name !== "string" || !cls.name.trim()) continue
    if (!unique.has(cls.id)) unique.set(cls.id, cls)
  }
  return Array.from(unique.values())
}

export function baseGameClasses(classes: readonly GameClass[]): GameClass[] {
  return classes.filter(cls => !cls.parentClassId)
}

export function subclassesFor(classes: readonly GameClass[], parentId: string): GameClass[] {
  return classes.filter(cls => cls.parentClassId === parentId)
}

/** Subclasses não acrescentam um nível independente à classe-mãe. */
export function classLevelsFromSkills(
  skills: Readonly<Record<string, number>>,
  classes: readonly GameClass[],
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const cls of classes) {
    if (cls.parentClassId) continue
    const level = (cls.skills || []).reduce(
      (sum, s) => sum + Math.max(0, Number(skills[s.id]) || 0),
      0,
    )
    if (level > 0) result[cls.id] = level
  }
  return result
}
