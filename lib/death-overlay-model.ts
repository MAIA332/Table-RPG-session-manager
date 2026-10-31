import type { CombatSnapshot } from "./combat-types"
import type { DeathCheck } from "./death-model"

type Owner = { id: string; ownerId: string }

/**
 * Somente eventos RECENTES e AUTORITATIVOS podem aparecer na apresentação.
 * O histórico em combat.log é para consulta; jamais deve disparar overlay.
 * O filtro não modifica HP, resultados dos dados, nem registros históricos.
 */
const DEATH_OVERLAY_LIFETIME_MS = 15_000
// Montagem nova do cliente = nova sessão de apresentação. Histórico anterior
// à abertura da página, ainda que recente, não dispara animações novamente.
const PRESENTATION_SESSION_STARTED_AT = Date.now()
const MAX_FUTURE_CLOCK_SKEW_MS = 2_000

export function visibleDeathChecks(
  combat: CombatSnapshot | null,
  characters: readonly Owner[],
  viewerId: string,
  isGm: boolean,
): DeathCheck[] {
  if (!combat) return []
  const owners = new Map((combat.characters || []).map(character => [character.id, character.ownerId]))
  for (const character of characters) owners.set(character.id, character.ownerId)
  const now = Date.now()
  const results: DeathCheck[] = []
  const ids = new Set<string>()
  for (const check of Object.values(combat.deathChecks || {})) {
    if (!check || typeof check.id !== "string" || ids.has(check.id)) continue
    if (!Number.isFinite(check.at) || check.at < PRESENTATION_SESSION_STARTED_AT ||
        check.at > now + MAX_FUTURE_CLOCK_SKEW_MS ||
        now - check.at > DEATH_OVERLAY_LIFETIME_MS) continue
    if (!isGm && owners.get(check.characterId) !== viewerId) continue
    ids.add(check.id)
    results.push(check)
  }
  return results.sort((a, b) => a.at - b.at)
}
