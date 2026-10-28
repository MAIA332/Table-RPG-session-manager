"use client"

import {
  useEffect, useLayoutEffect, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Grip, Maximize2, Minimize2, X } from "lucide-react"

type Position = { x: number; y: number }
type DragOrigin = { pointerId: number; clientX: number; clientY: number; x: number; y: number }

const EDGE = 12

/** Limita a janela flutuante à área visível, inclusive após redimensionar. */
function clampPosition(x: number, y: number, width: number, height: number): Position {
  return {
    x: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
    y: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
  }
}

/** Um único visualizador local por usuário, usado pelo mestre e pelos jogadores. */
export function GalleryImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const pipRef = useRef<HTMLElement | null>(null)
  const dragOrigin = useRef<DragOrigin | null>(null)

  // A tela ampliada é modal; a janela flutuante NÃO bloqueia a mesa ao fundo.
  useEffect(() => {
    if (minimized) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleEscape)
    }
  }, [minimized, onClose])

  useLayoutEffect(() => {
    if (!minimized || !pipRef.current) return
    const rect = pipRef.current.getBoundingClientRect()
    setPosition(current => clampPosition(current?.x ?? rect.left, current?.y ?? rect.top, rect.width, rect.height))
  }, [minimized])

  useEffect(() => {
    if (!minimized) return
    const handleResize = () => {
      const rect = pipRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition(current => clampPosition(current?.x ?? rect.left, current?.y ?? rect.top, rect.width, rect.height))
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [minimized])

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    const rect = pipRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOrigin.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: rect.left,
      y: rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = dragOrigin.current
    const rect = pipRef.current?.getBoundingClientRect()
    if (!origin || origin.pointerId !== event.pointerId || !rect) return
    setPosition(clampPosition(
      origin.x + event.clientX - origin.clientX,
      origin.y + event.clientY - origin.clientY,
      rect.width,
      rect.height,
    ))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragOrigin.current?.pointerId !== event.pointerId) return
    dragOrigin.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function moveWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta: Record<string, Position> = {
      ArrowLeft: { x: -24, y: 0 },
      ArrowRight: { x: 24, y: 0 },
      ArrowUp: { x: 0, y: -24 },
      ArrowDown: { x: 0, y: 24 },
    }
    const offset = delta[event.key]
    if (!offset) return
    const rect = pipRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    setPosition(current => clampPosition(
      (current?.x ?? rect.left) + offset.x,
      (current?.y ?? rect.top) + offset.y,
      rect.width,
      rect.height,
    ))
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!minimized ? (
        <motion.div
          key="gallery-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada de imagem"
          className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/95 p-4 backdrop-blur-lg md:p-12"
          onClick={onClose}
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="absolute right-1 top-1 z-10 flex gap-2 md:right-3 md:top-3" onClick={event => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMinimized(true)}
                aria-label="Minimizar imagem para janela flutuante"
                title="Minimizar (picture-in-picture)"
                className="flex items-center gap-2 rounded-lg border border-primary/40 bg-card/90 p-3 text-card-foreground shadow-xl transition-colors hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Minimize2 className="size-5" />
                <span className="hidden text-xs font-semibold sm:inline">Minimizar</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar imagem"
                title="Fechar"
                className="rounded-lg border border-border bg-card/90 p-3 text-card-foreground shadow-xl transition-colors hover:bg-destructive/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Imagem exibida na sessão"
              draggable={false}
              className="max-h-full max-w-full rounded-lg border border-white/10 object-contain drop-shadow-2xl"
              onClick={event => event.stopPropagation()}
            />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="gallery-picture-in-picture"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-0 z-[10010]"
        >
          <section
            ref={pipRef}
            role="region"
            aria-label="Imagem em janela flutuante"
            className="pointer-events-auto fixed w-[calc(100vw-24px)] max-w-[360px] overflow-hidden rounded-xl border border-primary/50 bg-card/95 text-card-foreground shadow-[0_16px_60px_rgba(0,0,0,.65)] backdrop-blur-xl"
            style={position ? { left: position.x, top: position.y } : { right: EDGE, bottom: EDGE }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/10 p-2">
              <div
                role="group"
                tabIndex={0}
                aria-label="Arraste a imagem ou use as setas do teclado para mover"
                title="Arraste para mover · Setas do teclado também funcionam"
                onPointerDown={beginDrag}
                onPointerMove={drag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={moveWithKeyboard}
                className="flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-grab active:cursor-grabbing"
              >
                <Grip className="size-4 shrink-0" />
                <span className="truncate">Imagem em exibição</span>
              </div>
              <button
                type="button"
                onClick={() => setMinimized(false)}
                aria-label="Maximizar imagem"
                title="Maximizar"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/30 bg-background/70 hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Maximize2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar imagem flutuante"
                title="Fechar"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background/70 hover:bg-destructive/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex aspect-video items-center justify-center bg-black/50 p-1.5" onDoubleClick={() => setMinimized(false)} title="Clique duas vezes para ampliar">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Imagem compartilhada em janela flutuante" draggable={false} className="max-h-full max-w-full select-none object-contain" />
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
