/** Regras de desgaste, partilhadas pelo combate, fichas e painel do Mestre. */
export const CRISIS_ATTRIBUTES = ["mig", "ins", "wlp", "dex"] as const
export type CrisisAttribute = (typeof CRISIS_ATTRIBUTES)[number]
export type CrisisConditionKind = "adrenaline" | "modifier" | "dot" | "paralysis" | "stun"
export type CrisisProgression = {
  enabled: boolean
  /** Dano de HP acumulado enquanto a entidade permanece em crise. */
  hpLossStep: number
  mode: "intensity" | "new_condition" | "both"
  /** Incremento por estágio do modificador ou do dano periódico. */
  modifierPerStep: number
  /** ID de outra condição cadastrada pelo Mestre, criada em cada estágio. */
  addConditionId?: string
}

export type CrisisCondition = {
  id: string
  name: string
  description: string
  enabled: boolean
  kind: CrisisConditionKind
  /** Apenas atributos e IDs dos testes oficiais. Ex.: mig ou check:c23. */
  target?: string
  modifier?: number
  damage?: number
  intervalSeconds?: number
  progression?: CrisisProgression
  applicationId?:any
  stage?:any
}
export type CrisisAppliedCondition = { id: string; definition: CrisisCondition; appliedAt: number }
export type CrisisProgress = { lastHp: number; accumulatedLoss: number; steps: number }
export type ResolvedCrisisCondition = CrisisCondition & {
  source: "automatic" | "manual" | "progressive"
  applicationId: string
  stage?: number
  nextTickAt?: number
}
export type CrisisConfig = {
  enabled: boolean
  thresholdPercent: number
  conditions: CrisisCondition[]
}
export type CrisisEntityStatus = {
  conditions: ResolvedCrisisCondition[]
  crisis: boolean
  /** A lista administrativa existe mesmo quando o alvo está com 0 HP. */
  manualApplied?: Array<{ applicationId: string; name: string; description: string }>
}
export type CrisisPublicState = {
  enabled: boolean
  thresholdPercent: number
  players: Record<string, CrisisEntityStatus>
  creatures: Record<string, CrisisEntityStatus>
}

export function defaultCrisisConfig(): CrisisConfig {
  return {
    enabled: false,
    thresholdPercent: 35,
    conditions: [
      { id: "adrenaline", name: "Adrenalina", description: "+2 em Vigor (MIG) e +1 em Intuição (INS).", enabled: true, kind: "adrenaline" },
      { id: "bleeding", name: "Sangramento", description: "Perda contínua de vida enquanto estiver em crise.", enabled: false, kind: "dot", damage: 1, intervalSeconds: 60 },
      { id: "poison", name: "Envenenado", description: "Dano de veneno periódico.", enabled: false, kind: "dot", damage: 2, intervalSeconds: 60 },
      { id: "paralysis", name: "Paralisia", description: "Bloqueia todas as rolagens e testes.", enabled: false, kind: "paralysis" },
      { id: "stun", name: "Atordoamento", description: "Cada rolagem causa 1 ponto de dano ao próprio autor.", enabled: false, kind: "stun" },
    ],
  }
}

const kinds = ["adrenaline", "modifier", "dot", "paralysis", "stun"] as const

