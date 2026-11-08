"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { apiFetch } from "@/lib/client"
import type { Character } from "@/lib/types"
import { GmSheetValueEditor } from "./gm-sheet-value-editor"

export function CharacterNameEditor({ character, canEdit, canEditLevel = false, level, expanded, onSaved }: {
  character: Character
  canEdit: boolean
  canEditLevel?: boolean
  level: number
  expanded: boolean
  onSaved: (character: Character) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(character.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const saveLock = useRef(false)
  useEffect(() => { if (!editing) setDraft(character.name) }, [character.name, editing])

  function cancel() {
    if (saveLock.current) return
    setDraft(character.name); setError(""); setEditing(false)
  }
  async function save() {
    if (!canEdit || saveLock.current) return
    const name = draft.trim()
    if (!name || name.length > 160) { setError("Informe um nome de 1 a 160 caracteres."); return }
    if (name === character.name) { setEditing(false); return }
    saveLock.current = true; setSaving(true); setError("")
    try {
      const result = await apiFetch<{ character: Character }>(`/api/characters/${encodeURIComponent(character.id)}`, {
        method: "PATCH", body: JSON.stringify({ name }),
      })
      if (result.character?.name !== name) throw new Error("O servidor não confirmou o novo nome.")
      onSaved(result.character)
      setEditing(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o nome.") }
    finally { saveLock.current = false; setSaving(false) }
  }

  const heading = `min-w-0 font-serif font-bold text-foreground leading-tight transition-[font-size,line-height] duration-[480ms] ${expanded ? "text-2xl sm:text-[26px] md:text-[28px]" : "text-[20px] sm:text-[22px] md:text-2xl"}`
  return <div className="min-w-0 w-full">
    {editing && canEdit ? <form className="flex min-w-0 flex-wrap items-center gap-1.5" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void save() }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); cancel() } }}>
      <input autoFocus aria-label="Nome do personagem" maxLength={160} disabled={saving} value={draft} onFocus={event => event.currentTarget.select()} onChange={event => { setDraft(event.target.value); setError("") }} className={`${heading} w-full min-w-[100px] flex-1 rounded border border-primary/50 bg-background px-2 py-1 outline-none focus:ring-1 focus:ring-primary`} />
      <button type="submit" disabled={saving} aria-label="Salvar nome" title="Salvar nome (Enter)" className="grid size-8 place-items-center rounded border border-primary/40 bg-primary/10 text-primary disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}</button>
      <button type="button" disabled={saving} onClick={cancel} aria-label="Cancelar edição do nome" title="Cancelar (Esc)" className="grid size-8 place-items-center rounded border border-border/60 text-muted-foreground disabled:opacity-50"><X className="size-4" /></button>
    </form> : <h3 className={heading}>
      {canEdit ? <button type="button" title="Editar nome" aria-label={`Editar nome de ${character.name}`} onClick={event => { event.stopPropagation(); setDraft(character.name); setError(""); setEditing(true) }} className="group inline-flex max-w-full items-center gap-2 text-left hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span className="truncate">{character.name}</span><Pencil className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" /></button> : <span>{character.name}</span>}{" "}
      <GmSheetValueEditor characterId={character.id} value={level} kind="level" canEdit={canEditLevel} onSaved={onSaved} className={expanded ? "text-primary text-sm sm:text-base md:text-lg" : "text-zinc-400 text-[12px] sm:text-[13px] md:text-sm"} />
    </h3>}
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>
}
