"use client"

import { useState } from "react"
import { Button } from "./ui/button"
import type { Character, DieSize } from "@/lib/types"
import type { GameClass } from "@/lib/game-data"
import { dieLabel } from "@/lib/custom-checks"

export function GmSheetEditor({ character, catalog, onSave }: {
  character: Character; catalog: GameClass[]; onSave: (patch: any) => Promise<any>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => structuredClone(character))
  const [selectedClass, setSelectedClass] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const field = "w-full min-w-0 rounded border border-border/60 bg-background px-2 py-2 text-sm"
  function setClassLevel(classId: string, level: number) {
    setDraft(current => {
      const definition = catalog.find(item => item.id === classId)
      const skills = { ...current.skills }
      const definitions = catalog.filter(item => item.id === classId || item.parentClassId === classId)
      const classSkills = definitions.flatMap(item => item.skills)
      let excess = classSkills.reduce((sum, skill) => sum + (skills[skill.id] || 0), 0) - level
      for (const skill of [...classSkills].reverse()) {
        if (excess <= 0) break
        const removed = Math.min(skills[skill.id] || 0, excess)
        skills[skill.id] = (skills[skill.id] || 0) - removed
        excess -= removed
      }
      if (level === 0) for (const skill of classSkills) delete skills[skill.id]
      return { ...current, skills, classes: level === 0 ? current.classes.filter(item => item.classId !== classId)
        : current.classes.some(item => item.classId === classId) ? current.classes.map(item => item.classId === classId ? { ...item, level } : item) : [...current.classes, { classId, level }] }
    })
  }
  async function save() {
    setBusy(true); setError("")
    try {
      const resources = Object.fromEntries(Object.entries(draft.resources).filter(([key, value]) => !["ip", "lp"].includes(key) && value !== (character.resources as any)[key]))
      // A mesma transação da progressão calcula os máximos e aplica somente
      // os ajustes manuais alterados, sem duplicar crescimento de HP/MP.
      await onSave({ name: draft.name, attributes: draft.attributes, classes: draft.classes, skills: draft.skills, resources, zenit: draft.zenit,
        expectedUpdatedAt: draft.updatedAt,
        ...(draft.isNpc ? { npcChecks: draft.npcChecks || [], ...(draft.npcLevel !== character.npcLevel ? { npcLevel: draft.npcLevel } : {}) } : {}) })
      setOpen(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar ficha.") }
    finally { setBusy(false) }
  }
  return <section className="mt-4 rounded-lg border border-primary/30 p-3">
    <Button size="sm" variant="outline" onClick={() => { setDraft(structuredClone(character)); setError(""); setOpen(value => !value) }}>Editar ficha · Mestre</Button>
    {open && <div className="mt-4 space-y-4">
      <label className="block text-xs">Nome<input className={field} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["dex", "ins", "mig", "wlp"] as const).map(key => <label key={key} className="text-xs">{key.toUpperCase()}<select className={field} value={draft.attributes[key]} onChange={event => setDraft({ ...draft, attributes: { ...draft.attributes, [key]: event.target.value as DieSize } })}>{[4,6,8,10,12,14,16,18,20].map(size => <option key={size}>d{size}</option>)}</select></label>)}</div>
      {draft.isNpc && <label className="block text-xs">Nível do NPC<input type="number" min={1} max={1000} className={field} value={draft.npcLevel || 1} onChange={event => setDraft({ ...draft, npcLevel: Number(event.target.value) })} /></label>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{(["hp", "maxHp", "mp", "maxMp", "maxIp", "xp", "fp"] as const).map(key => <label key={key} className="text-xs">{key.toUpperCase()}<input type="number" min={0} className={field} value={draft.resources[key]} onChange={event => setDraft({ ...draft, resources: { ...draft.resources, [key]: Number(event.target.value) } })} /></label>)}<label className="text-xs">Zenits<input type="number" min={0} className={field} value={draft.zenit} onChange={event => setDraft({ ...draft, zenit: Number(event.target.value) })} /></label></div>
      <p className="text-xs text-muted-foreground">Classes: ajuste níveis ou use 0 para remover. Ajuste também as habilidades abaixo para que representem a distribuição desejada.</p>
      {draft.classes.map(entry => <div key={entry.classId} className="space-y-2 rounded border border-border/50 p-3">
        <label className="flex items-center justify-between gap-3 text-sm">{catalog.find(item => item.id === entry.classId)?.name || entry.classId}<input aria-label={`Nível de ${entry.classId}`} type="number" min={0} max={1000} value={entry.level} className={`${field} max-w-24`} onChange={event => setClassLevel(entry.classId, Number(event.target.value))} /></label>
        {catalog.find(item => item.id === entry.classId)?.skills.map(skill => <label key={skill.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">{skill.name}<input type="number" min={0} max={skill.maxLevel} value={draft.skills[skill.id] || 0} className={`${field} max-w-24`} onChange={event => setDraft(current => ({ ...current, skills: { ...current.skills, [skill.id]: Number(event.target.value) } }))} /></label>)}
      </div>)}
      <div className="flex gap-2"><select aria-label="Adicionar classe" value={selectedClass} onChange={event => setSelectedClass(event.target.value)} className={field}><option value="">Adicionar classe normalmente...</option>{catalog.filter(item => !draft.classes.some(entry => entry.classId === item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button variant="outline" disabled={!selectedClass} onClick={() => { setClassLevel(selectedClass, 1); setSelectedClass("") }}>Adicionar</Button></div>
      {draft.isNpc && <div className="space-y-3"><p className="text-sm font-bold text-primary">Testes exclusivos deste NPC · Mestre</p>{(draft.npcChecks || []).map(check => <div key={check.id} className="space-y-2 rounded border border-border/60 p-3">
        <input aria-label="Nome do teste do NPC" value={check.name} className={field} onChange={event => setDraft(current => ({ ...current, npcChecks: (current.npcChecks || []).map(item => item.id === check.id ? { ...item, name: event.target.value } : item) }))} />
        <textarea aria-label="Descrição do teste do NPC" value={check.description} className={field} onChange={event => setDraft(current => ({ ...current, npcChecks: (current.npcChecks || []).map(item => item.id === check.id ? { ...item, description: event.target.value } : item) }))} />
        <p className="text-xs text-muted-foreground">Dados: {check.dice.map(dieLabel).join(" + ")}</p>
        <div className="flex flex-wrap gap-2">{(["dex", "ins", "mig", "wlp"] as const).map(attribute => <Button key={attribute} size="sm" variant="outline" disabled={check.dice.length >= 10} onClick={() => setDraft(current => ({ ...current, npcChecks: (current.npcChecks || []).map(item => item.id === check.id ? { ...item, dice: [...item.dice, { kind: "attribute", attribute }] } : item) }))}>+{attribute.toUpperCase()}</Button>)}<Button size="sm" variant="outline" disabled={check.dice.length <= 1} onClick={() => setDraft(current => ({ ...current, npcChecks: (current.npcChecks || []).map(item => item.id === check.id ? { ...item, dice: item.dice.slice(0, -1) } : item) }))}>Remover último dado</Button><Button size="sm" variant="ghost" onClick={() => setDraft(current => ({ ...current, npcChecks: (current.npcChecks || []).filter(item => item.id !== check.id) }))}>Excluir teste</Button></div>
      </div>)}<Button size="sm" variant="outline" onClick={() => setDraft(current => ({ ...current, npcChecks: [...(current.npcChecks || []), { id: `npc_${crypto.randomUUID()}`, name: "Novo teste", description: "", dice: [{ kind: "attribute", attribute: "dex" }], isPublic: false }] }))}>Adicionar teste exclusivo</Button></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar ficha"}</Button></div>
    </div>}
  </section>
}