/** Falha fechada em entradas inválidas; evita valores arbitrários da rede. */
export function parseCrisisConfig(input: unknown, validCheckIds: readonly string[] = []): CrisisConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuração de desgaste inválida.")
  const data = input as Record<string, unknown>
  if (typeof data.enabled !== "boolean" || typeof data.thresholdPercent !== "number" ||
    !Number.isInteger(data.thresholdPercent) || data.thresholdPercent < 1 || data.thresholdPercent > 100)
    throw new Error("Defina o gatilho de crise entre 1% e 100%.")
  if (!Array.isArray(data.conditions) || data.conditions.length > 30) throw new Error("Lista de condições inválida (máximo 30).")
  const seen = new Set<string>()
  const conditions = data.conditions.map((raw): CrisisCondition => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Condição inválida.")
    const row = raw as Record<string, unknown>
    const id = typeof row.id === "string" ? row.id.trim() : ""
    const name = typeof row.name === "string" ? row.name.trim() : ""
    const description = typeof row.description === "string" ? row.description.trim() : ""
    if (!/^[a-zA-Z0-9_-]{1,70}$/.test(id) || seen.has(id) || !name || name.length > 80 ||
      description.length > 500 || typeof row.enabled !== "boolean" ||
      !kinds.includes(row.kind as CrisisConditionKind)) throw new Error("ID, nome, descrição ou tipo de condição inválido.")
    seen.add(id)
    const kind = row.kind as CrisisConditionKind
    if (id === "adrenaline" && kind !== "adrenaline") throw new Error("O modelo Adrenalina é reservado.")
    if (kind === "adrenaline" && id !== "adrenaline") throw new Error("Não duplique a condição Adrenalina.")
    const condition: CrisisCondition = { id, name, description, enabled: row.enabled, kind }
    if (kind === "modifier") {
      const target = typeof row.target === "string" ? row.target : ""
      if (!CRISIS_ATTRIBUTES.some(a => a === target) &&
        !(target.startsWith("check:") && validCheckIds.includes(target.slice(6))))
        throw new Error(`Alvo inválido para ${name}: escolha atributo ou teste do sistema.`)
      if (typeof row.modifier !== "number" || !Number.isInteger(row.modifier) || Math.abs(row.modifier) > 100)
        throw new Error(`Modificador inválido de ${name}: use um inteiro entre -100 e +100.`)
      condition.target = target
      condition.modifier = row.modifier
    }
    if (kind === "dot") {
      if (typeof row.damage !== "number" || !Number.isInteger(row.damage) || row.damage < 1 || row.damage > 100000 ||
        typeof row.intervalSeconds !== "number" || !Number.isInteger(row.intervalSeconds) || row.intervalSeconds < 5 || row.intervalSeconds > 86400)
        throw new Error(`Dano ou intervalo inválido para ${name}.`)
      condition.damage = row.damage
      condition.intervalSeconds = row.intervalSeconds
    }
    if (kind === "stun") condition.damage = 1
    if (row.progression !== undefined) {
      const p = row.progression
      if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(`Progressão inválida para ${name}.`)
      const value = p as Record<string, unknown>
      const mode = value.mode
      if (typeof value.enabled !== "boolean" ||
        !Number.isSafeInteger(value.hpLossStep) || Number(value.hpLossStep) < 1 || Number(value.hpLossStep) > 100000 ||
        !["intensity", "new_condition", "both"].includes(String(mode)) ||
        !Number.isSafeInteger(value.modifierPerStep) || Math.abs(Number(value.modifierPerStep)) > 100 ||
        ((mode === "intensity" || mode === "both") && !["modifier", "dot"].includes(kind)) ||
        ((mode === "new_condition" || mode === "both") && (typeof value.addConditionId !== "string" || !value.addConditionId || value.addConditionId === id)))
        throw new Error(`Progressão inválida para ${name}.`)
      condition.progression = {
        enabled: value.enabled, hpLossStep: Number(value.hpLossStep),
        mode: mode as CrisisProgression["mode"], modifierPerStep: Number(value.modifierPerStep),
        ...(typeof value.addConditionId === "string" && value.addConditionId ? { addConditionId: value.addConditionId } : {}),
      }
    }
    return condition
  })
  for (const condition of conditions) {
    const p = condition.progression
    if (p?.enabled && (p.mode === "new_condition" || p.mode === "both") &&
      !conditions.some(candidate => candidate.id === p.addConditionId))
      throw new Error(`A condição progressiva ${condition.name} aponta para um efeito inexistente.`)
  }
  return { enabled: data.enabled, thresholdPercent: data.thresholdPercent, conditions }
}

export function normalizeCrisisConfig(input: unknown, validCheckIds: readonly string[] = []): CrisisConfig {
  if (input === undefined || input === null) return defaultCrisisConfig()
  try { return parseCrisisConfig(input, validCheckIds) }
  catch { return defaultCrisisConfig() }
}

