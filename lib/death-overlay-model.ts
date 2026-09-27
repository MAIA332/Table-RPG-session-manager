import type { CombatSnapshot } from "./combat-types"
import { DEATH_TABLE, type DeathCheck } from "./death-model"

type Owner = { id: string; ownerId: string }

// Read-only presentation: never rolls dice or changes HP.
export function visibleDeathChecks(
  combat: CombatSnapshot | null,
  characters: readonly Owner[],
  viewerId: string,
  isGm: boolean,
): DeathCheck[] {
  if (!combat) return []
  const owners = new Map((combat.characters || []).map(c => [c.id, c.ownerId]))
  // The room's character list is independent from the combat participant roster.
  for (const character of characters) owners.set(character.id, character.ownerId)
  const latest = new Map<string, DeathCheck>()
  const add = (check: DeathCheck) => {
    if (!isGm && owners.get(check.characterId) !== viewerId) return
    const previous = latest.get(check.characterId)
    if (!previous || check.at > previous.at) latest.set(check.characterId, check)
  }
  for (const check of Object.values(combat.deathChecks || {})) add(check)
  for (const entry of combat.log || []) {
    const roll = entry.roll
    if (!roll || roll.type !== "dice:roll") continue
    const match = /^Morte · Vigor \[(d(?:4|6|8|10|12|20)) \+ \1 \+ \1\] · /i.exec(String(roll.attribute))
    if (!match || typeof roll.breakdown !== "string" || !/^\d+\s*\+\s*\d+\s*\+\s*\d+$/.test(roll.breakdown)) continue
    const rolls = roll.breakdown.split("+").map(value => Number(value.trim()))
    const size = Number(match[1].slice(1))
    const total = Number(roll.result)
    if (rolls.some(value => !Number.isSafeInteger(value) || value < 1 || value > size) ||
      !Number.isSafeInteger(total) || rolls.reduce((sum, value) => sum + value, 0) !== total || Number(roll.modifier || 0) !== 0) continue
    const outcome = DEATH_TABLE.find(row => total >= row.min && total <= row.max)
    const characterId = entry.characterId || roll.characterId
    if (!outcome || !characterId) continue
    add({ id: entry.id, at: entry.at, characterId, characterName: roll.characterName,
      die: match[1], rolls, total, status: outcome.status, label: outcome.label,
      effect: outcome.effect, active: outcome.status !== "recovered" })
  }
  return [...latest.values()].sort((a, b) => a.at - b.at)
}
