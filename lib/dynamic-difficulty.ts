/** Guia de dificuldade para paradas de dados independentes e justas.
 * Uma distribuição normal é uma APROXIMAÇÃO para poucos dados discretos;
 * lambda < 1 desloca as taxas para premiar a evolução do personagem.
 * Não altera nenhuma regra de rolagem, bônus, falha crítica ou dano do RPG.
 */
export const DIFFICULTY_LAMBDA = 0.6 as const
/** σ é calculado pelos dados. Este fator configura a influência de σ nos ALVOS,
 * não altera a variância física dos dados nem a rolagem propriamente dita. */
export const DEFAULT_DIFFICULTY_SETTINGS: Readonly<DifficultySettings> = Object.freeze({
  lambda: DIFFICULTY_LAMBDA, sigmaMultiplier: 1,
})
export type DifficultySettings = { lambda: number; sigmaMultiplier: number }

/** Validação rígida para a API e para o editor. Nenhuma correção silenciosa. */
export function validateDifficultySettings(value: unknown): DifficultySettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Configuração do guia inválida.")
  const data = value as Record<string, unknown>
  if (typeof data.lambda !== "number" || !Number.isFinite(data.lambda) || data.lambda < 0 || data.lambda > 1)
    throw new Error("Lambda precisa estar entre 0 e 1.")
  if (typeof data.sigmaMultiplier !== "number" || !Number.isFinite(data.sigmaMultiplier) ||
      data.sigmaMultiplier < 0.5 || data.sigmaMultiplier > 2)
    throw new Error("O multiplicador de σ precisa estar entre 0,5 e 2.")
  return { lambda: data.lambda, sigmaMultiplier: data.sigmaMultiplier }
}

/** Compatibilidade com campanhas criadas antes do editor de parâmetros. */
export function readDifficultySettings(value: unknown): DifficultySettings {
  try { return validateDifficultySettings(value) }
  catch { return { ...DEFAULT_DIFFICULTY_SETTINGS } }
}


export type DifficultyTier = "critical" | "failure" | "easy" | "medium" | "hard" | "extreme"
export type DifficultyTargets = {
  critical: number
  easy: number
  medium: number
  hard: number
  extreme: number
}
export type DiceMoments = { mean: number; deviation: number }
export type DifficultyAnalysis = {
  sides: number[]
  baseSides: number[]
  actual: DiceMoments
  base: DiceMoments
  effective: DiceMoments
  targets: DifficultyTargets
  result: number
  tier: DifficultyTier
  lambda: number
  sigmaMultiplier: number
}

/** Extrai exclusivamente tamanhos de dados, nunca faces sorteadas ou modificadores. */
export function dicePoolFromLabel(label: unknown): number[] {
  if (typeof label !== "string" || label.length > 3000) return []
  const values: number[] = []
  const regex = /(^|[^\w])(\d{1,2})?d(\d{1,4})(?![\w])/gi
  for (const match of label.matchAll(regex)) {
    const quantity = match[2] ? Number(match[2]) : 1
    const sides = Number(match[3])
    if (!Number.isSafeInteger(quantity) || quantity < 1 ||
        !Number.isSafeInteger(sides) || sides < 2 || sides > 1000 ||
        values.length + quantity > 24) return []
    for (let i = 0; i < quantity; i++) values.push(sides)
  }
  return values
}

/** A ordem de preferência evita duplicar dados listados no rótulo e no breakdown. */
export function dicePoolFromEvent(event: {
  attribute?: unknown
  dice?: unknown
  breakdown?: unknown
}): number[] {
  // O evento explícito tem precedência quando contém faces (e não valores
  // sorteados). Em eventos antigos, usa o trecho da parada entre colchetes.
  if (Array.isArray(event.dice) && event.dice.length <= 24) {
    const pool = event.dice.flatMap((entry: unknown) => {
      if (typeof entry === "string") return dicePoolFromLabel(entry)
      if (!entry || typeof entry !== "object") return []
      const record = entry as Record<string, unknown>
      const sides = record.sides ?? record.faces
      return typeof sides === "number" && Number.isSafeInteger(sides) && sides >= 2 && sides <= 1000
        ? [sides] : []
    })
    if (pool.length && pool.length === event.dice.length) return pool
  }
  if (typeof event.attribute === "string") {
    const bracketPools = [...event.attribute.matchAll(/\[([^\]]+)\]/g)]
      .map(match => dicePoolFromLabel(match[1])).filter(pool => pool.length)
    if (bracketPools.length) return bracketPools[bracketPools.length - 1]
  }
  const labelPool = dicePoolFromLabel(event.attribute)
  if (labelPool.length) return labelPool
  return dicePoolFromLabel(event.breakdown)
}

