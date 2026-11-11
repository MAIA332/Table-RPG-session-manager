import { NextResponse } from "next/server"
import { ObjectId, type WithId, type Document } from "mongodb"
import { publish } from "@/lib/store"
import { VOICE_ATTACHMENTS_COLLECTION, VOICE_MESSAGES_COLLECTION, checkVoiceOrigin, getVoiceDb, readJsonLimited, requestError, voiceAccess } from "@/lib/voice/server"
import { encodeAttachment, type AttachmentInput } from "@/lib/voice/attachments"
import { VOICE_MESSAGE_MAX_LENGTH, type VoiceChatMessage, type VoiceChatPage } from "@/lib/voice/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }
type StoredMessage = Omit<VoiceChatMessage, "id" | "attachment"> & { _id: ObjectId; attachment: VoiceChatMessage["attachment"] }

function publicMessage(item: WithId<Document>): VoiceChatMessage {
  return {
    id: item._id.toHexString(), campaignId: String(item.campaignId),
    userId: String(item.userId), userName: String(item.userName),
    text: String(item.text), createdAt: Number(item.createdAt),
    attachment: item.attachment || null,
  }
}

export async function GET(request: Request, { params }: Params) {
  const access = await voiceAccess(params)
  if (access.error) return access.error
  const before = new URL(request.url).searchParams.get("before")
  if (before && !ObjectId.isValid(before)) return NextResponse.json({ error: "Cursor inválido." }, { status: 400 })
  try {
    const db = await getVoiceDb()
    const query = { campaignId: access.campaignId, ...(before ? { _id: { $lt: new ObjectId(before) } } : {}) }
    const rows = await db.collection(VOICE_MESSAGES_COLLECTION).find(query).sort({ _id: -1 }).limit(41).toArray()
    const more = rows.length > 40
    const messages = rows.slice(0, 40).map(publicMessage).reverse()
    const page: VoiceChatPage = { messages, nextCursor: more ? messages[0]?.id || null : null }
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar o chat." }, { status: 503 })
  }
}

export async function POST(request: Request, { params }: Params) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  let body: unknown
  try { body = await readJsonLimited(request) } catch (error) { return requestError(error) }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 })
  const input = body as { text?: unknown; attachment?: AttachmentInput | null }
  if (typeof input.text !== "string" || input.text.length > VOICE_MESSAGE_MAX_LENGTH)
    return NextResponse.json({ error: "O texto deve ter no máximo 2.000 caracteres." }, { status: 400 })
  const text = input.text.trim()
  if (!text && !input.attachment) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 })
  let encoded: ReturnType<typeof encodeAttachment> | null = null
  if (input.attachment != null) {
    try { encoded = encodeAttachment(input.attachment) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Anexo inválido." }, { status: 400 }) }
  }
  try {
    const db = await getVoiceDb()
    const messages = db.collection(VOICE_MESSAGES_COLLECTION)
    const attachments = db.collection(VOICE_ATTACHMENTS_COLLECTION)
    // Limite simples de cadência persistente: atua também após reinício do processo.
    const latest = await messages.findOne({ campaignId: access.campaignId, userId: access.user.id }, { sort: { _id: -1 }, projection: { createdAt: 1 } })
    if (latest && Date.now() - Number(latest.createdAt) < 800)
      return NextResponse.json({ error: "Envie a próxima mensagem em instantes." }, { status: 429 })
    const messageId = new ObjectId()
    const attachmentId = encoded ? new ObjectId() : null
    const attachment = encoded && attachmentId ? {
      id: attachmentId.toHexString(), name: encoded.name, mime: encoded.mime,
      kind: encoded.kind, originalSize: encoded.originalSize,
    } : null
    const doc: StoredMessage = {
      _id: messageId, campaignId: access.campaignId,
      userId: access.user.id, userName: access.user.name.slice(0, 100),
      text, createdAt: Date.now(), attachment,
    }
    if (encoded && attachmentId) {
      await attachments.insertOne({
        _id: attachmentId, campaignId: access.campaignId, messageId,
        userId: access.user.id, name: encoded.name, mime: encoded.mime,
        kind: encoded.kind, originalSize: encoded.originalSize,
        compressedSize: encoded.compressedSize, encoding: encoded.encoding,
        dataBase64: encoded.compressedDataBase64,
        createdAt: doc.createdAt,
      })
    }
    try { await messages.insertOne(doc) }
    catch (error) {
      if (attachmentId) await attachments.deleteOne({ _id: attachmentId }).catch(() => undefined)
      throw error
    }
    // SSE existente: mensagem pequena, sem conteúdo do anexo.
    publish(access.campaignId, { type: "voice:chat-updated" } as Parameters<typeof publish>[1])
    return NextResponse.json({ message: publicMessage(doc) }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar a mensagem." }, { status: 503 })
  }
}
