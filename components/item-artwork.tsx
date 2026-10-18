"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ImageOff, Maximize2, Package, X } from "lucide-react"
import { itemImageUrl } from "@/lib/item-image"

type Props = {
  name: string
  imageUrl?: unknown
  className?: string
  expandable?: boolean
  fallback?: ReactNode
}

/**
 * Miniatura opcional com ampliação acessível. Usamos imagem nativa para
 * permitir URLs HTTPS arbitrárias sem configurar remotePatterns do Next.
 * Imagens inválidas/indisponíveis recorrem ao ícone original, sem quebrar a UI.
 */
export function ItemArtwork({ name, imageUrl, className = "size-12", expandable = false, fallback }: Props) {
  const src = itemImageUrl(imageUrl)
  const [broken, setBroken] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setBroken(false)
    setOpen(false)
  }, [src])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = oldOverflow
    }
  }, [open])

  const hasImage = !!src && !broken
  const frameClass = `relative shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/40 ${className}`
  const picture = hasImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || undefined}
      alt={name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => { setBroken(true); setOpen(false) }}
      className="h-full w-full object-contain"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-accent/60">
      {fallback ?? (src ? <ImageOff className="size-5" aria-label="Imagem indisponível" /> : <Package className="size-5" />)}
    </div>
  )

  return <>
    {expandable && hasImage ? (
      <button
        type="button"
        className={`${frameClass} group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
        title={`Ampliar imagem de ${name}`}
        aria-label={`Ampliar imagem de ${name}`}
        onClick={() => setOpen(true)}
      >
        {picture}
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/75 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 className="size-3" /></span>
      </button>
    ) : <div className={frameClass}>{picture}</div>}
    {open && src && !broken && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}
        role="presentation"
      >
        <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-amber-500/40 bg-zinc-950 p-4 shadow-2xl" role="dialog" aria-modal="true" aria-label={`Imagem de ${name}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="truncate font-serif font-semibold text-amber-100">{name}</p>
            <button type="button" autoFocus onClick={() => setOpen(false)} className="rounded-md p-2 text-zinc-200 hover:bg-white/10" aria-label="Fechar imagem ampliada"><X className="size-5" /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src || undefined} alt={`Imagem ampliada de ${name}`} referrerPolicy="no-referrer" onError={() => { setBroken(true); setOpen(false) }} className="max-h-[78vh] w-full object-contain" />
        </div>
      </div>, document.body,
    )}
  </>
}
