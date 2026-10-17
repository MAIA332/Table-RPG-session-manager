/**
 * Regras específicas do Bestiário do Mestre.
 * Não modifica os requisitos de distribuição de dados dos personagens jogadores.
 * Fórmulas são arrays, não sets: MIG+MIG usa dois dados de MIG.
 */
import { validateCombat, type Attack, type Ability } from "./combat-model"

export const BESTIARY_ATTRIBUTES = ["dex", "ins", "mig", "wlp"] as const
export type BestiaryAttribute = (typeof BESTIARY_ATTRIBUTES)[number]
export const BESTIARY_DICE = ["d4", "d6", "d8", "d10", "d12", "d20"] as const
export type BestiaryDie = (typeof BESTIARY_DICE)[number]
export const MAX_BESTIARY_ATTACK_ATTRIBUTES = 4

export function validateBestiaryDice(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return "Os atributos da criatura são inválidos."
  }
  const current = attributes as Record<string, unknown>
  for (const attribute of BESTIARY_ATTRIBUTES) {
    if (!BESTIARY_DICE.some(die => die === current[attribute])) {
      return `O dado de ${attribute.toUpperCase()} é inválido. Selecione d4, d6, d8, d10, d12 ou d20.`
    }
  }
  return null
}

export function validateBestiaryFormula(attributes: unknown): string | null {
  if (!Array.isArray(attributes) || attributes.length < 1 || attributes.length > MAX_BESTIARY_ATTACK_ATTRIBUTES) {
    return "A fórmula de acerto deve ter entre 1 e 4 atributos."
  }
  for (const attribute of attributes) {
    if (!BESTIARY_ATTRIBUTES.some(item => item === attribute)) {
      return "A fórmula de acerto aceita somente DEX, INS, MIG e WLP."
    }
  }
  return null
}

/**
 * O validador legado do projeto foi escrito para ataques de dois atributos.
 * Primeiro validamos a fórmula original de 1 a 4 elementos e depois validamos
 * os demais campos (dano, tipo, habilidades, alvo etc.) com a regra anterior.
 * A fórmula ORIGINAL é persistida e usada para a rolagem; a versão de dois
 * atributos existe apenas para reutilizar as regras legadas de validação.
 */
export function validateBestiaryCombat(attacks: Attack[], abilities: Ability[]): string | null {
  for (let index = 0; index < attacks.length; index += 1) {
    const error = validateBestiaryFormula(attacks[index]?.attributes)
    if (error) return `Ataque ${index + 1}: ${error}`
  }
  const compatAttacks = attacks.map(attack => {
    const attributes = attack.attributes.length === 2
      ? attack.attributes
      : [attack.attributes[0], attack.attributes[0]]
    return { ...attack, attributes: attributes as Attack["attributes"] }
  })
  return validateCombat(compatAttacks, abilities)
}

export function formatBestiaryFormula(attributes: readonly string[], dice?: Partial<Record<BestiaryAttribute, string>>): string {
  return attributes.map(key => dice?.[key as BestiaryAttribute] ? `${key.toUpperCase()} (${dice[key as BestiaryAttribute]})` : key.toUpperCase()).join(" + ")
}
