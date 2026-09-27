"use client"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { Keyboard, X, Minimize2, Maximize2, Volume2, Play } from "lucide-react"
import type { Cutscene } from "./cutscene-types"
import { cutsceneMedia } from "@/lib/cutscene-media"

function TypewriterText({ text, isMinimized }: { text: string; isMinimized: boolean }) {
  const [displayed, setDisplayed] = useState("")
  useEffect(() => {
    setDisplayed("")
    let i = 0
    const timer = window.setInterval(() => { setDisplayed(text.slice(0, ++i)); if (i >= text.length) clearInterval(timer) }, 45)
    return () => clearInterval(timer)
  }, [text])
  return <h2 className={`mx-auto px-6 text-center font-serif font-black leading-tight text-white drop-shadow-lg ${isMinimized ? "line-clamp-3 text-lg" : "max-w-5xl text-3xl md:text-5xl lg:text-6xl"}`}>{displayed}</h2>
}
function SceneVideo({ url }: { url: string }) {
  const media = cutsceneMedia(url)
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [muted, setMuted] = useState(true)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (media.kind !== "file" || !video.current) return
    let active = true
    video.current.muted = true
    void video.current.play().catch(() => { if (active) setBlocked(true) })
    return () => { active = false }
  }, [url, media.kind])
  const enableSound = () => {
    if (video.current) {
      video.current.muted = false
      void video.current.play().then(() => { setMuted(false); setBlocked(false) }).catch(() => setBlocked(true))
    } else if (media.kind === "youtube") {
      for (const func of ["unMute", "playVideo"]) frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "https://www.youtube.com")
      setMuted(false)
    } else if (media.kind === "vimeo") {
      frame.current?.contentWindow?.postMessage({ method: "setVolume", value: 1 }, "https://player.vimeo.com")
      frame.current?.contentWindow?.postMessage({ method: "play" }, "https://player.vimeo.com")
      setMuted(false)
    }
  }
  if (media.kind === "invalid") return <p role="alert" className="p-6 text-white">URL de vídeo inválida.</p>
  return <div className="relative h-full w-full">
    {media.kind === "file" ? <video ref={video} src={media.url} autoPlay muted={muted} playsInline controls className="h-full w-full object-contain" onError={() => setBlocked(true)} />
      : <iframe ref={frame} src={media.url} title="Vídeo da cutscene" className="h-full w-full border-0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />}
    {(muted || blocked) && media.kind !== "embed" && <button onClick={enableSound} className="absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm text-white">
      {blocked ? <Play className="size-4" /> : <Volume2 className="size-4" />}{blocked ? "Reproduzir vídeo" : "Ativar som"}
    </button>}
  </div>
}
interface CutscenePlayerProps {
  cutscene: Cutscene; sceneIndex: number; isGm: boolean
  onSyncScene: (idx: number) => void; onClose: () => void
}
export function CutscenePlayer({ cutscene, sceneIndex, isGm, onSyncScene, onClose }: CutscenePlayerProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const scene = cutscene.scenes[sceneIndex]
  useEffect(() => {
    if (!isGm) return
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || !/^[1-9]$/.test(event.key)) return
      const index = Number(event.key) - 1
      if (index < cutscene.scenes.length) onSyncScene(index)
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [isGm, cutscene.scenes.length, onSyncScene])
  if (!scene) return null
  return <>
    <AnimatePresence>{!isMinimized && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm" />}</AnimatePresence>
    <motion.div layout initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }} transition={{ duration: .4 }}
      className={`fixed z-[100] overflow-hidden border border-white/15 bg-black shadow-2xl ${isMinimized ? "bottom-6 right-6 h-[180px] w-[320px] max-w-[90vw] rounded-xl" : "inset-0 rounded-2xl md:inset-10 lg:inset-16"}`}>
      <div className="absolute inset-0 flex items-center justify-center">
        {scene.type === "text" && <TypewriterText key={`${sceneIndex}:${scene.content}`} text={scene.content} isMinimized={isMinimized} />}
        {scene.type === "image" && <Image src={scene.content} alt="Cutscene" fill className={isMinimized ? "object-cover" : "object-contain"} />}
        {scene.type === "video" && <SceneVideo key={`${sceneIndex}:${scene.content}`} url={scene.content} />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <button aria-label={isMinimized ? "Expandir" : "Minimizar"} onClick={() => setIsMinimized(value => !value)} className="pointer-events-auto rounded-full bg-black/70 p-2.5 text-white">{isMinimized ? <Maximize2 className="size-5" /> : <Minimize2 className="size-5" />}</button>
        {isGm && !isMinimized && <span className="hidden items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs text-white/80 md:flex"><Keyboard className="size-4" />Teclas 1 a {Math.min(9, cutscene.scenes.length)} = Cenas</span>}
        <button onClick={onClose} aria-label="Fechar somente na minha tela" title="Fechar somente na minha tela" className="pointer-events-auto rounded-full bg-red-950/80 p-2.5 text-red-200"><X className="size-5" /></button>
      </div>
      {!isMinimized && <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-2">{cutscene.scenes.map((_, index) => <span key={index} className={`h-1.5 rounded-full ${index === sceneIndex ? "w-8 bg-primary" : "w-2 bg-white/30"}`} />)}</div>}
    </motion.div>
  </>
}
