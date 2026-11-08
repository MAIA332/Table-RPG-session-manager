import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import { CLASSES, type GameClass } from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import { adjustedClassPoints, spentClassPoints, xpClassBudget } from "@/lib/character-class-points"
import { deriveSkillClassLevels, progressionResourceDelta } from "@/lib/skill-progression"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { emptyClassBooks, progressFor } from "@/lib/class-books"
import { canPlayerUpgradeClass, type CustomClassVisibility } from "@/lib/class-visibility"
import type { RealtimeEvent } from "@/lib/types"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store, max-age=0" }
const err = (error: string, status = 400) => NextResponse.json({ error }, { status, headers })
const rank = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0
const classId = (entry: any): string => String(entry?.classId ?? entry?.id ?? "")
const FREE = "free_skill:"

function freeRanks(skillId: string, level: number, modifiers: any[], customIds: Set<string>) {
  const entry = modifiers.find(m => m?.id === FREE + skillId)
  return Math.min(level, entry ? rank(entry.value) : customIds.has(skillId) ? level : 0)
}

/** Evolução autenticada para o jogador dono da ficha e para o mestre da campanha. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return err("Não autenticado.", 401)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const skillId = body?.skillId
  if (typeof skillId !== "string" || !skillId.trim() || skillId.length > 120)
    return err("Perícia inválida.")
  try {
    const result = await transactStore(draft => {
      const current = draft.characters.get(id)
      if (!current) throw new Error("Personagem não encontrado.")
      const campaign = draft.campaigns.get(current.campaignId)
      const role = campaign ? getMemberRole(campaign, user.id) : undefined
      if (!role) throw new Error("Sem acesso à campanha.")
      const isGm = role === "gm"
      const freeGrant = isGm && body?.mode !== "normal"
      if (!isGm && current.ownerId !== user.id)
        throw new Error("Somente o proprietário ou o mestre pode evoluir este personagem.")
      const state = draft.campaignState.get(current.campaignId)
      const custom: CustomClassVisibility[] = Array.isArray(state?.customClasses)
        ? state.customClasses as CustomClassVisibility[] : []
      const characters = [...draft.characters.values()].filter(c => c.campaignId === current.campaignId)
      const catalog = getCampaignClassCatalog(characters, custom)
      const definition = catalog.find(cls => cls.skills.some(s => s.id === skillId))
      const skill = definition?.skills.find(s => s.id === skillId)
      if (!definition || !skill) throw new Error("Perícia não encontrada no catálogo da campanha.")
      const selected = progressFor(draft.classBooks.get(current.campaignId) ?? emptyClassBooks(), id).subclassIds
      if (!isGm && !canPlayerUpgradeClass(definition, custom, selected, { userId: user.id, characterId: current.id }))
        throw new Error("Essa classe ou subclasse não está liberada pelo mestre para evolução.")
      const skills = current.skills || {}
      const currentRank = rank(skills[skillId])
      if (currentRank >= rank(skill.maxLevel)) throw new Error("Nível máximo da habilidade atingido.")
      const customIds = new Set(custom.flatMap(cls => cls.skills.map(s => s.id)))
      if (!isGm && adjustedClassPoints(xpClassBudget(current.resources.xp), spentClassPoints(current, catalog, customIds), current.classPointAdjustment) <= 0)
        throw new Error("Você não possui pontos de evolução disponíveis.")

      const newClasses = (current.classes || []).map(cls => ({ ...cls }))
      const targetClassId = definition.parentClassId || definition.id
      const entry = newClasses.find(cls => classId(cls) === targetClassId)
      const previousRanks = catalog.filter(cls => cls.id === targetClassId ||
        (cls.parentClassId === targetClassId && selected.includes(cls.id)))
        .flatMap(cls => cls.skills)
        .reduce((sum, skill) => sum + rank(skills[skill.id]), 0)
      if (entry) entry.level = Math.max(rank(entry.level), previousRanks) + 1
      else newClasses.push({ classId: targetClassId, level: previousRanks + 1 })

      const previousMods: any[] = Array.isArray((current as any).customModifiers)
        ? (current as any).customModifiers : []
      const currentFree = freeRanks(skillId, currentRank, previousMods, customIds)
      const mods = previousMods.filter(m => m.id !== FREE + skillId)
      mods.push({ id: FREE + skillId, name: `Concessão gratuita: ${skill.name}`,
        target: "skill_grant_hidden", value: currentFree + (freeGrant ? 1 : 0) })
      const nextSkills = { ...skills, [skillId]: currentRank + 1 }
      const derivedClasses = deriveSkillClassLevels(newClasses, nextSkills, catalog)
      const growth = progressionResourceDelta(
        { classes: current.classes, skills, attributes: current.attributes },
        { classes: derivedClasses, skills: nextSkills, attributes: current.attributes },
        catalog, (classes, attributes) => computeMaxResources(classes, attributes, catalog),
      )
      const resources = {
        ...current.resources,
        maxHp: Math.max(1, current.resources.maxHp + growth.maxHp),
        maxMp: Math.max(0, current.resources.maxMp + growth.maxMp),
        maxIp: Math.max(0, current.resources.maxIp + growth.maxIp),
      }
      const updated = { ...current, skills: { ...skills, [skillId]: currentRank + 1 },
        classes: derivedClasses, customModifiers: mods, resources,
        ...(current.isNpc && current.npcLevel !== undefined ? { npcLevel: current.npcLevel + 1 } : {}),
        updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1) }
      draft.characters.set(id, updated)
      return { value: updated, changed: true }
    })
    publish(result.campaignId, { type: "character:updated", character: result } as RealtimeEvent)
    return NextResponse.json({ character: result }, { headers })
  } catch (error) {
    return err(error instanceof Error ? error.message : "Não foi possível evoluir a habilidade.", 400)
  }
}
