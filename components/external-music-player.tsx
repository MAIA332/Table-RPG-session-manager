"use client"

import { useEffect, useRef, useState } from "react"
import type { ActiveSound } from "@/lib/sound-config"
import { musicSource } from "@/lib/music-sources"

let youtubeApi: Promise<any> | undefined
let spotifyApi: Promise<any> | undefined
function loadApi(provider: "youtube" | "spotify"): Promise<any> {
  const global = window as any
  if (provider === "youtube") {
    if (global.YT?.Player) return Promise.resolve(global.YT)
    if (!youtubeApi) youtubeApi = new Promise((resolve, reject) => {
      const previous = global.onYouTubeIframeAPIReady
      global.onYouTubeIframeAPIReady = () => { previous?.(); resolve(global.YT) }
      const script = document.createElement("script")
      script.src = "https://www.youtube.com/iframe_api"
      script.onerror = () => { youtubeApi = undefined; reject(new Error("Falha ao carregar o player YouTube.")) }
      document.head.append(script)
    })
    return youtubeApi
  }
  if (!spotifyApi) spotifyApi = new Promise((resolve, reject) => {
    const previous = global.onSpotifyIframeApiReady
    global.onSpotifyIframeApiReady = (api: any) => { previous?.(api); resolve(api) }
    const script = document.createElement("script")
    script.src = "https://open.spotify.com/embed/iframe-api/v1"
    script.onerror = () => { spotifyApi = undefined; reject(new Error("Falha ao carregar o player Spotify.")) }
    document.head.append(script)
  })
  return spotifyApi
}

export function ExternalMusicPlayer({ sound, volume, onEnded }: { sound: ActiveSound; volume: number; onEnded: (sound: ActiveSound) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const controller = useRef<any>(null)
  const latest = useRef({ sound, volume, onEnded })
  latest.current = { sound, volume, onEnded }
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const source = musicSource(sound.url)
    if (!source || !element.current) return
    let cancelled = false
    let player: any
    let completed = false
    const target = document.createElement("div")
    element.current.replaceChildren(target)
    const ended = () => {
      if (cancelled || completed) return
      if (latest.current.sound.loop && !latest.current.sound.playlist) {
        player?.seekTo?.(0, true); player?.playVideo?.(); player?.play?.()
      } else { completed = true; latest.current.onEnded(latest.current.sound) }
    }
    setReady(false); setError("")
    void loadApi(source.provider).then(api => {
      if (cancelled) return
      if (source.provider === "youtube") {
        player = new api.Player(target, {
          width: "100%", height: 200,
          ...(source.kind === "video" ? { videoId: source.id } : {}),
          playerVars: { origin: window.location.origin, autoplay: 1, playsinline: 1, ...(source.kind === "playlist" ? { listType: "playlist", list: source.id } : {}) },
          events: {
            onReady: () => { if (cancelled) { player.destroy(); return }; controller.current = player; setReady(true) },
            onStateChange: (event: any) => { if (event.data === 0) ended() },
            onError: () => setError("Vídeo indisponível ou sem permissão de reprodução incorporada."),
          },
        })
      } else {
        api.createController(target, { uri: `spotify:${source.kind}:${source.id}`, width: "100%", height: 152 }, (instance: any) => {
          player = instance
          if (cancelled) { instance.destroy(); return }
          controller.current = instance; setReady(true)
          instance.addListener("playback_update", (event: any) => {
            const data = event.data
            if (data?.duration > 0 && data.position >= data.duration && !data.isBuffering) ended()
          })
        })
      }
    }).catch(reason => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true; controller.current = null; player?.destroy?.(); element.current?.replaceChildren() }
  }, [sound.id, sound.url])

  useEffect(() => {
    const player = controller.current
    if (!ready || !player) return
    if (musicSource(sound.url)?.provider === "youtube") {
      player.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100))
      if (sound.paused) player.pauseVideo(); else player.playVideo()
    } else { if (sound.paused) player.pause(); else player.play() }
  }, [ready, sound.paused, sound.url, volume])
  return <section className="w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-lg border border-primary/40 bg-background p-2 shadow-xl">
    <p className="mb-1 text-[10px] text-muted-foreground">{musicSource(sound.url)?.provider === "youtube" ? "YouTube" : "Spotify · volume no player"} · Se necessário, clique em reproduzir.</p>
    <div ref={element} />
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}
