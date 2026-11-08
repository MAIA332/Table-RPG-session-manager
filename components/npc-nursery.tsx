"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Archive, BookOpenText, Eye, Pencil, Plus, Search, Target, Trash2, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import type { Character } from "@/lib/types"
import type { GameClass } from "@/lib/game-data"
import { NPCCreator, type NPCDraft } from "@/components/character-sheet"
import { NpcArchivePreview } from "./npc-archive-preview"
import { AdvancedNpcEditor } from "./npc-advanced-editor"
import { EQUIPMENT } from "@/lib/game-data"
import { characterSkillLevel } from "@/lib/skill-progression"

type Gear = { id: string; name: string; detail?: string; cost?: number; category?: string; purchasable?: boolean }
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

/** Biblioteca de NPCs: a prévia é apenas leitura e nunca altera o snapshot arquivado. */
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
  const gear = useMemo(() => [...customEquipment, ...EQUIPMENT.filter(item => !customEquipment.some(custom => custom.id === item.id))], [customEquipment])
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

  return <AnimatePresence>{isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-black/85 p-2 backdrop-blur-md sm:p-4" onClick={event => event.stopPropagation()}>
    <motion.div initial={{ opacity: 0, scale: .985, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .985 }} role="dialog" aria-modal="true" aria-label="Berçário de NPCs" className="rpg-modal relative flex h-full max-h-[97dvh] w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background text-foreground shadow-2xl sm:max-h-[94dvh]" onClick={event => event.stopPropagation()}>
      <header className="relative shrink-0 overflow-hidden border-b border-primary/25 bg-card/60 px-4 py-5 sm:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-28 size-72 rounded-full border-[35px] border-primary/[.05]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center border border-primary/40 bg-primary/10 text-primary"><Archive className="size-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[.23em] text-primary">Acervo do Mestre · Campanha</p><h2 className="font-serif text-2xl font-black sm:text-3xl">O Berçário das Almas</h2><p className="mt-1 text-xs text-muted-foreground">Forje, arquive, examine e invoque fichas completas sem perder seus registros.</p></div></div><div className="flex items-center gap-2"><Button type="button" onClick={openNew} className="h-10 gap-2 rounded-sm px-3 text-xs font-bold sm:px-5"><Plus className="size-4" /> Forjar NPC</Button><button type="button" aria-label="Fechar Berçário" onClick={onClose} className="grid size-10 place-items-center rounded-full border border-border/75 bg-background/75 text-muted-foreground hover:border-primary/60 hover:text-primary"><X className="size-5" /></button></div></div>
      </header>
      {error && <div role="alert" className="border-b border-destructive/35 bg-destructive/10 px-5 py-3 text-xs text-destructive">{error}</div>}
      {success && <div role="status" className="border-b border-primary/25 bg-primary/[.07] px-5 py-3 text-xs text-primary">{success}</div>}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[345px_minmax(0,1fr)] xl:grid-cols-[375px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border/65 bg-card/25 lg:border-b-0 lg:border-r" aria-label="Acervo de NPCs">
          <div className="shrink-0 space-y-3 border-b border-border/60 p-4 sm:p-5"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.15em] text-primary">Prontos para invocação</p><span className="font-mono text-xs text-muted-foreground">{customNPCs.length} registrados</span></div>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input type="search" aria-label="Pesquisar NPCs" placeholder="Nome, classe, história..." value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full rounded-md border border-border/75 bg-background/80 pl-9 pr-3 text-xs text-foreground outline-none focus:border-primary/60" /></div>
            <div className="flex gap-1" role="group" aria-label="Origem do NPC">{[{ id: "all", label: "Todos", count: customNPCs.length },{ id: "archived", label: "Arquivados", count: archivedCount },{ id: "manual", label: "Forjados", count: customNPCs.length - archivedCount }].map(option => <button key={option.id} type="button" onClick={() => setSource(option.id as typeof source)} aria-pressed={source === option.id} className={`min-w-0 flex-1 rounded-md border px-2 py-2 text-[10px] font-bold transition ${source === option.id ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/30"}`}>{option.label} <span className="font-mono">{option.count}</span></button>)}</div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar-sepia sm:p-4">
            {filtered.length ? filtered.map(npc => { const selected = selectedNpc?.id === npc.id; const count = npc.npcLevel ?? Math.max(characterSkillLevel(npc.skills, 1), (npc.classes || []).reduce((sum, item) => sum + item.level, 0)); const linked = campaignCharacters.filter(char => npc.linkedCharacterIds?.includes(char.id)).length; return <button key={npc.id} type="button" onClick={() => { setSelectedId(npc.id); setError(null); setSuccess(null) }} aria-pressed={selected} className={`group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${selected ? "border-primary/65 bg-primary/[.10] shadow-sm" : "border-border/55 bg-background/55 hover:border-primary/40 hover:bg-card"}`}><span className="relative size-[70px] shrink-0 overflow-hidden rounded-md border border-primary/20 bg-background"><img src={/^(https?:\/\/|\/|data:image\/)/i.test(npc.avatarUrl) ? npc.avatarUrl : "/mystic-adventurer-portrait.png"} alt="" className="size-full object-cover" /></span><span className="min-w-0 flex-1"><span className="block truncate font-serif text-base font-bold">{npc.name}</span><span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{npc.identity || npc.origin || "Sem história definida"}</span><span className="mt-2 flex flex-wrap items-center gap-1.5"><span className="rounded border border-primary/25 bg-primary/[.07] px-1.5 py-0.5 font-mono text-[10px] text-primary">Nv. {count}</span><span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{npc.archivedSnapshot ? "Arquivado" : "Forjado"}</span>{linked > 0 && <span className="text-[10px] text-primary">{linked} ativo(s)</span>}</span></span><Eye className={`mt-1 size-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground/50 group-hover:text-primary"}`} /></button> }) : <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 px-5 text-center"><GhostSymbol /><p className="mt-3 text-sm font-semibold">Nenhum NPC encontrado</p><p className="mt-1 text-xs text-muted-foreground">Altere os filtros ou forje um novo NPC.</p></div>}
          </div>
        </aside>
        <div className="flex min-h-0 flex-col overflow-hidden">
          {selectedNpc ? <><div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/65 bg-card/35 px-4 py-3 sm:px-6"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Ficha do acervo</p><p className="text-xs text-muted-foreground">Prévia integral · Somente leitura</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!!busyId} onClick={() => openEdit(selectedNpc.id)} className="gap-1.5 border-primary/35 text-primary"><Pencil className="size-3.5" /> Editar</Button><Button type="button" size="sm" disabled={!!busyId} onClick={() => void action(selectedNpc.id, () => onSpawn(selectedNpc))} className="gap-1.5"><Target className="size-3.5" /> Invocar</Button><Button type="button" size="sm" variant="outline" title="Excluir registro do Berçário" aria-label={`Excluir ${selectedNpc.name}`} disabled={!!busyId} onClick={() => { if (!window.confirm(`Excluir ${selectedNpc.name} do Berçário? Isso não apaga as fichas já invocadas.`)) return; void action(selectedNpc.id, () => onDelete(selectedNpc.id), "NPC excluído do Berçário.") }} className="border-destructive/30 text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></Button></div></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar-sepia sm:p-6"><Button type="button" size="sm" variant="outline" disabled={!!busyId} onClick={() => setAdvancedId(selectedNpc.id)} className="mb-4">Editar defesas, mochila e golpes</Button><NpcArchivePreview key={selectedNpc.id} npc={selectedNpc} classes={catalog} customEquipment={customEquipment} />{!!onRepair && activeLinks.length > 0 && <div className="mt-5 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[.055] p-4"><p className="text-xs font-black uppercase tracking-widest text-amber-500">Fichas invocadas e vinculadas</p><p className="text-[11px] leading-relaxed text-muted-foreground">{selectedNpc.archivedSnapshot ? "Restaurar sobrescreve alterações atuais da ficha com o estado arquivado, sem gerar outro NPC." : "Conclui o registro de golpes especiais, retratos e afinidades em uma ficha já invocada, sem criar outro NPC."}</p>{activeLinks.map(character => <Button key={character.id} type="button" size="sm" variant="outline" disabled={!!busyId} className="mr-2 mt-2 border-amber-500/35 text-amber-400" onClick={() => { if (!window.confirm(selectedNpc.archivedSnapshot ? `Restaurar ${character.name} (${character.id}) ao snapshot arquivado?` : `Aplicar golpes, retratos e afinidades do Berçário à ficha ${character.name} já invocada?`)) return; void action(selectedNpc.id, () => onRepair(selectedNpc, character.id), `Ficha ${character.name} restaurada.`) }}>{selectedNpc.archivedSnapshot ? "Restaurar ficha" : "Concluir configuração"} · {character.name}</Button>)}</div>}</div></> : <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"><BookOpenText className="size-12 text-primary/50" /><h3 className="font-serif text-xl font-bold">O acervo está vazio</h3><p className="max-w-sm text-sm text-muted-foreground">Crie um NPC na Forja ou arquive um viajante para consultar sua ficha completa aqui.</p><Button type="button" onClick={openNew} className="mt-3 gap-2"><UserPlus className="size-4" /> Forjar primeiro NPC</Button></div>}
        </div>
      </div>
    </motion.div>
    {forging && <NPCCreator key={editing?.id || "new-npc"} initialNpc={editing} customClasses={customClasses} campaignCharacters={campaignCharacters} nurseryNPCs={customNPCs} customEquipment={customEquipment}
      onCreated={async npc => { await onCreated(npc); setSelectedId(npc.id); setEditingNpcId(null); setForging(false); setSuccess(`${npc.name} foi salvo no Berçário.`) }} onCancel={() => { setEditingNpcId(null); setForging(false) }} />}
    {advanced && <AdvancedNpcEditor key={advanced.id} initial={advanced} catalog={gear} onCancel={() => setAdvancedId(null)} onSave={async npc => { await onCreated(npc); setAdvancedId(null); setSuccess(`${npc.name} foi salvo no Berçário.`) }} />}
  </motion.div>}</AnimatePresence>
}

function GhostSymbol() { return <Archive className="size-10 text-primary/35" aria-hidden="true" /> }
