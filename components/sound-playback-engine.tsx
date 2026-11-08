"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Disc3, GripHorizontal, ListMusic, Maximize2, Pause, Play, SkipBack, SkipForward, Square, Volume2 } from "lucide-react"
import { SOUND_LIBRARY, normalizeSoundHotkeys, type ActiveSound, type SoundHotkey, type Track } from "@/lib/sound-config"
import { readPendingHotkeys } from "@/lib/soundpad-local"
import { createClientId } from "@/lib/client-id"
import { musicSource } from "@/lib/music-sources"
import { ExternalMusicPlayer } from "./external-music-player"

type PlayingAudio = { element: HTMLAudioElement; url: string }
type Stats = { id: string; current: number; duration: number }

type SoundPlaybackEngineProps = {
  activeSounds: ActiveSound[]
  currentUserId: string
  isGm: boolean
  musicVolume: number
  effectsVolume: number
  onSoundEnded?: (sound: ActiveSound) => void
  /** Adições opcionais necessárias para miniplayer e atalhos permanentes. */
  campaignId?: string
  isSoundpadOpen?: boolean
  onOpenSoundpad?: () => void
  customTracks?: Track[]
  onPlaySound?: (track: { id: string; url: string }, loop: boolean, targetUserId?: string | null) => void
  onStopSound?: (id: string) => void
  hotkeyTargetUserId?: string | null
}

function safeVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function releaseAudio(audio: HTMLAudioElement): void {
  audio.onended = null
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
}

