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


/** Visualização da ocupação das salas antes de ingressar na call. */
export interface VoiceRoomParticipant {
  id: string
  name: string
  role: string
  speaking: boolean
  microphone: boolean
}
export interface VoiceRoomInfo {
  id: string
  name: string
  isDefault: boolean
  participants: VoiceRoomParticipant[]
  previewAvailable: boolean
}

/** Restrições definidas pelo Mestre, independentes das preferências locais. */
export interface VoiceModerationState {
  microphoneMuted: boolean
  audioMuted: boolean
}
