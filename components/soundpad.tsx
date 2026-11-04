"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity, ArrowDown, ArrowUp, Disc3, GripVertical, Headphones,
  Link2, ListMusic, Music2, Pause, Play, Plus, Repeat, Save, Search,
  SkipBack, SkipForward, Square, Trash2, Volume2, WandSparkles, X,
} from "lucide-react"
import { createClientId } from "@/lib/client-id"
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
}

const inputClass = "w-full min-w-0 rounded-lg border border-[#826044]/30 bg-[#0e0c0b] px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-amber-500/60"
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-[#846445]/35 bg-[#272019] px-3 py-2 text-xs font-semibold text-amber-100 transition-colors hover:border-amber-400/50 hover:bg-[#35281c] disabled:cursor-not-allowed disabled:opacity-40"
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-[#1c130c] transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"

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

function createId(prefix: string): string {
  return `${prefix}-${createClientId()}`
}

export function Soundpad({
  campaignId, players = [], targetUserId = null, onTargetUserIdChange,
  isGm, activeSounds, customTracks = [], musicVolume = 0.5, effectsVolume = 0.5,
  onCustomTracksChange, onMusicVolumeChange, onEffectsVolumeChange,
  onPlaySound, onStopSound, onStopAll,
}: SoundpadProps) {
  const [targetingReady, setTargetingReady] = useState(false)
  const [folders, setFolders] = useState<SoundFolder[]>([])
  const [hotkeys, setHotkeys] = useState<SoundHotkey[]>([])
  const [activeFolder, setActiveFolder] = useState("all")
  const [search, setSearch] = useState("")
  const [newFolderName, setNewFolderName] = useState("")
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [newSoundName, setNewSoundName] = useState("")
  const [newSoundUrl, setNewSoundUrl] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [busyPlaylist, setBusyPlaylist] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const generation = useRef(0)
  const foldersRef = useRef<SoundFolder[]>([])
  const hotkeysRef = useRef<SoundHotkey[]>([])
  const stateQueue = useRef<Promise<void>>(Promise.resolve())

  const allTracks = useMemo(() => [...SOUND_LIBRARY, ...customTracks], [customTracks])
  const trackMap = useMemo(() => new Map(allTracks.map(track => [track.id, track])), [allTracks])
  const soundEndpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/sound`
  const stateEndpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/state`

  useEffect(() => {
    const version = ++generation.current
    const abort = new AbortController()
    setLoaded(false)
    setPendingWrites(0)
    setError("")
    setFolders([])
    setHotkeys([])
    foldersRef.current = []
    hotkeysRef.current = []
    setActiveFolder("all")
    if (!isGm) return () => { abort.abort(); generation.current++ }
    void Promise.all([
      fetch(stateEndpoint, { cache: "no-store", signal: abort.signal }),
      fetch(soundEndpoint, { cache: "no-store", signal: abort.signal }),
    ]).then(async ([stateResponse, soundResponse]) => {
      const [stateData, soundData] = await Promise.all([stateResponse.json(), soundResponse.json()])
      if (!stateResponse.ok) throw new Error(stateData.error || "Não foi possível carregar o arquivo sonoro.")
      if (!soundResponse.ok) throw new Error(soundData.error || "Não foi possível obter os recursos de áudio.")
      if (version !== generation.current) return
      const normalizedFolders = normalizeSoundFolders(stateData.state?.soundFolders)
      const normalizedKeys = normalizeSoundHotkeys(stateData.state?.soundHotkeys)
      foldersRef.current = normalizedFolders
      hotkeysRef.current = normalizedKeys
      setFolders(normalizedFolders)
      setHotkeys(normalizedKeys)
      setTargetingReady(soundData.capabilities?.targetedSound === true)
      setLoaded(true)
    }).catch(err => {
      if (version === generation.current && !abort.signal.aborted) setError(errorMessage(err, "Erro ao carregar o arquivo sonoro."))
    })
    return () => { abort.abort(); generation.current++ }
  }, [stateEndpoint, soundEndpoint, isGm, reload])

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

  // As gravações são serializadas; cliques rápidos em ordem/loops não perdem alterações.
  async function persistFolders(next: SoundFolder[]): Promise<boolean> {
    if (!isGm || !loaded) return false
    foldersRef.current = next
    setFolders(next)
    setPendingWrites(v => v + 1)
    const version = generation.current
    const job = stateQueue.current.then(async () => {
      if (version !== generation.current) return false
      const data = await postJson(stateEndpoint, { state: { soundFolders: next } })
      if (!Array.isArray(data.state?.soundFolders)) {
        throw new Error("Registre soundFolders em CAMPAIGN_STATE_ARRAY_FIELDS (lib/campaign-state.ts).")
      }
      return true
    })
    stateQueue.current = job.then(() => undefined, () => undefined)
    try { return await job }
    catch (err) {
      if (version === generation.current) {
        setError(errorMessage(err, "Não foi possível salvar a organização."))
        setReload(value => value + 1)
      }
      return false
    } finally { if (version === generation.current) setPendingWrites(v => Math.max(0, v - 1)) }
  }

  async function persistHotkeys(next: SoundHotkey[]): Promise<boolean> {
    if (!isGm || !loaded) return false
    hotkeysRef.current = next
    setHotkeys(next)
    setPendingWrites(v => v + 1)
    const version = generation.current
    const job = stateQueue.current.then(async () => {
      if (version !== generation.current) return false
      const data = await postJson(stateEndpoint, { state: { soundHotkeys: next } })
      if (!Array.isArray(data.state?.soundHotkeys)) {
        throw new Error("Registre soundHotkeys em CAMPAIGN_STATE_ARRAY_FIELDS (lib/campaign-state.ts).")
      }
      return true
    })
    stateQueue.current = job.then(() => undefined, () => undefined)
    try {
      const saved = await job
      if (saved && version === generation.current) {
        window.dispatchEvent(new CustomEvent("rpg:sound-hotkeys-updated", { detail: next }))
      }
      return saved
    } catch (err) {
      if (version === generation.current) {
        setError(errorMessage(err, "Não foi possível salvar os atalhos."))
        setReload(value => value + 1)
      }
      return false
    } finally { if (version === generation.current) setPendingWrites(v => Math.max(0, v - 1)) }
  }

  async function createFolder() {
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
    if (!confirm(`Excluir a pasta "${folder.name}" e suas playlists? Os arquivos de áudio permanecerão disponíveis em Sem pasta.`)) return
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
    if (!activeFolderObject || !newPlaylistName.trim()) return
    const folderId = activeFolderObject.id
    const playlist: SoundPlaylist = { id: createId("sound-playlist"), name: newPlaylistName.trim(), items: [] }
    setNewPlaylistName("")
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
    if (!confirm(`Excluir a playlist "${playlist.name}"? Os áudios originais serão preservados.`)) return
    await persistFolders(foldersRef.current.map(folder => folder.id === folderId
      ? { ...folder, playlists: folder.playlists.filter(entry => entry.id !== playlist.id) } : folder))
  }

  function addTrackToPlaylist(folderId: string, playlistId: string, trackId: string) {
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

  function addCustomSound() {
    if (!newSoundName.trim() || !newSoundUrl.trim()) return
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

  function removeCustomSound(trackId: string) {
    if (!confirm("Remover este áudio da mesa? As entradas das playlists que o utilizam ficarão indisponíveis.")) return
    onCustomTracksChange?.(customTracks.filter(track => track.id !== trackId))
    bindHotkey(trackId, "")
  }

  return (
    <div className="rpg-themed-workspace flex h-full w-full flex-col overflow-y-auto bg-[#120e0c] font-sans text-stone-100 lg:flex-row lg:overflow-hidden">
      {isGm ? (
        <main className="flex min-h-[500px] min-w-0 flex-[2] flex-col lg:min-h-0">
          <header className="relative shrink-0 overflow-hidden border-b border-amber-900/20 bg-gradient-to-br from-[#45301a] via-[#22180f] to-[#140f0c] px-6 py-6 sm:px-8">
            <div className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-amber-500/10 blur-3xl" />
            <p className="rpg-kicker text-[10px] font-black uppercase tracking-[0.35em] text-amber-400">Arquivo sonoro da campanha</p>
            <h2 className="rpg-title mt-2 text-3xl font-black tracking-tight text-[#f4e8d6]">Sua trilha, sua narrativa.</h2>
            <p className="mt-1 max-w-xl text-xs text-stone-400">Organize cenas em pastas, monte playlists sequenciais e dispare sons durante a sessão.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-stone-300">
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">{allTracks.length} áudios</span>
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">{folders.length} pastas</span>
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">{allPlaylists.length} playlists</span>
            </div>
          </header>

          <div className="shrink-0 space-y-4 border-b border-white/5 px-6 py-5 sm:px-8">
            <label className="block text-xs font-medium text-amber-100">
              Destinatário das próximas reproduções
              <select aria-label="Destinatário do áudio" value={targetUserId ?? ""}
                onChange={e => onTargetUserIdChange?.(e.target.value || null)} className={`${inputClass} mt-2`}>
                <option value="">Todos na mesa</option>
                {players.map(player => <option key={player.userId} value={player.userId} disabled={!targetingReady}>{player.name}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-stone-500">{targetUserId ? "Jogador selecionado + mestre" : "Todos os jogadores + mestre"} · A escolha vale apenas para novos disparos.</p>
            {targetUserId && !players.some(player => player.userId === targetUserId) && <p className="text-xs text-red-300">O destinatário selecionado não está na mesa.</p>}
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3">
              <Search className="size-4 shrink-0 text-stone-500" />
              <input aria-label="Pesquisar sons" placeholder="Buscar áudio na biblioteca..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-stone-600" />
              {search && <button aria-label="Limpar pesquisa" onClick={() => setSearch("")}><X className="size-3" /></button>}
            </div>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Nova pasta" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nome da nova pasta" maxLength={100}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void createFolder() } }} className={`${inputClass} max-w-52 flex-1`} />
              <button className={buttonClass} disabled={!loaded || !newFolderName.trim()} onClick={() => void createFolder()}><Plus className="size-4" /> Pasta</button>
            </div>
            <nav aria-label="Pastas de sons" className="flex flex-wrap gap-2">
              {[{ id: "all", name: "Biblioteca" }, { id: "unfiled", name: "Sem pasta" }, ...folders].map(folder => (
                <button key={folder.id} type="button" disabled={!loaded} aria-pressed={activeFolder === folder.id}
                  onClick={() => setActiveFolder(folder.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${activeFolder === folder.id ? "border-amber-400/70 bg-amber-400/15 text-amber-200" : "border-white/10 bg-white/5 text-stone-400 hover:text-white"}`}>
                  {folder.name}
                </button>
              ))}
            </nav>
            {activeFolderObject && <div className="flex gap-4 text-xs">
              <button className="text-amber-400 hover:underline" onClick={() => void renameFolder(activeFolderObject)}>Renomear pasta</button>
              <button className="text-red-400 hover:underline" onClick={() => void deleteFolder(activeFolderObject)}>Excluir pasta</button>
            </div>}
            {isSaving && <p role="status" className="text-xs text-amber-300">Salvando alterações...</p>}
            {!loaded && !error && <p role="status" className="text-xs text-stone-400">Carregando biblioteca...</p>}
            {error && <div role="alert" className="flex flex-wrap gap-3 text-xs text-red-300">{error}<button onClick={() => setReload(v => v + 1)} className="underline">Recarregar</button></div>}
          </div>

          <div className="custom-scrollbar-sepia min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6 sm:px-8">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h3 className="flex items-center gap-2 text-sm font-black text-[#f0ddbf]"><ListMusic className="size-4 text-amber-400" /> Playlists {activeFolderObject ? `· ${activeFolderObject.name}` : ""}</h3>
                <span className="text-[11px] text-stone-500">Arraste as faixas ou use as setas</span>
              </div>
              {activeFolderObject && <div className="flex flex-wrap gap-2">
                <input aria-label="Nome da playlist" value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} maxLength={100}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void createPlaylist() } }} placeholder="Nova playlist: Combate, Taverna..." className={`${inputClass} max-w-80 flex-1`} />
                <button disabled={!loaded || !newPlaylistName.trim()} className={buttonClass} onClick={() => void createPlaylist()}><Plus className="size-4" /> Criar playlist</button>
              </div>}
              {!activeFolderObject && <p className="text-xs text-stone-500">Selecione uma pasta para criar uma playlist dentro dela. As playlists existentes aparecem na Biblioteca.</p>}
              {loaded && visiblePlaylists.length === 0 && <div className="rounded-xl border border-dashed border-amber-800/30 bg-[#1b1510] p-6 text-center text-xs text-stone-500">Nenhuma playlist nesta visualização.</div>}
              {visiblePlaylists.map(({ folder, playlist }) => {
                const playing = activeSounds.find(s => s.playlist?.playlistId === playlist.id)
                return <article key={playlist.id} className="overflow-hidden rounded-xl border border-amber-900/30 bg-[#1b1612]">
                  <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400"><Disc3 className="size-6" /></div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-bold text-stone-100">{playlist.name}</h4>
                      <p className="text-[11px] text-stone-500">{folder.name} · {playlist.items.length} faixas {playing ? "· Em reprodução" : ""}</p>
                    </div>
                    <button className={primaryClass} disabled={!canPlay || playlist.items.length === 0 || busyPlaylist === playlist.id}
                      onClick={() => void playPlaylist(playlist)} title="Iniciar playlist desde a primeira faixa"><Play className="size-4 fill-current" /> Tocar</button>
                    <button aria-label={`Renomear playlist ${playlist.name}`} className={buttonClass} onClick={() => {
                      const name = prompt("Nome da playlist:", playlist.name)?.trim()
                      if (name) changePlaylist(folder.id, playlist.id, p => ({ ...p, name }))
                    }}>Editar</button>
                    <button title="Excluir playlist" aria-label={`Excluir ${playlist.name}`} className="text-red-400 hover:text-red-300" onClick={() => void deletePlaylist(folder.id, playlist)}><Trash2 className="size-4" /></button>
                  </div>
                  {playlist.items.length === 0 ? <p className="px-4 py-5 text-xs text-stone-500">Adicione faixas da biblioteca usando o seletor “Adicionar à playlist”.</p> : (
                    <div className="divide-y divide-white/5">
                      {playlist.items.map((cue, index) => {
                        const track = trackMap.get(cue.trackId)
                        const activeCue = playing?.playlist?.index === index
                        return <div key={cue.id} draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", cue.id) }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); moveCue(folder.id, playlist.id, e.dataTransfer.getData("text/plain"), cue.id) }}
                          className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${activeCue ? "bg-amber-400/10" : "hover:bg-white/[0.025]"}`}>
                          <GripVertical className="size-4 cursor-grab text-stone-600" />
                          <span className="w-5 shrink-0 text-right font-mono text-[11px] text-stone-500">{index + 1}</span>
                          <div className="min-w-28 flex-1 truncate text-xs font-medium text-stone-200">{track?.name || "Arquivo removido"}</div>
                          {activeCue && <Activity className="size-4 text-amber-400" />}
                          <label className="flex items-center gap-1.5 text-[11px] text-stone-400" title="0 = tocar uma vez; 1 = tocar duas vezes; e assim por diante">
                            <Repeat className="size-3" /> Loops
                            <input aria-label={`Quantidade de loops de ${track?.name || "faixa"}`} type="number" min={0} max={99} step={1} value={cue.loops}
                              onChange={e => changeCue(folder.id, playlist.id, cue.id, old => ({ ...old, loops: Math.min(99, Math.max(0, Math.trunc(Number(e.target.value) || 0))) }))}
                              className="w-12 rounded border border-white/10 bg-black/40 px-1 py-1 text-center font-mono text-amber-300" />
                          </label>
                          <span className="w-10 text-center text-[10px] text-stone-500">{cue.loops + 1}x</span>
                          <button aria-label="Mover faixa para cima" disabled={index === 0} title="Subir" onClick={() => moveCue(folder.id, playlist.id, cue.id, playlist.items[index - 1].id)} className="text-stone-400 hover:text-amber-300 disabled:opacity-20"><ArrowUp className="size-4" /></button>
                          <button aria-label="Mover faixa para baixo" disabled={index === playlist.items.length - 1} title="Descer" onClick={() => moveCue(folder.id, playlist.id, cue.id, playlist.items[index + 1].id)} className="text-stone-400 hover:text-amber-300 disabled:opacity-20"><ArrowDown className="size-4" /></button>
                          <button aria-label="Remover faixa da playlist" title="Remover da playlist" onClick={() => changePlaylist(folder.id, playlist.id, p => ({ ...p, items: p.items.filter(i => i.id !== cue.id) }))} className="text-stone-500 hover:text-red-400"><X className="size-4" /></button>
                        </div>
                      })}
                    </div>
                  )}
                  {playing && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-amber-500/10 px-4 py-2">
                    <span className="mr-auto text-[11px] text-amber-200">Faixa {(playing.playlist?.index ?? 0) + 1} de {playlist.items.length} · execução {(playing.playlist?.iteration ?? 0) + 1}</span>
                    <button className={buttonClass} onClick={() => void skipPlaylist(playing.id, "previous")}><SkipBack className="size-3" /> Anterior</button>
                    <button className={buttonClass} onClick={() => void setPaused(playing)}>{playing.paused ? <Play className="size-3" /> : <Pause className="size-3" />} {playing.paused ? "Retomar" : "Pausar"}</button>
                    <button className={buttonClass} onClick={() => void skipPlaylist(playing.id, "next")}>Próxima <SkipForward className="size-3" /></button>
                    <button className={buttonClass} onClick={() => onStopSound?.(playing.id)}><Square className="size-3" /> Parar</button>
                  </div>}
                </article>
              })}
              <p className="text-[11px] text-stone-600">Mudanças na ordem e nos loops feitas durante a reprodução valem para a próxima execução da playlist.</p>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#f0ddbf]"><Music2 className="size-4 text-amber-400" /> Faixas da biblioteca</h3>
              {loaded && visibleTracks.length === 0 && <p className="text-xs text-stone-500">Nenhum áudio encontrado.</p>}
              {visibleTracks.map(track => {
                const activeInstances = activeSounds.filter(s => s.trackId === track.id && (s.targetUserId ?? null) === targetUserId)
                const playing = activeInstances.length > 0
                return <div key={track.id} data-active={playing} className={`rpg-themed-card group flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-all ${playing ? "border-amber-400/50 bg-amber-400/10" : "border-white/5 bg-[#1b1511] hover:border-amber-500/25"}`}>
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${playing ? "bg-amber-400 text-[#1a120b]" : "bg-black/40 text-amber-700"}`}>
                    {track.isCustom ? <Link2 className="size-5" /> : <Disc3 className={`size-5 ${playing ? "animate-spin" : ""}`} style={playing ? { animationDuration: "5s" } : undefined} />}
                  </span>
                  <div className="min-w-32 flex-1">
                    <p className={`truncate text-sm font-bold ${playing ? "text-amber-200" : "text-stone-100"}`}>{track.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-stone-500">{track.isCustom ? "Link personalizado" : "Biblioteca base"}</p>
                    <select aria-label={`Mover ${track.name} para pasta`} disabled={!loaded} value={folderForTrack(track.id)} onChange={e => void moveTrack(track.id, e.target.value)}
                      className="mt-2 max-w-44 rounded border border-white/10 bg-[#0e0c0b] px-1 py-1 text-[11px] text-stone-400">
                      <option value="unfiled">Sem pasta</option>
                      {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                  </div>
                  <div className="flex min-w-36 flex-col gap-2">
                    <select aria-label={`Adicionar ${track.name} à playlist`} defaultValue="" onChange={e => {
                      const [folderId, playlistId] = e.target.value.split("::")
                      if (folderId && playlistId) addTrackToPlaylist(folderId, playlistId, track.id)
                      e.target.value = ""
                    }} className="max-w-48 rounded border border-white/10 bg-[#0e0c0b] px-2 py-1.5 text-[11px] text-stone-400">
                      <option value="">+ Adicionar à playlist</option>
                      {allPlaylists.map(({ folder, playlist }) => <option key={playlist.id} value={`${folder.id}::${playlist.id}`}>{folder.name} / {playlist.name}</option>)}
                    </select>
                    <select aria-label={`Atalho de ${track.name}`} disabled={!loaded} value={hotkeys.find(h => h.trackId === track.id)?.code || ""}
                      onChange={e => bindHotkey(track.id, e.target.value)} className="max-w-48 rounded border border-white/10 bg-[#0e0c0b] px-2 py-1.5 text-[11px] text-stone-400">
                      <option value="">Sem tecla de atalho</option>
                      {SHORTCUT_CODES.map(shortcut => <option key={shortcut.code} value={shortcut.code}>{shortcut.label}{hotkeys.some(h => h.code === shortcut.code && h.trackId !== track.id) ? " (substituir)" : ""}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button aria-label={`Tocar ${track.name} uma vez`} title="Tocar uma vez" disabled={!canPlay} onClick={() => onPlaySound?.(track, false, targetUserId)} className="flex size-9 items-center justify-center rounded-full bg-amber-400 text-[#1a120b] hover:bg-amber-300 disabled:opacity-40"><Play className="size-4 fill-current" /></button>
                    {track.loopable && <button aria-label={`Alternar loop de ${track.name}`} title="Loop infinito avulso" disabled={!canPlay && !activeInstances.some(s => s.loop)}
                      onClick={() => { const loopSound = activeInstances.find(s => s.loop); if (loopSound) onStopSound?.(loopSound.id); else onPlaySound?.(track, true, targetUserId) }}
                      className={`flex size-9 items-center justify-center rounded-full border ${activeInstances.some(s => s.loop) ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-white/10 text-stone-400 hover:text-white"}`}><Repeat className="size-4" /></button>}
                    {track.isCustom && <button aria-label={`Excluir ${track.name}`} title="Excluir som" onClick={() => removeCustomSound(track.id)} className="text-stone-500 hover:text-red-400"><Trash2 className="size-4" /></button>}
                  </div>
                </div>
              })}
            </section>
          </div>
        </main>
      ) : (
        <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <Headphones className="size-14 text-amber-700" />
          <h3 className="text-lg font-bold">Conectado ao áudio da mesa</h3>
          <p className="max-w-md text-sm text-stone-500">Você ouvirá a ambiência, as playlists e os efeitos controlados pelo mestre.</p>
        </div>
      )}

      <aside className="rpg-themed-subtle flex w-full shrink-0 flex-col border-l border-amber-900/20 bg-[#1b1510] lg:w-[350px]">
        {isGm && <>
          <div className="flex min-h-52 flex-col border-b border-white/5 p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-300"><Activity className="size-4" /> Tocando agora</h3>
              {activeSounds.length > 0 && <button onClick={onStopAll} className="text-[10px] font-bold uppercase text-red-400 hover:text-red-300">Parar tudo</button>}
            </div>
            {activeSounds.length === 0 ? <div className="flex min-h-28 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-xs text-stone-500"><Music2 className="mb-2 size-7" /> Silêncio na sala...</div> :
              <div className="custom-scrollbar-sepia max-h-64 space-y-2 overflow-y-auto">
                {activeSounds.map(sound => <div key={sound.id} className="flex items-center gap-2 rounded-lg border border-amber-800/25 bg-black/25 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-amber-100">{getTrackName(sound.trackId)}</p>
                    <p className="truncate text-[10px] text-stone-500">{sound.playlist ? `${sound.playlist.playlistName} · ${sound.playlist.index + 1}/${sound.playlist.total}` : sound.loop ? "Loop contínuo" : "Execução avulsa"}</p>
                    <p className="mt-0.5 text-[10px] text-stone-600">{sound.targetUserId == null ? "Todos na mesa" : `${players.find(p => p.userId === sound.targetUserId)?.name || "Jogador"} + mestre`}</p>
                  </div>
                  {sound.playlist && <button title="Próxima faixa" onClick={() => void skipPlaylist(sound.id, "next")} className="text-stone-400 hover:text-amber-300"><SkipForward className="size-4" /></button>}
                  <button title={sound.paused ? "Retomar áudio" : "Pausar áudio"} onClick={() => void setPaused(sound)} className="text-stone-400 hover:text-amber-300">{sound.paused ? <Play className="size-4" /> : <Pause className="size-4" />}</button>
                  <button title="Parar áudio" onClick={() => onStopSound?.(sound.id)} className="text-stone-400 hover:text-red-400"><Square className="size-4" /></button>
                </div>)}
              </div>}
          </div>
          <div className="space-y-3 border-b border-white/5 p-5">
            <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-stone-400"><WandSparkles className="size-4" /> Adicionar áudio por link</h3>
            <input aria-label="Nome do novo áudio" value={newSoundName} onChange={e => setNewSoundName(e.target.value)} placeholder="Nome do áudio" className={inputClass} />
            <input aria-label="URL do novo áudio" value={newSoundUrl} onChange={e => setNewSoundUrl(e.target.value)} placeholder="URL direta do arquivo" className={inputClass} />
            <button onClick={addCustomSound} disabled={!newSoundName.trim() || !newSoundUrl.trim()} className={`${buttonClass} w-full`}><Save className="size-4" /> Salvar em Sem pasta</button>
          </div>
        </>}
        <div className="mt-auto space-y-5 p-5">
          <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-stone-400"><Volume2 className="size-4" /> Mixer principal</h3>
          <label className="block space-y-2 text-xs text-stone-400"><span className="flex justify-between"><span>Músicas / playlists</span><span className="font-mono text-amber-300">{Math.round(musicVolume * 100)}%</span></span>
            <input type="range" min={0} max={1} step={0.01} value={musicVolume} onChange={e => onMusicVolumeChange?.(Number(e.target.value))} className="w-full accent-amber-400" />
          </label>
          <label className="block space-y-2 text-xs text-stone-400"><span className="flex justify-between"><span>Efeitos</span><span className="font-mono text-amber-300">{Math.round(effectsVolume * 100)}%</span></span>
            <input type="range" min={0} max={1} step={0.01} value={effectsVolume} onChange={e => onEffectsVolumeChange?.(Number(e.target.value))} className="w-full accent-amber-400" />
          </label>
          {isGm && <p className="text-[11px] leading-relaxed text-stone-600">Atalhos são exclusivos do mestre, funcionam com o Soundpad fechado e não disparam enquanto você digita em um formulário.</p>}
        </div>
      </aside>
    </div>
  )
}
