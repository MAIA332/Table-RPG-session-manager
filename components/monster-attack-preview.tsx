"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Clock3, Eye, ImageIcon, X } from "lucide-react"
import type { MonsterAttackPreview } from "@/lib/combat-types"

function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

/**
 * Exibido permanentemente pela CampaignCombat (não depende do modal do combate
 * nem do pendingAttack). Recebe SOMENTE os registros já filtrados no servidor.
 * Tempo absoluto: funciona após refresh e não pode ser estendido pelo cliente.
 */
export function MonsterAttackPreviewShelf({
  previews,
  serverOffset = 0,
  onCancel,
  position = "right",
}: {
  previews: MonsterAttackPreview[]
  serverOffset?: number
  /** Apenas Mestre: remove o popup da sessão inteira. */
  onCancel?: (previewId: string) => void
  position?: "left" | "right"
}) {
  const [now, setNow] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [])

  const serverNow = now + serverOffset
  const active = now
    ? previews.filter(preview => preview.expiresAt > serverNow)
      .sort((a, b) => b.startedAt - a.startedAt)
    : []
  const selected = active.find(preview => preview.id === selectedId)
  const canShow = Boolean(selected)

  useEffect(() => {
    if (!canShow) return
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null)
    }
    window.addEventListener("keydown", onKeydown)
    return () => window.removeEventListener("keydown", onKeydown)
  }, [canShow])

  useEffect(() => {
    if (!canShow) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [canShow])

  if (!now || (active.length === 0 && !selected)) return null

  return <>
    {active.length > 0 && (
      <aside className={`pointer-events-none fixed top-[5.5rem] z-[10005] flex max-h-[45vh] w-[min(260px,calc(100vw-24px))] flex-col gap-2 overflow-y-auto ${position === "left" ? "left-3 sm:left-5" : "right-3 sm:right-5"}`}
        aria-label="Imagens temporárias dos golpes especiais">
        {active.map(preview => {
          const remaining = Math.max(0, preview.expiresAt - serverNow)
          const initial = Math.max(1, preview.expiresAt - preview.startedAt)
          const percentage = Math.min(100, remaining / initial * 100)
          return <div key={preview.id} className="pointer-events-auto relative">
          <button type="button" onClick={() => setSelectedId(preview.id)}
            className="group relative w-full overflow-hidden rounded-xl border border-primary/45 bg-background/95 px-3 py-2.5 text-left text-foreground shadow-xl backdrop-blur-lg transition-all hover:border-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
            <span className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Eye className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold uppercase tracking-[0.13em] text-primary/85">Visualizar golpe</span>
                <span className="block truncate text-xs font-semibold">{preview.attackName}</span>
                <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock3 className="size-3" /> <span className="font-mono tabular-nums">{clock(remaining)}</span>
                </span>
              </span>
            </span>
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/10">
              <span className="block h-full bg-primary transition-[width] duration-500" style={{ width: `${percentage}%` }} />
            </span>
          </button>
          {onCancel && <button type="button" aria-label={`Encerrar visualização de ${preview.attackName} para todos`} title="Mestre: encerrar para todos" onClick={() => onCancel(preview.id)} className="absolute -top-1 right-1 grid size-6 place-items-center rounded-full border border-destructive/40 bg-card text-destructive hover:bg-destructive/10"><X className="size-3.5" /></button>}
          </div>
        })}
      </aside>
    )}
    {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {selected && (
          <motion.div key={selected.id} role="presentation"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/85 p-3 backdrop-blur-lg sm:p-6"
            onMouseDown={event => { if (event.target === event.currentTarget) setSelectedId(null) }}>
            <motion.section role="dialog" aria-modal="true" aria-label={`Imagem do golpe: ${selected.attackName}`}
              initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.22 }}
              className="flex max-h-[95dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background text-foreground shadow-[0_28px_100px_rgba(0,0,0,0.65)]">
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card/60 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><ImageIcon className="size-5" /></span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Visão do ataque</p>
                    <h3 className="truncate font-serif text-base font-bold sm:text-lg">{selected.attackName}</h3>
                    <p className="truncate text-xs text-muted-foreground">{selected.creatureName}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1.5 font-mono text-xs tabular-nums">
                    <Clock3 className="size-3.5 text-primary" />{clock(selected.expiresAt - serverNow)}
                  </span>
                  {onCancel && <button type="button"
                    onClick={() => { onCancel(selected.id); setSelectedId(null) }}
                    title="Mestre: interromper para todos os jogadores"
                    className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive transition hover:bg-destructive/20">
                    Encerrar para todos
                  </button>}
                  <button type="button" onClick={() => setSelectedId(null)} aria-label="Fechar imagem"
                    className="grid size-9 place-items-center rounded-full border border-border/70 bg-muted/50 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <X className="size-4" />
                  </button>
                </div>
              </header>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/95 p-2 sm:p-4">
                <img src={selected.imageUrl} alt={`Ilustração do golpe ${selected.attackName}`}
                  className="max-h-[calc(95dvh-160px)] w-full object-contain" />
              </div>
              <footer className="shrink-0 border-t border-border/70 bg-card/60 px-4 py-2 text-center text-[11px] text-muted-foreground">
                A imagem ficará inacessível quando o cronômetro chegar a zero.
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>, document.body,
    )}
  </>
}
