"use client"
import { controllerConfirm } from '@/lib/input/dialogs'
import { useController } from '@/components/controller/controller-provider'
import { useControllerActions } from '@/lib/input/use-controller-actions'
import { controllerFocus, focusControllerElement } from '@/lib/input/focus'
import { SOUND_ACTION_LABELS } from '@/lib/input/soundpad-commands'
import { ControllerGlyph } from '@/components/controller/controller-glyph'


import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Activity, ArrowDown, ArrowUp, Disc3, GripVertical, Headphones,
  Link2, ListMusic, Music2, Pause, Play, Plus, Repeat, Save, Search,
  SkipBack, SkipForward, Square, Trash2, Volume2, X,
  Folder, FolderOpen, Library, ChevronRight,
  Keyboard, SlidersHorizontal, Radio, MoreHorizontal,
  Music, Sparkles, PanelRight, List,
} from "lucide-react"
import { createClientId } from "@/lib/client-id"
import { musicSource } from "@/lib/music-sources"
import {
  readPendingFolderRecord, readPendingHotkeyRecord, savePendingPreference,
  clearPendingPreferenceIfMatches,
} from "@/lib/soundpad-local"
import {
  SOUND_LIBRARY, SHORTCUT_CODES, normalizeSoundFolders, normalizeSoundHotkeys,
  type ActiveSound, type PlaylistItem, type SoundFolder,
  type SoundHotkey, type SoundPlaylist, type Track,
} from "@/lib/sound-config"

// Exportações mantidas para não quebrar imports existentes do CampaignRoom.
export { SOUND_LIBRARY }
export type { ActiveSound, Track } from "@/lib/sound-config"

type SoundpadProps = {
  isGm: boolean
  campaignId: string
  currentUserId: string
  players?: { userId: string; name: string }[]
  targetUserId?: string | null
  onTargetUserIdChange?: (userId: string | null) => void
  onSoundEnded?: (sound: ActiveSound) => void // compatibilidade
  activeSounds: ActiveSound[]
  customTracks?: Track[]
  musicVolume?: number
  effectsVolume?: number
  onCustomTracksChange?: (tracks: Track[]) => void
  onMusicVolumeChange?: (volume: number) => void
  onEffectsVolumeChange?: (volume: number) => void
  onPlaySound?: (track: { id: string; url: string }, loop: boolean, targetUserId?: string | null) => void
  onStopSound?: (id: string) => void
  onStopAll?: () => void
  /** Opcional: permite ao componente pai fechar diretamente a tela cheia. */
  onClose?: () => void
}

const inputClass = "w-full min-w-0 rounded-xl border border-border/60 bg-background/55 px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/55 transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-full border border-border/60 bg-card/65 px-4 py-2.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-md transition-all hover:border-primary/50 hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-[0_10px_30px_-10px_currentColor] transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`)
  return data
}

type SoundPreferenceKind = "soundFolders" | "soundHotkeys"

/** Compara dados normalizados para não confundir diferença de formatação com falha. */
function samePreference(kind: SoundPreferenceKind, received: unknown, expected: SoundFolder[] | SoundHotkey[]): boolean {
  const normalize = kind === "soundFolders" ? normalizeSoundFolders : normalizeSoundHotkeys
  return JSON.stringify(normalize(received)) === JSON.stringify(normalize(expected))
}

