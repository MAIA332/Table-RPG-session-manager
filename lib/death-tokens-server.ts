import "server-only"
import type { Campaign } from "@/lib/types"
import type { GameClass } from "@/lib/game-data"
import { CLASSES, EQUIPMENT } from "@/lib/game-data"
import { store } from "@/lib/store"
import { isClassPublished } from "@/lib/class-visibility"
import type { DeathToken } from "@/lib/death-tokens"

const STATE_KEY = "deathTokens"

export function readCampaignDeathTokens(raw: Record<string, unknown> | undefined): DeathToken[] {
  return Array.isArray(raw?.[STATE_KEY]) ? (raw[STATE_KEY] as DeathToken[]).filter(token =>
    !!token && typeof token.id === "string" && typeof token.userId === "string" &&
    ["available", "used", "revoked"].includes(token.status)) : []
}

export function withCampaignDeathTokens(raw: Record<string, unknown> | undefined, tokens: DeathToken[]): Record<string, unknown> {
  return { ...raw, [STATE_KEY]: tokens, updatedAt: Date.now() }
}

/** Publicações são lidas do estado autoritativo; nunca do localStorage do jogador. */
export function creatorClassCatalog(campaignId: string, gm: boolean, token?: DeathToken): GameClass[] {
  const raw = store.campaignState.get(campaignId)
  const custom = Array.isArray(raw?.customClasses) ? raw.customClasses as GameClass[] : []
  const special = new Set(token?.status === "available" ? token.allowedClassIds : [])
  const allowedCustom = custom.filter(cls => gm || isClassPublished(cls) || special.has(cls.id))
  const unique = new Map<string, GameClass>()
  // Não reintroduzir classes ocultas ou excluídas através de fichas históricas.
  // A fonte de verdade é a definição atual, publicada ou autorizada pelo token.
  for (const cls of [...CLASSES, ...allowedCustom]) {
    if (!cls || !cls.id) continue
    // Classes históricas não publicadas só podem aparecer quando explicitamente autorizadas.
    const saved = custom.find(entry => entry.id === cls.id)
    if (saved && !gm && !isClassPublished(saved) && !special.has(cls.id)) continue
    unique.set(cls.id, cls)
  }
  return [...unique.values()].filter(cls => !cls.parentClassId || unique.has(cls.parentClassId))
}

export function creatorEquipmentCatalog(campaignId: string) {
  const raw = store.campaignState.get(campaignId)
  const custom = Array.isArray(raw?.customEquipment) ? raw.customEquipment as Array<{ id: string; name: string; cost: number; purchasable?: boolean; detail?: string }> : []
  const unique = new Map<string, (typeof custom)[number]>()
  for (const item of [...EQUIPMENT, ...custom]) if (typeof item.id === "string" && item.id) unique.set(item.id, item)
  return [...unique.values()]
}

export function isCampaignPlayer(campaign: Campaign, userId: string) {
  return campaign.members.some(member => member.userId === userId && member.role === "player")
}
