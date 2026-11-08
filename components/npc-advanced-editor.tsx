"use client"
import { useState } from "react"
import { X, Shield, Backpack, Swords, Plus, Trash2 } from "lucide-react"
import { Button } from "./ui/button"
import type { NPCDraft } from "./character-sheet"
import type { AttributeKey, DieSize } from "@/lib/types"
import { DEFENSE_IDS, readNurseryDefense, writeNurseryDefenses } from "@/lib/npc-restoration"
import { readNpcExtraDice, writeNpcExtraDice, npcAttackDescription, MAX_NPC_EXTRA_DICE } from "@/lib/npc-special-dice"
import type { PlayerSpecialAttack } from "@/lib/player-special-attacks"
export type Gear = { id: string; name: string; detail?: string; cost?: number; category?: string; purchasable?: boolean }
type CharacterSnapshot = { customModifiers?: Array<Record<string, unknown>>; npcEquippedIds?: string[]; specialAttacks?: PlayerSpecialAttack[] }
const ATTRS: { key: AttributeKey; label: string }[] = [
  { key: "dex", label: "Destreza" }, { key: "ins", label: "Intuição" },
  { key: "mig", label: "Vigor" }, { key: "wlp", label: "Vontade" },
]
const inputClass = "w-full rounded border border-primary/25 bg-background px-3 py-2 text-sm outline-none focus:border-primary"

