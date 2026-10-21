/** Testes customizados da campanha. Apenas o mestre gerencia; jogadores recebem somente os públicos. */
export type CustomCheckAttribute = "dex" | "ins" | "mig" | "wlp"
export type CustomCheckDie =
  | { kind: "fixed"; sides: number }
  | { kind: "attribute"; attribute: CustomCheckAttribute }

export interface CustomCheck {
  id: string
  name: string
  description: string
  dice: CustomCheckDie[]
  isPublic: boolean
}

export const CUSTOM_CHECK_DICE_LIMIT = 10
export const CUSTOM_CHECK_LIMIT = 100
export const CUSTOM_CHECK_ATTRIBUTES: CustomCheckAttribute[] = ["dex", "ins", "mig", "wlp"]
export const CUSTOM_CHECK_SIDES = [4, 6, 8, 10, 12, 20, 100] as const

export function readCustomChecks(state: Record<string, unknown> | undefined): CustomCheck[] {
  // Nunca use diretamente conteúdo legado não validado em uma rolagem.
  if (!Array.isArray(state?.customChecks)) return []
  return state.customChecks.flatMap(value => {
    try { return [validateCustomCheck(value)] } catch { return [] }
  }).slice(0, CUSTOM_CHECK_LIMIT)
}

export function validateCustomCheck(value: unknown): CustomCheck {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Teste inválido.")
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  const description = typeof raw.description === "string" ? raw.description.trim() : ""
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new Error("Identificador do teste inválido.")
  if (!name || name.length > 100) throw new Error("Nome do teste deve ter até 100 caracteres.")
  if (description.length > 1000) throw new Error("Descrição do teste excedeu 1000 caracteres.")
  if (!Array.isArray(raw.dice) || raw.dice.length < 1 || raw.dice.length > CUSTOM_CHECK_DICE_LIMIT)
    throw new Error(`Escolha entre 1 e ${CUSTOM_CHECK_DICE_LIMIT} dados.`)
  const dice: CustomCheckDie[] = raw.dice.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Dado inválido.")
    const die = item as Record<string, unknown>
    if (die.kind === "fixed" && typeof die.sides === "number" && Number.isSafeInteger(die.sides) && die.sides >= 2 && die.sides <= 1000)
      return { kind: "fixed", sides: die.sides }
    if (die.kind === "attribute" && CUSTOM_CHECK_ATTRIBUTES.includes(die.attribute as CustomCheckAttribute))
      return { kind: "attribute", attribute: die.attribute as CustomCheckAttribute }
    throw new Error("Dado inválido: use 2 a 1000 faces ou um atributo da ficha.")
  })
  if (typeof raw.isPublic !== "boolean") throw new Error("Visibilidade do teste inválida.")
  return { id, name, description, dice, isPublic: raw.isPublic }
}

export function dieLabel(die: CustomCheckDie): string {
  return die.kind === "fixed" ? `d${die.sides}` : die.attribute.toUpperCase()
}
