/** Golpes nomeados do jogador. O teste é determinado pelo tipo de defesa, no servidor. */
import { validSpecialAttackPreviewUrl, DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS, MAX_SPECIAL_ATTACK_PREVIEW_SECONDS } from "./combat-model"

export type PlayerAttackDefense = "physical" | "magical"
export type PlayerSpecialAttack = {
  id: string
  name: string
  targetDefense: PlayerAttackDefense
  checkId: "c64" | "c65"
  description: string
  previewImageUrl?: string
  previewDurationSeconds: number
  createdAt: number
  updatedAt: number
}

export type PlayerAttackPreview = {
  id: string
  campaignId: string
  characterId: string
  characterName: string
  attackId: string
  attackName: string
  targetDefense: PlayerAttackDefense
  imageUrl: string
  startedAt: number
  expiresAt: number
}

export type PlayerAttackUsage = { requestId: string; at: number; attackId: string }
export type PlayerSpecialAttackCharacter = {
  specialAttacks?: PlayerSpecialAttack[]
  /** Interno, protegido da edição genérica da ficha. */
  specialAttackUsage?: PlayerAttackUsage[]
  /** Contadores cumulativos de uso por ID, preservados em MongoDB. */
  specialAttackUseCounts?: Record<string, number>
}

/** Três técnicas mais utilizadas; em empate mantém a ordem cadastrada. */
export function mostUsedPlayerAttacks(
  attacks: readonly PlayerSpecialAttack[],
  counts: Record<string, number> | undefined,
  limit = 3,
): PlayerSpecialAttack[] {
  return attacks.map((attack, index) => ({ attack, index })).sort((a, b) => {
    const aCount = Number.isSafeInteger(counts?.[a.attack.id]) && (counts?.[a.attack.id] || 0) > 0
      ? counts![a.attack.id] : 0
    const bCount = Number.isSafeInteger(counts?.[b.attack.id]) && (counts?.[b.attack.id] || 0) > 0
      ? counts![b.attack.id] : 0
    return bCount - aCount || a.index - b.index
  }).slice(0, limit).map(({ attack }) => attack)
}

export function playerAttackCheckId(defense: PlayerAttackDefense): "c64" | "c65" {
  return defense === "magical" ? "c65" : "c64"
}
export function playerAttackDefenseLabel(defense: PlayerAttackDefense) {
  return defense === "magical" ? "Defesa Mágica" : "Defesa Física"
}
export function playerAttackCheckLabel(defense: PlayerAttackDefense) {
  return defense === "magical" ? "Magia e Arcanismo" : "Luta"
}
export function validPlayerAttackId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id)
}

/** Validação estrita para não persistir HTML/SVG, objetos inesperados ou IDs duplicados. */
export function validatePlayerSpecialAttacks(input: unknown, now = Date.now()): PlayerSpecialAttack[] {
  if (!Array.isArray(input) || input.length > 30) throw new Error("Informe até 30 golpes nomeados.")
  const ids = new Set<string>()
  const result = input.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Golpe inválido.")
    const entry = raw as Record<string, unknown>
    if (!validPlayerAttackId(entry.id) || ids.has(entry.id)) throw new Error("ID de golpe inválido ou duplicado.")
    ids.add(entry.id)
    const name = typeof entry.name === "string" ? entry.name.trim() : ""
    if (!name || name.length > 100) throw new Error("O nome do golpe deve ter entre 1 e 100 caracteres.")
    if (entry.targetDefense !== "physical" && entry.targetDefense !== "magical") throw new Error("Defesa alvo inválida.")
    const targetDefense = entry.targetDefense as PlayerAttackDefense
    const description = typeof entry.description === "string" ? entry.description.trim() : ""
    if (description.length > 4000) throw new Error("Descrição muito longa (máximo 4000 caracteres).")
    const image = typeof entry.previewImageUrl === "string" ? entry.previewImageUrl.trim() : ""
    if (image && !validSpecialAttackPreviewUrl(image)) throw new Error("Imagem inválida. Use HTTPS ou uma imagem PNG, JPEG, WebP, GIF ou AVIF compacta.")
    const seconds = entry.previewDurationSeconds === undefined
      ? DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS : Number(entry.previewDurationSeconds)
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_SPECIAL_ATTACK_PREVIEW_SECONDS) {
      throw new Error("Duração da imagem inválida (1 a 86400 segundos).")
    }
    return {
      id: entry.id,
      name,
      targetDefense,
      checkId: playerAttackCheckId(targetDefense),
      description,
      ...(image ? { previewImageUrl: image } : {}),
      previewDurationSeconds: seconds,
      createdAt: typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) && entry.createdAt > 0
        ? entry.createdAt : now,
      updatedAt: now,
    }
  })
  const inlineBytes = result.reduce((sum, attack) =>
    sum + (attack.previewImageUrl?.startsWith("data:") ? attack.previewImageUrl.length : 0), 0)
  if (inlineBytes > 3_000_000) {
    throw new Error("O total de imagens embutidas excede 3 MB. Use URLs HTTPS para os demais golpes.")
  }
  return result
}
