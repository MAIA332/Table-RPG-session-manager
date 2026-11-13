import { NextResponse } from "next/server"
import { TrackSource } from "livekit-server-sdk"
import { store } from "@/lib/store"
import { liveKitRoomName, voiceRoomExists, voiceRoomService } from "@/lib/voice/rooms"
import {
  acknowledgeVoiceMove, getVoiceModeration, listVoiceModeration, queueVoiceMove, setVoiceModeration,
  validPendingVoiceMove, VOICE_CONTROL_TOPIC,
} from "@/lib/voice/moderation"
import { checkVoiceOrigin, readJsonLimited, requestError, voiceAccess } from "@/lib/voice/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const noCache = {"Cache-Control": "no-store"}
type Params = {params: Promise<{id: string}>}

export async function GET(request: Request, {params}: Params) {
  const access = await voiceAccess(params)
  if (access.error) return access.error
  const roomId = new URL(request.url).searchParams.get("roomId") || ""
  try {
    const mine = await getVoiceModeration(access.campaignId, access.user.id)
    const pendingMove = roomId && validPendingVoiceMove(mine.pendingMove, roomId) &&
      await voiceRoomExists(access.campaignId, mine.pendingMove!.toRoomId) ? mine.pendingMove : null
    const moderation = access.role === "gm" ? await listVoiceModeration(access.campaignId) : undefined
    return NextResponse.json({mine: {microphoneMuted: mine.microphoneMuted, audioMuted: mine.audioMuted},
      pendingMove, ...(moderation ? {moderation} : {})}, {headers: noCache})
  } catch {
    return NextResponse.json({error: "Não foi possível consultar a moderação."}, {status: 503, headers: noCache})
  }
}

export async function PATCH(request: Request, {params}: Params) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  let body: unknown
  try {body = await readJsonLimited(request, 1024)} catch (error) {return requestError(error)}
  const moveId = body && typeof body === "object" && "moveId" in body && typeof body.moveId === "string" ? body.moveId : ""
  if (!/^[0-9a-f-]{36}$/i.test(moveId)) return NextResponse.json({error: "Transferência inválida."}, {status: 400})
  try {
    await acknowledgeVoiceMove(access.campaignId, access.user.id, moveId)
    return NextResponse.json({success: true}, {headers: noCache})
  } catch {return NextResponse.json({error: "Não foi possível confirmar a transferência."}, {status: 503})}
}

export async function POST(request: Request, {params}: Params) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({error: "Apenas o Mestre pode moderar a call."}, {status: 403})
  let body: unknown
  try {body = await readJsonLimited(request, 2048)} catch (error) {return requestError(error)}
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const action = typeof input.action === "string" ? input.action : "disconnect"
  const targetId = typeof input.targetId === "string" ? input.targetId : ""
  const roomId = typeof input.roomId === "string" ? input.roomId : "main"
  const targetRoomId = typeof input.targetRoomId === "string" ? input.targetRoomId : ""
  const member = store.campaigns.get(access.campaignId)?.members.find(m => m.userId === targetId)
  if (!member || member.role !== "player" || targetId === access.user.id)
    return NextResponse.json({error: "A moderação é permitida somente para jogadores da campanha."}, {status: 400})
  if (!["disconnect", "move", "microphone", "audio"].includes(action))
    return NextResponse.json({error: "Ação de moderação inválida."}, {status: 400})
  if ((action === "microphone" || action === "audio") && typeof input.muted !== "boolean")
    return NextResponse.json({error: "Informe se o jogador deve ser silenciado."}, {status: 400})
  try {
    if (!(await voiceRoomExists(access.campaignId, roomId)) ||
        (action === "move" && (targetRoomId === roomId || !(await voiceRoomExists(access.campaignId, targetRoomId)))))
      return NextResponse.json({error: "Sala de voz inválida."}, {status: 400})
  } catch {return NextResponse.json({error: "Não foi possível verificar as salas."}, {status: 503})}
  const api = voiceRoomService()
  if (!api) return NextResponse.json({error: "LiveKit não configurado."}, {status: 503})
  const liveRoom = liveKitRoomName(access.campaignId, roomId)
  try {
    // Validar ocupação no servidor. O cliente não pode mover/moderar jogadores
    // desconectados nem informar uma sala de origem falsa ou de outra campanha.
    await api.getParticipant(liveRoom, targetId)
    if (action === "disconnect") {
      await api.removeParticipant(liveRoom, targetId)
      return NextResponse.json({success: true}, {headers: noCache})
    }
    if (action === "move") {
      const move = await queueVoiceMove(access.campaignId, targetId, roomId, targetRoomId)
      // LiveKit self-hosted não oferece MoveParticipant. Um evento de dados
      // acelera a transferência; o cliente também consulta a ordem autenticada
      // por HTTP, evitando aceitar eventos falsificados por outros jogadores.
      try {
        await api.sendData(liveRoom, Buffer.from(JSON.stringify({id: move.id})), 0, {
          destinationIdentities: [targetId], topic: VOICE_CONTROL_TOPIC,
        })
      } catch (error) {
        console.debug("[Mesa de Voz] Aviso imediato indisponível; consulta periódica ativa:", error)
      }
      return NextResponse.json({success: true}, {headers: noCache})
    }
    const kind = action === "microphone" ? "microphoneMuted" : "audioMuted"
    const muted = input.muted as boolean
    const previous = await getVoiceModeration(access.campaignId, targetId)
    // Impedir a publicação de microfone e/ou a assinatura de áudio no SFU:
    // o bloqueio continua efetivo mesmo que o navegador tente ignorar a UI.
    await api.updateParticipant(liveRoom, targetId, {permission: {
      canPublish: kind === "microphoneMuted" ? !muted : !previous.microphoneMuted,
      canSubscribe: kind === "audioMuted" ? !muted : !previous.audioMuted,
      canPublishData: true, canPublishSources: [TrackSource.MICROPHONE],
    }})
    try {
      await setVoiceModeration(access.campaignId, targetId, kind, muted)
    } catch (cause) {
      await api.updateParticipant(liveRoom, targetId, {permission: {
        canPublish: !previous.microphoneMuted, canSubscribe: !previous.audioMuted,
        canPublishData: true, canPublishSources: [TrackSource.MICROPHONE],
      }}).catch(() => undefined)
      throw cause
    }
    // O cliente também zera o volume enquanto canSubscribe=false para cobrir
    // eventuais faixas já recebidas antes da atualização de permissões.
    try {
      await api.sendData(liveRoom, Buffer.from(JSON.stringify({kind, muted})), 0, {
        destinationIdentities: [targetId], topic: VOICE_CONTROL_TOPIC,
      })
    } catch (error) {console.debug("[Mesa de Voz] Aviso de moderação via HTTP será usado:", error)}
    return NextResponse.json({success: true, moderation: {microphoneMuted: kind === "microphoneMuted" ? muted : previous.microphoneMuted,
      audioMuted: kind === "audioMuted" ? muted : previous.audioMuted}}, {headers: noCache})
  } catch (error) {
    console.debug("[Mesa de Voz] Falha ao moderar participante:", error)
    return NextResponse.json({error: "Não foi possível aplicar a moderação. Verifique se o jogador ainda está conectado."},
      {status: 502, headers: noCache})
  }
}
