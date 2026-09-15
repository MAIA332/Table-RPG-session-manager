import { rollDamage, type Ability } from "./combat-model"
export type QteAbility = Extract<Ability, { kind: "qte" }>
export type QteOutcome = {
  total: number | null
  success: boolean
  damage: number
  effect: string
}
export type QteState = {
  id: string
  ability: QteAbility
  deadline: number
  targets: string[]
  outcomes: Record<string, QteOutcome>
}
export function createQte(
  id: string,
  ability: QteAbility,
  targets: string[],
  now: number,
): QteState {
  return {
    id,
    ability,
    deadline: now + ability.seconds * 1000,
    targets: [...new Set(targets)],
    outcomes: {},
  }
}
// The authority resolves dice once, then distributes this result. It must not reroll in each client.
export function answerQte(
  q: QteState,
  id: string,
  target: string,
  total: number | null,
  now: number,
  random = Math.random,
): QteState {
  if (q.id !== id || !q.targets.includes(target) || q.outcomes[target]) return q
  if (total !== null && !Number.isFinite(total)) return q
  // A timer cannot resolve a target early; a late click is always a timeout.
  if (total === null && now < q.deadline) return q
  const effectiveTotal = now >= q.deadline ? null : total
  const success =
    effectiveTotal !== null && effectiveTotal >= q.ability.difficulty
  return {
    ...q,
    outcomes: {
      ...q.outcomes,
      [target]: {
        total: effectiveTotal,
        success,
        damage: rollDamage(
          success ? q.ability.successDamage : q.ability.failureDamage,
          random,
        ),
        effect: success ? q.ability.successEffect : q.ability.failureEffect,
      },
    },
  }
}
export function expireQte(q: QteState, now: number, random = Math.random) {
  if (now < q.deadline) return q
  return q.targets.reduce(
    (state, target) => answerQte(state, q.id, target, null, now, random),
    q,
  )
}
export const qteComplete = (q: QteState) =>
  q.targets.every((id) => !!q.outcomes[id])
