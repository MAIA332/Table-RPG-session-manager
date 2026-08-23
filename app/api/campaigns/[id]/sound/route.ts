import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store } from "@/lib/store"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }

  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }

  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, role }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  return NextResponse.json({ sounds: store.activeSounds.get(access.campaignId) || [] })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") {
    return NextResponse.json({ error: "Apenas o mestre pode controlar os sons." }, { status: 403 })
  }

  const campaignId = access.campaignId
  const body = await request.json().catch(() => null)
  if (body?.action === "play") {
    if (typeof body.id !== "string" || typeof body.trackId !== "string" || typeof body.url !== "string") {
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    }
    const sound = { id: body.id, trackId: body.trackId, url: body.url, loop: Boolean(body.loop) }
    const current = store.activeSounds.get(campaignId) || []
    store.activeSounds.set(campaignId, [...current.filter((item) => item.id !== sound.id), sound])
    publish(campaignId, {
      type: "sound:play",
      sound,
    } as any)
    return NextResponse.json({ success: true, sounds: store.activeSounds.get(campaignId) })
  }

  if (body?.action === "stop") {
    store.activeSounds.set(campaignId, (store.activeSounds.get(campaignId) || []).filter((sound) => sound.id !== body.id))
    publish(campaignId, { type: "sound:stop", soundId: body.id } as any)
    return NextResponse.json({ success: true, sounds: store.activeSounds.get(campaignId) })
  }

  if (body?.action === "stop_all") {
    store.activeSounds.set(campaignId, [])
    publish(campaignId, { type: "sound:stop_all" } as any)
    return NextResponse.json({ success: true, sounds: [] })
  }

  return NextResponse.json({ error: "Ação de som inválida." }, { status: 400 })
}
