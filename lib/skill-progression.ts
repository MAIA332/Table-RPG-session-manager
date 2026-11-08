/** Progressão derivada exclusivamente dos níveis das habilidades aprendidas.
 * Bônus gratuitos fazem parte de `skills` e também entram no total.
 * XP continua sendo uma moeda/recurso independente, sem definir o nível.
 */
export function skillRank(value: unknown): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : 0
}

export function characterSkillLevel(skills: Record<string, number> | undefined, initialLevel = 5): number {
  const ranks = Object.values(skills ?? {}).reduce<number>((sum, rank) => sum + skillRank(rank), 0)
  return Math.max(initialLevel, ranks)
}

export interface SkillClassDefinition {
  id: string
  parentClassId?: string | null
  skills?: ReadonlyArray<{ id: string }>
}

export interface OwnedSkillClass { classId: string; level: number }

/** Os níveis de classe são derivados para compatibilidade com regras antigas
 * que usam classes[].level ao calcular vida e mana. Não são pontos separados.
 * Atribui cada habilidade somente uma vez, preferindo a classe adquirida.
 */
export function deriveSkillClassLevels<T extends OwnedSkillClass>(
  owned: readonly T[], skills: Record<string, number> | undefined,
  catalog: readonly SkillClassDefinition[],
): T[] {
  const claimed = new Set<string>()
  return owned.map(entry => {
    const definition = catalog.find(cls => cls.id === entry.classId)
    const skillIds = [
      ...(definition?.skills ?? []).map(skill => skill.id),
      ...catalog.filter(cls => cls.parentClassId === entry.classId)
        .flatMap(cls => (cls.skills ?? []).map(skill => skill.id)),
    ]
    let total = 0
    for (const id of skillIds) {
      if (claimed.has(id)) continue
      claimed.add(id)
      total += skillRank(skills?.[id])
    }
    // Quando a definição da classe não é conhecida, não inventa níveis.
    return { ...entry, level: definition ? total : skillRank(entry.level) }
  })
}

/**
 * Diferença entre duas versões da ficha, sem apagar ajustes manuais de vida/mana.
 * computeMaxResources é injetado para usar as mesmas regras do projeto.
 */
export function progressionResourceDelta<Attributes>(
  before: { classes: OwnedSkillClass[]; skills: Record<string, number>; attributes: Attributes },
  after: { classes: OwnedSkillClass[]; skills: Record<string, number>; attributes: Attributes },
  catalog: readonly SkillClassDefinition[],
  compute: (classes: OwnedSkillClass[], attributes: Attributes) => { maxHp: number; maxMp: number; maxIp: number },
): { maxHp: number; maxMp: number; maxIp: number } {
  const oldDerived = deriveSkillClassLevels(before.classes, before.skills, catalog)
  const newDerived = deriveSkillClassLevels(after.classes, after.skills, catalog)
  const oldMax = compute(oldDerived, before.attributes)
  const newMax = compute(newDerived, after.attributes)
  return {
    maxHp: newMax.maxHp - oldMax.maxHp,
    maxMp: newMax.maxMp - oldMax.maxMp,
    maxIp: newMax.maxIp - oldMax.maxIp,
  }
}

/**
 * Edições manuais do Mestre são concessões gratuitas. Registra quantos ranks
 * foram dados sem XP, usando o mesmo marcador que o Atlas de Evolução conhece.
 * Ao reduzir uma habilidade, remove primeiro ranks gratuitos; ranks pagos só
 * são devolvidos quando não restam concessões para retirar.
 */
export function reconcileGmFreeSkillRecords(
  previousSkills: Record<string, number>,
  nextSkills: Record<string, number>,
  rawModifiers: unknown,
): Record<string, unknown>[] {
  const modifiers: Record<string, unknown>[] = Array.isArray(rawModifiers)
    ? rawModifiers.filter((entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && !Array.isArray(entry),
      ).map(entry => ({ ...entry }))
    : []
  const allSkillIds = new Set([...Object.keys(previousSkills), ...Object.keys(nextSkills)])

  for (const skillId of allSkillIds) {
    const before = skillRank(previousSkills[skillId])
    const after = skillRank(nextSkills[skillId])
    if (before === after) continue

    const markerId = `free_skill:${skillId}`
    const markerIndex = modifiers.findIndex(entry => entry.id === markerId)
    const existing = markerIndex >= 0 ? modifiers[markerIndex] : undefined
    const oldFree = Math.min(before, skillRank(existing?.value))
    const free = Math.min(after, Math.max(0, oldFree + after - before))

    // Um marcador explícito zero evita tratar ranks pagos de classes antigas
    // como gratuitos no fallback legado da ficha.
    if (markerIndex >= 0) {
      modifiers[markerIndex] = { ...existing, value: free }
    } else {
      modifiers.push({
        id: markerId,
        name: `Nível gratuito de habilidade: ${skillId}`,
        target: "free_skill_hidden",
        value: free,
      })
    }
  }
  return modifiers
}
