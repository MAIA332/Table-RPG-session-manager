/** Backup local das preferências do estúdio. Não substitui o armazenamento do servidor. */
import {
  normalizeSoundFolders, normalizeSoundHotkeys,
  type SoundFolder, type SoundHotkey,
} from "@/lib/sound-config"

type PreferenceKind = "soundFolders" | "soundHotkeys"

function storageKey(campaignId: string, kind: PreferenceKind): string {
  return `rpg:soundpad:pending:v2:${campaignId}:${kind}`
}

function read<T>(campaignId: string, kind: PreferenceKind, normalizer: (data: unknown) => T): T | null {
  if (typeof window === "undefined") return null
  try {
    const data = window.localStorage.getItem(storageKey(campaignId, kind))
    return data === null ? null : normalizer(JSON.parse(data))
  } catch {
    return null
  }
}

export function readPendingFolders(campaignId: string): SoundFolder[] | null {
  return read(campaignId, "soundFolders", normalizeSoundFolders)
}

export function readPendingHotkeys(campaignId: string): SoundHotkey[] | null {
  return read(campaignId, "soundHotkeys", normalizeSoundHotkeys)
}

export function savePendingPreference(campaignId: string, kind: PreferenceKind, data: SoundFolder[] | SoundHotkey[]): void {
  try { window.localStorage.setItem(storageKey(campaignId, kind), JSON.stringify(data)) } catch { /* Quota/privacidade */ }
}

/** Um salvamento anterior não deve apagar um backup mais recente ainda pendente. */
export function clearPendingPreferenceIfMatches(campaignId: string, kind: PreferenceKind, data: SoundFolder[] | SoundHotkey[]): void {
  try {
    const key = storageKey(campaignId, kind)
    if (window.localStorage.getItem(key) === JSON.stringify(data)) window.localStorage.removeItem(key)
  } catch { /* Storage indisponível */ }
}
