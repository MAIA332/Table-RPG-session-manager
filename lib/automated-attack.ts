import { rollDamage, type Attack, type Attribute } from "./combat-model"
export type AttackResult = {
  rolls: number[]
  total: number
  outcome: "failure" | "cost" | "clean"
  damage: number
  remainingHp: number
  effect: string
}
// Inputs deliberately include the already computed defense/modifier: do not duplicate sheet rules here.
export function resolveAttack(
  attack: Attack,
  attributes: any,
  defense: number,
  hp: number,
  modifier = 0,
  random = Math.random,
): AttackResult {
  if (![defense, hp, modifier].every(Number.isFinite))
    throw new Error("Defesa, vida ou modificador inválido")
  if (attack.attributes.length !== 2)
    throw new Error("O ataque exige dois atributos")
  const rolls = attack.attributes.map((a:any) => {
    const die = /^d(\d+)$/i.exec(attributes[a])
    if (!die || +die[1] < 2 || +die[1] > 100)
      throw new Error("Dado de atributo inválido")
    return Math.floor(random() * +die[1]) + 1
  })
  const total = rolls.reduce((a:any, b:any) => a + b, 0) + modifier
  const outcome =
    total < defense ? "failure" : total === defense ? "cost" : "clean"
  const damage = outcome === "failure" ? 0 : rollDamage(attack.damage, random)
  return {
    rolls,
    total,
    outcome,
    damage,
    remainingHp: Math.max(0, hp - damage),
    effect: outcome === "failure" ? "" : attack.description || "",
  }
}
