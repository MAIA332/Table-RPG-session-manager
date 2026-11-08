"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Check, ImagePlus, Images, Link2, Loader2, Move, Plus, RotateCcw, Sparkles, Trash2, Upload, X, ZoomIn } from "lucide-react"
import { CharacterPortrait } from "@/components/character-portrait"
import { Button } from "@/components/ui/button"
import { createClientId } from "@/lib/client-id"
import { DEFAULT_PORTRAIT_CROP, normalizePortraitCrop, type PortraitCrop, type PortraitFrameId } from "@/lib/portrait-frames"
import { MAX_ALTERNATE_PORTRAITS, MAX_CHARACTER_PORTRAITS, validPortraitImage, validateAlternatePortraits, type AlternatePortrait } from "@/lib/portrait-gallery"

interface PortraitEditorProps {
  name: string
  avatarUrl: string
  frame?: PortraitFrameId | string
  crop?: PortraitCrop
  portraitLabel?: string
  portraitGallery?: AlternatePortrait[]
  onClose: () => void
  onSave: (avatarUrl: string, crop: PortraitCrop, portraitLabel: string, gallery: AlternatePortrait[]) => Promise<void>
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }

/** Preserva a funcionalidade original de upload apenas para a imagem principal. */
async function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.")
  if (file.size > 12 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 12 MB.")
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível preparar a imagem.")
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL("image/webp", 0.86)
    if (result.length > 3_500_000) throw new Error("A imagem comprimida ficou muito grande.")
    return result
  } finally { bitmap.close() }
}

