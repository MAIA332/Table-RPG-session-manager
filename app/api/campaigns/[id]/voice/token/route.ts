import { NextResponse } from "next/server"
import { AccessToken, TrackSource } from "livekit-server-sdk"
import { checkVoiceOrigin, voiceAccess } from "@/lib/voice/server"
import { liveKitRoomName, voiceRoomExists } from "@/lib/voice/rooms"
import { getVoiceModeration } from "@/lib/voice/moderation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  const roomId = new URL(request.url).searchParams.get("roomId") || "main"
  try {
    if (!(await voiceRoomExists(access.campaignId, roomId)))
      return NextResponse.json({ error: "Sala de voz não encontrada." }, { status: 404 })
  } catch {
    return NextResponse.json({ error: "Não foi possível verificar a sala." }, { status: 503 })
  }
  const url = process.env.LIVEKIT_URL?.trim()
  const apiKey = process.env.LIVEKIT_API_KEY?.trim()
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
  if (!url || !apiKey || !apiSecret || !/^wss:\/\//.test(url))
    return NextResponse.json({ error: "Servidor de voz ainda não configurado." }, { status: 503 })

  let moderation
  try { moderation = await getVoiceModeration(access.campaignId, access.user.id) }
  catch { return NextResponse.json({error: "Não foi possível verificar as permissões do microfone."}, {status: 503}) }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: access.user.id,
    name: access.user.name.slice(0, 80),
    ttl: 30 * 60,
    metadata: JSON.stringify({ role: access.role }),
  })
  token.addGrant({
    room: liveKitRoomName(access.campaignId, roomId),
    roomJoin: true,
    canPublish: !moderation.microphoneMuted,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: !moderation.audioMuted,
    canPublishData: true,
  })
  return NextResponse.json({ url, token: await token.toJwt(), moderation: {microphoneMuted: moderation.microphoneMuted, audioMuted: moderation.audioMuted} }, { headers: { "Cache-Control": "no-store" } })
}
