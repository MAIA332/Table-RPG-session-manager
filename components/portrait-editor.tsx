"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { ImagePlus, Link2, Loader2, Move, RotateCcw, Save, Upload, X, ZoomIn } from "lucide-react"
import { CharacterPortrait } from "@/components/character-portrait"
import { Button } from "@/components/ui/button"
import { DEFAULT_PORTRAIT_CROP, normalizePortraitCrop, type PortraitCrop, type PortraitFrameId } from "@/lib/portrait-frames"

interface PortraitEditorProps {
  name: string
  avatarUrl: string
  frame?: PortraitFrameId | string
  crop?: PortraitCrop
  onClose: () => void
  onSave: (avatarUrl: string, crop: PortraitCrop) => Promise<void>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

async function prepareImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.")
  if (file.size > 12 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 12 MB.")

  const bitmap = await createImageBitmap(file)
  const limit = 1200
  const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Não foi possível preparar a imagem.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const result = canvas.toDataURL("image/webp", 0.86)
  if (result.length > 3_500_000) throw new Error("A imagem comprimida ainda ficou muito grande.")
  return result
}

export function PortraitEditor({ name, avatarUrl, frame, crop, onClose, onSave }: PortraitEditorProps) {
  const [currentUrl, setCurrentUrl] = useState(avatarUrl || "/mystic-adventurer-portrait.png")
  const [urlDraft, setUrlDraft] = useState(avatarUrl || "")
  const [currentCrop, setCurrentCrop] = useState(() => normalizePortraitCrop(crop))
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)

  function applyUrl() {
    const next = urlDraft.trim()
    if (!next) return
    if (!next.startsWith("/") && !/^https?:\/\//i.test(next) && !next.startsWith("data:image/")) {
      setError("Informe um link de imagem válido.")
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
      const prepared = await prepareImage(file)
      setCurrentUrl(prepared)
      setUrlDraft("")
      setCurrentCrop(DEFAULT_PORTRAIT_CROP)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível abrir a imagem.")
    } finally {
      setPreparing(false)
    }
  }

  async function savePortrait() {
    setSaving(true)
    setError("")
    try {
      await onSave(currentUrl, currentCrop)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o retrato.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[320] flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        className="rpg-modal my-auto w-full max-w-4xl overflow-hidden border border-primary/30 bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border/60 bg-black/20 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/10 text-primary"><ImagePlus className="size-5" /></span>
            <h2 className="rpg-title truncate text-xl font-black sm:text-2xl">Editar retrato</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground" aria-label="Fechar editor de retrato"><X className="size-5" /></button>
        </header>

        <div className="grid gap-0 md:grid-cols-[minmax(300px,0.9fr)_minmax(360px,1.1fr)]">
          <section className="rpg-themed-workspace flex min-h-[360px] items-center justify-center border-b border-border/60 bg-black/20 p-8 md:min-h-[560px] md:border-b-0 md:border-r">
            <div className="text-center">
              <CharacterPortrait
                src={currentUrl}
                alt={`Prévia do retrato de ${name}`}
                frame={frame}
                crop={currentCrop}
                sizes="320px"
                className="mx-auto size-[min(72vw,320px)] cursor-grab touch-none shadow-2xl active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: currentCrop.x, y: currentCrop.y }
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current
                  if (!drag || drag.pointerId !== event.pointerId) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const x = clamp(drag.x - ((event.clientX - drag.clientX) / rect.width) * 100 / currentCrop.zoom, 0, 100)
                  const y = clamp(drag.y - ((event.clientY - drag.clientY) / rect.height) * 100 / currentCrop.zoom, 0, 100)
                  setCurrentCrop((current) => ({ ...current, x, y }))
                }}
                onPointerUp={(event) => {
                  if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
                }}
                onPointerCancel={() => { dragRef.current = null }}
              />
              <div className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><Move className="size-4" /> Arraste para reposicionar</div>
            </div>
          </section>

          <section className="rpg-themed-subtle flex flex-col gap-6 p-5 sm:p-7">
            <div className="space-y-3">
              <span className="rpg-kicker">Trocar imagem</span>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => void selectFile(event.target.files?.[0])} />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={preparing || saving} className="h-11 w-full gap-2">
                {preparing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Escolher arquivo
              </Button>
              <div className="flex gap-2">
                <label className="rpg-themed-deep flex h-10 min-w-0 flex-1 items-center gap-2 rounded-sm border border-border/60 bg-background/60 px-3 focus-within:border-primary/60">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyUrl() }} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" placeholder="Link da imagem" />
                </label>
                <Button variant="outline" size="sm" onClick={applyUrl} className="h-10 px-3">Aplicar</Button>
              </div>
            </div>

            <div className="space-y-5 border-t border-border/50 pt-5">
              <div className="flex items-center justify-between gap-3">
                <span className="rpg-kicker">Enquadramento</span>
                <button type="button" onClick={() => setCurrentCrop(DEFAULT_PORTRAIT_CROP)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"><RotateCcw className="size-3.5" /> Redefinir</button>
              </div>
              <label className="block space-y-2">
                <span className="flex items-center justify-between text-xs font-semibold text-foreground"><span>Horizontal</span><span className="font-mono text-muted-foreground">{Math.round(currentCrop.x)}%</span></span>
                <input type="range" min="0" max="100" step="1" value={currentCrop.x} onChange={(event) => setCurrentCrop((current) => ({ ...current, x: Number(event.target.value) }))} className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted" style={{ accentColor: "var(--primary)" }} />
              </label>
              <label className="block space-y-2">
                <span className="flex items-center justify-between text-xs font-semibold text-foreground"><span>Vertical</span><span className="font-mono text-muted-foreground">{Math.round(currentCrop.y)}%</span></span>
                <input type="range" min="0" max="100" step="1" value={currentCrop.y} onChange={(event) => setCurrentCrop((current) => ({ ...current, y: Number(event.target.value) }))} className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted" style={{ accentColor: "var(--primary)" }} />
              </label>
              <label className="block space-y-2">
                <span className="flex items-center justify-between text-xs font-semibold text-foreground"><span className="flex items-center gap-2"><ZoomIn className="size-4 text-primary" /> Zoom</span><span className="font-mono text-muted-foreground">{currentCrop.zoom.toFixed(2)}x</span></span>
                <input type="range" min="1" max="3" step="0.05" value={currentCrop.zoom} onChange={(event) => setCurrentCrop((current) => ({ ...current, zoom: Number(event.target.value) }))} className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted" style={{ accentColor: "var(--accent)" }} />
              </label>
            </div>

            <div className="mt-auto space-y-3 border-t border-border/50 pt-5">
              {error && <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button onClick={() => void savePortrait()} disabled={saving || preparing} className="h-11 w-full gap-2 text-base font-bold">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar retrato
              </Button>
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  )
}
