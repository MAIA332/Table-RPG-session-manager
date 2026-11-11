import { NextResponse } from "next/server"
import { RoomServiceClient } from "livekit-server-sdk"
import { store } from "@/lib/store"
import { checkVoiceOrigin, readJsonLimited, requestError, voiceAccess } from "@/lib/voice/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o Mestre pode moderar a call." }, { status: 403 })
  let body: unknown
  try { body = await readJsonLimited(request, 1024) } catch (error) { return requestError(error) }
  const targetId = body && typeof body === "object" && "targetId" in body ? (body as {targetId?: unknown}).targetId : null
  const member = store.campaigns.get(access.campaignId)?.members.find(m => m.userId === targetId)
  if (!member || member.role !== "player" || targetId === access.user.id)
    return NextResponse.json({ error: "Somente jogadores participantes podem ser desconectados." }, { status: 400 })
  const url = process.env.LIVEKIT_URL?.trim()
  const key = process.env.LIVEKIT_API_KEY?.trim()
  const secret = process.env.LIVEKIT_API_SECRET?.trim()
  if (!url || !key || !secret) return NextResponse.json({ error: "LiveKit não configurado." }, { status: 503 })
  try {
    const api = new RoomServiceClient(url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), key, secret)
    await api.removeParticipant(`otms-voice-${access.campaignId}`, String(targetId))
    // Desconexão pontual, não banimento: o participante pode retornar depois.
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível desconectar o participante." }, { status: 502 })
  }
}
