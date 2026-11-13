import { NextResponse } from "next/server"
import { TrackSource } from "livekit-server-sdk"
import { store } from "@/lib/store"
import { checkVoiceOrigin, readJsonLimited, requestError, voiceAccess } from "@/lib/voice/server"
import {
  DEFAULT_VOICE_ROOM, MAX_EXTRA_VOICE_ROOMS, createVoiceRoom, listVoiceRooms,
  liveKitRoomName, removeVoiceRoom, voiceRoomExists, voiceRoomService,
} from "@/lib/voice/rooms"
import type { VoiceRoomInfo } from "@/lib/voice/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }
const noCache = { "Cache-Control": "no-store" }

export async function GET(_request: Request, { params }: Params) {
  const access = await voiceAccess(params)
  if (access.error) return access.error
  try {
    const rooms = await listVoiceRooms(access.campaignId)
    const client = voiceRoomService()
    if (client) {
      try {
        // LiveKit não materializa salas vazias; sua ausência na listagem
        // significa zero participantes, não erro ao consultar a prévia.
        const active = await client.listRooms()
        const activeNames = new Set(active.map(item => item.name))
        const members = store.campaigns.get(access.campaignId)?.members || []
        await Promise.all(rooms.map(async (room) => {
          const roomName = liveKitRoomName(access.campaignId, room.id)
          if (!activeNames.has(roomName)) { room.previewAvailable = true; return }
          try {
            const people = await client.listParticipants(roomName)
            room.participants = people.map((person:any) => ({
              id: person.identity,
              name: store.users.get(person.identity)?.name || person.name || "Participante",
              role: members.find(member => member.userId === person.identity)?.role || "player",
              speaking: person.isSpeaking === true,
              microphone: person.tracks.some((track:any) => track.source === TrackSource.MICROPHONE && !track.muted),
            }))
            room.previewAvailable = true
          } catch (cause) {
            // Não informar "vazia" quando não conseguimos consultar o LiveKit.
            console.debug("[Mesa de Voz] Prévia da sala indisponível:", room.id, cause)
            room.previewAvailable = false
          }
        }))
      } catch (cause) {
        console.debug("[Mesa de Voz] Não foi possível consultar a ocupação:", cause)
      }
    }
    return NextResponse.json({ rooms }, { headers: noCache })
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar as salas de voz." }, { status: 503, headers: noCache })
  }
}

export async function POST(request: Request, { params }: Params) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o Mestre pode criar salas." }, { status: 403 })
  let body: unknown
  try { body = await readJsonLimited(request, 2048) } catch (error) { return requestError(error) }
  const name = typeof body === "object" && body !== null && "name" in body && typeof body.name === "string"
    ? body.name.trim().replace(/\s+/g, " ") : ""
  if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "O nome deve ter entre 2 e 40 caracteres." }, { status: 400 })
  try {
    const room: VoiceRoomInfo = await createVoiceRoom(access.campaignId, name)
    return NextResponse.json({ room }, { status: 201, headers: noCache })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "ROOM_LIMIT"
      ? `Limite de ${MAX_EXTRA_VOICE_ROOMS} salas adicionais atingido.` : "Não foi possível criar a sala." },
    { status: error instanceof Error && error.message === "ROOM_LIMIT" ? 409 : 503 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o Mestre pode excluir salas." }, { status: 403 })
  let body: unknown
  try { body = await readJsonLimited(request, 2048) } catch (error) { return requestError(error) }
  const roomId = body && typeof body === "object" && "roomId" in body && typeof body.roomId === "string" ? body.roomId : ""
  try {
    if (!roomId || roomId === DEFAULT_VOICE_ROOM || !(await voiceRoomExists(access.campaignId, roomId)))
      return NextResponse.json({ error: "Sala inválida ou protegida." }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Não foi possível verificar a sala." }, { status: 503 })
  }
  const client = voiceRoomService()
  if (!client) return NextResponse.json({ error: "Servidor de voz indisponível." }, { status: 503 })
  try {
    const existing = await client.listRooms()
    const present = existing.some(room => room.name === liveKitRoomName(access.campaignId, roomId))
    const people = present ? await client.listParticipants(liveKitRoomName(access.campaignId, roomId)) : []
    if (people.length) return NextResponse.json({ error: "Esvazie a sala antes de excluí-la." }, { status: 409 })
    await removeVoiceRoom(access.campaignId, roomId)
    return NextResponse.json({ success: true }, { headers: noCache })
  } catch {
    return NextResponse.json({ error: "Não foi possível confirmar que a sala está vazia." }, { status: 503 })
  }
}
