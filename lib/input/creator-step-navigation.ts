/** Etapas da Forja: nunca pular requisitos ou submeter ao pressionar RB. */
export function creatorStepTransition(step: number, direction: -1 | 1,
  canAdvance: boolean, length = 5): number {
  const last = Math.max(0, length - 1)
  const safe = Math.max(0, Math.min(last, Math.trunc(step)))
  if (direction === -1) return Math.max(0, safe - 1)
  return canAdvance ? Math.min(last, safe + 1) : safe
}
