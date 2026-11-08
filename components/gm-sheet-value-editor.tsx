"use client"
import { useState, useRef } from "react"
import { Check, Loader2, Minus, Pencil, Plus, X } from "lucide-react"
import { apiFetch } from "@/lib/client"
import type { Character } from "@/lib/types"

export function GmSheetValueEditor({ characterId, value, kind, canEdit, className = "", onSaved }: {
  characterId: string; value: number; kind: "level" | "classPoints"; canEdit: boolean; className?: string; onSaved: (character: Character) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const label = kind === "level" ? "nível do personagem" : "pontos de classe disponíveis"
  async function save(delta?: number) {
    if (!canEdit || lock.current) return
    const next = Number(draft)
    if (delta === undefined && (!draft.trim() || !Number.isSafeInteger(next) || next < (kind === "level" ? 1 : 0) || next > (kind === "level" ? 1000 : 1_000_000))) { setError("Informe uma quantidade inteira válida."); return }
    lock.current = true; setBusy(true); setError("")
    try {
      const result = await apiFetch<{ character: Character; availableClassPoints: number }>(`/api/characters/${encodeURIComponent(characterId)}/sheet-settings`, {
        method: "PATCH", body: JSON.stringify(delta !== undefined ? { classPointsDelta: delta } : { [kind]: next }),
      })
      onSaved(result.character); setEditing(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar.") }
    finally { lock.current = false; setBusy(false) }
  }
  const button = "inline-flex size-7 shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 disabled:opacity-40"
  return <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {editing && canEdit ? <>
      <input autoFocus type="number" step={1} min={kind === "level" ? 1 : 0} max={kind === "level" ? 1000 : 1_000_000} aria-label={`Editar ${label}`} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} onFocus={event => event.currentTarget.select()} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save() } if (event.key === "Escape" && !busy) { event.preventDefault(); setEditing(false); setError("") } }} className="w-20 rounded border border-primary/50 bg-background px-2 py-1 font-mono text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
      <button type="button" disabled={busy} onClick={() => void save()} aria-label={`Salvar ${label}`} className={button}>{busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}</button>
      <button type="button" disabled={busy} onClick={() => { setEditing(false); setError("") }} aria-label={`Cancelar edição de ${label}`} className={button}><X className="size-3" /></button>
    </> : <>
      {canEdit ? <button type="button" onClick={() => { setDraft(String(value)); setError(""); setEditing(true) }} aria-label={`Editar ${label}`} title={`Editar ${label} · Mestre`} className="inline-flex items-center gap-1 hover:text-primary">{kind === "level" ? `(Nv. ${value})` : "Pontos disponíveis"}<Pencil className="size-3" /></button> : <span>(Nv. {value})</span>}
      {canEdit && kind === "classPoints" && <><button type="button" disabled={busy || value <= 0} onClick={() => void save(-1)} className={button} aria-label="Retirar 1 ponto de classe"><Minus className="size-3" /></button><button type="button" disabled={busy} onClick={() => void save(1)} className={button} aria-label="Conceder 1 ponto de classe">{busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}</button></>}
    </>}
    {error && <span role="alert" className="basis-full text-xs font-normal text-destructive">{error}</span>}
  </span>
}
