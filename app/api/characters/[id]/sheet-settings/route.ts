import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, transactStore } from "@/lib/store"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { adjustedClassPoints, spentClassPoints, xpClassBudget } from "@/lib/character-class-points"
import type { GameClass } from "@/lib/game-data"

class SettingsError extends Error { constructor(message: string, public status = 400) { super(message) } }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ajuste inválido." }, { status: 400 })
  try {
    const result = await transactStore(db => {
      const current = db.characters.get(id)
      if (!current) throw new SettingsError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      if (!campaign || getMemberRole(campaign, user.id) !== "gm") throw new SettingsError("Somente o Mestre pode editar o nível e os pontos disponíveis.", 403)
      const next = structuredClone(current)
      if (body.level !== undefined) {
        if (!Number.isSafeInteger(body.level) || body.level < 1 || body.level > 1000) throw new SettingsError("Informe um nível inteiro entre 1 e 1000.")
        next.manualLevel = body.level
      }
      const state = db.campaignState.get(current.campaignId)
      const custom = Array.isArray(state?.customClasses) ? state.customClasses as GameClass[] : []
      const catalog = getCampaignClassCatalog([...db.characters.values()].filter(c => c.campaignId === current.campaignId), custom)
      const spent = spentClassPoints(current, catalog, new Set(custom.flatMap(cls => cls.skills.map(skill => skill.id))))
      const budget = xpClassBudget(current.resources.xp)
      const available = adjustedClassPoints(budget, spent, current.classPointAdjustment)
      if (body.classPoints !== undefined || body.classPointsDelta !== undefined) {
        if (body.classPoints !== undefined && body.classPointsDelta !== undefined) throw new SettingsError("Informe um saldo ou uma variação, não ambos.")
        const value = body.classPoints ?? body.classPointsDelta
        if (!Number.isSafeInteger(value) || Math.abs(value) > 1_000_000 || body.classPoints !== undefined && value < 0) throw new SettingsError("Quantidade de pontos inválida.")
        const desired = body.classPoints !== undefined ? value : Math.max(0, available + value)
        if (desired > 1_000_000) throw new SettingsError("Limite de pontos excedido.")
        next.classPointAdjustment = desired + spent - budget
      }
      if (body.level === undefined && body.classPoints === undefined && body.classPointsDelta === undefined) throw new SettingsError("Nenhum ajuste informado.")
      next.updatedAt = Math.max(Date.now(), current.updatedAt + 1)
      db.characters.set(id, next)
      return { value: { character: next, availableClassPoints: adjustedClassPoints(budget, spent, next.classPointAdjustment) }, changed: true }
    })
    publish(result.character.campaignId, { type: "character:updated", character: result.character })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar." }, { status: error instanceof SettingsError ? error.status : 500 })
  }
}
