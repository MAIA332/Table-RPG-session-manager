import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { advanceSkillModifiers, activateSkillModifiers, finishSkillModifiers, skillRuntime, type SkillModifier } from "@/lib/class-skill-effects"
import type { GameClass } from "@/lib/game-data"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import type { Character, RealtimeEvent } from "@/lib/types"

type Context = { params: Promise<{ id: string }> }
const bad = (error: string, status: number) => NextResponse.json({ error }, { status })
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w:-]{1,120}$/.test(value)

/** Custo, duração, recarga e consequências são aplicados atomicamente.
 * O cliente envia só os IDs, nunca o custo ou o bônus calculado. */
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser()
  if (!user) return bad("Não autenticado.", 401)
  const { id: campaignId } = await context.params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return bad("Campanha não encontrada.", 404)
  const role = getMemberRole(campaign, user.id)
  if (!role) return bad("Sem acesso à campanha.", 403)
  const gm = role === "gm"
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return bad("JSON inválido.", 400) }
  const { action, characterId, skillId, requestId, modifierId } = body
  if (!validId(characterId)) return bad("Personagem inválido.", 400)
  if (!["activate", "finish", "expire", "remove-aftermath"].includes(String(action))) return bad("Ação desconhecida.", 400)
  if (action === "activate" && (!validId(skillId) || !validId(requestId))) return bad("Identificador da habilidade inválido.", 400)
  if (action === "finish" && !validId(skillId)) return bad("Habilidade inválida.", 400)
  if (action === "remove-aftermath" && (!gm || !validId(modifierId))) return bad("Apenas o mestre pode remover esse revés.", 403)

  try {
    const result = await transactStore(draft => {
      const character = draft.characters.get(characterId)
      if (!character || character.campaignId !== campaignId || (!gm && character.ownerId !== user.id))
        throw new Error("Personagem não autorizado.")
      const now = Date.now()
      const saved: SkillModifier[] = Array.isArray((character as any).customModifiers) ? (character as any).customModifiers : []
      let modifiers = advanceSkillModifiers(saved, now)
      let resources = character.resources
      let changed = JSON.stringify(modifiers) !== JSON.stringify(saved)
      let duplicate = false

      if (action === "activate") {
        const usedId = `class_skill:receipt:${requestId}`
        const previous = saved.find(mod => mod.id === usedId)
        if (previous) {
          if (previous.skillId !== skillId) throw new Error("Identificador de ativação reutilizado em outra habilidade.")
          duplicate = true
        } else {
          const state = draft.campaignState.get(campaignId)
          const customs = Array.isArray(state?.customClasses) ? state.customClasses as GameClass[] : []
          const classes = getCampaignClassCatalog(
            [...draft.characters.values()].filter(candidate => candidate.campaignId === campaignId), customs)
          const found = classes.flatMap(cls => cls.skills || []).find(skill => skill.id === skillId)
          if (!found?.action) throw new Error("Habilidade não ativável ou não encontrada.")
          for (const seconds of [found.action.durationSeconds, found.action.cooldownSeconds, found.action.aftermath?.durationSeconds]) {
            if (seconds != null && (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 604800))
              throw new Error("Temporizador inválido na definição da habilidade.")
          }
          if ((found.action.checkBonuses?.length || 0) > 40)
            throw new Error("Limite de 40 bônus por habilidade excedido.")
          const skillLevel = Number(character.skills?.[skillId as string] || 0)
          if (!Number.isSafeInteger(skillLevel) || skillLevel < 1)
            throw new Error("Essa habilidade não foi aprendida pelo personagem.")
          const runtime = skillRuntime(modifiers, skillId as string, now)
          if (runtime.duration) throw new Error("A habilidade já está ativa.")
          if (runtime.cooldown) throw new Error("A habilidade ainda está em recarga.")
          const cost = Number(found.action.cost)
          if (!Number.isSafeInteger(cost) || cost < 0 || cost > 100000)
            throw new Error("Custo inválido na definição da habilidade.")
          const resource = found.action.resource
          if (resource === "ip") throw new Error("PI mede capacidade de carga. Configure PV, PM ou Sem custo.")
          if (!(["mp", "hp", "none"] as string[]).includes(resource))
            throw new Error("Recurso inválido.")
          if (resource !== "none" && cost > 0) {
            const available = Number(character.resources[resource])
            if (!Number.isFinite(available) || available < cost || resource === "hp" && available <= cost)
              throw new Error("PV ou PM insuficientes para usar essa habilidade.")
            resources = { ...character.resources, [resource]: available - cost }
          }
          modifiers = activateSkillModifiers(modifiers, found, skillLevel, now, requestId as string)
          changed = true
        }
      } else if (action === "finish") {
        const active = skillRuntime(modifiers, skillId as string, now).duration
        if (!active || typeof active.expiresAt === "number") throw new Error("A habilidade não possui efeito aberto para encerrar.")
        modifiers = finishSkillModifiers(modifiers, skillId as string, now)
        changed = true
      } else if (action === "remove-aftermath") {
        const target = modifiers.find(mod => mod.id === modifierId && mod.type === "class_skill_aftermath")
        if (!target) throw new Error("Revés não encontrado.")
        modifiers = modifiers.filter(mod => mod.id !== modifierId)
        changed = true
      }
      if (changed) {
        const updated: Character = { ...character, resources, customModifiers: modifiers,
          updatedAt: Math.max(now, Number(character.updatedAt || 0) + 1) } as Character
        draft.characters.set(characterId, updated)
      }
      return { value: { changed, duplicate }, changed }
    })
    const character = store.characters.get(characterId)
    if (result.changed && character) publish(campaignId, { type: "character:updated", character } as RealtimeEvent)
    return NextResponse.json({ success: true, ...result, character })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível usar a habilidade."
    return bad(message, /não autorizado|Apenas|não autenticado/.test(message) ? 403 : 400)
  }
}
