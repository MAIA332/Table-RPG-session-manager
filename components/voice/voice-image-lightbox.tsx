"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Minus, Plus, RotateCcw, X } from "lucide-react"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { controllerFocus } from "@/lib/input/focus"

type Props = { src: string; name: string; onClose: () => void }

/** Visualizador separado do chat, acessível por mouse, teclado e gamepad. */
export function VoiceImageLightbox({ src, name, onClose }: Props) {
  const [zoom, setZoom] = useState(1)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useControllerActions({
    "ui.back": () => { onClose(); return true },
    "ui.confirm": () => controllerFocus("ui.confirm", dialogRef.current),
    "ui.left": () => controllerFocus("ui.left", dialogRef.current),
    "ui.right": () => controllerFocus("ui.right", dialogRef.current),
    "ui.up": () => controllerFocus("ui.up", dialogRef.current),
    "ui.down": () => controllerFocus("ui.down", dialogRef.current),
    "ui.next": () => controllerFocus("ui.next", dialogRef.current),
    "ui.previous": () => controllerFocus("ui.previous", dialogRef.current),
  }, { priority: 550, captureAll: true })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault(); setZoom(current => Math.min(3, +(current + 0.25).toFixed(2)))
      } else if (event.key === "-") {
        event.preventDefault(); setZoom(current => Math.max(1, +(current - 0.25).toFixed(2)))
      } else if (event.key === "0") {
        event.preventDefault(); setZoom(1)
      } else if (event.key === "Tab") {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        if (!buttons.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    // Captura antes do listener Escape do painel de voz, para não fechá-lo junto.
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = oldOverflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [onClose])

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Imagem: ${name}`}
      className="otms-voice-lightbox fixed inset-0 z-[10020] flex flex-col bg-black/95 p-3 backdrop-blur-md sm:p-6"
      onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="mx-auto mb-3 flex w-full max-w-5xl shrink-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white" title={name}>{name}</p>
        <button type="button" className="otms-voice-action text-white" onClick={() => setZoom(current => Math.max(1, current - 0.25))} disabled={zoom <= 1} aria-label="Diminuir zoom"><Minus className="size-4"/></button>
        <span className="min-w-10 text-center text-xs text-white" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" className="otms-voice-action text-white" onClick={() => setZoom(current => Math.min(3, current + 0.25))} disabled={zoom >= 3} aria-label="Aumentar zoom"><Plus className="size-4"/></button>
        <button type="button" className="otms-voice-action text-white" onClick={() => setZoom(1)} aria-label="Restaurar zoom"><RotateCcw className="size-4"/></button>
        <button ref={closeRef} type="button" className="otms-voice-action text-white" onClick={onClose} aria-label="Fechar imagem"><X className="size-4"/></button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto rounded-lg" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} draggable={false} className="m-auto rounded-md object-contain shadow-2xl"
          style={{ maxWidth: "calc(100vw - 48px)", maxHeight: "calc(100dvh - 115px)", transform: `scale(${zoom})`, transformOrigin: "center center" }}/>
      </div>
      <p className="mt-2 shrink-0 text-center text-[11px] text-white/60">Esc/B: fechar · +/-: zoom · 0: restaurar · controle: navegar e confirmar</p>
    </div>, document.body,
  )
}
