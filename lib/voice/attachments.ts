import "server-only"
import { gzipSync, gunzipSync } from "node:zlib"
import { VOICE_FILE_MAX_BYTES, type VoiceChatAttachment } from "./types"

export interface AttachmentInput { name: unknown; mime: unknown; dataBase64: unknown }
export interface StoredAttachment extends VoiceChatAttachment {
  encoding: "gzip+base64"
  compressedDataBase64: string
  compressedSize: number
}

const ALLOWED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

function imageSignatureMatches(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
  return false
}

/** Base64 estrito (não Data URL), gzip em armazenamento; até 2 MiB descomprimidos. */
export function encodeAttachment(raw: AttachmentInput): StoredAttachment {
  if (typeof raw.name !== "string" || typeof raw.dataBase64 !== "string" || typeof raw.mime !== "string")
    throw new Error("Anexo inválido.")
  const name = raw.name.replace(/[\\/\x00-\x1f\x7f]/g, "_").trim().slice(0, 120)
  const mime = raw.mime.toLowerCase().trim().slice(0, 100) || "application/octet-stream"
  if (!name || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mime)) throw new Error("Metadados do arquivo inválidos.")
  const base64 = raw.dataBase64
  if (base64.length > Math.ceil(VOICE_FILE_MAX_BYTES / 3) * 4 + 8 || base64.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
    throw new Error("Base64 inválido ou arquivo maior que 2 MiB.")
  const bytes = Buffer.from(base64, "base64")
  if (!bytes.length || bytes.length > VOICE_FILE_MAX_BYTES) throw new Error("Limite de 2 MiB excedido.")
  const kind = ALLOWED_IMAGES.has(mime) && imageSignatureMatches(bytes, mime) ? "image" : "file"
  // Nunca renderizar arquivos arbitrários como HTML/SVG no navegador.
  const safeMime = kind === "image" ? mime : "application/octet-stream"
  const compressed = gzipSync(bytes, { level: 6 })
  return {
    id: "", name, mime: safeMime, kind, originalSize: bytes.length,
    encoding: "gzip+base64", compressedDataBase64: compressed.toString("base64"), compressedSize: compressed.length,
  }
}

export function decodeAttachment(data: string): Buffer {
  if (!data || data.length > 3_000_000) throw new Error("Anexo corrompido.")
  return gunzipSync(Buffer.from(data, "base64"), { maxOutputLength: VOICE_FILE_MAX_BYTES + 1 })
}
