/** Estado compartilhado das habilidades. Tempos absolutos em milissegundos,
 * separados da recarga, para sobreviver à desconexão e à troca de abas. */
import type { GameSkill, GameSkillAction, GameSkillAftermath, GameSkillCheckBonus } from "./game-data"

export type SkillModifier = {
  id: string
  type?: string
  name?: string
  target?: string
  value?: number
  skillId?: string
  startedAt?: number
  durationMs?: number
  expiresAt?: number
  aftermath?: GameSkillAftermath
}

const PREFIX = "class_skill:"
const receiptLifetime = 24 * 60 * 60 * 1000
export const skillModifierType = (type: string) => type.startsWith("class_skill_")
export const isSkillModifier = (mod: SkillModifier) => typeof mod.type === "string" && skillModifierType(mod.type)

export function skillEffectDuration(seconds: unknown): number | null {
  return typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 604800
    ? seconds * 1000 : null
}

export function skillBonusValue(bonus: GameSkillCheckBonus, level: number) {
  const base = Number(bonus.value)
  return (Number.isFinite(base) ? base : 0) * (bonus.perLevel ? level : 1)
}

export function skillAftermathModifier(skillId: string, effect: GameSkillAftermath, at: number): SkillModifier {
  const durationMs = skillEffectDuration(effect.durationSeconds)
  return {
    id: `${PREFIX}aftermath:${skillId}:${at}`,
    type: "class_skill_aftermath",
    name: effect.name?.trim() || "Revés da habilidade",
    skillId,
    target: effect.target || "all",
    value: Number(effect.value) || 0,
    startedAt: at,
    ...(durationMs ? { durationMs, expiresAt: at + durationMs } : {}),
  }
}

/** Materializa revés ao terminar a duração; não depende da aba do jogador aberta.
 * É seguro chamar várias vezes, pois o marcador é consumido na primeira vez. */
export function advanceSkillModifiers<T extends SkillModifier>(mods: T[], now = Date.now()): SkillModifier[] {
  const next: SkillModifier[] = []
  for (const mod of mods) {
    if (!isSkillModifier(mod)) { next.push(mod); continue }
    if (typeof mod.expiresAt !== "number" || mod.expiresAt > now) {
      next.push(mod)
      continue
    }
    if (mod.type === "class_skill_duration" && mod.aftermath?.trigger === "end" && mod.skillId) {
      const endAt = mod.expiresAt
      const consequence = skillAftermathModifier(mod.skillId, mod.aftermath, endAt)
      if (!consequence.expiresAt || consequence.expiresAt > now) next.push(consequence)
    }
  }
  return next
}

export function skillRuntime(mods: SkillModifier[], skillId: string, now = Date.now()) {
  const entries = advanceSkillModifiers(mods, now).filter(mod => mod.skillId === skillId)
  return {
    duration: entries.find(mod => mod.type === "class_skill_duration"),
    cooldown: entries.find(mod => mod.type === "class_skill_cooldown"),
    aftermath: entries.filter(mod => mod.type === "class_skill_aftermath"),
  }
}

export function activateSkillModifiers(mods: SkillModifier[], skill: GameSkill, level: number, at: number, requestId: string): SkillModifier[] {
  const action: GameSkillAction = skill.action!
  const durationMs = skillEffectDuration(action.durationSeconds)
  const cooldownMs = skillEffectDuration(action.cooldownSeconds)
  // Uma habilidade pode ser instantânea, sem custo e mesmo assim ter botão "Usar".
  const persistent = Boolean(durationMs || action.checkBonuses?.length)
  const base: SkillModifier[] = [
    ...mods.filter(mod => !(mod.type === "class_skill_bonus" && mod.skillId === skill.id)),
    { id: `${PREFIX}receipt:${requestId}`, type: "class_skill_receipt", name: skill.name, target: "class_skill_runtime", value: 0, skillId: skill.id, expiresAt: at + receiptLifetime },
  ]
  if (persistent) {
    base.push({
      id: `${PREFIX}duration:${skill.id}:${at}`,
      type: "class_skill_duration", name: skill.name, target: "class_skill_runtime", value: 0,
      skillId: skill.id, startedAt: at,
      ...(durationMs ? { durationMs, expiresAt: at + durationMs } : {}),
      ...(action.aftermath?.trigger === "end" ? { aftermath: { ...action.aftermath } } : {}),
    })
  }
  for (const bonus of action.checkBonuses || []) {
    const value = skillBonusValue(bonus, level)
    if (!value || !bonus.target) continue
    base.push({
      id: `${PREFIX}bonus:${skill.id}:${at}:${encodeURIComponent(bonus.target)}`,
      type: "class_skill_bonus", name: skill.name, skillId: skill.id,
      target: bonus.target, value, startedAt: at,
      ...(durationMs ? { durationMs, expiresAt: at + durationMs } : {}),
    })
  }
  if (cooldownMs) base.push({
    id: `${PREFIX}cooldown:${skill.id}:${at}`, type: "class_skill_cooldown",
    name: skill.name, skillId: skill.id, target: "class_skill_runtime", value: 0,
    startedAt: at, durationMs: cooldownMs, expiresAt: at + cooldownMs,
  })
  if (action.aftermath && (action.aftermath.trigger === "use" || !persistent && action.aftermath.trigger === "end")) {
    base.push(skillAftermathModifier(skill.id, action.aftermath, at))
  }
  return base
}

/** Encerramento manual de efeitos sem limite em segundos (ex.: 3 rodadas narrativas).
 * Recarga não é apagada, e o revés começa no encerramento. */
export function finishSkillModifiers(mods: SkillModifier[], skillId: string, now = Date.now()): SkillModifier[] {
  const duration = skillRuntime(mods, skillId, now).duration
  if (!duration || typeof duration.expiresAt === "number") return mods
  const remaining = mods.filter(mod => !(mod.skillId === skillId &&
    (mod.type === "class_skill_duration" || mod.type === "class_skill_bonus")))
  if (duration.aftermath?.trigger === "end") {
    remaining.push(skillAftermathModifier(skillId, duration.aftermath, now))
  }
  return remaining
}

export function skillRollModifier(mods: SkillModifier[], targets: string[], now = Date.now()) {
  const targetSet = new Set(targets.map(target => target.toLocaleLowerCase("pt-BR")))
  return advanceSkillModifiers(mods, now).reduce((total, mod) => {
    if (mod.type !== "class_skill_bonus" && mod.type !== "class_skill_aftermath") return total
    if (mod.target !== "all" && !targetSet.has(String(mod.target || "").toLocaleLowerCase("pt-BR"))) return total
    return total + (Number.isFinite(mod.value) ? Number(mod.value) : 0)
  }, 0)
}

export function passiveSkillRollModifier(skills: Record<string, unknown> | undefined, classes: Array<{ skills: GameSkill[] }>, targets: string[], attributeOnly = false) {
  const targetSet = new Set(targets.map(target => target.toLocaleLowerCase("pt-BR")))
  let total = 0
  const visited = new Set<string>()
  for (const cls of classes) for (const skill of cls.skills || []) {
    if (visited.has(skill.id)) continue
    visited.add(skill.id)
    const level = Number(skills?.[skill.id] || 0)
    if (!Number.isSafeInteger(level) || level < 1) continue
    for (const bonus of skill.passiveBonuses || []) {
      if (bonus.attributeOnly && !attributeOnly) continue
      if (bonus.target === "all" || targetSet.has(bonus.target.toLocaleLowerCase("pt-BR"))) {
        total += skillBonusValue(bonus, level)
      }
    }
  }
  return total
}
