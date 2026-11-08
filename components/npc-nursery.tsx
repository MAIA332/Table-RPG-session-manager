"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Archive, BookOpenText, Eye, Pencil, Plus, Search, Trash2, UserPlus, X, Shield, Backpack, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { EQUIPMENT } from "@/lib/game-data"
import type { Character, AttributeKey, DieSize } from "@/lib/types"
import type { GameClass } from "@/lib/game-data"
import { characterSkillLevel } from "@/lib/skill-progression"
import { DEFENSE_IDS, readNurseryDefense, writeNurseryDefenses } from "@/lib/npc-restoration"
import { readNpcExtraDice, writeNpcExtraDice, npcAttackDescription, MAX_NPC_EXTRA_DICE } from "@/lib/npc-special-dice"
import { NPCCreator, type NPCDraft } from "@/components/character-sheet"
import { NpcArchivePreview } from "./npc-archive-preview"
import type { PlayerSpecialAttack } from "@/lib/player-special-attacks"

export type Gear = { id: string; name: string; detail?: string; cost?: number; category?: string; purchasable?: boolean }
interface NpcNurseryProps {
  isOpen: boolean
  onClose: () => void
  customNPCs: NPCDraft[]
  onSpawn: (npc: NPCDraft) => void | Promise<void>
  onRepair?: (npc: NPCDraft, characterId: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onCreated: (npc: NPCDraft) => void | Promise<void>
  customClasses?: GameClass[]
  campaignCharacters?: Character[]
  customEquipment?: Gear[]
}

const ATTRS: { key: AttributeKey; label: string }[] = [
  { key: "dex", label: "Destreza" }, { key: "ins", label: "Intuição" },
  { key: "mig", label: "Might" }, { key: "wlp", label: "Vontade" },
]
const inputClass = "w-full rounded border border-primary/25 bg-background px-3 py-2 text-sm outline-none focus:border-primary"

/** Editor de campos que a Forja antiga não disponibiliza para NPCs no acervo. */
function AdvancedNpcEditor({ initial, catalog, onCancel, onSave }: {
  initial: NPCDraft; catalog: Gear[]; onCancel: () => void; onSave: (npc: NPCDraft) => Promise<void>
}) {
  const [npc, setNpc] = useState<NPCDraft>(() => structuredClone(initial))
  const [mods, setMods] = useState<Array<Record<string, unknown>>>(() =>
    structuredClone(initial.npcModifiers ?? (initial.archivedSnapshot as any)?.customModifiers ?? []))
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
                {["d6","d8","d10","d12","d14","d16","d18","d20"].map(die => <option key={die} value={die}>{die}</option>)}
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

export function NpcNursery({ isOpen, onClose, customNPCs, onSpawn, onRepair, onDelete, onCreated, customClasses = [], campaignCharacters = [], customEquipment = [] }: NpcNurseryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [forging, setForging] = useState(false)
  const [editingNpcId, setEditingNpcId] = useState<string | null>(null)
  const [advancedId, setAdvancedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [source, setSource] = useState<"all" | "archived" | "manual">("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const catalog = useMemo(() => getCampaignClassCatalog([...campaignCharacters, ...customNPCs], customClasses), [campaignCharacters, customNPCs, customClasses])
  const gear = useMemo<Gear[]>(() => [
    ...customEquipment,
    ...EQUIPMENT.filter(item => !customEquipment.some(custom => custom.id === item.id)),
  ], [customEquipment])
  const filtered = useMemo(() => customNPCs.filter(npc => {
    if (source === "archived" && !npc.archivedSnapshot) return false
    if (source === "manual" && npc.archivedSnapshot) return false
    const query = search.trim().toLocaleLowerCase("pt-BR")
    return !query || [npc.name, npc.origin, npc.identity, npc.theme, ...(npc.classes || []).map(cls => catalog.find(c => c.id === cls.classId)?.name || cls.classId)]
      .some(text => String(text || "").toLocaleLowerCase("pt-BR").includes(query))
  }), [customNPCs, source, search, catalog])
  const selectedNpc = filtered.find(npc => npc.id === selectedId) || filtered[0] || null
  const editing = customNPCs.find(npc => npc.id === editingNpcId)
  const advanced = customNPCs.find(npc => npc.id === advancedId)
  const archivedCount = customNPCs.filter(npc => !!npc.archivedSnapshot).length
  const activeLinks = selectedNpc ? campaignCharacters.filter(c => selectedNpc.linkedCharacterIds?.includes(c.id)) : []

  useEffect(() => {
    if (!isOpen) { setForging(false); setEditingNpcId(null); setAdvancedId(null); return }
    if (selectedId && !customNPCs.some(npc => npc.id === selectedId)) setSelectedId(null)
  }, [isOpen, selectedId, customNPCs])

  async function action(id: string, call: () => void | Promise<void>, successMessage?: string) {
    if (busyId) return
    setError(null); setSuccess(null); setBusyId(id)
    try { await call(); if (successMessage) setSuccess(successMessage) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível persistir esta operação.") }
    finally { setBusyId(null) }
  }
  function openNew() { setEditingNpcId(null); setForging(true); setError(null) }
  function openEdit(id: string) { setEditingNpcId(id); setForging(true); setError(null) }

  return <AnimatePresence>{isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-black/85 p-2 backdrop-blur-md sm:p-4">
    <motion.div initial={{ opacity: 0, scale: .985, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .985 }} role="dialog" aria-modal="true" aria-label="Berçário de NPCs" className="rpg-modal relative flex h-full max-h-[97dvh] w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background text-foreground shadow-2xl sm:max-h-[94dvh]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-primary/25 bg-card/60 px-4 py-5 sm:px-7">
        <div className="flex items-center gap-3"><Archive className="size-7 text-primary"/><div><p className="text-[10px] font-black uppercase tracking-[.23em] text-primary">Acervo do Mestre · Campanha</p><h2 className="font-serif text-2xl font-black sm:text-3xl">O Berçário das Almas</h2><p className="text-xs text-muted-foreground">Forje, arquive, examine e invoque fichas sem perder seus registros.</p></div></div>
        <div className="flex gap-2"><Button type="button" onClick={openNew}><Plus className="mr-2 size-4"/> Forjar NPC</Button><button type="button" aria-label="Fechar Berçário" onClick={onClose}><X className="size-5"/></button></div>
      </header>
      {error && <div role="alert" className="border-b border-destructive/35 bg-destructive/10 px-5 py-3 text-xs text-destructive">{error}</div>}
      {success && <div role="status" className="border-b border-primary/25 bg-primary/[.07] px-5 py-3 text-xs text-primary">{success}</div>}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[345px_minmax(0,1fr)] xl:grid-cols-[375px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border/65 bg-card/25 lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 border-b border-border/60 p-4 sm:p-5"><div className="flex justify-between"><p className="text-[10px] font-black uppercase tracking-widest text-primary">Prontos para invocação</p><span className="text-xs">{customNPCs.length} registrados</span></div>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input type="search" aria-label="Pesquisar NPCs" placeholder="Nome, classe, história..." value={search} onChange={event => setSearch(event.target.value)} className={`${inputClass} pl-9`}/></div>
            <div className="flex gap-1">{([{id:"all", label:"Todos", count:customNPCs.length},{id:"archived",label:"Arquivados",count:archivedCount},{id:"manual",label:"Forjados",count:customNPCs.length-archivedCount}] as const).map(option => <button key={option.id} type="button" onClick={() => setSource(option.id)} className={`flex-1 rounded border px-2 py-2 text-[10px] ${source===option.id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{option.label} ({option.count})</button>)}</div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">{filtered.map(npc => <button type="button" key={npc.id} onClick={() => {setSelectedId(npc.id);setError(null);setSuccess(null)}} aria-pressed={selectedNpc?.id===npc.id} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${selectedNpc?.id===npc.id ? "border-primary/65 bg-primary/10" : "border-border/55 hover:border-primary/40"}`}>
            <img src={/^(https?:\/\/|\/|data:image\/)/i.test(npc.avatarUrl) ? npc.avatarUrl : "/mystic-adventurer-portrait.png"} alt="" className="size-[68px] rounded object-cover"/>
            <span className="min-w-0 flex-1"><strong className="block truncate font-serif">{npc.name}</strong><small className="block truncate text-muted-foreground">{npc.identity || npc.origin || "Sem história"}</small><span className="mt-2 inline-block rounded border border-primary/30 px-2 py-1 text-[10px] text-primary">Nv. {characterSkillLevel(npc.skills)}</span></span><Eye className="mt-1 size-4 shrink-0"/>
          </button>)}{filtered.length===0 && <div className="grid min-h-40 place-items-center text-center text-xs text-muted-foreground"><BookOpenText className="size-9 text-primary"/> Nenhum NPC encontrado.</div>}</div>
        </aside>
        <main className="flex min-h-0 flex-col overflow-hidden">
          {selectedNpc ? <><header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/65 bg-card/35 px-4 py-3 sm:px-6"><div><p className="text-[10px] font-black uppercase tracking-widest text-primary">Ficha do acervo</p><p className="text-xs text-muted-foreground">Prévia integral · Edição nos controles do Mestre</p></div>
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!!busyId} onClick={() => openEdit(selectedNpc.id)}><Pencil className="mr-1 size-3"/> Forja</Button>
              <Button type="button" size="sm" variant="outline" disabled={!!busyId} onClick={() => setAdvancedId(selectedNpc.id)}><Backpack className="mr-1 size-3"/> Defesas / Mochila / Golpes</Button>
              <Button type="button" size="sm" disabled={!!busyId} onClick={() => void action(selectedNpc.id, () => onSpawn(selectedNpc), `${selectedNpc.name} invocado.`)}><UserPlus className="mr-1 size-3"/> Invocar</Button>
              <Button type="button" size="sm" variant="outline" disabled={!!busyId} onClick={() => {if (window.confirm(`Excluir ${selectedNpc.name} do Berçário?`)) void action(selectedNpc.id, () => onDelete(selectedNpc.id), "NPC removido.")}}><Trash2 className="size-3"/></Button></div>
          </header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><NpcArchivePreview key={selectedNpc.id} npc={selectedNpc} classes={catalog} customEquipment={customEquipment}/>
            {!!onRepair && activeLinks.length > 0 && <div className="mt-5 rounded-xl border border-amber-500/30 p-4"><p className="text-xs font-black uppercase text-amber-500">Fichas invocadas vinculadas</p>{activeLinks.map(character => <Button key={character.id} type="button" size="sm" variant="outline" disabled={!!busyId} className="mr-2 mt-2" onClick={() => {if (window.confirm(`Restaurar a ficha ${character.name} com os dados do Berçário?`)) void action(selectedNpc.id, () => onRepair(selectedNpc, character.id), `Ficha ${character.name} restaurada.`)}}>Restaurar {character.name}</Button>)}</div>}
          </div></> : <div className="grid h-full place-items-center p-8 text-center"><div><BookOpenText className="mx-auto size-12 text-primary/50"/><h3 className="mt-2 font-serif text-xl">Acervo vazio</h3><Button className="mt-3" onClick={openNew}>Forjar primeiro NPC</Button></div></div>}
        </main>
      </div>
    </motion.div>
    {forging && <NPCCreator key={editing?.id || "new-npc"} initialNpc={editing} customClasses={customClasses} campaignCharacters={campaignCharacters} nurseryNPCs={customNPCs} customEquipment={customEquipment} onCreated={async npc => {await onCreated(npc);setSelectedId(npc.id);setEditingNpcId(null);setForging(false);setSuccess(`${npc.name} foi salvo no Berçário.`)}} onCancel={() => {setEditingNpcId(null);setForging(false)}}/>}
    {advanced && <AdvancedNpcEditor key={advanced.id} initial={advanced} catalog={gear} onCancel={() => setAdvancedId(null)} onSave={async npc => {await onCreated(npc);setAdvancedId(null);setSuccess(`${npc.name} foi salvo no Berçário.`)}}/>}
  </motion.div>}</AnimatePresence>
}
