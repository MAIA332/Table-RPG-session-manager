import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  getMemberRole,
  getVisibleSounds,
  notifySoundsChanged,
  store,
  type CampaignSound,
} from "@/lib/store"

export const dynamic = "force-dynamic"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, campaign, role, userId: user.id }
}

function soundResponse(campaignId: string, userId: string) {
  return NextResponse.json({
    success: true,
    capabilities: { targetedSound: true },
    sounds: getVisibleSounds(campaignId, userId),
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  return soundResponse(access.campaignId, access.userId)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const { campaignId, campaign, role, userId } = access
  const body = await request.json().catch(() => null)

  // O destinatário pode informar o término natural de um efeito individual.
  // Isso não permite iniciar sons, encerrar loops ou controlar sons de terceiros.
  if (body?.action === "ended") {
    if (typeof body.id !== "string" || !body.id.trim()) {
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    }
    const current = store.activeSounds.get(campaignId) || []
    const sound = current.find(item => item.id === body.id)
    if (!sound) return soundResponse(campaignId, userId)
    if (sound.loop || (role !== "gm" && sound.targetUserId !== userId)) {
      return NextResponse.json({ error: "Sem permissão para finalizar este som." }, { status: 403 })
    }
    store.activeSounds.set(campaignId, current.filter(item => item.id !== body.id))
    notifySoundsChanged(campaignId)
    return soundResponse(campaignId, userId)
  }

  if (role !== "gm") {
    return NextResponse.json({ error: "Apenas o mestre pode controlar os sons." }, { status: 403 })
  }

  if (body?.action === "play") {
    if (
      typeof body.id !== "string" || !body.id.trim() ||
      typeof body.trackId !== "string" || !body.trackId.trim() ||
      typeof body.url !== "string" || !body.url.trim() ||
      (body.loop !== undefined && typeof body.loop !== "boolean")
    ) {
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    }

    // Ausência/null mantém compatibilidade com os sons destinados à mesa toda.
    // Um alvo inválido nunca é convertido em transmissão geral.
    const targetUserId = body.targetUserId ?? null
    if (targetUserId !== null && (
      typeof targetUserId !== "string" ||
      !targetUserId.trim() ||
      getMemberRole(campaign, targetUserId) !== "player"
    )) {
      return NextResponse.json({ error: "Selecione um jogador válido desta campanha." }, { status: 400 })
    }

    const sound: CampaignSound = {
      id: body.id,
      trackId: body.trackId,
      url: body.url,
      loop: body.loop ?? false,
      targetUserId,
    }
    const current = store.activeSounds.get(campaignId) || []
    if (current.some(item => item.id === sound.id)) {
      return NextResponse.json({ error: "Este identificador de reprodução já está em uso." }, { status: 409 })
    }
    store.activeSounds.set(campaignId, [...current, sound])
    notifySoundsChanged(campaignId)
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "stop") {
    if (typeof body.id !== "string" || !body.id.trim()) {
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    }
    store.activeSounds.set(campaignId, (store.activeSounds.get(campaignId) || []).filter(sound => sound.id !== body.id))
    notifySoundsChanged(campaignId)
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "stop_all") {
    store.activeSounds.set(campaignId, [])
    notifySoundsChanged(campaignId)
    return soundResponse(campaignId, userId)
  }

  return NextResponse.json({ error: "Ação de som inválida." }, { status: 400 })
}
