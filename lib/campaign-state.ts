import { saveToDisk, store } from "@/lib/store"
import type { GalleryFolder, StoreFolder } from "./types"

export const CAMPAIGN_STATE_ARRAY_FIELDS = [
  "gallery", "galleryFolders", "galleryBroadcastRequests", "lore",
  "cutscenes", "customNPCs", "npcLoots", "draftPolls", "customSounds",
  "soundFolders", "customCreatures", "customEquipment", "customClasses",
  "storeFolders",
] as const

export type CampaignStateArrayField = typeof CAMPAIGN_STATE_ARRAY_FIELDS[number]

export interface SoundFolder {
  id: string
  name: string
  trackIds: string[]
}

export interface CampaignState {
  gallery: unknown[]
  lore: unknown[]
  cutscenes: unknown[]
  customNPCs: unknown[]
  npcLoots: unknown[]
  draftPolls: unknown[]
  customSounds: unknown[]
  soundFolders: SoundFolder[]
  customCreatures: unknown[]
  customEquipment: unknown[]
  customClasses: unknown[]
  weather: string
  updatedAt: number
  storeFolders: StoreFolder[]
  galleryFolders: GalleryFolder[]
  galleryBroadcastRequests: unknown[]
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
    soundFolders: normalizeSoundFolders(raw.soundFolders),
    customCreatures: Array.isArray(raw.customCreatures) ? raw.customCreatures : [],
    customEquipment: Array.isArray(raw.customEquipment) ? raw.customEquipment : [],
    customClasses: Array.isArray(raw.customClasses) ? raw.customClasses : [],
    storeFolders: Array.isArray(raw.storeFolders) ? raw.storeFolders : [],
    weather: typeof raw.weather === "string" ? raw.weather : "clear",
    galleryFolders: Array.isArray(raw.galleryFolders) ? raw.galleryFolders : [{ id: "root", name: "Todas as imagens" }],
    galleryBroadcastRequests: Array.isArray(raw.galleryBroadcastRequests) ? raw.galleryBroadcastRequests : [],
    updatedAt: Number(raw.updatedAt) || 0,
  }
}

export function getCampaignStateFields(campaignId: string): string[] {
  const raw = store.campaignState.get(campaignId) || {}
  return [...CAMPAIGN_STATE_ARRAY_FIELDS, "weather"].filter(field => Object.prototype.hasOwnProperty.call(raw, field))
}

export function updateCampaignState(campaignId: string, patch: Record<string, unknown>): CampaignState {
  const current = store.campaignState.get(campaignId) || {}
  const next: Record<string, unknown> = { ...current }
  for (const field of CAMPAIGN_STATE_ARRAY_FIELDS) {
    if (Array.isArray(patch[field])) {
      next[field] = field === "soundFolders" ? normalizeSoundFolders(patch[field]) : patch[field]
    }
  }
  if (typeof patch.weather === "string") next.weather = patch.weather
  next.updatedAt = Date.now()
  store.campaignState.set(campaignId, next)
  if (Array.isArray(next.lore)) store.lore.set(campaignId, next.lore)
  saveToDisk(store)
  return getCampaignState(campaignId)
}

function normalizeSoundFolders(value: unknown): SoundFolder[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const tracks = new Set<string>()
  return value.flatMap(entry => {
    if (!entry || typeof entry.id !== "string" || !entry.id || ["all", "unfiled"].includes(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim()) return []
    ids.add(entry.id)
    const trackIds: string[] = []
    for (const id of Array.isArray(entry.trackIds) ? entry.trackIds : []) {
      if (typeof id === "string" && !tracks.has(id)) { tracks.add(id); trackIds.push(id) }
    }
    return [{ id: entry.id, name: entry.name.trim(), trackIds }]
  })
}