/** O gatilho vale em qualquer ficha da campanha, mesmo sem combate ativo. */
export function activeCrisisConditions(config: CrisisConfig, hp: number, maxHp: number): CrisisCondition[] {
  if (!config.enabled || !Number.isFinite(hp) || !Number.isFinite(maxHp) ||
    hp <= 0 || maxHp <= 0 || hp / maxHp * 100 > config.thresholdPercent) return []
  return config.conditions.filter(condition => condition.enabled)
}

/** Resolve os efeitos manuais sem depender do switch global nem de estar em combate. */
export function resolveCrisisConditions(
  config: CrisisConfig,
  hp: number,
  maxHp: number,
  manual: readonly CrisisAppliedCondition[] = [],
  progress: Record<string, CrisisProgress> = {},
): ResolvedCrisisCondition[] {
  if (hp <= 0 || maxHp <= 0) return []
  const manuallySelected = new Set(manual.map(entry => entry.definition.id))
  const auto = activeCrisisConditions(config, hp, maxHp).filter(c => !manuallySelected.has(c.id)).map(condition => ({
    ...condition, source: "automatic" as const, applicationId: `auto:${condition.id}`,
  }))
  const applied = manual.map(entry => ({
    ...entry.definition, enabled: true, source: "manual" as const, applicationId: `manual:${entry.id}`,
  }))
  const all: ResolvedCrisisCondition[] = [...auto, ...applied]
  const inCrisis = hp / maxHp * 100 <= config.thresholdPercent
  if (!inCrisis) return all
  const additions: ResolvedCrisisCondition[] = []
  for (const condition of all) {
    const progression = condition.progression
    const steps = Math.min(20, Math.max(0, progress[condition.applicationId]?.steps || 0))
    if (!progression?.enabled || !steps) continue
    condition.stage = steps
    if (progression.mode === "intensity" || progression.mode === "both") {
      if (condition.kind === "modifier") condition.modifier = (condition.modifier || 0) + steps * progression.modifierPerStep
      if (condition.kind === "dot") condition.damage = Math.max(1, (condition.damage || 1) + steps * progression.modifierPerStep)
    }
    if ((progression.mode === "new_condition" || progression.mode === "both") && progression.addConditionId) {
      const child = config.conditions.find(c => c.id === progression.addConditionId)
      if (!child) continue
      for (let stage = 1; stage <= steps; stage++) {
        additions.push({
          ...child, enabled: true, progression: undefined, source: "progressive",
          applicationId: `progress:${condition.applicationId}:${stage}:${child.id}`, stage,
        })
      }
    }
  }
  return [...all, ...additions]
}

/** Registra somente HP perdido durante a crise; cura não apaga danos já sofridos. */
export function advanceCrisisProgress(
  config: CrisisConfig, hp: number, maxHp: number,
  conditions: readonly ResolvedCrisisCondition[],
  previous: Record<string, CrisisProgress> = {},
): Record<string, CrisisProgress> {
  if (hp <= 0 || maxHp <= 0 || hp / maxHp * 100 > config.thresholdPercent) return {}
  const updated: Record<string, CrisisProgress> = {}
  for (const condition of conditions) {
    const rule = condition.progression
    if (!rule?.enabled || condition.source === "progressive") continue
    const before = previous[condition.applicationId]
    const accumulatedLoss = (before?.accumulatedLoss || 0) + Math.max(0, (before?.lastHp ?? hp) - hp)
    updated[condition.applicationId] = {
      lastHp: hp, accumulatedLoss,
      steps: Math.min(20, Math.floor(accumulatedLoss / rule.hpLossStep)),
    }
  }
  return updated
}

export function crisisRollModifier(conditions: readonly CrisisCondition[], attrs: readonly string[], checkId?: string): number {
  let total = 0
  for (const condition of conditions) {
    if (condition.kind === "adrenaline") {
      if (attrs.includes("mig")) total += 2
      if (attrs.includes("ins")) total += 1
    } else if (condition.kind === "modifier" && (
      attrs.includes(condition.target || "") || (checkId && condition.target === `check:${checkId}`)
    )) total += condition.modifier || 0
  }
  return total
}

export const crisisBlocksRoll = (conditions: readonly CrisisCondition[]) => conditions.some(c => c.kind === "paralysis")
export const crisisSelfDamageOnRoll = (conditions: readonly CrisisCondition[]) => conditions.some(c => c.kind === "stun") ? 1 : 0