function clock(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "--:--"
  const seconds = Math.floor(value)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

async function postSound(campaignId: string, action: string, id: string): Promise<void> {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/sound`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, id }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || "Não foi possível executar o comando de áudio.")
  }
}

/**
 * Montar UMA única vez em CampaignRoom, fora da modal Soundpad.
 * Fechar a modal nunca altera a identidade dos HTMLAudioElements ativos.
 */
export function SoundPlaybackEngine({
  activeSounds, currentUserId, isGm, musicVolume, effectsVolume, onSoundEnded,
  campaignId, isSoundpadOpen, onOpenSoundpad,
  customTracks = [], onPlaySound, onStopSound, hotkeyTargetUserId = null,
}: SoundPlaybackEngineProps) {
  const playingRef = useRef<Map<string, PlayingAudio>>(new Map())
  const currentSoundsRef = useRef<Map<string, ActiveSound>>(new Map())
  const completedRef = useRef<Set<string>>(new Set())
  const onEndedRef = useRef(onSoundEnded)
  const onPlayRef = useRef(onPlaySound)
  const targetRef = useRef(hotkeyTargetUserId)
  const tracksRef = useRef<Map<string, Track>>(new Map())
  const keysRef = useRef<SoundHotkey[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const [commandError, setCommandError] = useState("")
  const [commandBusy, setCommandBusy] = useState(false)
  // O prop pode não ter sido passado pelo componente pai; acompanhar o portal
  // independentemente evita que o miniplayer fique escondido para sempre.
  const [observedOpen, setObservedOpen] = useState<boolean | null>(null)
  // A propriedade controlada do CampaignRoom é a fonte de verdade quando disponível.
  // O evento do portal permanece apenas como fallback para versões antigas do pai.
  const soundpadOpen = isSoundpadOpen ?? observedOpen ?? false

  const tracks = useMemo(() => [...SOUND_LIBRARY, ...customTracks], [customTracks])
  useEffect(() => { onEndedRef.current = onSoundEnded }, [onSoundEnded])
  useEffect(() => { onPlayRef.current = onPlaySound }, [onPlaySound])
  useEffect(() => { targetRef.current = hotkeyTargetUserId }, [hotkeyTargetUserId])
  useEffect(() => { tracksRef.current = new Map(tracks.map(track => [track.id, track])) }, [tracks])

  // Visibilidade publicada pelo portal: o miniplayer não depende de outro modal.
  useEffect(() => {
    const visibility = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId: string; open: boolean }>).detail
      if (detail && (!campaignId || detail.campaignId === campaignId)) setObservedOpen(Boolean(detail.open))
    }
    window.addEventListener("rpg:soundpad-visibility", visibility)
    if (document.querySelector("[data-soundpad-fullscreen]")) setObservedOpen(true)
    return () => window.removeEventListener("rpg:soundpad-visibility", visibility)
  }, [campaignId])

  // Atalhos pertencem ao motor permanente, não à existência do painel.
  useEffect(() => {
    if (!isGm || !campaignId) return
    const abort = new AbortController()
    let updatedDuringFetch = false
    keysRef.current = readPendingHotkeys(campaignId) ?? []
    const preferencesUrl = `/api/campaigns/${encodeURIComponent(campaignId)}/sound/preferences`
    const legacyUrl = `/api/campaigns/${encodeURIComponent(campaignId)}/state`
    void fetch(preferencesUrl, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        const preferences = response.ok ? await response.json().catch(() => null) : null
        // A nova rota inclui legado. Compatibilidade com o backend anterior:
        // /state só é consultado quando a rota falha ou não devolve legado.
        const needsLegacy = !preferences?.success ||
          (preferences?.stored?.hotkeys !== true && preferences?.legacyIncluded !== true)
        let legacy: { state?: { soundHotkeys?: unknown } } | null = null
        if (needsLegacy) {
          const legacyResponse = await fetch(legacyUrl, {
            cache: "no-store", signal: abort.signal,
          }).catch(() => null)
          legacy = legacyResponse?.ok ? await legacyResponse.json().catch(() => null) : null
        }
        if (abort.signal.aborted || updatedDuringFetch) return
        const storedHotkeys = preferences?.success &&
          (preferences.legacyIncluded === true || preferences.stored?.hotkeys === true)
          ? normalizeSoundHotkeys(preferences.soundHotkeys)
          : normalizeSoundHotkeys(legacy?.state?.soundHotkeys)
        keysRef.current = readPendingHotkeys(campaignId) ?? storedHotkeys
      }).catch(() => {})
    const updated = (event: Event) => {
      updatedDuringFetch = true
      keysRef.current = normalizeSoundHotkeys((event as CustomEvent).detail)
    }
    window.addEventListener("rpg:sound-hotkeys-updated", updated)
    return () => { abort.abort(); window.removeEventListener("rpg:sound-hotkeys-updated", updated) }
  }, [campaignId, isGm])

  useEffect(() => {
    if (!isGm) return
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'] input"))) return
      const hotkey = keysRef.current.find(item => item.code === event.code)
      if (!hotkey) return
      const track = tracksRef.current.get(hotkey.trackId)
      if (!track) return
      event.preventDefault()
      if (onPlayRef.current) {
        onPlayRef.current({ id: track.id, url: track.url }, false, targetRef.current)
      } else if (campaignId) {
        // Compatibilidade com CampaignRoom antigo que ainda não passa onPlaySound.
        const id = `hotkey-${createClientId()}`
        void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/sound`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "play", id, trackId: track.id, url: track.url, loop: false, targetUserId: targetRef.current }),
        }).then(response => {
          if (!response.ok) console.warn("Não foi possível reproduzir o atalho:", response.status)
        }).catch(error => console.warn("Falha ao acionar atalho:", error))
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [isGm, campaignId])

  useEffect(() => {
    const audible = activeSounds.filter(sound =>
      !musicSource(sound.url) && (isGm || sound.targetUserId == null || sound.targetUserId === currentUserId),
    )
    const next = new Map(audible.map(sound => [sound.id, sound]))
    currentSoundsRef.current = next

    for (const [id, existing] of playingRef.current) {
      const sound = next.get(id)
      if (!sound || sound.url !== existing.url) {
        releaseAudio(existing.element)
        playingRef.current.delete(id)
      }
    }
    for (const id of completedRef.current) if (!next.has(id)) completedRef.current.delete(id)

    for (const sound of audible) {
      const volume = safeVolume(sound.playlist || sound.loop ? musicVolume : effectsVolume)
      const existing = playingRef.current.get(sound.id)
      if (existing) {
        existing.element.volume = volume
        existing.element.loop = Boolean(sound.loop && !sound.playlist)
        if (sound.paused) existing.element.pause()
        else if (existing.element.paused) {
          void existing.element.play().catch(error => console.warn("Áudio não pôde ser retomado:", error))
        }
        continue
      }
      if (completedRef.current.has(sound.id)) continue
      const audio = new Audio(sound.url)
      audio.preload = "auto"
      audio.loop = Boolean(sound.loop && !sound.playlist)
      audio.volume = volume
      audio.onended = () => {
        const current = playingRef.current.get(sound.id)
        if (!current || current.element !== audio || audio.loop) return
        completedRef.current.add(sound.id)
        releaseAudio(audio)
        playingRef.current.delete(sound.id)
        const latest = currentSoundsRef.current.get(sound.id)
        if (!latest) return
        // Playlist só avança por término do GM. Outros clientes aguardam o servidor.
        if (latest.playlist && !isGm) return
        if (onEndedRef.current) onEndedRef.current(latest)
        else if (campaignId) {
          void postSound(campaignId, "ended", latest.id).catch(error => console.warn("Falha ao encerrar faixa:", error))
        }
      }
      playingRef.current.set(sound.id, { element: audio, url: sound.url })
      if (!sound.paused) {
        void audio.play().catch(error => console.warn("Áudio não pôde ser tocado automaticamente:", error))
      }
    }
  }, [activeSounds, currentUserId, isGm, musicVolume, effectsVolume, campaignId])

  // Consultar diretamente o elemento já existente não reinicia nem desloca o áudio.
  const audible = activeSounds.filter(sound => isGm || sound.targetUserId == null || sound.targetUserId === currentUserId)
  const featured = audible.find(sound => Boolean(sound.playlist)) || audible.find(sound => sound.loop) || audible[audible.length - 1]
  const featuredId = featured?.id
  useEffect(() => {
    if (!isGm || soundpadOpen || !featuredId) return
    const tick = () => {
      const audio = playingRef.current.get(featuredId)?.element
      if (audio) setStats({
        id: featuredId,
        current: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : NaN,
      })
    }
    tick()
    const interval = window.setInterval(tick, 400)
    return () => window.clearInterval(interval)
  }, [isGm, soundpadOpen, featuredId])

  useEffect(() => {
    return () => {
      for (const { element } of playingRef.current.values()) releaseAudio(element)
      playingRef.current.clear()
      currentSoundsRef.current.clear()
      completedRef.current.clear()
    }
  }, [])

  async function runCommand(action: string, sound: ActiveSound) {
    if (!campaignId || commandBusy) return
    setCommandBusy(true)
    setCommandError("")
    try {
      if (action === "stop" && onStopSound) onStopSound(sound.id)
      else await postSound(campaignId, action, sound.id)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Falha no controle de áudio.")
    } finally { setCommandBusy(false) }
  }

  const externalPlayers = <div className="fixed bottom-4 left-4 z-[12000] flex max-h-[75vh] flex-col gap-2 overflow-y-auto">{audible.filter(sound => musicSource(sound.url)).map(sound => <ExternalMusicPlayer key={sound.id} sound={sound} volume={sound.loop || sound.playlist ? musicVolume : effectsVolume} onEnded={latest => {
    if (latest.playlist && !isGm) return
    if (onEndedRef.current) onEndedRef.current(latest)
    else if (campaignId) void postSound(campaignId, "ended", latest.id).catch(error => console.warn(error))
  }} />)}</div>
  if (!isGm || soundpadOpen || !featured) return externalPlayers

  const elapsed = stats?.id === featured.id ? stats.current : 0
  const duration = stats?.id === featured.id ? stats.duration : NaN
  const progress = Number.isFinite(duration) && duration > 0 ? Math.min(100, elapsed / duration * 100) : 0
  const title = tracks.find(track => track.id === featured.trackId)?.name || "Áudio em reprodução"

  return (<>{externalPlayers}
    <div className="fixed bottom-5 right-5 z-[80] w-[310px] max-w-[calc(100vw-24px)] select-none overflow-hidden rounded-2xl border border-amber-500/30 bg-[#17120fee] text-[#f0e5d4] shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <div className="flex cursor-grab touch-none items-center justify-between border-b border-white/5 bg-gradient-to-r from-[#38271a] to-[#1b1510] px-3 py-2 active:cursor-grabbing"
        onPointerDown={event => {
          if (event.button !== 0) return
          dragRef.current = { startX: event.clientX, startY: event.clientY, x: offset.x, y: offset.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (!drag) return
          setOffset({
            x: Math.min(16, Math.max(310 - window.innerWidth, drag.x + event.clientX - drag.startX)),
            y: Math.min(16, Math.max(155 - window.innerHeight, drag.y + event.clientY - drag.startY)),
          })
        }}
        onPointerUp={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300"><GripHorizontal className="size-4" /> Som da mesa</div>
        <span className="text-[10px] text-stone-500">Arraste para mover</span>
      </div>
      <div className="flex items-center gap-3 p-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/35 to-amber-950/20 text-amber-300"><Disc3 className={`size-7 ${featured.paused ? "" : "animate-spin"}`} style={{ animationDuration: "6s" }} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" title={title}>{title}</p>
          <p className="truncate text-[11px] text-stone-400">{featured.playlist ? `${featured.playlist.playlistName} · ${featured.playlist.index + 1}/${featured.playlist.total}` : featured.loop ? "Repetição contínua" : "Áudio avulso"}</p>
        </div>
        <button type="button" aria-label="Abrir Soundpad" title="Abrir biblioteca de sons" onClick={() => {
          if (onOpenSoundpad) onOpenSoundpad()
          else window.dispatchEvent(new CustomEvent("rpg:soundpad-request-open", { detail: { campaignId } }))
        }} className="text-stone-400 hover:text-amber-300"><Maximize2 className="size-4" /></button>
      </div>
      <div className="px-3">
        <div className="h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progresso do áudio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="h-full rounded-full bg-amber-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-stone-400"><span>{clock(elapsed)}</span><span>{clock(duration)}</span></div>
      </div>
      <div className="flex items-center justify-center gap-4 px-3 pb-3 pt-1">
        {featured.playlist ? <button title="Faixa anterior" aria-label="Faixa anterior" disabled={commandBusy} onClick={() => void runCommand("playlist_previous", featured)} className="text-stone-400 hover:text-white disabled:opacity-30"><SkipBack className="size-4" /></button> : <Volume2 className="size-4 text-stone-600" />}
        <button title={featured.paused ? "Retomar" : "Pausar"} aria-label={featured.paused ? "Retomar" : "Pausar"} disabled={commandBusy}
          onClick={() => void runCommand(featured.paused ? "resume" : "pause", featured)} className="flex size-9 items-center justify-center rounded-full bg-amber-400 text-[#21170e] hover:bg-amber-300 disabled:opacity-30">
          {featured.paused ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
        </button>
        <button title="Parar" aria-label="Parar áudio" disabled={commandBusy} onClick={() => void runCommand("stop", featured)} className="text-stone-400 hover:text-red-400 disabled:opacity-30"><Square className="size-4 fill-current" /></button>
        {featured.playlist ? <button title="Próxima faixa" aria-label="Próxima faixa" disabled={commandBusy} onClick={() => void runCommand("playlist_next", featured)} className="text-stone-400 hover:text-white disabled:opacity-30"><SkipForward className="size-4" /></button> : <ListMusic className="size-4 text-stone-600" />}
      </div>
      {commandError && <p role="alert" className="px-3 pb-2 text-[10px] text-red-300">{commandError}</p>}
    </div></>
  )
}
