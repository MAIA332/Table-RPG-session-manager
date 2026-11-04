/** Modelos compartilhados entre o Soundpad e o motor permanente do navegador. */
export interface Track {
  id: string
  name: string
  url: string
  loopable: boolean
  isCustom?: boolean
}

export const SOUND_LIBRARY: Track[] = [
  { id: "snd_sword", name: "Golpe de Espada", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/sword.mp3", loopable: false },
  { id: "snd_magic", name: "Impacto Mágico", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/magical_horror_audiosprite.mp3", loopable: false },
  { id: "snd_monster", name: "Grito do Monstro", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/alien_death1.mp3", loopable: false },
  { id: "snd_blaster", name: "Impacto Sonoro", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/blaster.mp3", loopable: false },
  { id: "snd_music", name: "Música de Batalha (Exemplo)", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/oedipus_wizball_highscore.mp3", loopable: true },
]

export interface PlaylistItem {
  /** Identificador único da ocorrência (uma mesma faixa pode aparecer diversas vezes). */
  id: string
  trackId: string
  /** 0 = uma execução; 1 = duas; N = N+1 execuções. */
  loops: number
}

export interface SoundPlaylist {
  id: string
  name: string
  items: PlaylistItem[]
}

export interface SoundFolder {
  id: string
  name: string
  trackIds: string[]
  playlists: SoundPlaylist[]
}

export interface SoundHotkey {
  trackId: string
  /** KeyboardEvent.code (Numpad1, Digit1, F6 etc.), independente do layout. */
  code: string
}

export interface ActivePlaylistInfo {
  sessionId: string
  playlistId: string
  playlistName: string
  index: number
  iteration: number
  total: number
}

export interface ActiveSound {
  id: string
  trackId: string
  url: string
  loop: boolean
  paused?: boolean
  targetUserId?: string | null
  playlist?: ActivePlaylistInfo
}

export const SHORTCUT_CODES = [
  ...Array.from({ length: 10 }, (_, n) => ({ code: `Numpad${n}`, label: `Num ${n}` })),
  ...Array.from({ length: 10 }, (_, n) => ({ code: `Digit${n}`, label: `Tecla ${n}` })),
  ...Array.from({ length: 7 }, (_, n) => ({ code: `F${n + 6}`, label: `F${n + 6}` })),
]

export function normalizeSoundFolders(value: unknown): SoundFolder[] {
  if (!Array.isArray(value)) return []
  const folderIds = new Set<string>()
  const playlistIds = new Set<string>()
  const assignedTracks = new Set<string>()
  return value.flatMap((raw): SoundFolder[] => {
    if (!raw || typeof raw !== "object") return []
    const folder = raw as Record<string, unknown>
    if (typeof folder.id !== "string" || !folder.id || ["all", "unfiled"].includes(folder.id) || folderIds.has(folder.id)) return []
    if (typeof folder.name !== "string" || !folder.name.trim()) return []
    folderIds.add(folder.id)
    const trackIds: string[] = []
    for (const id of Array.isArray(folder.trackIds) ? folder.trackIds : []) {
      if (typeof id === "string" && id && !assignedTracks.has(id)) {
        assignedTracks.add(id)
        trackIds.push(id)
      }
    }
    const playlists: SoundPlaylist[] = []
    for (const entry of Array.isArray(folder.playlists) ? folder.playlists : []) {
      if (!entry || typeof entry !== "object") continue
      if (typeof entry.id !== "string" || !entry.id || playlistIds.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim()) continue
      playlistIds.add(entry.id)
      const itemIds = new Set<string>()
      const items: PlaylistItem[] = []
      for (const rawItem of Array.isArray(entry.items) ? entry.items : []) {
        if (!rawItem || typeof rawItem !== "object" || typeof rawItem.id !== "string" || !rawItem.id || itemIds.has(rawItem.id) || typeof rawItem.trackId !== "string") continue
        itemIds.add(rawItem.id)
        items.push({ id: rawItem.id, trackId: rawItem.trackId, loops: Math.min(99, Math.max(0, Math.trunc(Number(rawItem.loops) || 0))) })
      }
      playlists.push({ id: entry.id, name: entry.name.trim(), items })
    }
    return [{ id: folder.id, name: folder.name.trim(), trackIds, playlists }]
  })
}

export function normalizeSoundHotkeys(value: unknown): SoundHotkey[] {
  if (!Array.isArray(value)) return []
  const usedCodes = new Set<string>()
  const usedTracks = new Set<string>()
  const allowedCodes = new Set(SHORTCUT_CODES.map(key => key.code))
  const result: SoundHotkey[] = []
  for (const entry of value) {
    if (!entry || typeof entry.trackId !== "string" || typeof entry.code !== "string" || !entry.trackId.trim() ||
        !allowedCodes.has(entry.code) || usedCodes.has(entry.code) || usedTracks.has(entry.trackId)) continue
    usedCodes.add(entry.code)
    usedTracks.add(entry.trackId)
    result.push({ trackId: entry.trackId, code: entry.code })
  }
  return result
}
