import { saveToDisk, store } from "@/lib/store"

export const CAMPAIGN_STATE_ARRAY_FIELDS = [
  "gallery",
  "lore",
  "cutscenes",
  "customNPCs",
  "npcLoots",
  "draftPolls",
  "customSounds",
  "customCreatures",
  "customEquipment"
] as const

export type CampaignStateArrayField = typeof CAMPAIGN_STATE_ARRAY_FIELDS[number]

export interface CampaignState {
  gallery: unknown[]
  lore: unknown[]
  cutscenes: unknown[]
  customNPCs: unknown[]
  npcLoots: unknown[]
  draftPolls: unknown[]
  customSounds: unknown[]
  weather: string
  updatedAt: number
}

export function getCampaignState(campaignId: string): CampaignState {
  const raw = store.campaignState.get(campaignId) || {}
  return {
    gallery: Array.isArray(raw.gallery) ? raw.gallery : [],
    lore: Array.isArray(raw.lore) ? raw.lore : store.lore.get(campaignId) || [],
    cutscenes: Array.isArray(raw.cutscenes) ? raw.cutscenes : [],
    customNPCs: Array.isArray(raw.customNPCs) ? raw.customNPCs : [],
    npcLoots: Array.isArray(raw.npcLoots) ? raw.npcLoots : [],
    draftPolls: Array.isArray(raw.draftPolls) ? raw.draftPolls : [],
    customSounds: Array.isArray(raw.customSounds) ? raw.customSounds : [],
    weather: typeof raw.weather === "string" ? raw.weather : "clear",
    updatedAt: Number(raw.updatedAt) || 0,
  }
}

export function getCampaignStateFields(campaignId: string): string[] {
  const raw = store.campaignState.get(campaignId) || {}
  return [...CAMPAIGN_STATE_ARRAY_FIELDS, "weather"].filter((field) => Object.prototype.hasOwnProperty.call(raw, field))
}

export function updateCampaignState(campaignId: string, patch: Record<string, unknown>): CampaignState {
  const current = store.campaignState.get(campaignId) || {}
  const next: Record<string, unknown> = { ...current }

  for (const field of CAMPAIGN_STATE_ARRAY_FIELDS) {
    if (Array.isArray(patch[field])) next[field] = patch[field]
  }
  if (typeof patch.weather === "string") next.weather = patch.weather

  next.updatedAt = Date.now()
  store.campaignState.set(campaignId, next)
  if (Array.isArray(next.lore)) store.lore.set(campaignId, next.lore)
  saveToDisk(store)
  return getCampaignState(campaignId)
}
