import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, store, transactStore } from "@/lib/store"
import { cleanDeathTokenBenefits, type DeathToken } from "@/lib/death-tokens"
import { creatorClassCatalog, creatorEquipmentCatalog, isCampaignPlayer, readCampaignDeathTokens, withCampaignDeathTokens } from "@/lib/death-tokens-server"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }
function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }) }

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return fail("Não autenticado.", 401)
  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return fail("Campanha não encontrada.", 404)
  const role = getMemberRole(campaign, user.id)
  if (!role) return fail("Sem acesso à campanha.", 403)
  const all = readCampaignDeathTokens(store.campaignState.get(id))
  return NextResponse.json({
    tokens: role === "gm" ? all : all.filter(token => token.userId === user.id && token.status === "available"),
    myTokens: all.filter(token => token.userId === user.id && token.status === "available"),
    ...(role === "gm" ? { members: campaign.members.filter(member => member.role === "player") } : {}),
  })
}

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return fail("Não autenticado.", 401)
  const { id } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Dados inválidos.")
  try {
    const token = await transactStore(draft => {
      const campaign = draft.campaigns.get(id)
      if (!campaign) throw new TokenError("Campanha não encontrada.", 404)
      if (getMemberRole(campaign, user.id) !== "gm") throw new TokenError("Apenas o Mestre concede tokens.", 403)
      const targetUserId = String(body.userId || "")
      if (!isCampaignPlayer(campaign, targetUserId)) throw new TokenError("Selecione um jogador da campanha.")
      let config: ReturnType<typeof cleanDeathTokenBenefits>
      try { config = cleanDeathTokenBenefits(body) }
      catch (error) { throw new TokenError(error instanceof Error ? error.message : "Configuração inválida.") }
      const classIds = new Set(creatorClassCatalog(id, true).filter(cls => !cls.parentClassId).map(cls => cls.id))
      if (config.allowedClassIds.some(classId => !classIds.has(classId))) throw new TokenError("Classe inicial inexistente ou subclasse inválida.")
      const items = new Set(creatorEquipmentCatalog(id).map(item => item.id))
      if (config.startingItemIds.some(itemId => !items.has(itemId))) throw new TokenError("Item inicial inexistente.")
      const token: DeathToken = { ...config, id: genId("death"), userId: targetUserId,
        campaignId: id, issuedBy: user.id, status: "available", createdAt: Date.now() }
      const old = draft.campaignState.get(id)
      draft.campaignState.set(id, withCampaignDeathTokens(old, [...readCampaignDeathTokens(old), token]))
      return { value: token, changed: true }
    })
    return NextResponse.json({ token }, { status: 201 })
  } catch (error) { return fail(error instanceof Error ? error.message : "Falha ao conceder token.", error instanceof TokenError ? error.status : 500) }
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return fail("Não autenticado.", 401)
  const { id } = await params
  const body = await request.json().catch(() => null) as { tokenId?: unknown } | null
  if (typeof body?.tokenId !== "string") return fail("Token inválido.")
  try {
    const revoked = await transactStore(draft => {
      const campaign = draft.campaigns.get(id)
      if (!campaign) throw new TokenError("Campanha não encontrada.", 404)
      if (getMemberRole(campaign, user.id) !== "gm") throw new TokenError("Apenas o Mestre pode revogar.", 403)
      const current = draft.campaignState.get(id)
      const tokens = readCampaignDeathTokens(current)
      const target = tokens.find(token => token.id === body.tokenId)
      if (!target) throw new TokenError("Token não encontrado.", 404)
      if (target.status !== "available") throw new TokenError("Token já consumido ou revogado.", 409)
      const next = tokens.map(token => token.id === target.id ? { ...token, status: "revoked" as const, revokedAt: Date.now() } : token)
      draft.campaignState.set(id, withCampaignDeathTokens(current, next))
      return { value: next.find(token => token.id === target.id)!, changed: true }
    })
    return NextResponse.json({ token: revoked })
  } catch (error) { return fail(error instanceof Error ? error.message : "Falha ao revogar token.", error instanceof TokenError ? error.status : 500) }
}

class TokenError extends Error { constructor(message: string, public status = 400) { super(message) } }
