/**
 * Backup de alterações NÃO confirmadas do Soundpad. Não é fonte de verdade:
 * a versão persistida no MongoDB sempre tem prioridade.
 *
 * baseRevision permite recuperar um envio interrompido, mas impede que um
 * backup antigo do navegador apague silenciosamente um dado mais novo.
 */
import {
  normalizeSoundFolders, normalizeSoundHotkeys,
  type SoundFolder, type SoundHotkey,
} from "@/lib/sound-config"

type PreferenceKind = "soundFolders" | "soundHotkeys"
export type PendingSoundPreference<T> = {
  value: T
  /** null = backup de versão anterior; nunca aplicá-lo automaticamente. */
  baseRevision: number | null
  savedAt: number
}

function storageKey(campaignId: string, kind: PreferenceKind): string {
  // Mesmo prefixo v2 para permitir migração sem perder backups preexistentes.
  return `rpg:soundpad:pending:v2:${campaignId}:${kind}`
}

function read<T>(campaignId: string, kind: PreferenceKind, normalizer: (data: unknown) => T): PendingSoundPreference<T> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey(campaignId, kind))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // Formato legado: lista nua, sem revisão do banco.
      return { value: normalizer(parsed), baseRevision: null, savedAt: 0 }
    }
    if (!parsed || typeof parsed !== "object") return null
    const data = parsed as Record<string, unknown>
    if (!Array.isArray(data.value)) return null
    const revision = data.baseRevision
    return {
      value: normalizer(data.value),
      baseRevision: Number.isSafeInteger(revision) && Number(revision) >= 0 ? Number(revision) : null,
      savedAt: Number.isFinite(data.savedAt) ? Number(data.savedAt) : 0,
    }
  } catch { return null }
}

export function readPendingFolderRecord(campaignId: string): PendingSoundPreference<SoundFolder[]> | null {
  return read(campaignId, "soundFolders", normalizeSoundFolders)
}
export function readPendingHotkeyRecord(campaignId: string): PendingSoundPreference<SoundHotkey[]> | null {
  return read(campaignId, "soundHotkeys", normalizeSoundHotkeys)
}

// Interface mantida para eventuais consumidores anteriores.
export function readPendingFolders(campaignId: string): SoundFolder[] | null {
  return readPendingFolderRecord(campaignId)?.value ?? null
}
export function readPendingHotkeys(campaignId: string): SoundHotkey[] | null {
  return readPendingHotkeyRecord(campaignId)?.value ?? null
}

export function savePendingPreference(
  campaignId: string, kind: PreferenceKind, data: SoundFolder[] | SoundHotkey[], baseRevision: number,
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(campaignId, kind), JSON.stringify({
      version: 3, value: data, baseRevision, savedAt: Date.now(),
    }))
  } catch { /* Quota/privacidade: erro na rede continua visível no Soundpad. */ }
}

/** Nunca limpe uma alteração mais recente enquanto um POST antigo é confirmado. */
export function clearPendingPreferenceIfMatches(
  campaignId: string, kind: PreferenceKind, data: SoundFolder[] | SoundHotkey[],
): void {
  if (typeof window === "undefined") return
  try {
    const current = kind === "soundFolders" ? readPendingFolderRecord(campaignId) : readPendingHotkeyRecord(campaignId)
    if (current && JSON.stringify(current.value) === JSON.stringify(data)) {
      window.localStorage.removeItem(storageKey(campaignId, kind))
    }
  } catch { /* Storage indisponível */ }
}
