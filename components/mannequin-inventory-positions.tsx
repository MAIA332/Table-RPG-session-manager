"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Layers3, Loader2, MapPin, Rotate3D } from "lucide-react"
import {
  MANNEQUIN_ZONES, initialMannequinPlacements, normalizeMannequinPlacements,
  type MannequinItem, type MannequinPlacement,
} from "@/lib/equipment-mannequin"

const NAMES = new Map(MANNEQUIN_ZONES.map(entry => [entry.id, entry.name] as const))

/** Leitura independente do MongoDB, montada só quando a mochila é aberta.
 * Não grava posições nem altera itens em uso ou seus bônus. */
export function MannequinInventoryPositions({ characterId, items, onOpenMannequin }: {
  characterId: string
  items: MannequinItem[]
  onOpenMannequin: () => void
}) {
  const [stored, setStored] = useState<MannequinPlacement[] | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setStored(null)
    setError("")
    void (async () => {
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/mannequin`, {
          cache: "no-store", signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body.success !== true) throw new Error(body.error || `Erro ${response.status} ao consultar Manequim.`)
        const positions = normalizeMannequinPlacements(body.placements)
        if (!controller.signal.aborted) setStored(positions)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha ao consultar posições.")
      }
    })()
    return () => controller.abort()
  }, [characterId, refresh])

  const visible = useMemo(() => stored === null ? [] : initialMannequinPlacements(items,stored),[items,stored])
  const positions = useMemo(() => new Map(visible.map(entry => [entry.key,entry])),[visible])
  // Um registro legado duplicado ainda não foi confirmado na nova camada:
  // a mochila deve mostrar a posição reparada como sugestão, até salvar.
  const confirmed = useMemo(() => new Set((stored || []).filter(entry => {
    const resolved = positions.get(entry.key)
    return resolved?.zone === entry.zone && resolved.layer === entry.layer
  }).map(entry => entry.key)),[stored,positions])

  return <section aria-label="Posições dos equipamentos em uso" className="rounded-xl border border-primary/25 bg-card/30 p-3.5 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-center gap-2"><Layers3 className="size-4 shrink-0 text-primary"/><h5 className="text-xs font-bold text-primary">Onde estão equipados</h5></div>
      <button type="button" onClick={onOpenMannequin} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-2 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/15"><Rotate3D className="size-3.5"/>Abrir Manequim</button>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Localização corporal e camada de cada peça em uso, sincronizadas com o Manequim.</p>
    {stored===null && !error && <p role="status" className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin"/>Lendo as posições do MongoDB...</p>}
    {!!error && <div role="alert" className="mt-3 rounded-lg border border-destructive/35 bg-destructive/10 p-2.5 text-[11px] text-destructive"><AlertTriangle className="mr-1 inline size-3.5"/>{error}<button type="button" onClick={()=>setRefresh(v=>v+1)} className="ml-2 font-bold underline">Tentar novamente</button></div>}
    {stored!==null&&<>
      {!items.length&&<p className="mt-3 text-[11px] text-muted-foreground">Nenhum equipamento em uso.</p>}
      <div className="mt-3 max-h-[260px] space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:rgba(170,128,68,.4)_transparent]">
        {items.map(item=>{
          const position=positions.get(item.key)
          return <div key={item.key} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/45 bg-background/60 px-2.5 py-2">
            <div className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-foreground" title={item.name}>{item.name}</span><span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="size-3 shrink-0 text-primary/85"/>{position ? NAMES.get(position.zone) : "Sem posição"}</span></div>
            <div className="shrink-0 text-right"><span className="block whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">C{(position?.layer ?? 0)+1}</span>{!confirmed.has(item.key)&&<span title="Sugestão inicial ainda não salva" className="mt-1 block text-[9px] text-muted-foreground">Sugerido</span>}</div>
          </div>
        })}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">C1–C20 = camada. Posições sugeridas só serão persistidas ao salvar no Manequim.</p>
    </>}
  </section>
}