export function diceMoments(sides: readonly number[]): DiceMoments {
  if (!sides.length || sides.length > 24 ||
      sides.some(f => !Number.isSafeInteger(f) || f < 2 || f > 1000)) {
    throw new Error("Parada de dados inválida.")
  }
  return {
    mean: sides.reduce((sum, f) => sum + (f + 1) / 2, 0),
    deviation: Math.sqrt(sides.reduce((sum, f) => sum + (f * f - 1) / 12, 0)),
  }
}

/** Mundo-base: 1d8/2d8, 3d8, n>=4 d10 para cada dado. */
export function worldBaseDice(count: number): number[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 24) throw new Error("Quantidade de dados inválida.")
  return Array.from({ length: count }, () => count <= 3 ? 8 : 10)
}

/** Targets arredondados como DC = round(mu + k*sigma), incluindo k crítico -1.40. */
export function difficultyTargets(moment: DiceMoments): DifficultyTargets {
  const { mean, deviation } = moment
  return {
    critical: Math.round(mean - 1.4 * deviation),
    easy: Math.round(mean - 0.67 * deviation),
    medium: Math.round(mean),
    hard: Math.round(mean + 0.67 * deviation),
    extreme: Math.round(mean + 1.28 * deviation),
  }
}

/** Uma faixa é a MELHOR categoria alcançada pelo resultado FINAL. */
export function reachedDifficulty(result: number, t: DifficultyTargets): DifficultyTier {
  if (result <= t.critical) return "critical"
  if (result >= t.extreme) return "extreme"
  if (result >= t.hard) return "hard"
  if (result >= t.medium) return "medium"
  if (result >= t.easy) return "easy"
  return "failure"
}

export function analyzeDifficulty(
  sides: readonly number[], result: number,
  config: number | DifficultySettings = DEFAULT_DIFFICULTY_SETTINGS,
): DifficultyAnalysis {
  if (!Number.isFinite(result)) throw new Error("Resultado final inválido.")
  const settings = validateDifficultySettings(typeof config === "number"
    ? { lambda: config, sigmaMultiplier: 1 } : config)
  const { lambda, sigmaMultiplier } = settings
  const actual = diceMoments(sides)
  const baseSides = worldBaseDice(sides.length)
  const base = diceMoments(baseSides)
  const effective = {
    mean: base.mean + lambda * (actual.mean - base.mean),
    deviation: (base.deviation + lambda * (actual.deviation - base.deviation)) * sigmaMultiplier,
  }
  const targets = difficultyTargets(effective)
  return { sides: [...sides], baseSides, actual, base, effective, targets,
    result, tier: reachedDifficulty(result, targets), lambda, sigmaMultiplier }
}

/** Tabela puramente Gaussiana para comparação com progressão, sem lambda. */
export const DIFFICULTY_REFERENCES = [
  { label: "2d8", sides: [8, 8] },
  { label: "2d12", sides: [12, 12] },
  { label: "2d20", sides: [20, 20] },
  { label: "3d8", sides: [8, 8, 8] },
  { label: "3d12", sides: [12, 12, 12] },
  { label: "3d20", sides: [20, 20, 20] },
  { label: "4d10", sides: [10, 10, 10, 10] },
  { label: "4d14", sides: [14, 14, 14, 14] },
  { label: "4d20", sides: [20, 20, 20, 20] },
] as const

/** Distribuição DISCRETA exata para os exemplos didáticos do livro.
 * Não é usada para decidir sucesso ou recalcular dados do jogo. */
export function exactSuccessProbability(sides: readonly number[], target: number, bonus = 0): number {
  if (!sides.length || sides.length > 6 || sides.some(f => !Number.isSafeInteger(f) || f < 2 || f > 30))
    throw new Error("Exemplo de probabilidade admite até 6 dados de até 30 faces.")
  if (!Number.isFinite(target) || !Number.isFinite(bonus)) throw new Error("Limite inválido.")
  let distribution = [1]
  for (const faces of sides) {
    const next = Array(distribution.length + faces).fill(0) as number[]
    for (let sum = 0; sum < distribution.length; sum++)
      for (let face = 1; face <= faces; face++) next[sum + face] += distribution[sum] / faces
    distribution = next
  }
  return distribution.reduce((chance, weight, sum) => chance + (sum + bonus >= target ? weight : 0), 0)
}
