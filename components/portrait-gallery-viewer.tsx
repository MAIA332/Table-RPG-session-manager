"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Grid2X2, Images, Rows3, X } from "lucide-react"
import { getDisplayPortraits, characterPortraitLimit, type CharacterPortraitCollection } from "@/lib/portrait-gallery"

interface PortraitGalleryViewerProps {
  name: string
  character: CharacterPortraitCollection
  onClose: () => void
  initialLayout?: "grid" | "carousel"
}

/** Galeria pública e somente leitura: qualquer membro que veja a ficha pode abrir. */
export function PortraitGalleryViewer({ name, character, onClose, initialLayout = "grid" }: PortraitGalleryViewerProps) {
  const portraits = getDisplayPortraits(character)
  const [layout, setLayout] = useState<"grid" | "carousel">(initialLayout)
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const selected = portraits[Math.min(index, portraits.length - 1)]

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return }
      if (event.key === "ArrowRight") { event.preventDefault(); setIndex(value => (value + 1) % portraits.length) }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex(value => (value - 1 + portraits.length) % portraits.length) }
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'))
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKey)
      previousFocus?.focus()
    }
  }, [portraits.length])

  if (typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[12000] h-[100dvh] w-screen overflow-hidden bg-background text-foreground" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} role="dialog" tabIndex={-1} aria-modal="true" aria-label={`Galeria de retratos de ${name}`} className="relative flex h-full min-h-0 w-full flex-col outline-none"
        style={{ backgroundImage: "radial-gradient(ellipse 65% 55% at 50% 25%, color-mix(in srgb, var(--primary) 7%, transparent), transparent 72%), linear-gradient(color-mix(in srgb, var(--primary) 3%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--primary) 3%, transparent) 1px, transparent 1px)", backgroundSize: "auto, 42px 42px, 42px 42px" }}>
        <header className="shrink-0 border-b border-primary/20 bg-background/95 px-4 py-3 shadow-lg sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center border border-primary/40 bg-primary/10 text-primary"><Images className="size-5" /></span>
              <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.24em] text-primary">Arquivo de expressões</p><h2 className="truncate font-serif text-lg font-bold sm:text-2xl">{name}</h2></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-sm border border-border/60 bg-card/40 p-1 sm:flex" role="group" aria-label="Modo de visualização">
                <button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold transition ${layout === "grid" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Grid2X2 className="size-4" /> Grade</button>
                <button type="button" aria-pressed={layout === "carousel"} onClick={() => setLayout("carousel")} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold transition ${layout === "carousel" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Rows3 className="size-4" /> Carrossel</button>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar galeria de retratos" className="grid size-10 place-items-center border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"><X className="size-5" /></button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-[1500px] flex-1">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-l-2 border-primary/70 pl-4">
              <div><p className="text-[10px] font-black uppercase tracking-[.19em] text-primary/80">Retratos do personagem</p><h3 className="mt-1 font-serif text-xl font-bold">Cada imagem conta uma história</h3><p className="mt-1 text-xs text-muted-foreground">Explore as versões do personagem, acompanhadas de suas legendas.</p></div>
              <span className="border border-primary/25 bg-primary/5 px-3 py-1.5 font-mono text-xs text-primary">{String(portraits.length).padStart(2,"0")} / {String(characterPortraitLimit(character.portraitLimit)).padStart(2, "0")}</span>
            </div>
            <div className="mb-5 flex gap-2 sm:hidden" role="group" aria-label="Modo de visualização">
              <button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={`flex-1 border px-3 py-2 text-xs ${layout === "grid" ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}>Grade</button>
              <button type="button" aria-pressed={layout === "carousel"} onClick={() => setLayout("carousel")} className={`flex-1 border px-3 py-2 text-xs ${layout === "carousel" ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}>Carrossel</button>
            </div>
            {layout === "grid" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 sm:gap-5">
                {portraits.map((portrait, i) => (
                  <button key={portrait.id} type="button" onClick={() => { setIndex(i); setLayout("carousel") }} className="group overflow-hidden border border-border/60 bg-card/30 text-left transition hover:border-primary/60 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    <div className="relative aspect-[3/4] overflow-hidden bg-muted/30"><img src={portrait.url} alt={`${name} — ${portrait.label}`} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />{portrait.isPrimary && <span className="absolute left-2 top-2 border border-primary/40 bg-background/90 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-primary">Principal</span>}</div>
                    <div className="border-t border-border/50 px-3 py-3"><span className="text-[9px] font-bold uppercase tracking-widest text-primary/70">Retrato {String(i + 1).padStart(2,"0")}</span><p className="mt-1 line-clamp-2 min-h-9 text-sm font-semibold text-foreground">{portrait.label}</p></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mx-auto grid max-w-[1160px] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)] lg:gap-8">
                <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden border border-primary/25 bg-card/25 p-3 sm:p-5">
                  <img key={selected.id} src={selected.url} alt={`${name} — ${selected.label}`} className="max-h-[60dvh] w-full object-contain" />
                  {portraits.length > 1 && <><button type="button" aria-label="Retrato anterior" onClick={() => setIndex(value => (value - 1 + portraits.length) % portraits.length)} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center border border-primary/30 bg-background/90 text-primary hover:bg-primary/15"><ChevronLeft className="size-5" /></button><button type="button" aria-label="Próximo retrato" onClick={() => setIndex(value => (value + 1) % portraits.length)} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center border border-primary/30 bg-background/90 text-primary hover:bg-primary/15"><ChevronRight className="size-5" /></button></>}
                </div>
                <aside className="min-w-0 space-y-5 lg:self-center">
                  <div className="border-l-2 border-primary pl-4"><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary/70">{String(index + 1).padStart(2,"0")} / {String(portraits.length).padStart(2,"0")}</p><h3 className="mt-2 font-serif text-3xl font-bold text-foreground">{selected.label}</h3><p className="mt-2 text-sm text-muted-foreground">{selected.isPrimary ? "Imagem principal da ficha" : "Expressão alternativa do personagem"}</p></div>
                  <div className="grid grid-cols-5 gap-2">{portraits.map((portrait, i) => <button type="button" key={portrait.id} onClick={() => setIndex(i)} aria-label={`Ver ${portrait.label}`} aria-pressed={i === index} className={`aspect-square overflow-hidden border-2 ${i === index ? "border-primary" : "border-border/50 opacity-65 hover:opacity-100"}`}><img src={portrait.url} alt="" className="size-full object-cover" /></button>)}</div>
                  <p className="text-xs text-muted-foreground">Use as setas do teclado ou selecione uma miniatura para alternar entre os retratos.</p>
                </aside>
              </div>
            )}
          </div>
        </div>
        <footer className="shrink-0 border-t border-primary/20 bg-background/95 px-4 py-3 text-center text-xs text-muted-foreground">Galeria somente para visualização · As imagens são definidas pelo jogador ou pelo Mestre.</footer>
      </div>
    </div>, document.body,
  )
}