/** Editor de campos que a Forja antiga não disponibiliza para NPCs no acervo. */
export function AdvancedNpcEditor({ initial, catalog, onCancel, onSave }: {
  initial: NPCDraft; catalog: Gear[]; onCancel: () => void; onSave: (npc: NPCDraft) => Promise<void>
}) {
  const [npc, setNpc] = useState<NPCDraft>(() => {
    const snapshot = initial.archivedSnapshot as (CharacterSnapshot | undefined)
    const modifiers = initial.npcModifiers ?? initial.customModifiers ?? snapshot?.customModifiers ?? []
    const equipped = initial.npcEquippedIds ?? snapshot?.npcEquippedIds ?? modifiers
      .filter(mod => typeof mod.id === "string" && mod.id.startsWith("item_equipped:") && mod.value === 1)
      .map(mod => String(mod.id).slice("item_equipped:".length))
    return { ...structuredClone(initial), npcEquippedIds: [...equipped], specialAttacks: structuredClone(initial.specialAttacks ?? snapshot?.specialAttacks ?? []) }
  })
  const [mods, setMods] = useState<Array<Record<string, unknown>>>(() =>
    structuredClone(initial.npcModifiers ?? initial.customModifiers ?? (initial.archivedSnapshot as any)?.customModifiers ?? []))
  const [tab, setTab] = useState<"attributes" | "backpack" | "attacks">("attributes")
  const [adding, setAdding] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const physical = readNurseryDefense(mods, DEFENSE_IDS.physical, Number(npc.attributes.dex.replace("d", "")) || 6)
  const magical = readNurseryDefense(mods, DEFENSE_IDS.magical, Number(npc.attributes.ins.replace("d", "")) || 6)
  const equipment = npc.equipment ?? []
  const equipped = npc.npcEquippedIds ?? []
  const attacks = npc.specialAttacks ?? []

  function setDefense(physicalValue: number, magicalValue: number) {
    try { setMods(writeNurseryDefenses(mods, physicalValue, magicalValue)); setError("") }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Defesa inválida.") }
  }
  function setAttack(index: number, updates: Partial<PlayerSpecialAttack>) {
    setNpc(current => ({ ...current, specialAttacks: (current.specialAttacks ?? []).map((attack, at) => at === index ? { ...attack, ...updates } : attack) }))
  }
  function newAttack() {
    if (attacks.length >= 30) return
    const now = Date.now()
    setNpc(current => ({ ...current, specialAttacks: [...(current.specialAttacks ?? []), {
      id: `npc-attack-${now}-${Math.random().toString(36).slice(2)}`, name: "Novo golpe", description: "",
      checkId: "c64", targetDefense: "physical", createdAt: now, updatedAt: now,
      previewDurationSeconds: 10,
    }] }))
  }
  async function save() {
    if (busy) return
    setBusy(true); setError("")
    try {
      await onSave({ ...npc, npcModifiers: mods, npcEquippedIds: equipped.filter(id => equipment.includes(id)) })
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o NPC.") }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/90 p-3 sm:p-6" role="presentation">
    <section role="dialog" aria-modal="true" aria-label={`Editar ficha de ${npc.name} no Berçário`} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-primary/40 bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/25 p-4 sm:p-6">
        <div><p className="text-[10px] uppercase tracking-widest text-primary">Editor do Berçário</p><h2 className="font-serif text-xl font-bold">{npc.name}</h2></div>
        <button type="button" aria-label="Cancelar edição" onClick={onCancel}><X className="size-5"/></button>
      </header>
      <nav className="flex shrink-0 flex-wrap gap-2 border-b border-border p-3" aria-label="Áreas de edição">
        {([ ["attributes", "Atributos e defesas", Shield], ["backpack", "Mochila", Backpack], ["attacks", "Golpes especiais", Swords] ] as const).map(([id,label,Icon]) =>
          <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab===id} className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${tab === id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}><Icon className="size-4"/>{label}</button>)}
      </nav>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {tab === "attributes" && <>
          <p className="text-xs text-muted-foreground">Estes valores serão aplicados ao invocar ou restaurar a ficha. As defesas manuais são guardadas sem incluir bônus de itens equipados.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{ATTRS.map(({key,label}) =>
            <label key={key} className="space-y-2 text-xs font-bold">{label}
              <select className={inputClass} value={npc.attributes[key]} onChange={event => setNpc(current => ({ ...current, attributes: { ...current.attributes, [key]: event.target.value as DieSize } }))}>
                {["d4","d6","d8","d10","d12","d14","d16","d18","d20"].map(die => <option key={die} value={die}>{die}</option>)}
              </select>
            </label>)}</div>
          <div className="grid grid-cols-2 gap-3">{[
            { id: "physical", label: "Defesa física", value: physical },
            { id: "magical", label: "Defesa mágica", value: magical },
          ].map(field => <label key={field.id} className="space-y-2 text-xs font-bold">{field.label}
            <input type="number" inputMode="numeric" min={0} step={1} className={inputClass} value={field.value} onChange={event => {
              if (event.target.value === "") return
              const value = Number(event.target.value)
              if (field.id === "physical") setDefense(value, magical)
              else setDefense(physical, value)
            }}/>
          </label>)}</div>
        </>}
        {tab === "backpack" && <>
          <p className="text-xs text-muted-foreground">Adicione ou remova itens existentes no catálogo da campanha antes da invocação. Itens repetidos contam separadamente na mochila.</p>
          <div className="flex flex-wrap gap-2"><select className={`${inputClass} min-w-0 flex-1`} value={adding} onChange={event => setAdding(event.target.value)}><option value="">Escolha um item...</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <Button type="button" disabled={!adding} onClick={() => {setNpc(current => ({ ...current, equipment: [...(current.equipment ?? []), adding] }));setAdding("")}}><Plus className="mr-1 size-4"/> Adicionar</Button></div>
          <div className="space-y-2">{equipment.map((id,index) => {
            const item = catalog.find(value => value.id === id)
            return <div key={`${id}-${index}`} className="flex items-center gap-3 rounded border border-border p-3 text-xs">
              <span className="min-w-0 flex-1"><strong className="block truncate">{item?.name ?? id}</strong><small className="text-muted-foreground">{item?.category ?? "Item"}</small></span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={equipped.includes(id)} onChange={event => setNpc(current => ({ ...current, npcEquippedIds: event.target.checked ? [...new Set([...(current.npcEquippedIds ?? []), id])] : (current.npcEquippedIds ?? []).filter(value => value !== id) }))}/> Preparar equipado</label>
              <button type="button" aria-label={`Retirar ${item?.name ?? id}`} onClick={() => setNpc(current => ({ ...current, equipment: current.equipment.filter((_,at) => at!==index), npcEquippedIds: (current.npcEquippedIds ?? []).filter(value => value !== id || current.equipment.filter(e => e===id).length > 1) }))} className="text-destructive"><Trash2 className="size-4"/></button>
            </div>
          })}{equipment.length === 0 && <p className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Mochila vazia.</p>}</div>
          <p className="text-xs text-muted-foreground">O estado preparado é armazenado no Berçário e acompanha a restauração.</p>
        </>}
        {tab === "attacks" && <>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Dados extras de NPC: até 10 dados em qualquer combinação, além do teste padrão.</p><Button type="button" disabled={attacks.length>=30} onClick={newAttack}><Plus className="mr-1 size-4"/> Golpe</Button></div>
          {attacks.map((attack,index) => {
            const dice = readNpcExtraDice(attack.description)
            return <article key={attack.id} className="space-y-3 rounded-lg border border-primary/25 bg-card/40 p-4">
              <div className="flex flex-wrap items-center gap-2"><input aria-label="Nome do golpe" className={`${inputClass} min-w-0 flex-1`} value={attack.name} maxLength={100} onChange={event => setAttack(index,{name:event.target.value})}/><select aria-label="Teste do golpe" className={`${inputClass} w-auto`} value={attack.targetDefense} onChange={event => setAttack(index,{ targetDefense:event.target.value as "physical"|"magical", checkId:event.target.value === "physical" ? "c64" : "c65"})}><option value="physical">Luta</option><option value="magical">Magia e Arcanismo</option></select><button type="button" aria-label="Excluir golpe" onClick={() => setNpc(current => ({...current,specialAttacks:(current.specialAttacks??[]).filter((_,at)=>at!==index)}))} className="text-destructive"><Trash2 className="size-4"/></button></div>
              <textarea className={inputClass} rows={2} maxLength={3800} aria-label="Descrição do golpe" value={npcAttackDescription(attack.description)} onChange={event => setAttack(index,{description:writeNpcExtraDice(event.target.value,dice)})}/>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong>Dados extras: {dice.length}/{MAX_NPC_EXTRA_DICE}</strong><div className="flex gap-1">{ATTRS.map(({key}) => <button key={key} type="button" disabled={dice.length>=MAX_NPC_EXTRA_DICE} onClick={() => setAttack(index,{description:writeNpcExtraDice(attack.description,[...dice,key])})} className="rounded border border-primary/35 px-2 py-1 disabled:opacity-40">+{key.toUpperCase()}</button>)}</div></div>
              <div className="flex flex-wrap gap-1">{dice.map((key,at) => <button key={`${key}-${at}`} type="button" title="Remover este dado" onClick={() => setAttack(index,{description:writeNpcExtraDice(attack.description,dice.filter((_,i)=>at!==i))})} className="rounded border border-border px-2 py-1 text-xs">{key.toUpperCase()} ×</button>)}</div>
            </article>
          })}
        </>}
      </div>
      {error && <p role="alert" className="border-t border-destructive/30 px-5 py-2 text-xs text-destructive">{error}</p>}
      <footer className="flex shrink-0 justify-end gap-2 border-t border-border p-4"><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button><Button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Salvando..." : "Salvar no Berçário"}</Button></footer>
    </section>
  </div>
}
