import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { VOICE_ATTACHMENTS_COLLECTION, VOICE_MESSAGES_COLLECTION, getVoiceDb, voiceAccess } from "@/lib/voice/server"
import { decodeAttachment } from "@/lib/voice/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const access = await voiceAccess(params)
  if (access.error) return access.error
  const { attachmentId } = await params
  if (!ObjectId.isValid(attachmentId)) return NextResponse.json({ error: "Anexo inválido." }, { status: 400 })
  try {
    const db = await getVoiceDb()
    const attachment = await db.collection(VOICE_ATTACHMENTS_COLLECTION).findOne({
      _id: new ObjectId(attachmentId), campaignId: access.campaignId,
    })
    if (!attachment) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 })
    const parentExists = await db.collection(VOICE_MESSAGES_COLLECTION).findOne({
      _id: attachment.messageId, campaignId: access.campaignId,
    }, { projection: { _id: 1 } })
    if (!parentExists) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 })
    if (attachment.encoding !== "gzip+base64" || typeof attachment.dataBase64 !== "string")
      return NextResponse.json({ error: "Formato inválido." }, { status: 422 })
    const bytes = decodeAttachment(attachment.dataBase64)
    const isImage = attachment.kind === "image" && ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(attachment.mime)
    const cleanName = String(attachment.name).replace(/[\r\n]/g, "_").slice(0, 120)
    const filename = cleanName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_")
    const encodedName = encodeURIComponent(cleanName)
    const disposition = isImage ? "inline" : "attachment"
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": isImage ? attachment.mime : "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao recuperar arquivo." }, { status: 503 })
  }
}
