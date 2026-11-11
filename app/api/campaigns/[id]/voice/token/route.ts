import { NextResponse } from "next/server"
import { AccessToken, TrackSource } from "livekit-server-sdk"
import { checkVoiceOrigin, voiceAccess } from "@/lib/voice/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  const url = process.env.LIVEKIT_URL?.trim()
  const apiKey = process.env.LIVEKIT_API_KEY?.trim()
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
  if (!url || !apiKey || !apiSecret || !/^wss:\/\//.test(url))
    return NextResponse.json({ error: "Servidor de voz ainda não configurado." }, { status: 503 })

  const token = new AccessToken(apiKey, apiSecret, {
    identity: access.user.id,
    name: access.user.name.slice(0, 80),
    ttl: 30 * 60,
    metadata: JSON.stringify({ role: access.role }),
  })
  token.addGrant({
    room: `otms-voice-${access.campaignId}`,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: true,
  })
  return NextResponse.json({ url, token: await token.toJwt() }, { headers: { "Cache-Control": "no-store" } })
}
