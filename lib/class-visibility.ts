/** Regras de publicação de classes por campanha.
 * Dados legados sem playerVisible continuam visíveis (compatibilidade).
 * Novas classes devem ser criadas pelo mestre com playerVisible: false.
 */
import { CLASSES, type GameClass } from "./game-data"

export type CustomClassVisibility = GameClass & { playerVisible?: boolean }

/** Uma classe custom apenas fica oculta quando o mestre a bloqueou explicitamente. */
export function isClassPublished(cls: unknown): boolean {
  return !cls || typeof cls !== "object" || (cls as { playerVisible?: boolean }).playerVisible !== false
}

/** A subclasse depende também da publicação da respectiva classe-mãe custom. */
export function isClassAvailableToPlayers(
  classId: string,
  customClasses: readonly CustomClassVisibility[],
): boolean {
  // IDs oficiais nunca dependem do controle de publicação dos homebrews.
  if (CLASSES.some(cls => cls.id === classId)) return true
  const byId = new Map(customClasses.map(cls => [cls.id, cls]))
  const visited = new Set<string>()
  let current = byId.get(classId)
  while (current) {
    if (!isClassPublished(current)) return false
    if (visited.has(current.id)) return false // cadastro cíclico
    visited.add(current.id)
    current = current.parentClassId ? byId.get(current.parentClassId) : undefined
  }
  return true
}

/** Filtra a lista mostrada ao jogador sem alterar as classes históricas do personagem. */
export function playerVisibleClassCatalog<T extends { id: string }>(
  catalog: readonly T[],
  customClasses: readonly CustomClassVisibility[],
): T[] {
  return catalog.filter(cls => isClassAvailableToPlayers(cls.id, customClasses))
}

/** Subclasses exigem seleção prévia; o mestre pode conceder níveis livremente. */
export function canPlayerUpgradeClass(
  definition: { id: string; parentClassId?: string },
  customClasses: readonly CustomClassVisibility[],
  selectedSubclassIds: readonly string[] = [],
): boolean {
  return isClassAvailableToPlayers(definition.id, customClasses) &&
    (!definition.parentClassId || selectedSubclassIds.includes(definition.id))
}

/** Guard para executar na rota PATCH de personagens após autenticar o ator.
 * Somente chamadas dos jogadores precisam desta validação; mestre tem permissão.
 * NÃO substitui a validação existente de pontos, níveis e propriedade do personagem.
 */
export function assertPublishedSkillUpgrades(
  before: { skills?: Record<string, number>; classes?: Array<{ classId?: string; id?: string }> },
  updates: { skills?: Record<string, number>; classes?: Array<{ classId?: string; id?: string }> },
  customClasses: readonly CustomClassVisibility[],
): void {
  if (updates.skills && typeof updates.skills === "object") {
    for (const cls of customClasses) {
      if (isClassAvailableToPlayers(cls.id, customClasses)) continue
      for (const skill of cls.skills || []) {
        const previous = Number(before.skills?.[skill.id] ?? 0)
        const requested = Number(updates.skills[skill.id] ?? previous)
        if (requested > previous)
          throw new Error(`A classe "${cls.name}" não está liberada pelo mestre para evolução.`)
      }
    }
  }
  if (Array.isArray(updates.classes)) {
    const previous = new Set((before.classes || []).map(cls => cls.classId ?? cls.id))
    for (const cls of updates.classes) {
      const id = cls.classId ?? cls.id
      if (id && !previous.has(id) && !isClassAvailableToPlayers(id, customClasses))
        throw new Error("Esta classe não está liberada pelo mestre.")
    }
  }
}
