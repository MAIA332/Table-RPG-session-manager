import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { publish } from "@/lib/store"
import { VOICE_ATTACHMENTS_COLLECTION, VOICE_MESSAGES_COLLECTION, checkVoiceOrigin, getVoiceDb, voiceAccess } from "@/lib/voice/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const originError = checkVoiceOrigin(request)
  if (originError) return originError
  const access = await voiceAccess(params)
  if (access.error) return access.error
  const { messageId } = await params
  if (!ObjectId.isValid(messageId)) return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 })
  try {
    const db = await getVoiceDb()
    const _id = new ObjectId(messageId)
    const messages = db.collection(VOICE_MESSAGES_COLLECTION)
    const item = await messages.findOne({ _id, campaignId: access.campaignId }, { projection: { userId: 1 } })
    if (!item) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 })
    if (item.userId !== access.user.id && access.role !== "gm")
      return NextResponse.json({ error: "Sem permissão para excluir." }, { status: 403 })
    await messages.deleteOne({ _id, campaignId: access.campaignId })
    await db.collection(VOICE_ATTACHMENTS_COLLECTION).deleteMany({ messageId: _id, campaignId: access.campaignId })
    publish(access.campaignId, { type: "voice:chat-updated" } as Parameters<typeof publish>[1])
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Falha ao excluir mensagem." }, { status: 503 })
  }
}
