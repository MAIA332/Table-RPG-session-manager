/** Dados de um teste personalizado enviado pelo Mestre para a rolagem. */
export type MonsterCustomDie =
  | { kind: "attribute"; attribute: "dex" | "ins" | "mig" | "wlp" }
  | { kind: "fixed"; sides: number }

export type MonsterCustomCheck = {
  id: string
  name: string
  dice: MonsterCustomDie[]
}

const ATTRIBUTE_NAMES = new Set(["dex", "ins", "mig", "wlp"])
const ATTRIBUTE_DICE = /^d(4|6|8|10|12|20)$/

/** Nunca usa uma fórmula arbitrária do cliente: valida cada dado e o limite de dez. */
export function parseMonsterCustomCheck(raw: unknown): MonsterCustomCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Teste personalizado inválido")
  }
  const input = raw as Record<string, unknown>
  if (typeof input.id !== "string" || !input.id.trim() || input.id.length > 120 ||
      typeof input.name !== "string" || !input.name.trim() || input.name.length > 120 ||
      !Array.isArray(input.dice) || input.dice.length < 1 || input.dice.length > 10) {
    throw new Error("Identificação ou quantidade de dados inválida")
  }
  const dice: MonsterCustomDie[] = input.dice.map((entry: unknown): MonsterCustomDie => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Dado personalizado inválido")
    }
    const die = entry as Record<string, unknown>
    if (die.kind === "attribute" && typeof die.attribute === "string" &&
        ATTRIBUTE_NAMES.has(die.attribute)) {
      return {
        kind: "attribute",
        attribute: die.attribute as Extract<MonsterCustomDie, { kind: "attribute" }>["attribute"],
      }
    }
    if (die.kind === "fixed" && typeof die.sides === "number" &&
        Number.isSafeInteger(die.sides) && die.sides >= 2 && die.sides <= 1000) {
      return { kind: "fixed", sides: die.sides }
    }
    throw new Error("Dado personalizado não permitido")
  })
  return { id: input.id, name: input.name, dice }
}

/** Resolve atributos da criatura na ordem exata configurada no teste. */
export function resolveMonsterCustomDice(
  check: MonsterCustomCheck,
  attributes: Record<"dex" | "ins" | "mig" | "wlp", string>,
): string[] {
  return check.dice.map(die => {
    if (die.kind === "fixed") return `d${die.sides}`
    const value = String(attributes[die.attribute] || "")
    if (!ATTRIBUTE_DICE.test(value)) throw new Error(`Dado do atributo ${die.attribute} inválido`)
    return value
  })
}

/** Recebe uma fonte de aleatoriedade auditável; no combate real usa node:crypto. */
export function rollMonsterCustomDice(
  dice: string[],
  face: (sides: number) => number,
): { rolls: number[]; result: number } {
  if (dice.length < 1 || dice.length > 10) throw new Error("Quantidade de dados inválida")
  const rolls = dice.map(die => {
    const sides = Number(die.slice(1))
    if (!/^d\d{1,4}$/.test(die) || !Number.isSafeInteger(sides) || sides < 2 || sides > 1000) {
      throw new Error("Dado inválido")
    }
    const value = face(sides)
    if (!Number.isSafeInteger(value) || value < 1 || value > sides) {
      throw new Error("Resultado do dado inválido")
    }
    return value
  })
  return { rolls, result: rolls.reduce((total, value) => total + value, 0) }
}
