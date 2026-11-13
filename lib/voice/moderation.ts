import "server-only"
import { randomUUID } from "node:crypto"
import { getVoiceDb } from "./server"
import type { VoiceModerationState } from "./types"

const COLLECTION = "voice_participant_moderation"
export const VOICE_CONTROL_TOPIC = "otms.voice.moderation.v1"
export const MOVE_EXPIRES_MS = 30_000

export type PendingVoiceMove = {
  id: string
  fromRoomId: string
  toRoomId: string
  issuedAt: number
}
type StoredModeration = VoiceModerationState & {
  campaignId: string
  userId: string
  pendingMove?: PendingVoiceMove
  updatedAt: number
}

export const emptyVoiceModeration = (): VoiceModerationState => ({microphoneMuted: false, audioMuted: false})

export async function getVoiceModeration(campaignId: string, userId: string): Promise<VoiceModerationState & {pendingMove?: PendingVoiceMove}> {
  const db = await getVoiceDb()
  const item = await db.collection<StoredModeration>(COLLECTION).findOne({campaignId, userId})
  return {microphoneMuted: item?.microphoneMuted === true, audioMuted: item?.audioMuted === true,
    ...(item?.pendingMove ? {pendingMove: item.pendingMove} : {})}
}

export async function listVoiceModeration(campaignId: string): Promise<Record<string, VoiceModerationState>> {
  const db = await getVoiceDb()
  const rows = await db.collection<StoredModeration>(COLLECTION).find({campaignId},
    {projection: {userId: 1, microphoneMuted: 1, audioMuted: 1}}).toArray()
  return Object.fromEntries(rows.map(row => [row.userId, {
    microphoneMuted: row.microphoneMuted === true, audioMuted: row.audioMuted === true,
  }]))
}

export async function setVoiceModeration(campaignId: string, userId: string, kind: "microphoneMuted" | "audioMuted", muted: boolean) {
  const db = await getVoiceDb()
  await db.collection<StoredModeration>(COLLECTION).updateOne({campaignId, userId},
    {$set: {[kind]: muted, updatedAt: Date.now()}, $setOnInsert: {campaignId, userId}}, {upsert: true})
}

export async function queueVoiceMove(campaignId: string, userId: string, fromRoomId: string, toRoomId: string): Promise<PendingVoiceMove> {
  const pendingMove = {id: randomUUID(), fromRoomId, toRoomId, issuedAt: Date.now()}
  const db = await getVoiceDb()
  await db.collection<StoredModeration>(COLLECTION).updateOne({campaignId, userId},
    {$set: {pendingMove, updatedAt: Date.now()}, $setOnInsert: {campaignId, userId}}, {upsert: true})
  return pendingMove
}

export function validPendingVoiceMove(move: PendingVoiceMove | undefined, roomId: string, now = Date.now()): move is PendingVoiceMove {
  return !!move && move.fromRoomId === roomId && move.toRoomId !== roomId &&
    now - move.issuedAt >= 0 && now - move.issuedAt <= MOVE_EXPIRES_MS
}

/** Confirma a execução de um deslocamento, sem apagar comandos mais novos. */
export async function acknowledgeVoiceMove(campaignId: string, userId: string, moveId: string) {
  const db = await getVoiceDb()
  await db.collection<StoredModeration>(COLLECTION).updateOne({campaignId, userId, "pendingMove.id": moveId},
    {$unset: {pendingMove: ""}})
}
