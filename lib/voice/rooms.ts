import "server-only"
import { randomUUID } from "node:crypto"
import { RoomServiceClient } from "livekit-server-sdk"
import { getVoiceDb } from "./server"
import type { VoiceRoomInfo } from "./types"

export const VOICE_ROOMS_COLLECTION = "voice_rooms"
export const DEFAULT_VOICE_ROOM = "main"
export const MAX_EXTRA_VOICE_ROOMS = 12

type StoredVoiceRoom = { campaignId: string; id: string; name: string; createdAt: number }

export function liveKitRoomName(campaignId: string, roomId: string): string {
  return `otms-voice-${campaignId}${roomId === DEFAULT_VOICE_ROOM ? "" : `-${roomId}`}`
}

export function voiceRoomService(): RoomServiceClient | null {
  const url = process.env.LIVEKIT_URL?.trim()
  const key = process.env.LIVEKIT_API_KEY?.trim()
  const secret = process.env.LIVEKIT_API_SECRET?.trim()
  if (!url || !key || !secret || !/^wss?:\/\//.test(url)) return null
  return new RoomServiceClient(url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), key, secret)
}

export async function listVoiceRooms(campaignId: string): Promise<VoiceRoomInfo[]> {
  const db = await getVoiceDb()
  const rows = await db.collection<StoredVoiceRoom>(VOICE_ROOMS_COLLECTION)
    .find({ campaignId }).sort({ createdAt: 1 }).limit(MAX_EXTRA_VOICE_ROOMS + 1).toArray()
  return [
    { id: DEFAULT_VOICE_ROOM, name: "Sala principal", isDefault: true, participants: [], previewAvailable: false },
    ...rows.map(row => ({ id: row.id, name: row.name, isDefault: false, participants: [], previewAvailable: false })),
  ]
}

export async function voiceRoomExists(campaignId: string, roomId: string): Promise<boolean> {
  if (roomId === DEFAULT_VOICE_ROOM) return true
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return false
  const db = await getVoiceDb()
  return !!(await db.collection(VOICE_ROOMS_COLLECTION).findOne({ campaignId, id: roomId }, { projection: { _id: 1 } }))
}

export async function createVoiceRoom(campaignId: string, name: string): Promise<VoiceRoomInfo> {
  const db = await getVoiceDb()
  const collection = db.collection<StoredVoiceRoom>(VOICE_ROOMS_COLLECTION)
  const count = await collection.countDocuments({ campaignId })
  if (count >= MAX_EXTRA_VOICE_ROOMS) throw new Error("ROOM_LIMIT")
  const id = randomUUID()
  await collection.insertOne({ campaignId, id, name, createdAt: Date.now() })
  return { id, name, isDefault: false, participants: [], previewAvailable: true }
}

export async function removeVoiceRoom(campaignId: string, roomId: string) {
  const db = await getVoiceDb()
  return db.collection(VOICE_ROOMS_COLLECTION).deleteOne({ campaignId, id: roomId })
}
