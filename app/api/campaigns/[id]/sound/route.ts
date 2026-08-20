import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store } from "@/lib/store"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
  if (getMemberRole(campaign, user.id) !== "gm") {
    return NextResponse.json({ error: "Apenas o mestre pode controlar os sons." }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (body?.action === "play") {
    publish(campaignId, {
      type: "sound:play",
      sound: { id: body.id, trackId: body.trackId, url: body.url, loop: body.loop },
    } as any)
    return NextResponse.json({ success: true })
  }

  if (body?.action === "stop") {
    publish(campaignId, { type: "sound:stop", soundId: body.id } as any)
    return NextResponse.json({ success: true })
  }

  if (body?.action === "stop_all") {
    publish(campaignId, { type: "sound:stop_all" } as any)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Ação de som inválida." }, { status: 400 })
}