/** O servidor MongoDB devolve revisões independentes para pastas e atalhos. */
function readRevision(payload: any, kind: SoundPreferenceKind): number {
  const value = payload?.revisions?.[kind]
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

/**
 * A resposta do POST pode ser perdida depois do commit. Verificamos o GET
 * autoritativo do MongoDB, e nunca tratamos um backup local como confirmação.
 */
async function saveConfirmedPreference(
  endpoint: string, kind: SoundPreferenceKind,
  value: SoundFolder[] | SoundHotkey[], expectedRevision: number,
): Promise<number> {
  let originalError: unknown
  try {
    const result = await postJson(endpoint, { [kind]: value, expectedRevision })
    if (result?.success === true && result?.source === "mongodb" &&
        Array.isArray(result[kind]) && samePreference(kind, result[kind], value)) {
      return readRevision(result, kind)
    }
    throw new Error("O MongoDB não confirmou as preferências sonoras.")
  } catch (error) { originalError = error }

  try {
    const response = await fetch(endpoint, { cache: "no-store" })
    if (response.ok) {
      const result = await response.json()
      const storedKind = kind === "soundFolders" ? "folders" : "hotkeys"
      if (result?.success === true && result?.source === "mongodb" &&
          result?.stored?.[storedKind] === true && Array.isArray(result[kind]) &&
          samePreference(kind, result[kind], value)) {
        return readRevision(result, kind)
      }
    }
  } catch { /* Preservar o erro original. */ }
  throw originalError
}

function createId(prefix: string): string {
  return `${prefix}-${createClientId()}`
}

export function Soundpad({
  campaignId, players = [], targetUserId = null, onTargetUserIdChange,
  isGm, activeSounds, customTracks = [], musicVolume = 0.5, effectsVolume = 0.5,
  onCustomTracksChange, onMusicVolumeChange, onEffectsVolumeChange,
  onPlaySound, onStopSound, onStopAll, onClose,
}: SoundpadProps) {
  const {active: controllerActive, settings: controllerSettings} = useController()
  const [targetingReady, setTargetingReady] = useState(false)
  const [folders, setFolders] = useState<SoundFolder[]>([])
  const [hotkeys, setHotkeys] = useState<SoundHotkey[]>([])
  const [activeFolder, setActiveFolder] = useState("all")
  const [search, setSearch] = useState("")
  const [newFolderName, setNewFolderName] = useState("")
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [newSoundName, setNewSoundName] = useState("")
  const [newSoundUrl, setNewSoundUrl] = useState("")
  const [importingMusic, setImportingMusic] = useState(false)
  const [importNotice, setImportNotice] = useState("")
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  // Fechar nunca volta ao antigo modal compacto: o estúdio só existe em tela cheia.
  const [isVisible, setIsVisible] = useState(true)
  const [portalReady, setPortalReady] = useState(false)
  const [mobileInspector, setMobileInspector] = useState(false)
  const [lastPlaylistAdded, setLastPlaylistAdded] = useState<Record<string, string>>({})
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const themeAnchorRef = useRef<HTMLSpanElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const [loaded, setLoaded] = useState(false)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [busyPlaylist, setBusyPlaylist] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const generation = useRef(0)
  const foldersRef = useRef<SoundFolder[]>([])
  const hotkeysRef = useRef<SoundHotkey[]>([])
  const stateQueue = useRef<Promise<void>>(Promise.resolve())
  const revisionsRef = useRef<Record<SoundPreferenceKind, number>>({ soundFolders: 0, soundHotkeys: 0 })
  const [localConflict, setLocalConflict] = useState(false)

  const allTracks = useMemo(() => [...SOUND_LIBRARY, ...customTracks], [customTracks])
  const trackMap = useMemo(() => new Map(allTracks.map(track => [track.id, track])), [allTracks])
  const soundEndpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/sound`
  const preferencesEndpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/sound/preferences`

  useEffect(() => {
    const version = ++generation.current
    const abort = new AbortController()
    setLoaded(false)
    setPendingWrites(0)
    setLocalConflict(false)
    setError("")
    setFolders([])
    setHotkeys([])
    foldersRef.current = []
    hotkeysRef.current = []
    revisionsRef.current = { soundFolders: 0, soundHotkeys: 0 }
    setActiveFolder("all")
    setSelectedPlaylistId(null)
    if (!isGm) return () => { abort.abort(); generation.current++ }

    void Promise.all([
      fetch(preferencesEndpoint, { cache: "no-store", signal: abort.signal }),
      fetch(soundEndpoint, { cache: "no-store", signal: abort.signal }),
    ]).then(async ([preferencesResponse, soundResponse]) => {
      const soundData = await soundResponse.json().catch(() => ({}))
      if (!soundResponse.ok) throw new Error(soundData.error || "Não foi possível obter os recursos de áudio.")
      const preferences = await preferencesResponse.json().catch(() => null)
      if (!preferencesResponse.ok || preferences?.success !== true || preferences?.source !== "mongodb") {
        throw new Error(preferences?.error || "As configurações de áudio não foram confirmadas no MongoDB. Edite apenas quando a conexão estiver disponível.")
      }
      if (version !== generation.current || abort.signal.aborted) return

      const storedFolders = normalizeSoundFolders(preferences.soundFolders)
      const storedKeys = normalizeSoundHotkeys(preferences.soundHotkeys)
      const foldersRevision = readRevision(preferences, "soundFolders")
      const hotkeysRevision = readRevision(preferences, "soundHotkeys")
      revisionsRef.current = { soundFolders: foldersRevision, soundHotkeys: hotkeysRevision }

      const pendingFolders = readPendingFolderRecord(campaignId)
      const pendingHotkeys = readPendingHotkeyRecord(campaignId)
      if (pendingFolders && samePreference("soundFolders", storedFolders, pendingFolders.value)) {
        clearPendingPreferenceIfMatches(campaignId, "soundFolders", pendingFolders.value)
      }
      if (pendingHotkeys && samePreference("soundHotkeys", storedKeys, pendingHotkeys.value)) {
        clearPendingPreferenceIfMatches(campaignId, "soundHotkeys", pendingHotkeys.value)
      }
      const folderRecovery = !!pendingFolders &&
        !samePreference("soundFolders", storedFolders, pendingFolders.value) &&
        pendingFolders.baseRevision === foldersRevision
      const keyRecovery = !!pendingHotkeys &&
        !samePreference("soundHotkeys", storedKeys, pendingHotkeys.value) &&
        pendingHotkeys.baseRevision === hotkeysRevision
      const conflict = (!!pendingFolders &&
        !samePreference("soundFolders", storedFolders, pendingFolders.value) && !folderRecovery) ||
        (!!pendingHotkeys && !samePreference("soundHotkeys", storedKeys, pendingHotkeys.value) && !keyRecovery)
      // Uma revisão diferente significa que o servidor recebeu mudanças mais
      // recentes. Nunca substituí-las automaticamente por um backup antigo.
      const nextFolders = folderRecovery ? pendingFolders!.value : storedFolders
      const nextHotkeys = keyRecovery ? pendingHotkeys!.value : storedKeys
      foldersRef.current = nextFolders
      hotkeysRef.current = nextHotkeys
      setFolders(nextFolders)
      setHotkeys(nextHotkeys)
      setLocalConflict(conflict)
      window.dispatchEvent(new CustomEvent("rpg:sound-hotkeys-updated", { detail: nextHotkeys }))
      setTargetingReady(soundData.capabilities?.targetedSound === true)
      setLoaded(true)

      if (conflict) setError("Existe um backup local de outra revisão. A versão do MongoDB foi preservada. Escolha 'Resolver backup' para decidir se quer restaurá-lo.")
      else if (folderRecovery || keyRecovery) setError("Há alterações locais ainda não confirmadas no MongoDB. Use 'Tentar salvar novamente' para sincronizar.")
    }).catch(err => {
      if (version === generation.current && !abort.signal.aborted) {
        setError(errorMessage(err, "Erro ao carregar o arquivo sonoro."))
      }
    })
    return () => { abort.abort(); generation.current++ }
  }, [preferencesEndpoint, soundEndpoint, campaignId, isGm, reload])

  const canPlay = isGm && loaded && (!targetUserId || (targetingReady && players.some(p => p.userId === targetUserId)))
  const isSaving = pendingWrites > 0
  const activeFolderObject = folders.find(folder => folder.id === activeFolder)
  const allPlaylists = folders.flatMap(folder => folder.playlists.map(playlist => ({ folder, playlist })))
  const visiblePlaylists = allPlaylists.filter(({ folder }) => activeFolder === "all" || folder.id === activeFolder)
  const folderForTrack = (id: string) => folders.find(folder => folder.trackIds.includes(id))?.id || "unfiled"
  const visibleTracks = allTracks.filter(track =>
    (activeFolder === "all" || folderForTrack(track.id) === activeFolder) &&
    track.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  const getTrackName = (id: string) => trackMap.get(id)?.name || "Faixa indisponível"

  // Filas independentes por recurso: uma atualização de atalhos não apaga pastas,
  // e várias edições rápidas da mesma playlist são gravadas na ordem correta.
  async function persistFolders(next: SoundFolder[], recovering = false): Promise<boolean> {
    if (!isGm || !loaded) return false
    if (localConflict && !recovering) {
      setError("Resolva ou descarte o backup local antes de editar; seus dados não foram alterados.")
      return false
    }
    foldersRef.current = next
    setFolders(next)
    savePendingPreference(campaignId, "soundFolders", next, revisionsRef.current.soundFolders)
    setPendingWrites(v => v + 1)
    const version = generation.current
    const job = stateQueue.current.then(async () => {
      if (version !== generation.current) return false
      // Ignorar versões intermediárias substituídas enquanto aguardavam a fila.
      if (next !== foldersRef.current) return false
      const revision = await saveConfirmedPreference(preferencesEndpoint, "soundFolders", next, revisionsRef.current.soundFolders)
      revisionsRef.current.soundFolders = revision
      clearPendingPreferenceIfMatches(campaignId, "soundFolders", next)
      return true
    })
    stateQueue.current = job.then(() => undefined, () => undefined)
    try {
      const saved = await job
      if (saved && version === generation.current) setError("")
      return saved
    } catch (err) {
      if (version === generation.current) setError(`${errorMessage(err, "Não foi possível salvar a organização.")} Alterações preservadas neste navegador.`)
      return false
    } finally {
      if (version === generation.current) setPendingWrites(v => Math.max(0, v - 1))
    }
  }

  async function persistHotkeys(next: SoundHotkey[], recovering = false): Promise<boolean> {
    if (!isGm || !loaded) return false
    if (localConflict && !recovering) {
      setError("Resolva ou descarte o backup local antes de editar; seus dados não foram alterados.")
      return false
    }
    hotkeysRef.current = next
    setHotkeys(next)
    savePendingPreference(campaignId, "soundHotkeys", next, revisionsRef.current.soundHotkeys)
    // Atualizar o motor de reprodução de imediato (mesmo se o servidor falhar).
    window.dispatchEvent(new CustomEvent("rpg:sound-hotkeys-updated", { detail: next }))
    setPendingWrites(v => v + 1)
    const version = generation.current
    const job = stateQueue.current.then(async () => {
      if (version !== generation.current) return false
      if (next !== hotkeysRef.current) return false
      const revision = await saveConfirmedPreference(preferencesEndpoint, "soundHotkeys", next, revisionsRef.current.soundHotkeys)
      revisionsRef.current.soundHotkeys = revision
      clearPendingPreferenceIfMatches(campaignId, "soundHotkeys", next)
      return true
    })
    stateQueue.current = job.then(() => undefined, () => undefined)
    try {
      const saved = await job
      if (saved && version === generation.current) setError("")
      return saved
    } catch (err) {
      if (version === generation.current) setError(`${errorMessage(err, "Não foi possível salvar os atalhos.")} Alterações preservadas neste navegador.`)
      return false
    } finally {
      if (version === generation.current) setPendingWrites(v => Math.max(0, v - 1))
    }
  }

  async function retryPendingChanges() {
    // Reconsultar o servidor antes de qualquer recuperação. Abas e deploys
    // diferentes podem ter gravado uma revisão enquanto o painel estava aberto.
    try {
      const response = await fetch(preferencesEndpoint, { cache: "no-store" })
      const remote = await response.json().catch(() => null)
      if (!response.ok || remote?.source !== "mongodb" || remote?.success !== true) {
        throw new Error(remote?.error || "MongoDB indisponível. O backup local foi preservado.")
      }
      const pendingFolders = readPendingFolderRecord(campaignId)
      const pendingHotkeys = readPendingHotkeyRecord(campaignId)
      const revisions = {
        soundFolders: readRevision(remote, "soundFolders"),
        soundHotkeys: readRevision(remote, "soundHotkeys"),
      }
      const pending = [
        { kind: "soundFolders" as const, data: pendingFolders, stored: remote.soundFolders },
        { kind: "soundHotkeys" as const, data: pendingHotkeys, stored: remote.soundHotkeys },
      ].filter(entry => entry.data && !samePreference(entry.kind, entry.stored, entry.data.value))
      if (pending.some(entry => entry.data!.baseRevision !== revisions[entry.kind])) {
        if (!await controllerConfirm("O MongoDB contém uma versão diferente deste backup local. Restaurar o backup SUBSTITUIRÁ as pastas/playlists ou atalhos correspondentes salvos no servidor. Deseja continuar?")) {
          setError("A versão atual do MongoDB foi mantida. Seu backup local não foi apagado.")
          return
        }
      }
      revisionsRef.current = revisions
      setLocalConflict(false)
      if (pendingFolders && !samePreference("soundFolders", remote.soundFolders, pendingFolders.value)) {
        await persistFolders(pendingFolders.value, true)
      } else if (pendingFolders) clearPendingPreferenceIfMatches(campaignId, "soundFolders", pendingFolders.value)
      if (pendingHotkeys && !samePreference("soundHotkeys", remote.soundHotkeys, pendingHotkeys.value)) {
        await persistHotkeys(pendingHotkeys.value, true)
      } else if (pendingHotkeys) clearPendingPreferenceIfMatches(campaignId, "soundHotkeys", pendingHotkeys.value)
      if (!pendingFolders && !pendingHotkeys) setReload(value => value + 1)
    } catch (err) {
      setError(errorMessage(err, "Não foi possível recuperar o backup do Soundpad."))
    }
  }

  async function discardLocalBackup() {
    if (!await controllerConfirm("Descartar definitivamente os backups locais de pastas/playlists e atalhos? O conteúdo atual do MongoDB será mantido.")) return
    const localFolders = readPendingFolderRecord(campaignId)
    const localHotkeys = readPendingHotkeyRecord(campaignId)
    if (localFolders) clearPendingPreferenceIfMatches(campaignId, "soundFolders", localFolders.value)
    if (localHotkeys) clearPendingPreferenceIfMatches(campaignId, "soundHotkeys", localHotkeys.value)
    setLocalConflict(false)
    setError("")
    setReload(value => value + 1)
  }

  async function createFolder() {
    if (localConflict) { setError("Resolva o backup local antes de criar pastas."); return }
    const name = newFolderName.trim()
    if (!name) return
    const id = createId("sound-folder")
    setNewFolderName("")
    setActiveFolder(id)
    await persistFolders([...foldersRef.current, { id, name, trackIds: [], playlists: [] }])
  }

  async function renameFolder(folder: SoundFolder) {
    const name = prompt("Novo nome da pasta:", folder.name)?.trim()
    if (name && name !== folder.name) await persistFolders(foldersRef.current.map(f => f.id === folder.id ? { ...f, name } : f))
  }

  async function deleteFolder(folder: SoundFolder) {
    if (!await controllerConfirm(`Excluir a pasta "${folder.name}" e suas playlists? Os arquivos de áudio permanecerão disponíveis em Sem pasta.`)) return
    setActiveFolder("all")
    await persistFolders(foldersRef.current.filter(f => f.id !== folder.id))
  }

  async function moveTrack(trackId: string, folderId: string) {
    await persistFolders(foldersRef.current.map(folder => ({
      ...folder,
      trackIds: [...folder.trackIds.filter(id => id !== trackId), ...(folder.id === folderId ? [trackId] : [])],
    })))
  }

  async function createPlaylist() {
    if (localConflict) { setError("Resolva o backup local antes de criar playlists."); return }
    if (!activeFolderObject || !newPlaylistName.trim()) return
    const folderId = activeFolderObject.id
    const playlist: SoundPlaylist = { id: createId("sound-playlist"), name: newPlaylistName.trim(), items: [] }
    setNewPlaylistName("")
    setSelectedPlaylistId(playlist.id)
    await persistFolders(foldersRef.current.map(folder => folder.id === folderId
      ? { ...folder, playlists: [...folder.playlists, playlist] } : folder))
  }

  function changePlaylist(folderId: string, playlistId: string, update: (playlist: SoundPlaylist) => SoundPlaylist) {
    void persistFolders(foldersRef.current.map(folder => folder.id !== folderId ? folder : {
      ...folder,
      playlists: folder.playlists.map(playlist => playlist.id === playlistId ? update(playlist) : playlist),
    }))
  }

  async function deletePlaylist(folderId: string, playlist: SoundPlaylist) {
    if (!await controllerConfirm(`Excluir a playlist "${playlist.name}"? Os áudios originais serão preservados.`)) return
    await persistFolders(foldersRef.current.map(folder => folder.id === folderId
      ? { ...folder, playlists: folder.playlists.filter(entry => entry.id !== playlist.id) } : folder))
  }

  function addTrackToPlaylist(folderId: string, playlistId: string, trackId: string) {
    const folder = foldersRef.current.find(item => item.id === folderId)
    const playlistName = folder?.playlists.find(item => item.id === playlistId)?.name
    if (playlistName) setLastPlaylistAdded(previous => ({ ...previous, [trackId]: playlistName }))
    changePlaylist(folderId, playlistId, playlist => ({
      ...playlist, items: [...playlist.items, { id: createId("cue"), trackId, loops: 0 }],
    }))
  }

  function changeCue(folderId: string, playlistId: string, cueId: string, update: (cue: PlaylistItem) => PlaylistItem) {
    changePlaylist(folderId, playlistId, playlist => ({
      ...playlist, items: playlist.items.map(cue => cue.id === cueId ? update(cue) : cue),
    }))
  }

  function moveCue(folderId: string, playlistId: string, fromId: string, toId: string) {
    if (fromId === toId) return
    changePlaylist(folderId, playlistId, playlist => {
      const items = playlist.items.slice()
      const from = items.findIndex(cue => cue.id === fromId)
      const to = items.findIndex(cue => cue.id === toId)
      if (from < 0 || to < 0) return playlist
      const [cue] = items.splice(from, 1)
      items.splice(to, 0, cue)
      return { ...playlist, items }
    })
  }

  function bindHotkey(trackId: string, code: string) {
    // Substituir associação remove a anterior automaticamente: nunca existem duplicações.
    const next = hotkeysRef.current.filter(entry => entry.trackId !== trackId && entry.code !== code)
    if (code) next.push({ trackId, code })
    void persistHotkeys(next)
  }

  async function playPlaylist(playlist: SoundPlaylist) {
    if (!canPlay) return
    const items = playlist.items.flatMap(item => {
      const track = trackMap.get(item.trackId)
      return track ? [{ itemId: item.id, trackId: track.id, url: track.url, loops: item.loops }] : []
    })
    if (!items.length || items.length !== playlist.items.length) {
      setError("Esta playlist possui faixas ausentes. Remova-as ou restaure seus arquivos antes de tocar.")
      return
    }
    setBusyPlaylist(playlist.id)
    setError("")
    try {
      await postJson(soundEndpoint, {
        action: "playlist_start", playlistId: playlist.id,
        playlistName: playlist.name, items, targetUserId,
      })
    } catch (err) { setError(errorMessage(err, "Falha ao iniciar a playlist.")) }
    finally { setBusyPlaylist(null) }
  }

  async function skipPlaylist(id: string, direction: "previous" | "next") {
    try {
      await postJson(soundEndpoint, { action: direction === "next" ? "playlist_next" : "playlist_previous", id })
    } catch (err) { setError(errorMessage(err, "Não foi possível trocar a faixa.")) }
  }

  async function setPaused(sound: ActiveSound) {
    try {
      await postJson(soundEndpoint, { action: sound.paused ? "resume" : "pause", id: sound.id })
    } catch (err) { setError(errorMessage(err, "Não foi possível alterar a reprodução.")) }
  }

  async function addCustomSound() {
    if (!newSoundUrl.trim() || importingMusic) return
    if (musicSource(newSoundUrl.trim())) {
      setImportingMusic(true); setError(""); setImportNotice("")
      try {
        const result = await postJson(`${soundEndpoint}/import`, { url: newSoundUrl.trim() })
        const imported = result.tracks as Track[]
        const ids = new Set(customTracks.map(track => track.id))
        const additions = [...new Map(imported.map(track => [track.id, track])).values()].filter(track => !ids.has(track.id))
        onCustomTracksChange?.([...customTracks, ...additions])
        setImportNotice(`${additions.length} música(s) importada(s).`)
        setNewSoundUrl(""); setNewSoundName("")
      } catch (cause) { setError(errorMessage(cause, "Não foi possível importar.")) }
      finally { setImportingMusic(false) }
      return
    }
    if (!newSoundName.trim()) { setError("Informe o nome do áudio."); return }
    try {
      const url = new URL(newSoundUrl.trim(), window.location.origin)
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("URL inválida.")
    } catch { setError("Informe uma URL HTTP(S) válida para o áudio."); return }
    onCustomTracksChange?.([...customTracks, {
      id: createId("snd_custom"), name: newSoundName.trim(), url: newSoundUrl.trim(),
      loopable: true, isCustom: true,
    }])
    setNewSoundName("")
    setNewSoundUrl("")
  }

  async function removeCustomSound(trackId: string) {
    if (!await controllerConfirm("Remover este áudio da mesa? As entradas das playlists que o utilizam ficarão indisponíveis.")) return
    onCustomTracksChange?.(customTracks.filter(track => track.id !== trackId))
    bindHotkey(trackId, "")
  }


  // O Soundpad está SEMPRE em tela cheia. Fechar a tela não renderiza um segundo modal.
  useEffect(() => { setPortalReady(true) }, [])

  function closeStudio() {
    window.dispatchEvent(new CustomEvent("rpg:soundpad-visibility", {
      detail: { campaignId, open: false },
    }))
    setIsVisible(false)
    onCloseRef.current?.()
  }

  useEffect(() => {
    if (!portalReady || !isVisible) return
    window.dispatchEvent(new CustomEvent("rpg:soundpad-visibility", {
      detail: { campaignId, open: true },
    }))
    return () => {
      window.dispatchEvent(new CustomEvent("rpg:soundpad-visibility", {
        detail: { campaignId, open: false },
      }))
    }
  }, [campaignId, portalReady, isVisible])

  // Se o pai não desmontar o Soundpad, o miniplayer ainda pode reabrir a tela.
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId: string }>).detail
      if (detail?.campaignId === campaignId) setIsVisible(true)
    }
    window.addEventListener("rpg:soundpad-request-open", open)
    return () => window.removeEventListener("rpg:soundpad-request-open", open)
  }, [campaignId])

  // Copia as variáveis de tema da campanha para o portal, que está fora desse escopo.
  useEffect(() => {
    const anchor = themeAnchorRef.current
    const dialog = dialogRef.current
    if (!portalReady || !isVisible || !anchor || !dialog) return
    const syncTheme = () => {
      const computed = window.getComputedStyle(anchor)
      for (let i = 0; i < computed.length; i++) {
        const name = computed.item(i)
        if (name.startsWith("--")) {
          const value = computed.getPropertyValue(name).trim()
          if (value) dialog.style.setProperty(name, value)
        }
      }
      const surface = window.getComputedStyle(dialog)
      dialog.style.setProperty("--soundpad-option-bg", surface.backgroundColor)
      dialog.style.setProperty("--soundpad-option-fg", surface.color)
      const background = surface.backgroundColor
      const values = background.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
      if (background.startsWith("oklch(") && values.length) {
        dialog.style.colorScheme = values[0] > 0.6 ? "light" : "dark"
      } else if (background.startsWith("hsl(") && values.length >= 3) {
        dialog.style.colorScheme = values[2] > 60 ? "light" : "dark"
      } else if (background.startsWith("rgb(") && values.length >= 3) {
        const brightness = values[0] * .2126 + values[1] * .7152 + values[2] * .0722
        dialog.style.colorScheme = brightness > 140 ? "light" : "dark"
      }
    }
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    let element: HTMLElement | null = anchor
    while (element) {
      observer.observe(element, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
      element = element.parentElement
    }
    return () => observer.disconnect()
  }, [portalReady, isVisible])

  useEffect(() => {
    if (!portalReady || !isVisible) return
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement as HTMLElement | null
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeStudio()
        return
      }
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
      )).filter(el => el.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeys, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeys, true)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [portalReady, isVisible])

  const focusedEntry = visiblePlaylists.find(entry => entry.playlist.id === selectedPlaylistId) || visiblePlaylists[0]
  const focusedPlaylist = focusedEntry?.playlist
  const focusedFolder = focusedEntry?.folder
  const focusedPlaying = focusedPlaylist ? activeSounds.find(sound => sound.playlist?.playlistId === focusedPlaylist.id) : undefined
  const featuredSound = activeSounds.find(sound => sound.playlist) || activeSounds.find(sound => sound.loop) || activeSounds[activeSounds.length - 1]
  const featuredName = featuredSound ? getTrackName(featuredSound.trackId) : "Nenhuma faixa em reprodução"
  const featuredSubline = featuredSound?.playlist
    ? `${featuredSound.playlist.playlistName} · ${featuredSound.playlist.index + 1} de ${featuredSound.playlist.total}`
    : featuredSound?.loop ? "Repetição contínua" : featuredSound ? "Reprodução avulsa" : "Escolha uma faixa para começar"
  const selectedFolderName = activeFolderObject?.name || (activeFolder === "unfiled" ? "Sem pasta" : "Sua biblioteca")

  // The whole fullscreen studio is a gamepad layer. Capture every command
  // before CampaignRoom handlers, even if there is no playable track yet.
  // A/B and D-pad are always navigation; the modal's dedicated audio mapping
  // is translated by ControllerProvider only while this portal exists.
  useControllerActions({
    'ui.up': () => controllerFocus('ui.up', dialogRef.current),
    'ui.down': () => controllerFocus('ui.down', dialogRef.current),
    'ui.left': () => controllerFocus('ui.left', dialogRef.current),
    'ui.right': () => controllerFocus('ui.right', dialogRef.current),
    'ui.confirm': () => controllerFocus('ui.confirm', dialogRef.current),
    'ui.back': () => { closeStudio(); return true },
    'ui.settings': () => { closeStudio(); return true },
    'audio.play': () => { if (isGm && featuredSound?.paused) void setPaused(featuredSound); else if (isGm && !featuredSound && focusedPlaylist) void playPlaylist(focusedPlaylist); return true },
    'audio.pause': () => { if (isGm && featuredSound && !featuredSound.paused) void setPaused(featuredSound); return true },
    'audio.toggle': () => { if (isGm && featuredSound) void setPaused(featuredSound); return true },
    'audio.stop': () => { if (isGm && featuredSound) { if (onStopSound) onStopSound(featuredSound.id); else void postJson(soundEndpoint,{action:'stop',id:featuredSound.id}).catch(error => setError(errorMessage(error,'Não foi possível parar o áudio.'))) }; return true },
    'audio.previous': () => { if (isGm && featuredSound?.playlist) void skipPlaylist(featuredSound.id,'previous'); return true },
    'audio.next': () => { if (isGm && featuredSound?.playlist) void skipPlaylist(featuredSound.id,'next'); return true },
  }, { enabled: portalReady && isVisible, priority: 550, captureAll: true })

  useEffect(() => {
    if (!controllerActive || !portalReady || !isVisible) return
    const frame = requestAnimationFrame(() => {
      const modal = dialogRef.current
      const playerControl = modal?.querySelector<HTMLButtonElement>('footer[data-soundpad-transport="toolbar"] button[aria-label="Pausar"]:not(:disabled),footer[data-soundpad-transport="toolbar"] button[aria-label="Retomar"]:not(:disabled)')
      const search = modal?.querySelector<HTMLInputElement>('input[aria-label="Pesquisar sons"]')
      focusControllerElement(playerControl || search)
    })
    return () => cancelAnimationFrame(frame)
  }, [controllerActive, portalReady, isVisible])

  const studio = (
    <div
      ref={dialogRef}
      data-controller-scroll-root="soundpad"
      tabIndex={-1}
      role="dialog"
      aria-modal={true}
      aria-label="Estúdio de áudio da campanha"
      className="rpg-themed-workspace relative isolate flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-background text-foreground outline-none"
    >
      <style>{`
        .rpg-themed-workspace select.soundpad-select {
          background-color: var(--soundpad-option-bg, #20160f) !important;
          color: var(--soundpad-option-fg, #f1e8dc) !important;
          color-scheme: inherit;
        }
        .rpg-themed-workspace select.soundpad-select option {
          background-color: var(--soundpad-option-bg, #20160f);
          color: var(--soundpad-option-fg, #f1e8dc);
        }
      `}</style>
      {/* Atmosfera cromática utiliza os tokens do tema ativo, sem cores hardcoded. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-52 -top-64 size-[620px] rounded-full bg-primary/[0.10] blur-[115px]" />
        <div className="absolute right-[-180px] top-[18%] size-[520px] rounded-full bg-primary/[0.065] blur-[110px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-card/25 via-background/40 to-background" />
      </div>

      {/* TOP BAR · leitura imediata, controles essenciais sempre acessíveis. */}
      <header className="relative z-40 flex shrink-0 flex-wrap items-center gap-3 border-b border-border/50 bg-background/65 px-4 py-3 shadow-[0_6px_40px_rgba(0,0,0,0.10)] backdrop-blur-2xl sm:px-6 lg:gap-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 lg:w-[220px] lg:shrink-0">
          <div className="grid size-10 shrink-0 place-items-center rounded-[14px] border border-primary/35 bg-gradient-to-br from-primary/25 via-primary/10 to-card text-primary shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
            <Disc3 className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[.26em] text-primary/80">RPG · SOUND STUDIO</p>
            <h2 className="truncate text-[15px] font-extrabold tracking-tight text-foreground">Arquivo sonoro</h2>
          </div>
        </div>

        <div className="order-3 flex w-full min-w-[160px] flex-1 items-center gap-2 rounded-full border border-border/70 bg-card/45 px-4 py-2.5 text-muted-foreground transition-all focus-within:border-primary/60 focus-within:bg-card/75 focus-within:ring-2 focus-within:ring-primary/10 sm:order-none">
          <Search className="size-4 shrink-0" />
          <input aria-label="Pesquisar sons" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar sons, músicas e efeitos..."
            className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/65 sm:text-sm" />
          {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="rounded-full p-1 hover:bg-primary/10 hover:text-primary"><X className="size-3.5" /></button>}
          <span className="hidden shrink-0 rounded-md border border-border/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70 md:block">BUSCA</span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          {isGm && (
            <label className="hidden items-center gap-2 rounded-full border border-border/55 bg-card/40 px-3 py-2 text-muted-foreground lg:flex">
              <Radio className="size-4 shrink-0 text-primary" />
              <span className="hidden text-[11px] font-semibold xl:block">Transmitir para</span>
              <select aria-label="Destinatário do áudio" value={targetUserId ?? ""} onChange={event => onTargetUserIdChange?.(event.target.value || null)}
                className="soundpad-select max-w-[155px] cursor-pointer rounded-lg border border-border/60 px-2 py-1 text-xs font-semibold outline-none">
                <option value="">Toda a mesa</option>
                {players.map(player => <option key={player.userId} value={player.userId} disabled={!targetingReady}>{player.name}</option>)}
              </select>
            </label>
          )}
          <span className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary md:inline-flex">
            <span className={`size-1.5 rounded-full ${activeSounds.length ? "animate-pulse bg-primary" : "bg-muted-foreground/50"}`} />
            {activeSounds.length ? `${activeSounds.length} tocando` : "Em espera"}
          </span>
          <button type="button" onClick={() => setMobileInspector(value => !value)} title="Abrir painel de controle"
            aria-label="Abrir painel de controle" aria-expanded={mobileInspector} className="grid size-9 place-items-center rounded-full border border-border/60 bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-primary xl:hidden"><PanelRight className="size-4" /></button>
          <button type="button" onClick={closeStudio} title="Fechar estúdio de áudio"
            aria-label="Fechar estúdio de áudio" className="grid size-9 place-items-center rounded-full border border-border/60 bg-card/50 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary">
            <X className="size-[18px]" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {isGm ? (
          <>
            {/* SIDEBAR · coleção e pastas, visual próximo ao Spotify. */}
            <aside data-controller-scrollport="true" className="z-10 flex max-h-[220px] w-full shrink-0 flex-col gap-4 overflow-y-auto border-b border-border/45 bg-card/20 p-4 backdrop-blur-xl lg:max-h-none lg:w-[255px] lg:border-b-0 lg:border-r lg:p-5">
              <div>
                <div className="mb-3 flex items-center justify-between px-2">
                  <span className="text-[10px] font-black uppercase tracking-[.22em] text-muted-foreground">Sua coleção</span>
                  <Library className="size-4 text-muted-foreground/70" />
                </div>
                <nav aria-label="Biblioteca de sons" className="space-y-1">
                  <button type="button" onClick={() => setActiveFolder("all")} aria-pressed={activeFolder === "all"}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all ${activeFolder === "all" ? "bg-primary/15 text-primary shadow-[inset_3px_0_0_0_currentColor]" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}>
                    <Library className="size-[18px]" /> Todos os sons <span className="ml-auto font-mono text-[10px] opacity-65">{allTracks.length}</span>
                  </button>
                  <button type="button" onClick={() => setActiveFolder("unfiled")} aria-pressed={activeFolder === "unfiled"}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all ${activeFolder === "unfiled" ? "bg-primary/15 text-primary shadow-[inset_3px_0_0_0_currentColor]" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}>
                    <Music className="size-[18px]" /> Sem pasta
                  </button>
                </nav>
              </div>

              <div className="min-h-0 flex-1">
                <div className="mb-2 flex items-center justify-between px-2">
                  <span className="text-[10px] font-black uppercase tracking-[.22em] text-muted-foreground">Pastas</span>
                  <span className="font-mono text-[10px] text-muted-foreground/70">{folders.length}</span>
                </div>
                <nav aria-label="Pastas de sons" className="space-y-1">
                  {folders.map(folder => (
                    <button type="button" key={folder.id} onClick={() => setActiveFolder(folder.id)} aria-pressed={activeFolder === folder.id}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-medium transition-all ${activeFolder === folder.id ? "bg-primary/15 text-primary shadow-[inset_3px_0_0_0_currentColor]" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}>
                      {activeFolder === folder.id ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <span className="font-mono text-[10px] opacity-60">{folder.playlists.length}</span>
                    </button>
                  ))}
                  {!folders.length && <p className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground/75">Crie uma pasta para organizar playlists por cena.</p>}
                </nav>
              </div>

              <div className="space-y-2 border-t border-border/45 pt-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nova pasta</label>
                <div className="flex items-center gap-2">
                  <input aria-label="Nome da nova pasta" value={newFolderName} onChange={event => setNewFolderName(event.target.value)} maxLength={100}
                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void createFolder() } }}
                    placeholder="Ex: Sessão 04" className={`${inputClass} !py-2 !text-xs`} />
                  <button type="button" title="Criar pasta" aria-label="Criar pasta" disabled={!loaded || !newFolderName.trim()} onClick={() => void createFolder()}
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all hover:brightness-110 disabled:opacity-40"><Plus className="size-4" /></button>
                </div>
                {activeFolderObject && <div className="flex items-center gap-4 pt-1">
                  <button type="button" onClick={() => void renameFolder(activeFolderObject)} className="text-[11px] text-muted-foreground hover:text-primary">Renomear</button>
                  <button type="button" onClick={() => void deleteFolder(activeFolderObject)} className="text-[11px] text-muted-foreground hover:text-destructive">Excluir pasta</button>
                </div>}
                <div className="mt-3 hidden items-center gap-2 rounded-xl border border-border/45 bg-background/35 px-3 py-2 text-[11px] text-muted-foreground lg:flex">
                  <Keyboard className="size-4 shrink-0 text-primary/70" /><span>Atalhos ativos com o painel fechado</span>
                </div>
              </div>
            </aside>

            {/* MAIN · hero, capas de playlists, tabela de faixas. */}
            <main data-controller-scrollport="true" className="soundpad-scroll min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
              {targetUserId && !players.some(player => player.userId === targetUserId) && <p className="mb-4 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">O destinatário selecionado não participa mais da mesa.</p>}
              <div className="mb-4 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
                <div className="flex min-w-0 items-center gap-1.5"><span className="truncate">Biblioteca</span><ChevronRight className="size-3" /><span className="truncate font-semibold text-foreground">{selectedFolderName}</span></div>
                <span className="hidden text-[10px] uppercase tracking-[.18em] text-primary/85 sm:block">ÁUDIO · EXPERIÊNCIA IMERSIVA</span>
              </div>

              <section className="relative isolate overflow-hidden rounded-[28px] border border-primary/25 bg-card/55 shadow-[0_20px_70px_rgba(0,0,0,.16)] backdrop-blur-2xl">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/25 via-primary/[0.07] to-background/30" />
                <div className="pointer-events-none absolute -right-24 -top-44 size-[450px] rounded-full border-[55px] border-primary/[0.075]" />
                <div className="pointer-events-none absolute -right-14 top-10 size-[300px] rounded-full border-[45px] border-primary/[0.09]" />
                <div className="flex flex-col items-start gap-5 p-5 sm:p-7 2xl:flex-row 2xl:items-center 2xl:gap-8">
                  <div className="relative grid size-32 shrink-0 place-items-center overflow-hidden rounded-[23px] border border-primary/30 bg-gradient-to-br from-primary/40 via-primary/15 to-card shadow-[0_18px_40px_rgba(0,0,0,.28)] sm:size-40">
                    <div className="absolute left-[-22%] top-[-22%] size-[80%] rounded-full bg-primary/30 blur-3xl" />
                    <div className="absolute grid size-[74%] place-items-center rounded-full border-[11px] border-foreground/10 bg-background/65 shadow-xl">
                      <div className="absolute inset-2 rounded-full border border-foreground/10" />
                      <div className="absolute inset-[24%] rounded-full border border-primary/30" />
                      <div className="grid size-7 place-items-center rounded-full border border-primary/50 bg-primary text-primary-foreground"><Music2 className="size-3.5" /></div>
                    </div>
                    <span className="absolute bottom-2 left-2 rounded-md border border-primary/20 bg-background/70 px-2 py-1 font-mono text-[9px] font-bold tracking-[.2em] text-primary backdrop-blur-lg">RPG</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.25em] text-primary"><Sparkles className="size-3.5" /> Biblioteca sonora</div>
                    <h1 className="max-w-[750px] break-words text-3xl font-black tracking-[-.045em] text-foreground sm:text-4xl 2xl:text-5xl">{selectedFolderName}</h1>
                    <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Transforme cada momento da campanha em uma cena inesquecível. Suas trilhas, efeitos e playlists em um só lugar.</p>
                    <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full border border-border/50 bg-background/35 px-3 py-1.5 text-foreground/80 backdrop-blur-md"><strong className="text-primary">{visiblePlaylists.length}</strong> playlists</span>
                      <span className="rounded-full border border-border/50 bg-background/35 px-3 py-1.5 text-foreground/80 backdrop-blur-md"><strong className="text-primary">{visibleTracks.length}</strong> faixas</span>
                      {activeSounds.length > 0 && <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 font-bold text-primary"><Activity className="size-3.5" /> Mesa em reprodução</span>}
                    </div>
                  </div>
                </div>
              </section>

              {isGm && <label className="mt-5 flex items-center gap-2 rounded-xl border border-border/45 bg-card/40 px-3 py-2.5 text-[11px] text-muted-foreground backdrop-blur-xl lg:hidden">
                <Radio className="size-4 text-primary" /> Enviar para
                <select aria-label="Destinatário do áudio (mobile)" value={targetUserId ?? ""} onChange={event => onTargetUserIdChange?.(event.target.value || null)} className="soundpad-select min-w-0 flex-1 rounded-lg border border-border/60 px-2 py-1 text-right font-semibold outline-none">
                  <option value="">Todos na mesa</option>
                  {players.map(player => <option key={player.userId} value={player.userId} disabled={!targetingReady}>{player.name}</option>)}
                </select>
              </label>}

              <section className="mt-8">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary/80">Suas coleções</p><h3 className="mt-1 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">Playlists</h3></div>
                  <span className="text-[11px] text-muted-foreground">Selecione uma coleção para organizar a fila</span>
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border/45 bg-card/35 p-2.5 backdrop-blur-xl sm:p-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Plus className="size-5" /></div>
                  <input aria-label="Nome da playlist" value={newPlaylistName} onChange={event => setNewPlaylistName(event.target.value)} maxLength={100}
                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void createPlaylist() } }}
                    placeholder={activeFolderObject ? `Nova playlist em ${activeFolderObject.name}...` : "Selecione uma pasta à esquerda para criar uma playlist"}
                    disabled={!activeFolderObject || !loaded}
                    className="min-w-36 flex-1 bg-transparent px-2 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/75 disabled:opacity-55 sm:text-sm" />
                  <button type="button" className={buttonClass} disabled={!activeFolderObject || !loaded || !newPlaylistName.trim()} onClick={() => void createPlaylist()}><Plus className="size-4" /> Criar</button>
                </div>
                {loaded && visiblePlaylists.length === 0 ? (
                  <div className="grid min-h-32 place-items-center rounded-3xl border border-dashed border-border/65 bg-card/20 p-6 text-center backdrop-blur-md">
                    <div><ListMusic className="mx-auto mb-2 size-7 text-primary/50" /><p className="text-sm font-semibold">Nenhuma playlist por aqui</p><p className="mt-1 text-xs text-muted-foreground">Selecione uma pasta e crie sua primeira sequência de áudio.</p></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {visiblePlaylists.map(({ folder, playlist }, index) => {
                      const playing = activeSounds.find(sound => sound.playlist?.playlistId === playlist.id)
                      const selected = focusedEntry?.playlist.id === playlist.id
                      return <div key={playlist.id} className={`group relative flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-primary/50 bg-primary/[0.10]" : "border-border/50 bg-card/45 hover:border-primary/35 hover:bg-card/70"}`}>
                        <button type="button" aria-label={`Selecionar playlist ${playlist.name}`} aria-pressed={selected} onClick={() => setSelectedPlaylistId(playlist.id)} className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />
                        <div className="relative pointer-events-none grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/35 via-card to-background">
                          <div className="absolute -right-4 -top-4 size-14 rounded-full border-[9px] border-primary/15" />
                          <Disc3 className="size-7 text-primary" />
                          <span className="absolute bottom-1 right-1 font-mono text-[9px] text-primary/70">0{(index % 9) + 1}</span>
                        </div>
                        <div className="pointer-events-none relative min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">{playlist.name}</p>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">{folder.name} · {playlist.items.length} faixas</p>
                          {playing && <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-primary"><Activity className="size-3" /> Reproduzindo</p>}
                        </div>
                        <button type="button" title={`Tocar ${playlist.name}`} aria-label={`Tocar playlist ${playlist.name}`} disabled={!canPlay || !playlist.items.length || busyPlaylist === playlist.id} onClick={() => void playPlaylist(playlist)}
                          className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110 disabled:opacity-40"><Play className="ml-0.5 size-4 fill-current" /></button>
                      </div>
                    })}
                  </div>
                )}
              </section>

              {focusedPlaylist && focusedFolder && (
                <section className="mt-9 overflow-hidden rounded-[24px] border border-border/50 bg-card/40 shadow-[0_16px_50px_rgba(0,0,0,.10)] backdrop-blur-xl">
                  <div className="relative overflow-hidden border-b border-border/45 bg-gradient-to-r from-primary/[0.13] via-primary/[0.04] to-transparent p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="grid size-[66px] shrink-0 place-items-center rounded-[17px] border border-primary/35 bg-primary/15 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"><ListMusic className="size-8 text-primary" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-[.18em] text-primary/90">Playlist selecionada / {focusedFolder.name}</p>
                        <h3 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{focusedPlaylist.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{focusedPlaylist.items.length} faixas · loops personalizados · ordem de execução</p>
                      </div>
                      <button type="button" className={primaryClass} disabled={!canPlay || !focusedPlaylist.items.length || busyPlaylist === focusedPlaylist.id} onClick={() => void playPlaylist(focusedPlaylist)}><Play className="size-4 fill-current" /> Reproduzir</button>
                      <button type="button" title="Renomear playlist" aria-label={`Renomear playlist ${focusedPlaylist.name}`} className="grid size-9 place-items-center rounded-full border border-border/50 bg-background/45 text-muted-foreground hover:border-primary/40 hover:text-primary" onClick={() => {
                        const name = prompt("Nome da playlist:", focusedPlaylist.name)?.trim()
                        if (name) changePlaylist(focusedFolder.id, focusedPlaylist.id, playlist => ({ ...playlist, name }))
                      }}><MoreHorizontal className="size-5" /></button>
                      <button type="button" title="Excluir playlist" aria-label={`Excluir playlist ${focusedPlaylist.name}`} onClick={() => void deletePlaylist(focusedFolder.id, focusedPlaylist)} className="grid size-9 place-items-center rounded-full border border-border/50 bg-background/45 text-muted-foreground hover:border-destructive/50 hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                    {focusedPlaying && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-primary/15 pt-4">
                      <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><Activity className="size-3.5" /> Faixa {(focusedPlaying.playlist?.index ?? 0) + 1}/{focusedPlaylist.items.length} · repetição {(focusedPlaying.playlist?.iteration ?? 0) + 1}</span>
                      <button type="button" className={buttonClass} onClick={() => void skipPlaylist(focusedPlaying.id, "previous")}><SkipBack className="size-3.5" /> Anterior</button>
                      <button type="button" className={buttonClass} onClick={() => void setPaused(focusedPlaying)}>{focusedPlaying.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}{focusedPlaying.paused ? "Retomar" : "Pausar"}</button>
                      <button type="button" className={buttonClass} onClick={() => void skipPlaylist(focusedPlaying.id, "next")}>Próxima <SkipForward className="size-3.5" /></button>
                      <button type="button" className={buttonClass} onClick={() => onStopSound?.(focusedPlaying.id)}><Square className="size-3.5" /> Parar</button>
                    </div>}
                  </div>
                  {focusedPlaylist.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <div className="min-w-[610px]">
                        <div className="grid grid-cols-[32px_minmax(170px,1fr)_118px_80px_116px] items-center gap-2 border-b border-border/35 px-4 py-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground sm:px-6">
                          <span className="text-center">#</span><span>Faixa</span><span>Loops por faixa</span><span>Execuções</span><span className="text-right">Ordem / Ações</span>
                        </div>
                        {focusedPlaylist.items.map((cue, index) => {
                          const track = trackMap.get(cue.trackId)
                          const activeCue = focusedPlaying?.playlist?.index === index
                          return <div key={cue.id} draggable
                            onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", cue.id) }}
                            onDragOver={event => event.preventDefault()}
                            onDrop={event => { event.preventDefault(); moveCue(focusedFolder.id, focusedPlaylist.id, event.dataTransfer.getData("text/plain"), cue.id) }}
                            className={`group grid grid-cols-[32px_minmax(170px,1fr)_118px_80px_116px] items-center gap-2 border-b border-border/20 px-4 py-2.5 transition-colors last:border-0 hover:bg-primary/[0.05] sm:px-6 ${activeCue ? "bg-primary/[0.10]" : ""}`}>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground"><GripVertical className="size-3.5 cursor-grab opacity-50 group-hover:opacity-100" />{activeCue ? <Activity className="size-3.5 text-primary" /> : index + 1}</span>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/15 bg-gradient-to-br from-primary/20 to-card text-primary"><Music2 className="size-4" /></div>
                              <div className="min-w-0"><p className={`truncate text-xs font-semibold ${activeCue ? "text-primary" : "text-foreground"}`}>{track?.name || "Arquivo removido"}</p><p className="text-[10px] text-muted-foreground">{track?.isCustom ? "Áudio personalizado" : "Biblioteca"}</p></div>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="0 = uma vez; 1 = duas vezes; 2 = três vezes...">
                              <Repeat className="size-3.5 shrink-0 text-primary/70" />
                              <input aria-label={`Quantidade de loops de ${track?.name || "faixa"}`} type="number" min={0} max={99} step={1} value={cue.loops}
                                onChange={event => changeCue(focusedFolder.id, focusedPlaylist.id, cue.id, old => ({ ...old, loops: Math.min(99, Math.max(0, Math.trunc(Number(event.target.value) || 0))) }))}
                                className="w-14 rounded-lg border border-border/60 bg-background/55 px-2 py-1.5 text-center font-mono text-xs text-foreground outline-none focus:border-primary/60" />
                            </label>
                            <span className="font-mono text-xs text-muted-foreground">{cue.loops + 1}<span className="ml-0.5 text-[10px]">vez(es)</span></span>
                            <div className="flex justify-end gap-1">
                              <button type="button" title="Mover faixa para cima" aria-label="Mover faixa para cima" disabled={index === 0} onClick={() => moveCue(focusedFolder.id, focusedPlaylist.id, cue.id, focusedPlaylist.items[index - 1].id)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-25"><ArrowUp className="size-3.5" /></button>
                              <button type="button" title="Mover faixa para baixo" aria-label="Mover faixa para baixo" disabled={index === focusedPlaylist.items.length - 1} onClick={() => moveCue(focusedFolder.id, focusedPlaylist.id, cue.id, focusedPlaylist.items[index + 1].id)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-25"><ArrowDown className="size-3.5" /></button>
                              <button type="button" title="Remover faixa" aria-label="Remover faixa da playlist" onClick={() => changePlaylist(focusedFolder.id, focusedPlaylist.id, playlist => ({ ...playlist, items: playlist.items.filter(item => item.id !== cue.id) }))} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button>
                            </div>
                          </div>
                        })}
                      </div>
                    </div>
                  ) : <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground"><ListMusic className="size-7 text-primary/45" />Sua playlist está vazia. Adicione faixas na biblioteca abaixo.</div>}
                  <p className="border-t border-border/35 px-4 py-3 text-[11px] text-muted-foreground sm:px-6">Arraste para reordenar ou use as setas. As mudanças feitas enquanto toca valem na próxima execução.</p>
                </section>
              )}

              <section className="mt-9">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary/80">Acervo da mesa</p><h3 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Faixas da biblioteca</h3></div>
                  <span className="flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-md"><List className="size-3.5" /> {visibleTracks.length} faixas</span>
                </div>
                <div className="overflow-hidden rounded-[22px] border border-border/55 bg-card/35 shadow-[0_14px_55px_rgba(0,0,0,.09)] backdrop-blur-xl">
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-[minmax(180px,1.3fr)_minmax(112px,.75fr)_minmax(150px,1fr)_minmax(130px,.8fr)_114px] items-center gap-3 border-b border-border/45 px-4 py-3.5 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground sm:px-5">
                        <span>Título</span><span>Pasta</span><span>Adicionar à playlist</span><span>Atalho</span><span className="text-right">Reprodução</span>
                      </div>
                      {visibleTracks.map((track, index) => {
                        const activeInstances = activeSounds.filter(sound => sound.trackId === track.id && (sound.targetUserId ?? null) === targetUserId)
                        const playing = activeInstances.length > 0
                        return <div key={track.id} data-active={playing} className={`group grid grid-cols-[minmax(180px,1.3fr)_minmax(112px,.75fr)_minmax(150px,1fr)_minmax(130px,.8fr)_114px] items-center gap-3 border-b border-border/25 px-4 py-2.5 transition-colors last:border-0 hover:bg-primary/[.055] sm:px-5 ${playing ? "bg-primary/[.08]" : ""}`}>
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground/70">{playing ? <Activity className="size-3.5 text-primary" /> : index + 1}</span>
                            <div className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-primary/15 bg-gradient-to-br from-primary/25 via-card to-background text-primary shadow-sm">{track.isCustom ? <Link2 className="size-[18px]" /> : <Disc3 className="size-[18px]" />}</div>
                            <div className="min-w-0"><p className={`truncate text-xs font-semibold ${playing ? "text-primary" : "text-foreground"}`} title={track.name}>{track.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{track.isCustom ? "Personalizado" : "Biblioteca base"}</p></div>
                          </div>
                          <select aria-label={`Mover ${track.name} para pasta`} disabled={!loaded} value={folderForTrack(track.id)} onChange={event => void moveTrack(track.id, event.target.value)} className="soundpad-select min-w-0 max-w-full cursor-pointer rounded-lg border border-border/50 px-2 py-2 text-[11px] outline-none focus:border-primary/50">
                            <option value="unfiled">Sem pasta</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                          </select>
                          <select aria-label={`Adicionar ${track.name} à playlist`} defaultValue="" onChange={event => {
                            const [folderId, playlistId] = event.target.value.split("::")
                            if (folderId && playlistId) addTrackToPlaylist(folderId, playlistId, track.id)
                            event.target.value = ""
                          }} className="soundpad-select min-w-0 max-w-full cursor-pointer rounded-lg border border-border/50 px-2 py-2 text-[11px] outline-none focus:border-primary/50">
                            <option value="">{lastPlaylistAdded[track.id] ? `✓ Adicionado: ${lastPlaylistAdded[track.id]}` : "+ Adicionar..."}</option>{allPlaylists.map(({ folder, playlist }) => <option key={playlist.id} value={`${folder.id}::${playlist.id}`}>{folder.name} / {playlist.name}</option>)}
                          </select>
                          <select aria-label={`Atalho de ${track.name}`} disabled={!loaded} value={hotkeys.find(hotkey => hotkey.trackId === track.id)?.code || ""} onChange={event => bindHotkey(track.id, event.target.value)} className="soundpad-select min-w-0 max-w-full cursor-pointer rounded-lg border border-border/50 px-2 py-2 text-[11px] outline-none focus:border-primary/50">
                            <option value="">Sem atalho</option>{SHORTCUT_CODES.map(shortcut => <option key={shortcut.code} value={shortcut.code}>{shortcut.label}{hotkeys.some(hotkey => hotkey.code === shortcut.code && hotkey.trackId !== track.id) ? " (substituir)" : ""}</option>)}
                          </select>
                          <div className="flex justify-end gap-1">
                            <button type="button" title="Tocar uma vez" aria-label={`Tocar ${track.name} uma vez`} disabled={!canPlay} onClick={() => onPlaySound?.(track, false, targetUserId)} className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-110 disabled:opacity-35"><Play className="ml-0.5 size-3.5 fill-current" /></button>
                            {track.loopable && <button type="button" title="Loop infinito" aria-label={`Alternar loop de ${track.name}`} disabled={!canPlay && !activeInstances.some(sound => sound.loop)} onClick={() => { const loopSound = activeInstances.find(sound => sound.loop); if (loopSound) onStopSound?.(loopSound.id); else onPlaySound?.(track, true, targetUserId) }} className={`grid size-8 shrink-0 place-items-center rounded-full border transition-colors ${activeInstances.some(sound => sound.loop) ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary"}`}><Repeat className="size-3.5" /></button>}
                            {track.isCustom && <button type="button" title="Excluir som" aria-label={`Excluir ${track.name}`} onClick={() => removeCustomSound(track.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>}
                          </div>
                        </div>
                      })}
                      {loaded && visibleTracks.length === 0 && <div className="px-5 py-9 text-center text-sm text-muted-foreground">Nenhum som encontrado nesta pasta.</div>}
                    </div>
                  </div>
                </div>
              </section>
            </main>
          </>
        ) : (
          <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="pointer-events-none absolute size-[300px] rounded-full bg-primary/10 blur-[95px]" />
            <div className="relative grid size-24 place-items-center rounded-[26px] border border-primary/30 bg-primary/10 text-primary shadow-xl backdrop-blur-xl"><Headphones className="size-11" /></div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[.25em] text-primary">Som ambiente conectado</p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Você está na frequência da mesa.</h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">O mestre controla as trilhas e os efeitos. Você recebe o áudio sem precisar manter este painel aberto.</p>
            {featuredSound && <div className="mt-8 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-primary/25 bg-card/60 p-4 text-left backdrop-blur-xl"><Activity className="size-5 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{featuredName}</p><p className="truncate text-xs text-muted-foreground">{featuredSubline}</p></div></div>}
          </main>
        )}

        {/* Painel do inspetor; em telas pequenas aparece como drawer sobre a biblioteca. */}
        {mobileInspector && <button type="button" aria-label="Fechar painel de controle" className="absolute inset-0 z-20 bg-background/60 backdrop-blur-sm xl:hidden" onClick={() => setMobileInspector(false)} />}
        <aside data-controller-scrollport="true" className={`${mobileInspector ? "absolute inset-y-0 right-0 z-30 flex w-[min(92vw,360px)]" : "hidden"} min-h-0 shrink-0 flex-col overflow-y-auto border-l border-border/50 bg-card/55 p-5 shadow-[-12px_0_60px_rgba(0,0,0,.12)] backdrop-blur-2xl xl:relative xl:z-10 xl:flex xl:w-[320px] 2xl:w-[352px]`}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary/75">Monitor de áudio</p><h3 className="mt-1 text-[17px] font-extrabold">Tocando agora</h3></div>
            <div className="flex items-center gap-2">
              <Activity className="size-[18px] text-primary/75" />
              {mobileInspector && <button type="button" aria-label="Fechar inspetor" onClick={() => setMobileInspector(false)} className="grid size-8 place-items-center rounded-full border border-border/50 xl:hidden"><X className="size-4" /></button>}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[21px] border border-primary/25 bg-background/45 p-3 shadow-[0_15px_45px_rgba(0,0,0,.12)]">
            <div className="relative grid aspect-[1.3/1] place-items-center overflow-hidden rounded-[15px] bg-gradient-to-br from-primary/35 via-primary/[0.09] to-card">
              <div className="absolute -right-16 -top-16 size-64 rounded-full border-[38px] border-primary/10" />
              <div className="absolute -bottom-14 -left-14 size-52 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative grid size-[105px] place-items-center rounded-full border-[13px] border-foreground/10 bg-background/75 shadow-2xl"><div className="absolute inset-3 rounded-full border border-primary/25" /><div className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Music2 className="size-4" /></div></div>
              {featuredSound && <span className="absolute bottom-3 left-3 rounded-full border border-primary/25 bg-background/60 px-3 py-1 text-[10px] font-bold text-primary backdrop-blur-lg">{featuredSound.paused ? "PAUSADO" : "ON AIR"}</span>}
            </div>
            <div className="min-w-0 px-1 pb-2 pt-4"><p className="truncate text-base font-extrabold" title={featuredName}>{featuredName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{featuredSubline}</p></div>
            {isGm && featuredSound && <div className="flex items-center justify-center gap-5 border-t border-border/40 pt-3">
              {featuredSound.playlist && <button type="button" aria-label="Anterior" title="Anterior" onClick={() => void skipPlaylist(featuredSound.id, "previous")} className="text-muted-foreground hover:text-primary"><SkipBack className="size-[18px]" /></button>}
              <button type="button" aria-label={featuredSound.paused ? "Retomar" : "Pausar"} title={featuredSound.paused ? "Retomar" : "Pausar"} onClick={() => void setPaused(featuredSound)} className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105">{featuredSound.paused ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}</button>
              <button type="button" aria-label="Parar" title="Parar" onClick={() => onStopSound?.(featuredSound.id)} className="text-muted-foreground hover:text-destructive"><Square className="size-4" /></button>
              {featuredSound.playlist && <button type="button" aria-label="Próxima" title="Próxima" onClick={() => void skipPlaylist(featuredSound.id, "next")} className="text-muted-foreground hover:text-primary"><SkipForward className="size-[18px]" /></button>}
            </div>}
          </div>
          {isGm && <>
            <div className="mt-5 flex items-center justify-between"><span className="text-xs font-bold">Fila ativa</span>{activeSounds.length > 0 && <button type="button" onClick={onStopAll} className="text-[11px] font-semibold text-destructive hover:underline">Parar todos</button>}</div>
            <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {activeSounds.length === 0 ? <p className="rounded-xl border border-dashed border-border/60 bg-background/25 px-3 py-5 text-center text-xs text-muted-foreground">Silêncio na sala...</p> : activeSounds.map(sound => (
                <div key={sound.id} className="flex items-center gap-2 rounded-xl border border-border/35 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/25">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Activity className="size-3.5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{getTrackName(sound.trackId)}</p><p className="truncate text-[10px] text-muted-foreground">{sound.playlist ? sound.playlist.playlistName : sound.loop ? "Loop contínuo" : "Avulso"} · {sound.targetUserId == null ? "Todos" : "Individual"}</p></div>
                  <button type="button" aria-label={`Parar ${getTrackName(sound.trackId)}`} title="Parar áudio" onClick={() => onStopSound?.(sound.id)} className="text-muted-foreground hover:text-destructive"><Square className="size-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-border/45 pt-5">
              <div className="mb-3 flex items-center gap-2"><Plus className="size-4 text-primary" /><h4 className="text-xs font-extrabold">Adicionar áudio</h4></div>
              <div className="space-y-2.5">
                <input aria-label="Nome do novo áudio" value={newSoundName} onChange={event => setNewSoundName(event.target.value)} placeholder="Nome do áudio" className={inputClass} />
                <input aria-label="URL do novo áudio" value={newSoundUrl} onChange={event => setNewSoundUrl(event.target.value)} placeholder="Link do YouTube, Spotify ou MP3" className={inputClass} />
                <button type="button" onClick={() => void addCustomSound()} disabled={importingMusic || !newSoundUrl.trim()} className={`${buttonClass} w-full`}><Save className="size-4" /> {importingMusic ? "Importando..." : musicSource(newSoundUrl.trim()) ? "Importar automaticamente" : "Salvar áudio"}</button>
                {importNotice && <p role="status" className="text-xs text-primary">{importNotice}</p>}
                <p className="text-[11px] text-muted-foreground">YouTube e Spotify usam os players oficiais. O Spotify pode solicitar login e limitar a reprodução conforme a conta.</p>
              </div>
            </div>
          </>}
          <div className="mt-6 border-t border-border/45 pt-5">
            <div className="mb-4 flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /><h4 className="text-xs font-extrabold">Mixer da mesa</h4></div>
            <div className="space-y-5">
              <label className="block space-y-2 text-[11px] text-muted-foreground"><span className="flex items-center justify-between"><span className="font-semibold text-foreground">Músicas / playlists</span><span className="font-mono text-primary">{Math.round(musicVolume * 100)}%</span></span>
                <input aria-label="Volume das músicas" type="range" min={0} max={1} step={0.01} value={musicVolume} onChange={event => onMusicVolumeChange?.(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-primary" />
              </label>
              <label className="block space-y-2 text-[11px] text-muted-foreground"><span className="flex items-center justify-between"><span className="font-semibold text-foreground">Efeitos sonoros</span><span className="font-mono text-primary">{Math.round(effectsVolume * 100)}%</span></span>
                <input aria-label="Volume dos efeitos" type="range" min={0} max={1} step={0.01} value={effectsVolume} onChange={event => onEffectsVolumeChange?.(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-primary" />
              </label>
            </div>
            <p className="mt-5 flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground/80"><Keyboard className="mt-0.5 size-3.5 shrink-0" /> Atalhos de teclado exclusivos do mestre. Configure-os em cada faixa da biblioteca.</p>
          </div>
        </aside>
      </div>

      {/* PLAYER DO ESTÚDIO: fixa os controles sem recriar elementos de áudio. */}
      <footer data-soundpad-transport="toolbar" className="relative z-40 flex min-h-[78px] shrink-0 items-center gap-3 border-t border-border/50 bg-card/65 px-3 py-3 shadow-[0_-14px_50px_rgba(0,0,0,.16)] backdrop-blur-2xl sm:gap-5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:max-w-[34%]">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-gradient-to-br from-primary/35 via-primary/10 to-background text-primary shadow-sm sm:size-12"><Disc3 className="size-6" /></div>
          <div className="min-w-0"><p className="truncate text-xs font-bold sm:text-sm" title={featuredName}>{featuredName}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">{featuredSubline}</p></div>
        </div>
        {isGm ? (
          <div className="flex shrink-0 flex-col items-center justify-center gap-2 sm:flex-1">
            <div className="flex items-center gap-3 sm:gap-5">
              <button type="button" aria-label="Faixa anterior" title="Faixa anterior" disabled={!featuredSound?.playlist} onClick={() => featuredSound && void skipPlaylist(featuredSound.id, "previous")} className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-25"><SkipBack className="size-[18px]" /></button>
              <button type="button" aria-label={featuredSound?.paused ? "Retomar" : "Pausar"} title={featuredSound?.paused ? "Retomar" : "Pausar"} disabled={!featuredSound} onClick={() => featuredSound && void setPaused(featuredSound)} className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 disabled:opacity-30">{featuredSound?.paused ? <Play className="size-[18px] fill-current" /> : <Pause className="size-[18px] fill-current" />}</button>
              <button type="button" aria-label="Próxima faixa" title="Próxima faixa" disabled={!featuredSound?.playlist} onClick={() => featuredSound && void skipPlaylist(featuredSound.id, "next")} className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-25"><SkipForward className="size-[18px]" /></button>
              <button type="button" aria-label="Parar reprodução" title="Parar reprodução" disabled={!featuredSound} onClick={() => featuredSound && onStopSound?.(featuredSound.id)} className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-25"><Square className="size-[15px]" /></button>
            </div>
            <div className="hidden w-full max-w-[380px] items-center justify-center gap-2 text-[10px] text-muted-foreground sm:flex"><Activity className={`size-3.5 text-primary ${featuredSound && !featuredSound.paused ? "animate-pulse" : "opacity-40"}`} /><span>{featuredSound ? (featuredSound.paused ? "Pausado" : "Em reprodução") : "Aguardando reprodução"}</span>{featuredSound?.playlist && <span className="font-mono text-primary">· Faixa {featuredSound.playlist.index + 1}/{featuredSound.playlist.total}</span>}</div>
          </div>
        ) : <div className="flex items-center gap-2 text-xs text-primary"><Activity className="size-4" /> Recebendo áudio da mesa</div>}
        <div className="ml-auto hidden flex-1 items-center justify-end gap-3 text-muted-foreground lg:flex">
          <Volume2 className="size-4 shrink-0" /><input aria-label="Volume das músicas na barra" type="range" min={0} max={1} step={0.01} value={musicVolume} onChange={event => onMusicVolumeChange?.(Number(event.target.value))} className="w-24 cursor-pointer accent-primary xl:w-28" />
          <span className="w-9 text-right font-mono text-[10px] text-primary">{Math.round(musicVolume * 100)}%</span>
          <span className="ml-3 flex items-center gap-1.5 rounded-full border border-border/50 bg-background/35 px-3 py-1.5 text-[10px] text-muted-foreground"><Radio className="size-3.5 text-primary" /> {targetUserId ? "Individual" : "Mesa"}</span>
        </div>
      </footer>
      {controllerActive && isGm && <div className="pointer-events-none absolute bottom-[88px] left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 flex-wrap justify-center gap-2 rounded-lg border border-primary/30 bg-background/95 px-3 py-1.5 text-center text-[11px] font-semibold text-primary shadow-lg" aria-label="Comandos do controle no Soundpad">
        {Object.entries(controllerSettings.soundpadBindings).filter(([,action]) => action && action in SOUND_ACTION_LABELS).slice(0,6).map(([button,action]) => <span key={button} className="inline-flex items-center gap-1 whitespace-nowrap"><ControllerGlyph button={button as import('@/lib/input/actions').GamepadButtonName | `LT+${import('@/lib/input/actions').GamepadButtonName}`} small />{SOUND_ACTION_LABELS[action as keyof typeof SOUND_ACTION_LABELS]}</span>)}
        <span>A Selecionar · B Fechar</span>
      </div>}
      {(isSaving || error || !loaded) && isGm && (
        <div className="pointer-events-none absolute bottom-[87px] left-1/2 z-50 w-[min(90vw,500px)] -translate-x-1/2 rounded-xl border border-border/60 bg-background/90 px-4 py-3 text-center text-xs text-foreground shadow-2xl backdrop-blur-xl">
          {!loaded && !error ? "Carregando biblioteca..." : isSaving ? "Salvando alterações..." : <span role="alert" className="pointer-events-auto text-destructive">{error} <button type="button" className="ml-2 underline" onClick={() => void retryPendingChanges()}>{loaded ? (localConflict ? "Resolver backup" : "Tentar salvar novamente") : "Recarregar"}</button>{localConflict && <button type="button" className="ml-2 underline" onClick={discardLocalBackup}>Descartar backup</button>}</span>}
        </div>
      )}
    </div>
  )

  return <>
    <span ref={themeAnchorRef} className="hidden" aria-hidden="true" />
    {isVisible && portalReady ? createPortal(
      <div
        data-soundpad-fullscreen
        className="pointer-events-auto fixed inset-0 isolate h-[100dvh] w-screen overflow-hidden"
        style={{ zIndex: 15000 }}
      >
        {studio}
      </div>,
      document.body,
    ) : null}
  </>
}
