/** Contratos compartilhados pelo chat de voz; payloads binários nunca aparecem na listagem. */
export const VOICE_FILE_MAX_BYTES = 2 * 1024 * 1024
export const VOICE_MESSAGE_MAX_LENGTH = 2000

export interface VoiceChatAttachment {
  id: string
  name: string
  mime: string
  kind: "image" | "file"
  originalSize: number
}

export interface VoiceChatMessage {
  id: string
  campaignId: string
  userId: string
  userName: string
  text: string
  createdAt: number
  attachment: VoiceChatAttachment | null
}

export interface VoiceChatPage {
  messages: VoiceChatMessage[]
  nextCursor: string | null
}