/** Editor em caixas com limite total de cinco retratos, incluindo o avatar principal. */
export function PortraitEditor({ name, avatarUrl, frame, crop, portraitLabel, portraitGallery, onClose, onSave }: PortraitEditorProps) {
  const [currentUrl, setCurrentUrl] = useState(avatarUrl || "/mystic-adventurer-portrait.png")
  const [urlDraft, setUrlDraft] = useState(avatarUrl || "")
  const [currentCrop, setCurrentCrop] = useState(() => normalizePortraitCrop(crop))
  const [mainLabel, setMainLabel] = useState(portraitLabel || "Normal")
  const [extras, setExtras] = useState<AlternatePortrait[]>(() => (Array.isArray(portraitGallery) ? portraitGallery : []).slice(0, MAX_ALTERNATE_PORTRAITS))
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
  const editorDialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = "hidden"
    editorDialogRef.current?.focus()
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return }
      if (event.key !== "Tab" || !editorDialogRef.current) return
      const focusable = Array.from(editorDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeys)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeys)
      previousFocus?.focus()
    }
  }, [])

  function applyUrl() {
    const next = urlDraft.trim()
    if (!next || (!next.startsWith("/") && !/^https?:\/\//i.test(next))) {
      setError("Informe uma URL válida para a imagem principal.")
      return
    }
    setError("")
    setCurrentUrl(next)
  }

  async function selectFile(file?: File) {
    if (!file) return
    setPreparing(true)
    setError("")
    try {
      setCurrentUrl(await prepareImage(file))
      setUrlDraft("")
      setCurrentCrop(DEFAULT_PORTRAIT_CROP)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível abrir a imagem.") }
    finally { setPreparing(false); if (fileInputRef.current) fileInputRef.current.value = "" }
  }

  function addPortrait() {
    if (extras.length >= MAX_ALTERNATE_PORTRAITS) return
    setExtras(current => [...current, { id: `portrait_${createClientId()}`, label: "Nova expressão", url: "" }])
    setError("")
  }

  function updatePortrait(id: string, patch: Partial<AlternatePortrait>) {
    setExtras(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  /** Troca entre imagem principal e alternativa, mantendo cinco caixas no máximo. */
  function makePrimary(id: string) {
    const chosen = extras.find(item => item.id === id)
    if (!chosen || !validPortraitImage(chosen.url)) {
      setError("Envie uma imagem ou insira um link HTTPS para esta expressão.")
      return
    }
    if (!validPortraitImage(currentUrl)) {
      setError("Para preservar o avatar atual como alternativa, ele também precisa ter uma URL HTTPS pública. Substitua o avatar principal por um link antes de alternar.")
      return
    }
    setExtras(current => current.map(item => item.id === id
      ? { ...item, url: currentUrl, label: mainLabel.trim() || "Normal" }
      : item))
    setCurrentUrl(chosen.url)
    setUrlDraft(chosen.url)
    setMainLabel(chosen.label)
    setCurrentCrop(DEFAULT_PORTRAIT_CROP)
    setError("")
  }

  async function savePortrait() {
    if (saving || preparing) return
    setError("")
    try {
      const label = mainLabel.trim()
      if (!label || label.length > 60) throw new Error("A legenda principal deve ter de 1 a 60 caracteres.")
      const normalized = validateAlternatePortraits(extras)
      if (normalized.some(item => item.url === currentUrl)) throw new Error("A imagem principal não pode se repetir nas alternativas.")
      setSaving(true)
      await onSave(currentUrl, currentCrop, label, normalized)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar os retratos.") }
    finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[11500] flex items-center justify-center overflow-y-auto bg-black/85 p-2 backdrop-blur-md sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={editorDialogRef} role="dialog" aria-modal="true" aria-label={`Editar retratos de ${name}`} tabIndex={-1} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} className="rpg-modal my-auto flex max-h-[96dvh] w-full max-w-[1320px] flex-col overflow-hidden border border-primary/30 bg-background text-foreground shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-primary/20 bg-card/40 px-4 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center border border-primary/40 bg-primary/10 text-primary"><Images className="size-5" /></span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.22em] text-primary/80">Retratos do viajante · {extras.length + 1} / {MAX_CHARACTER_PORTRAITS}</p><h2 className="truncate font-serif text-xl font-black sm:text-2xl">Expressões de {name}</h2></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar editor de retratos" className="grid size-10 shrink-0 place-items-center border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"><X className="size-5" /></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(320px,.85fr)_minmax(0,1.15fr)]">
          <section className="rpg-themed-workspace border-b border-border/60 bg-card/20 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[.18em] text-primary">01 · Avatar principal</span><span className="border border-primary/30 bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-primary">Principal</span></div>
            <div className="flex items-center justify-center py-2"><CharacterPortrait src={currentUrl} alt={`Prévia do retrato de ${name}`} frame={frame} crop={currentCrop} sizes="320px" className="size-[min(65vw,280px)] cursor-grab touch-none shadow-xl active:cursor-grabbing" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: currentCrop.x, y: currentCrop.y } }} onPointerMove={event => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const rect = event.currentTarget.getBoundingClientRect(); const x = clamp(drag.x - (event.clientX - drag.clientX) / rect.width * 100 / currentCrop.zoom, 0, 100); const y = clamp(drag.y - (event.clientY - drag.clientY) / rect.height * 100 / currentCrop.zoom, 0, 100); setCurrentCrop(value => ({ ...value, x, y })) }} onPointerUp={event => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }} /></div>
            <p className="mt-3 text-center text-xs text-muted-foreground"><Move className="mr-1 inline size-3.5" /> Arraste para reposicionar o enquadramento.</p>
            <label className="mt-5 block space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-primary">Legenda do retrato</span><input value={mainLabel} onChange={event => setMainLabel(event.target.value)} maxLength={60} placeholder="Ex.: Normal, em combate..." className="w-full rounded-sm border border-border/60 bg-background/70 px-3 py-2.5 text-sm outline-none focus:border-primary/60" /></label>
            <div className="mt-5 space-y-3 border-t border-primary/10 pt-4">
              <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-primary">Imagem principal</span><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={event => void selectFile(event.target.files?.[0])} /></div>
              <div className="flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 border border-border/60 bg-background/60 px-3 focus-within:border-primary/50"><Link2 className="size-4 shrink-0 text-muted-foreground" /><input value={urlDraft} onChange={event => setUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") applyUrl() }} placeholder="Link da imagem" className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm" /></label><Button type="button" variant="outline" size="sm" onClick={applyUrl}>Aplicar</Button></div>
              <Button variant="outline" disabled={saving || preparing} onClick={() => fileInputRef.current?.click()} className="w-full gap-2 text-xs">{preparing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Escolher arquivo para avatar principal</Button>
              <p className="text-[11px] text-muted-foreground">O avatar e as expressões aceitam upload local ou links HTTPS.</p>
            </div>
            <div className="mt-5 space-y-3 border-t border-primary/10 pt-4">
              <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-primary">Enquadramento</span><button type="button" onClick={() => setCurrentCrop(DEFAULT_PORTRAIT_CROP)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><RotateCcw className="size-3.5" /> Redefinir</button></div>
              {(["x", "y", "zoom"] as const).map(key => <label key={key} className="block space-y-1.5"><span className="flex justify-between text-xs"><span>{key === "x" ? "Horizontal" : key === "y" ? "Vertical" : <><ZoomIn className="mr-1 inline size-3.5" /> Zoom</>}</span><span className="font-mono text-muted-foreground">{key === "zoom" ? `${currentCrop.zoom.toFixed(2)}x` : `${Math.round(currentCrop[key])}%`}</span></span><input type="range" min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 3 : 100} step={key === "zoom" ? .05 : 1} value={currentCrop[key]} onChange={event => setCurrentCrop(value => ({ ...value, [key]: Number(event.target.value) }))} className="w-full cursor-pointer accent-primary" /></label>)}
            </div>
          </section>

          <section className="min-w-0 space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-primary/70 pl-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">02 · Galeria de expressões</p><h3 className="mt-1 font-serif text-lg font-bold sm:text-xl">Outras versões do personagem</h3><p className="mt-1 text-xs text-muted-foreground">Defina até quatro imagens extras, com uma legenda para cada estado.</p></div><span className="font-mono text-xs text-primary">{extras.length} / {MAX_ALTERNATE_PORTRAITS}</span></div>
            <div className="rounded-sm border border-primary/25 bg-primary/[.05] p-3 text-xs text-muted-foreground"><Sparkles className="mr-2 inline size-4 text-primary" /> Exemplos: <strong className="text-foreground">Normal</strong>, <strong className="text-foreground">Cansado</strong>, <strong className="text-foreground">Ferido</strong>, <strong className="text-foreground">Transformado</strong>. Outros jogadores poderão visualizar as versões em grade ou carrossel.</div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {extras.map((portrait, index) => (
                <div key={portrait.id} className="group min-w-0 space-y-3 rounded-sm border border-border/60 bg-card/25 p-3 transition hover:border-primary/35">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Retrato {String(index + 2).padStart(2, "0")}</span><button type="button" title="Remover este retrato" aria-label={`Remover ${portrait.label}`} onClick={() => setExtras(value => value.filter(item => item.id !== portrait.id))} className="grid size-7 place-items-center text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button></div>
                  <div className="flex min-w-0 items-center gap-3"><div className="grid size-20 shrink-0 place-items-center overflow-hidden border border-primary/20 bg-background/70"><img src={validPortraitImage(portrait.url) ? portrait.url : "/mystic-adventurer-portrait.png"} alt="" className="size-full object-cover" /></div><label className="min-w-0 flex-1 space-y-1"><span className="text-[10px] font-bold uppercase text-muted-foreground">Legenda</span><input value={portrait.label} maxLength={60} onChange={event => updatePortrait(portrait.id, { label: event.target.value })} placeholder="Ex.: Cansado" className="w-full border border-border/60 bg-background/60 px-2 py-2 text-xs outline-none focus:border-primary/60" /></label></div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 border border-primary/30 p-2 text-xs text-primary"><Upload className="size-4" /> Enviar imagem local<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={saving || preparing} className="hidden" onChange={async event => {
                    const input = event.currentTarget
                    const file = input.files?.[0]
                    if (!file) return
                    setPreparing(true); setError("")
                    try { updatePortrait(portrait.id, { url: await prepareImage(file) }) }
                    catch (error) { setError(error instanceof Error ? error.message : "Falha ao preparar imagem.") }
                    finally { setPreparing(false); input.value = "" }
                  }} /></label>
                  <label className="block space-y-1"><span className="text-[10px] font-bold uppercase text-muted-foreground">Link HTTPS (opcional com upload)</span><input value={portrait.url.startsWith("data:") ? "" : portrait.url} onChange={event => updatePortrait(portrait.id, { url: event.target.value })} placeholder={portrait.url.startsWith("data:") ? "Imagem local carregada" : "https://exemplo.com/retrato.png"} className="w-full border border-border/60 bg-background/60 px-2 py-2 text-xs outline-none focus:border-primary/60" /></label>
                  <button type="button" onClick={() => makePrimary(portrait.id)} className="flex w-full items-center justify-center gap-1.5 border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"><ArrowUpRight className="size-3.5" /> Definir como avatar principal</button>
                </div>
              ))}
              {extras.length < MAX_ALTERNATE_PORTRAITS && <button type="button" onClick={addPortrait} className="flex min-h-[175px] flex-col items-center justify-center gap-2 border border-dashed border-primary/35 bg-primary/[.025] px-4 py-5 text-primary transition hover:border-primary/70 hover:bg-primary/[.07]"><span className="grid size-11 place-items-center rounded-full border border-primary/35 bg-primary/10"><Plus className="size-5" /></span><strong className="text-sm">Adicionar expressão</strong><span className="text-[11px] text-muted-foreground">URL pública + legenda</span></button>}
            </div>
          </section>
        </div>
        <footer className="flex shrink-0 flex-col gap-3 border-t border-primary/20 bg-card/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="min-w-0"><p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"><ImagePlus className="size-4 text-primary" /> {extras.length + 1} de {MAX_CHARACTER_PORTRAITS} retratos</p><p className="mt-1 text-[10px] text-muted-foreground">Alterações só são publicadas após salvar.</p></div>
          <div className="flex flex-wrap items-center gap-2">{error && <p role="alert" className="w-full text-xs text-destructive sm:max-w-[330px]">{error}</p>}<Button variant="outline" disabled={saving || preparing} onClick={onClose}>Cancelar</Button><Button onClick={() => void savePortrait()} disabled={saving || preparing} className="min-w-[150px] gap-2 font-bold">{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {saving ? "Salvando..." : "Salvar retratos"}</Button></div>
        </footer>
      </motion.div>
    </motion.div>
  )
}
