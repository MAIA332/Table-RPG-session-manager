/** Estado de treinamento persistido na ficha; os horários são absolutos (UTC em ms). */
export const TRAINING_ATTRIBUTES = ["mig", "wlp", "dex", "ins"] as const
export type TrainingAttribute = (typeof TRAINING_ATTRIBUTES)[number]
/** Meta inicial de cada atributo. A meta cresce após cada evolução POR TREINAMENTO. */
export const TRAINING_GOAL = 6
export const TRAINING_GOAL_INCREMENT = 2
export const TRAINING_OPTIONS = {
  12: { points: 0.5, realMinutes: 60, fatigueMinutes: 10, dexPenalty: 1 },
  24: { points: 1, realMinutes: 120, fatigueMinutes: 20, dexPenalty: 2 },
  36: { points: 1.5, realMinutes: 180, fatigueMinutes: 30, dexPenalty: 3 },
  48: { points: 2, realMinutes: 240, fatigueMinutes: 40, dexPenalty: 4 },
} as const
export type TrainingHours = keyof typeof TRAINING_OPTIONS

export type TrainingState = {
  points: Record<TrainingAttribute, number>
  /** Melhoria gratuita via treino; não consome os pontos de atributo obtidos por nível. */
  upgrades: Record<TrainingAttribute, number>
  active?: { attribute: TrainingAttribute; hours: TrainingHours; startedAt: number; endsAt: number }
  fatigue?: { startedAt: number; endsAt: number; dexPenalty: number }
}

export function normalizeTraining(input: unknown): TrainingState {
  const source = input && typeof input === "object" ? input as Partial<TrainingState> : {}
  const points = {} as TrainingState["points"]
  const upgrades = {} as TrainingState["upgrades"]
  for (const attribute of TRAINING_ATTRIBUTES) {
    const n = source.points?.[attribute]
    points[attribute] = typeof n === "number" && Number.isFinite(n) && n >= 0
      ? Math.round(n * 2) / 2 : 0
    const earned = source.upgrades?.[attribute]
    upgrades[attribute] = typeof earned === "number" && Number.isSafeInteger(earned) && earned >= 0 ? earned : 0
  }
  return {
    points,
    upgrades,
    ...(source.active ? { active: { ...source.active } } : {}),
    ...(source.fatigue ? { fatigue: { ...source.fatigue } } : {}),
  }
}

/** MIG, WLP, DEX e INS têm metas independentes: 6 → 8 → 10 → 12... */
export function trainingGoal(input: unknown, attribute: TrainingAttribute): number {
  const { upgrades } = normalizeTraining(input)
  return TRAINING_GOAL + upgrades[attribute] * TRAINING_GOAL_INCREMENT
}

/** Debita a meta antiga e só depois aumenta o limite do próximo ciclo. */
export function spendTrainingUpgrade(input: unknown, attribute: TrainingAttribute): TrainingState | null {
  const state = normalizeTraining(input)
  const cost = trainingGoal(state, attribute)
  if (state.points[attribute] < cost) return null
  state.points[attribute] = Math.round((state.points[attribute] - cost) * 2) / 2
  state.upgrades[attribute] += 1
  return state
}

export function isTrainingActive(input: unknown, now = Date.now()): boolean {
  const active = normalizeTraining(input).active
  return Boolean(active && Number.isFinite(active.endsAt) && active.endsAt > now)
}

export function trainingFatiguePenalty(input: unknown, now = Date.now()): number {
  const fatigue = normalizeTraining(input).fatigue
  return fatigue && fatigue.startedAt <= now && fatigue.endsAt > now ? fatigue.dexPenalty : 0
}

/** Conclusão idempotente: acumula uma vez, mesmo após recarregar ou reconectar. */
export function settleTraining(input: unknown, now = Date.now()): { state: TrainingState; completed: boolean } {
  const state = normalizeTraining(input)
  const active = state.active
  if (!active || active.endsAt > now) return { state, completed: false }
  const option = TRAINING_OPTIONS[active.hours]
  if (!option || !TRAINING_ATTRIBUTES.includes(active.attribute)) {
    delete state.active
    return { state, completed: true }
  }
  state.points[active.attribute] = Math.round((state.points[active.attribute] + option.points) * 2) / 2
  state.fatigue = {
    startedAt: active.endsAt,
    endsAt: active.endsAt + option.fatigueMinutes * 60_000,
    dexPenalty: option.dexPenalty,
  }
  delete state.active
  return { state, completed: true }
}

export function nextAttributeDie(die: string): string | null {
  const index = ["d6", "d8", "d10", "d12", "d14", "d16", "d18", "d20"].indexOf(die)
  return index >= 0 && index < 7 ? ["d8", "d10", "d12", "d14", "d16", "d18", "d20"][index] : null
}

export function fatigueModifier(input: unknown, now = Date.now()) {
  const fatigue = normalizeTraining(input).fatigue
  if (!fatigue || fatigue.endsAt <= now) return null
  return {
    id: "training_fatigue", type: "training_fatigue", name: "Cansado",
    target: "dex", value: -fatigue.dexPenalty,
    startedAt: fatigue.startedAt, expiresAt: fatigue.endsAt,
  }
}
