import { resolveAttack } from "./automated-attack"
import type { Attack } from "./combat-model"
import { validateBestiaryFormula, validateBestiaryDice } from "./bestiary-attack-formula"

/**
 * Ponte para o motor legado (2 dados): os dados adicionais são rolados e
 * incluídos por deslocamento de defesa no MESMO cálculo de acerto/dano.
 * Não assume nem recria regras de efeitos, críticos ou redução de dano.
 */
export function resolveBestiaryAttack(
  attack: Attack,
  creatureDice: Parameters<typeof resolveAttack>[1],
  defense: number,
  targetHp: number,
  random: () => number,
): ReturnType<typeof resolveAttack> {
  const issue = validateBestiaryFormula(attack.attributes) || validateBestiaryDice(creatureDice)
  if (issue) throw new Error(issue)
  if (attack.attributes.length === 2)
    return resolveAttack(attack, creatureDice, defense, targetHp, 0, random)

  // O motor de dois dados calcula acerto, sucesso e dano. Acrescentar os
  // dados extras equivale matematicamente a diminuir a defesa consultada.
  const keys = attack.attributes
  const extraRolls = keys.slice(2).map(key => {
    const size = Number(creatureDice[key].slice(1))
    return Math.floor(random() * size) + 1
  })
  const extraTotal = extraRolls.reduce((total, value) => total + value, 0)
  const isSingleDie = keys.length === 1
  const firstTwo = isSingleDie ? [keys[0], keys[0]] : keys.slice(0, 2)
  let call = 0
  const controlledRandom = () => {
    call += 1
    // Um dado: segundo lançamento da fórmula de compatibilidade vale 1;
    // o ajuste de defesa +1 o anula. Os demais RNGs continuam normais.
    if (isSingleDie && call === 2) return 0
    return random()
  }
  // Equivalentemente, movemos o valor dos dados extras para a defesa
  // comparada pelo motor. Isso preserva as regras de êxito por margem,
  // mesmo se a implementação antiga ignorar o parâmetro de modificador.
  // Exemplo: 2d + 9 >= DEF é idêntico a 2d >= DEF - 9.
  // Se a defesa ajustada for negativa, a vitória por acerto é garantida;
  // usamos piso 1 para compatibilidade com validadores legados.
  const adjustment = extraTotal - (isSingleDie ? 1 : 0)
  const result = resolveAttack(
    { ...attack, attributes: firstTwo as Attack["attributes"] },
    creatureDice,
    Math.max(1, defense - adjustment),
    targetHp,
    0,
    controlledRandom,
  )
  if (result.rolls.length !== 2)
    throw new Error("O motor antigo não processou os dois dados-base da fórmula.")
  const rolls = isSingleDie ? [result.rolls[0]] : [...result.rolls, ...extraRolls]
  const total = result.total + adjustment
  const expected = rolls.reduce((sum, value) => sum + value, 0)
  if (total !== expected)
    throw new Error("Motor de ataques incompatível: o resultado não corresponde aos dados da criatura.")
  return { ...result, total, rolls }
}
