"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import { BookOpen, Hammer, Layers3, Plus, Save, Trash2, Sparkles, LockKeyhole, WandSparkles, X, Check, Loader2, GraduationCap, ArrowLeft, ChevronRight, RefreshCw, Eye, BookMarked } from "lucide-react"
import type { ClassBook, ClassBookEntry, ClassBookProgress, BookKind, CampaignClassBooks, ClassBookDeckView, ClassBookActivity } from "@/lib/class-books"
import type { BookLevelSummary } from "@/lib/class-books-learning"
import { characterClassIds } from "@/lib/class-books"
import { PRESET_CHECKS } from "@/lib/combat-checks"
import { ClassTimerProgress } from "./class-timer-progress"

const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
const field = "w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/60"
const ghost = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition"

interface ClassData {
  id: string
  name: string
  parentClassId?: string
}

interface BooksResponse {
  books: ClassBook[]
  classes: ClassData[]
  progress: ClassBookProgress
  characterProgress?: CampaignClassBooks["progress"]
  characterClasses?: Record<string, string[]>
  characterClassLevels?: Record<string, Record<string, number>>
  deckView?: Record<string, ClassBookDeckView>
  activity?: ClassBookActivity[]
  revision: number
  serverNow?: number
  /** Valores computados no servidor a partir do livro completo; nenhum dado secreto de carta. */
  levelSummary?: Record<string, BookLevelSummary[]>
  /** LP disponível, sempre lido da ficha persistida no servidor. */
  lorePoints?: number
  /** Identificador revelado somente DEPOIS do débito e desbloqueio persistidos. */
  learnedEntryId?: string
  character?: { id: string; name: string; resources?: unknown; customModifiers?: unknown }
}

async function call(campaignId: string, payload?: Record<string, unknown>, characterId?: string): Promise<BooksResponse & { success?: boolean }> {
  const url = `/api/campaigns/${encodeURIComponent(campaignId)}/class-books${characterId ? `?characterId=${encodeURIComponent(characterId)}` : ""}`
  const response = await fetch(url, payload ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  } : { cache: "no-store" })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Erro ao carregar o grimório.")
  return data
}

const checkTargets = [
  { value: "all", label: "Todos os testes" },
  { value: "mig", label: "Vigor (MIG)" },
  { value: "dex", label: "Destreza (DEX)" },
  { value: "ins", label: "Intuição (INS)" },
  { value: "wlp", label: "Vontade (WLP)" },
  ...PRESET_CHECKS.map(check => ({ value: check.name, label: `Apenas: ${check.name}` })),
]
const bonusTargetName = (target: string) => checkTargets.find(c => c.value === target)?.label || target

function blankEntry(): ClassBookEntry {
  return { id: id("card"), name: "Nova criação", description: "", published: false, tier: 1, requiredClassLevel: 1, rarity: "Comum", materials: [], tags: [], checkBonuses: [] }
}

function blankBook(classId: string, kind: BookKind): ClassBook {
  return { id: id("book"), classId, kind, name: kind === "spellbook" ? "Novo Grimório" : "Livro de Projetos", description: "", unlockMode: "all", playMode: kind === "spellbook" ? "deck" : "gallery", cooldownSeconds: kind === "spellbook" ? 60 : null, handLimit: 7, entries: [], updatedAt: Date.now() }
}

function BookCard({ entry, kind, onClick, selected = false, disabled = false, player = false }: {
  entry: ClassBookEntry
  kind: BookKind
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  player?: boolean
}) {
  const blueprints = kind === "blueprints"
  if (player) return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      whileHover={{ y: -4 }}
      whileTap={{ scale: .985 }}
      transition={{ duration: .18 }}
      className={`group relative flex min-h-[385px] w-full min-w-0 flex-col overflow-hidden rounded-[22px] border text-left text-card-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? "border-accent ring-2 ring-accent/30 bg-card" : "border-border/80 bg-card hover:border-accent/50 hover:shadow-lg"} ${disabled ? "opacity-60" : ""}`}
    >
      <div className="h-1.5 shrink-0 bg-accent" />
      <div className="flex min-h-[92px] items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[.22em] text-accent">{entry.kind || (blueprints ? "Projeto" : "Arcana")}</p>
          <h3 className="line-clamp-2 text-xl font-black uppercase leading-[1.05] tracking-tight text-foreground sm:text-[22px]">{entry.name}</h3>
        </div>
        <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border border-accent/35 bg-accent/10 text-accent">
          <span className="text-[8px] font-black uppercase tracking-wide">Nível</span>
          <span className="text-xl font-black leading-5">{entry.requiredClassLevel ?? 1}</span>
        </div>
      </div>
      <div className="relative mx-3 flex h-[185px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-foreground/[0.035]">
        {entry.imageUrl ? <img src={entry.imageUrl} alt={`Ilustração de ${entry.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.045]" /> : <div className="relative flex size-full items-center justify-center overflow-hidden">
          <div aria-hidden="true" className="absolute -left-10 -top-14 size-44 rounded-full border-[30px] border-accent/10" />
          <div aria-hidden="true" className="absolute -bottom-16 -right-12 size-48 rounded-full border-[28px] border-foreground/5" />
          <div className="flex size-24 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent"><span className="font-serif text-7xl font-black leading-none">{blueprints ? "⚒" : "✦"}</span></div>
        </div>}
        <span className="absolute bottom-3 left-3 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground backdrop-blur-md">{entry.rarity || "Comum"}</span>
        {selected && <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg"><Check size={17}/></span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-4">
        <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{entry.description || "Uma criação ainda sem descrição."}</p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
          <span className="text-xs font-semibold text-foreground">{entry.cost ? `${entry.cost.amount} ${entry.cost.resource.toUpperCase()}` : "Sem custo"}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent">{selected ? "Selecionada" : "Ver carta"}<ChevronRight size={14}/></span>
        </div>
      </div>
    </motion.button>
  )
  return <motion.button type="button" layout whileHover={{ y: -7, rotateY: 3, scale: 1.025 }} whileTap={{ scale: 0.98 }}
    onClick={onClick} disabled={disabled}
    className={`group relative isolate flex h-[304px] w-[214px] shrink-0 flex-col overflow-hidden rounded-[17px] border-[5px] text-left shadow-2xl transition-all ${selected ? "border-yellow-300 ring-2 ring-yellow-400/50" : blueprints ? "border-amber-950 bg-amber-950" : "border-indigo-950 bg-indigo-950"} ${disabled ? "opacity-60" : ""}`}
    style={{ background: blueprints ? "linear-gradient(140deg,#31251b,#090909 75%)" : "linear-gradient(145deg,#2f245e,#100f22 65%,#050508)" }}>
    <div className="flex justify-between items-center gap-2 bg-black/45 px-2 py-1.5 text-[11px] font-bold text-white">
      <span className="line-clamp-1">{entry.name}</span>
      <span className="rounded-full border border-white/20 px-1.5 text-[9px]">{entry.cost?.amount ?? (entry.tier ?? 1)}</span>
    </div>
    <div className="relative h-32 border-y-2 border-white/20 bg-gradient-to-br from-indigo-700/30 via-zinc-900 to-amber-900/30">
      {entry.imageUrl ? <img src={entry.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-white/30">{blueprints ? <Hammer size={58} /> : <WandSparkles size={58} />}</div>}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/40" />
    </div>
    <div className="flex justify-between border-b border-white/15 bg-black/30 px-2 py-1 text-[10px] text-white/80">
      <span>{entry.kind || (blueprints ? "Projeto" : "Feitiço")}</span><span>{entry.rarity || "Comum"}</span>
    </div>
    <div className="flex-1 overflow-hidden px-2 py-2 text-[10px] leading-relaxed text-zinc-100">
      <p className="line-clamp-5 whitespace-pre-wrap">{entry.description || "Os detalhes desta criação ainda não foram escritos."}</p>
      {entry.effects && <p className="mt-2 line-clamp-2 border-t border-white/20 pt-1 italic text-amber-200">{entry.effects}</p>}
      {entry.materials && entry.materials.length > 0 && <p className="mt-1 line-clamp-2 text-amber-300">{entry.materials.map(m => `${m.amount}× ${m.name}`).join(" · ")}</p>}
    </div>
    <div className="flex justify-between bg-black/50 px-2 py-1 text-[9px] text-white/60"><span>Classe Nv. {entry.requiredClassLevel ?? 1} · Carta Nv. {entry.tier ?? 1}</span><span>{entry.cost ? `${entry.cost.amount} ${entry.cost.resource.toUpperCase()}` : "Sem custo"}</span></div>
    <div className="pointer-events-none absolute -inset-12 -translate-x-full rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
  </motion.button>
}

export function ClassBooksWorkbench({ campaignId, characters, refreshToken = 0 }: { campaignId: string; characters: { id: string; name: string }[]; refreshToken?: number }) {
  const [data, setData] = useState<BooksResponse | null>(null)
  const [draft, setDraft] = useState<ClassBook | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const [characterId, setCharacterId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const reload = useCallback(async () => { const next = await call(campaignId); setData(next); return next }, [campaignId])
  useEffect(() => { let mounted = true; void call(campaignId).then(res => { if (mounted) setData(res) }).catch(e => { if (mounted) setError(e.message) }); return () => { mounted = false } }, [campaignId, refreshToken])
  const update = (patch: Partial<ClassBook>) => setDraft(prev => prev ? { ...prev, ...patch } : prev)
  const editEntry = (entryId: string, patch: Partial<ClassBookEntry>) => setDraft(prev => prev ? { ...prev, entries: prev.entries.map(e => e.id === entryId ? { ...e, ...patch } : e) } : prev)
  const entry = draft?.entries.find(e => e.id === selectedEntry)
  const selectedCharacter = characters.find(c => c.id === characterId)
  const selectedClassLevel = (book: ClassBook) =>
    data?.characterClassLevels?.[characterId]?.[book.classId] ?? 0
  const getAssigned = (book: ClassBook, card: ClassBookEntry) => {
    if (!selectedCharacter || !card.published) return false
    const progress = data?.characterProgress?.[characterId]
    if ((progress?.denied?.[book.id] || []).includes(card.id)) return false
    if ((progress?.granted?.[book.id] || []).includes(card.id)) return true
    const ids = data?.characterClasses?.[characterId] || []
    const subclasses = progress?.subclassIds || []
    return book.unlockMode === "all" && [...ids, ...subclasses].includes(book.classId)
  }
  const mutate = async (payload: Record<string, unknown>) => {
    setSaving(true); setError("")
    try { await call(campaignId, payload); await reload(); return true }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); return false }
    finally { setSaving(false) }
  }
  const save = async () => {
    if (!data || !draft) return
    if (await mutate({ action: "save-book", revision: data.revision, book: draft })) setDraft(null)
  }
  const publishEntry = async (published: boolean) => {
    if (!data || !draft || !entry) return
    const next = { ...draft, entries: draft.entries.map(card => card.id === entry.id ? { ...card, published } : card) }
    if (await mutate({ action: "save-book", revision: data.revision, book: next })) {
      setDraft(next)
      setSelectedEntry(entry.id)
    }
  }
  const assignAll = async (bookId: string, granting: boolean) => {
    if (!characterId) return
    await mutate({ action: granting ? "grant-all" : "revoke-all", characterId, bookId })
  }
  return <div className="space-y-4 rounded-2xl border border-violet-500/25 bg-violet-950/10 p-4 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-violet-300" /> Biblioteca de Mecânicas</h3>
        <p className="text-xs text-zinc-400">Associe grimórios e projetos a qualquer classe ou subclasse. Conteúdo inicialmente vazio.</p></div>
      <button className={ghost} onClick={() => void reload()} type="button">Atualizar livros</button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">{error}</p>}
    {!data ? <p className="flex items-center gap-2 text-xs text-zinc-300"><Loader2 className="animate-spin" size={14} /> Carregando...</p> : <>
      <div className="flex flex-wrap gap-2">
        {data.books.map(book => <button key={book.id} type="button" className={`${ghost} ${draft?.id === book.id ? "border-amber-400/60 text-amber-300" : ""}`} onClick={() => { setDraft(structuredClone(book)); setSelectedEntry(null) }}>{book.kind === "spellbook" ? "✦" : "⚒"} {book.name}</button>)}
        {data.books.length === 0 && <p className="text-xs text-zinc-400">Nenhuma mecânica criada ainda.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={ghost} disabled={!data.classes.length} onClick={() => { setDraft(blankBook(data.classes[0].id, "spellbook")); setSelectedEntry(null) }}><Plus size={13} className="inline" /> Criar Grimório</button>
        <button className={ghost} disabled={!data.classes.length} onClick={() => { setDraft(blankBook(data.classes[0].id, "blueprints")); setSelectedEntry(null) }}><Plus size={13} className="inline" /> Criar Blueprints</button>
      </div>
      {draft && <div className="space-y-4 rounded-xl border border-white/15 bg-black/40 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs">Nome do livro<input className={field} value={draft.name} maxLength={140} onChange={e => update({ name: e.target.value })} /></label>
          <label className="text-xs">Classe / Subclasse<select className={field} value={draft.classId} onChange={e => update({ classId: e.target.value })}>
            {data.classes.map(c => <option key={c.id} value={c.id}>{c.parentClassId ? "↳ " : ""}{c.name}</option>)}</select></label>
          <label className="text-xs">Acesso às cartas<select className={field} value={draft.unlockMode} onChange={e => update({ unlockMode: e.target.value as ClassBook["unlockMode"] })}>
            <option value="all">Automático — todas as cartas publicadas são liberadas</option>
            <option value="grant">Manual — cada carta é atribuída pelo Mestre</option>
            {draft.kind === "spellbook" && <option value="learn">Aprendizado — gastar 1 LP para descobrir uma carta aleatória</option>}
          </select>
            <span className="mt-1 block text-[11px] text-amber-200">{draft.unlockMode === "grant"
              ? "Modo manual: publicar não libera a carta. O Mestre escolhe quais personagens a recebem."
              : draft.unlockMode === "learn"
                ? "O jogador gasta 1 LP para aprender uma carta publicada, ainda desconhecida e de nível permitido. Não vê as cartas bloqueadas. Atribuições do Mestre continuam válidas."
                : "Modo automático: cartas publicadas e de nível permitido entram no baralho da classe. Revogações individuais continuam valendo."}</span></label>
          {draft.kind === "spellbook" && <>
            <label className="text-xs">Modo do grimório<select className={field} value={draft.playMode || "deck"} onChange={e => update({ playMode: e.target.value as "deck" | "gallery" })}><option value="deck">Deck — comprar, usar, descartar</option><option value="gallery">Grimório — todas as cartas visíveis</option></select></label>
            <label className="text-xs">Máximo de cartas na mão<input className={field} type="number" min={1} max={20} value={draft.handLimit ?? 7} onChange={e => update({ handLimit: Number(e.target.value) })} /></label>
            <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-950/10 p-3 text-xs md:col-span-2">
              <p className="font-bold text-amber-200">Recarga do grimório</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.cooldownSeconds != null} onChange={e => update({ cooldownSeconds: e.target.checked ? 60 : null })} /> Ativar cooldown quando o ciclo de cartas acabar</label>
              {draft.cooldownSeconds != null && <label className="flex flex-wrap items-center gap-2">Tempo de recarga (minutos)
                <input className={`${field} w-24`} type="number" min={1} max={120} step={1} value={draft.cooldownSeconds / 60} onChange={e => update({ cooldownSeconds: Number(e.target.value) * 60 })} />
                <span className="text-zinc-400">1 a 120 min; o jogador reinicia após o término.</span>
              </label>}
              {draft.cooldownSeconds == null && <label className="flex items-center gap-2"><input type="checkbox" checked={draft.allowPlayerReset === true} onChange={e => update({ allowPlayerReset: e.target.checked })} /> Permitir reinício manual pelo jogador (modo sem cooldown)</label>}
              <p className="text-zinc-400">A recarga começa após jogar a última carta da mão quando o monte também estiver vazio. O servidor bloqueia o reinício antecipado, inclusive para o Mestre.</p>
            </div>
          </>}
          <label className="text-xs">URL da capa<input className={field} value={draft.coverUrl || ""} onChange={e => update({ coverUrl: e.target.value })} /></label>
          <label className="text-xs md:col-span-2">Descrição<textarea className={field} rows={2} value={draft.description} onChange={e => update({ description: e.target.value })} /></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-widest text-amber-400">{draft.kind === "spellbook" ? "Cartas do grimório" : "Projetos do livro"}</p>
          <button className={ghost} onClick={() => { const newEntry = blankEntry(); update({ entries: [...draft.entries, newEntry] }); setSelectedEntry(newEntry.id) }}><Plus size={13} className="inline" /> Nova carta</button></div>
        <div className="flex gap-3 overflow-x-auto py-3">{draft.entries.map(e => <BookCard key={e.id} entry={e} kind={draft.kind} selected={selectedEntry === e.id} onClick={() => setSelectedEntry(e.id)} />)}</div>
        {entry && <div className="space-y-3 rounded-xl border border-amber-500/25 p-3">
          <div className="flex justify-between"><h4 className="text-xs font-bold text-amber-400">Editor de Carta / Projeto</h4><button className="text-red-400" onClick={() => { update({ entries: draft.entries.filter(e => e.id !== entry.id) }); setSelectedEntry(null) }} title="Excluir carta"><Trash2 size={16} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">Título<input className={field} value={entry.name} onChange={e => editEntry(entry.id, { name: e.target.value })} /></label>
            <label className="text-xs">Imagem (URL)<input className={field} value={entry.imageUrl || ""} onChange={e => editEntry(entry.id, { imageUrl: e.target.value })} /></label>
            <label className="text-xs">Tipo / Escola<input className={field} value={entry.kind || ""} onChange={e => editEntry(entry.id, { kind: e.target.value })} /></label>
            <label className="text-xs">Raridade<input className={field} value={entry.rarity || ""} onChange={e => editEntry(entry.id, { rarity: e.target.value })} /></label>
            <label className="text-xs">Nível da carta<input type="number" min={1} max={30} className={field} value={entry.tier ?? 1} onChange={e => editEntry(entry.id, { tier: Number(e.target.value) })} /></label>
             <label className="text-xs">Nível mínimo da classe vinculada<input aria-label="Nível exigido da classe" type="number" min={1} max={30} step={1} className={field} value={entry.requiredClassLevel ?? 1} onChange={e => editEntry(entry.id, { requiredClassLevel: Number(e.target.value) })} /><span className="mt-1 block text-[11px] text-amber-200">A partir deste nível da classe, a carta pode ser vista e utilizada, desde que tenha sido liberada.</span></label>
            {draft.kind === "spellbook" && <label className="text-xs">Cópias no deck<input type="number" min={1} max={4} className={field} value={entry.copies ?? 1} onChange={e => editEntry(entry.id, { copies: Number(e.target.value) })} /></label>}
            <label className="text-xs">Custo<select className={field} value={entry.cost?.resource || "none"} onChange={e => editEntry(entry.id, { cost: e.target.value === "none" ? undefined : { resource: e.target.value as "mp" | "hp", amount: entry.cost?.amount ?? 0 } })}><option value="none">Sem custo</option><option value="mp">PM</option><option value="hp">PV</option></select></label>
            {entry.cost && <label className="text-xs">Quantidade de custo<input className={field} type="number" min={0} value={entry.cost.amount} onChange={e => editEntry(entry.id, { cost: { ...entry.cost!, amount: Number(e.target.value) } })} /></label>}
            <label className="text-xs">Tags (separadas por vírgula)<input className={field} value={(entry.tags || []).join(", ")} onChange={e => editEntry(entry.id, { tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} /></label>
            <label className="text-xs sm:col-span-2">Descrição<textarea className={field} rows={3} value={entry.description} onChange={e => editEntry(entry.id, { description: e.target.value })} /></label>
            <label className="text-xs sm:col-span-2">Efeitos / Regras<textarea className={field} rows={3} value={entry.effects || ""} onChange={e => editEntry(entry.id, { effects: e.target.value })} /></label>
            {draft.kind === "blueprints" && <>
              <label className="text-xs">Tempo de construção<input className={field} value={entry.craftingTime || ""} onChange={e => editEntry(entry.id, { craftingTime: e.target.value })} /></label>
              <label className="text-xs">Resultado da criação<input className={field} value={entry.result || ""} onChange={e => editEntry(entry.id, { result: e.target.value })} /></label>
              <div className="sm:col-span-2 space-y-2 text-xs">Materiais necessários
                {(entry.materials || []).map((material, idx) => <div key={idx} className="flex gap-2"><input className={field} value={material.name} placeholder="Material" onChange={e => editEntry(entry.id, { materials: (entry.materials || []).map((m, i) => i === idx ? { ...m, name: e.target.value } : m) })} /><input className="w-20 rounded border border-white/15 bg-black/50 px-2" type="number" min={1} value={material.amount} onChange={e => editEntry(entry.id, { materials: (entry.materials || []).map((m, i) => i === idx ? { ...m, amount: Number(e.target.value) } : m) })} /><button onClick={() => editEntry(entry.id, { materials: (entry.materials || []).filter((_, i) => i !== idx) })}>✕</button></div>)}
                <button className={ghost} onClick={() => editEntry(entry.id, { materials: [...(entry.materials || []), { name: "", amount: 1 }] })}>+ Material</button>
              </div>
            </>}
            {draft.kind === "spellbook" && <div className="sm:col-span-2 space-y-3 rounded-xl border border-violet-400/25 bg-violet-950/10 p-3">
              <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold text-violet-200">Bônus automáticos nas rolagens</p><p className="text-[11px] text-zinc-400">Ativados após conjurar e descontar PV/PM. Bônus temporários expiram sozinhos; repetir a carta renova a duração sem acumular.</p></div>
                <button type="button" className={ghost} disabled={(entry.checkBonuses?.length ?? 0) >= 12} onClick={() => editEntry(entry.id, { checkBonuses: [...(entry.checkBonuses || []), { target: "all", value: 1 }] })}><Plus size={13} className="inline" /> Bônus</button></div>
              {(entry.checkBonuses || []).map((bonus, index) => <div className="flex flex-wrap items-center gap-2" key={`${index}-${bonus.target}`}>
                <select className={`${field} min-w-[190px] flex-1`} aria-label={`Alvo do bônus ${index + 1}`} value={bonus.target} onChange={e => editEntry(entry.id, { checkBonuses: (entry.checkBonuses || []).map((b, i) => i === index ? { ...b, target: e.target.value } : b) })}>
                  {checkTargets.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs">+ <input className={`${field} w-20`} aria-label={`Valor do bônus ${index + 1}`} type="number" min={1} max={50} step={1} value={bonus.value} onChange={e => editEntry(entry.id, { checkBonuses: (entry.checkBonuses || []).map((b, i) => i === index ? { ...b, value: Number(e.target.value) } : b) })} /></label>
                <button type="button" className="rounded border border-red-500/30 px-2 py-2 text-red-300" aria-label="Remover bônus" onClick={() => editEntry(entry.id, { checkBonuses: (entry.checkBonuses || []).filter((_, i) => i !== index) })}><Trash2 size={14}/></button>
              </div>)}
              <div className="rounded-lg border border-violet-500/20 p-2 text-xs">
                <label className="flex flex-wrap items-center gap-2">Duração dos bônus
                  <select className={`${field} w-44`} value={entry.bonusDurationSeconds == null ? "unlimited" : "timed"} onChange={e => editEntry(entry.id, { bonusDurationSeconds: e.target.value === "timed" ? 60 : null })}>
                    <option value="unlimited">Ilimitado</option><option value="timed">Temporário</option>
                  </select>
                </label>
                {entry.bonusDurationSeconds != null && <label className="mt-2 flex items-center gap-2">Segundos
                  <input type="number" className={`${field} w-24`} min={10} max={600} step={1} value={entry.bonusDurationSeconds} onChange={e => editEntry(entry.id, { bonusDurationSeconds: Number(e.target.value) })} />
                  <span className="text-zinc-400">10 segundos a 10 minutos</span>
                </label>}
              </div>
              {!!entry.checkBonuses?.length && <p className="text-[11px] text-amber-200">{entry.checkBonuses.map(b => `+${b.value} ${bonusTargetName(b.target)}`).join(" · ")}</p>}
            </div>}
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-white/15 bg-black/30 p-3">
              <span className={`rounded px-2 py-1 text-xs font-bold ${entry.published ? "bg-emerald-900/50 text-emerald-200" : "bg-amber-950 text-amber-200"}`}>{entry.published ? "PUBLICADA" : "RASCUNHO"}</span>
              <button type="button" disabled={saving || entry.published} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" onClick={() => void publishEntry(true)}>Publicar carta agora</button>
              <button type="button" disabled={saving || !entry.published} className={ghost} onClick={() => void publishEntry(false)}>Voltar para rascunho</button>
              <p className="w-full text-[11px] text-zinc-400">{draft.unlockMode === "grant"
                ? "Publicar prepara a carta, mas somente o Mestre poderá atribuí-la."
                : draft.unlockMode === "learn"
                  ? "Publicar coloca a carta no conjunto de descobertas possíveis. O jogador não a vê até aprender gastando 1 LP; o Mestre também pode atribuí-la."
                  : "Publicar libera automaticamente a carta para personagens da classe que atingiram o nível mínimo."} Rascunhos nunca podem ser conjurados.</p>
            </div>
          </div>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
          <div className="flex gap-2"><button disabled={saving} className={ghost} onClick={() => { setDraft(null); setSelectedEntry(null) }}>Cancelar</button>
            {data.books.some(b => b.id === draft.id) && <button disabled={saving} className="rounded-lg border border-red-500/35 px-3 py-2 text-xs text-red-300" onClick={() => { if (window.confirm(`Excluir ${draft.name} e todos os seus projetos?`)) void mutate({ action: "delete-book", bookId: draft.id, revision: data.revision }).then(ok => { if (ok) setDraft(null) }) }}><Trash2 size={13} className="inline" /> Excluir</button>}</div>
          <button disabled={saving} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-black disabled:opacity-60" onClick={() => void save()}><Save size={14} className="mr-1 inline" /> {saving ? "Salvando..." : "Salvar no MongoDB"}</button>
        </div>
      </div>}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <h4 className="text-xs font-bold text-amber-300">Solicitações de fabricação</h4>
        {(data.activity || []).filter(a => a.action === "craft-request" && a.status === "pending").length === 0 && <p className="text-xs text-zinc-500">Nenhum projeto aguardando aprovação.</p>}
        {(data.activity || []).filter(a => a.action === "craft-request" && a.status === "pending").map(a => {
          const book = data.books.find(b => b.id === a.bookId)
          const entry = book?.entries.find(e => e.id === a.entryId)
          return <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/40 p-2 text-xs"><span className="flex-1">{characters.find(c => c.id === a.characterId)?.name || "Viajante"} pediu {entry?.name || "projeto"}</span>
            <button className={ghost} disabled={saving} onClick={() => void mutate({ action: "resolve-craft", activityId: a.id, status: "approved" })}>Aprovar</button>
            <button className={ghost} disabled={saving} onClick={() => void mutate({ action: "resolve-craft", activityId: a.id, status: "rejected" })}>Recusar</button></div>
        })}
      </div>
       <div className="space-y-3 border-t border-white/10 pt-4">
         <h4 className="flex items-center gap-2 text-sm font-bold text-violet-200"><LockKeyhole size={16} /> Atribuir e revogar cartas dos jogadores</h4>
         <p className="text-xs text-zinc-400">Selecione qualquer viajante da campanha. A atribuição fica salva no MongoDB e pode ser revertida imediatamente. Publicação e atribuição são controles independentes.</p>
         <select className={field} aria-label="Personagem para atribuir cartas" value={characterId} onChange={e => setCharacterId(e.target.value)}>
           <option value="">Selecione um personagem</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
         </select>
         {characterId && data.books.map(book => {
           const published = book.entries.filter(card => card.published)
           const assigned = published.filter(card => getAssigned(book, card)).length
           return <section key={book.id} className="rounded-xl border border-white/15 bg-black/30 p-3">
             <div className="flex flex-wrap items-center justify-between gap-2">
               <div><p className="text-sm font-bold text-amber-200">{book.name}</p>
                 <p className="text-[11px] text-zinc-400">{data.classes.find(c => c.id === book.classId)?.name || book.classId} · {book.unlockMode === "all" ? "Liberação automática da classe" : book.unlockMode === "learn" ? "Aprendizado (1 LP por carta)" : "Liberação manual"} · {assigned}/{published.length} acessíveis</p>
               </div>
               <div className="flex gap-2"><button type="button" disabled={saving || !published.length} className={ghost} onClick={() => void assignAll(book.id, true)}>Atribuir todas</button>
                 <button type="button" disabled={saving || !published.length} className={ghost} onClick={() => void assignAll(book.id, false)}>Revogar todas</button></div>
             </div>
             {!book.entries.length && <p className="mt-3 text-xs text-zinc-500">Nenhuma carta cadastrada.</p>}
             <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{book.entries.map(card => {
               const granted = getAssigned(book, card)
               return <div key={card.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-2">
                 <div className="min-w-0"><p className="truncate text-xs font-semibold" title={card.name}>{card.name}</p>
                   <span className={`text-[10px] ${!card.published ? "text-zinc-500" : granted ? "text-emerald-300" : "text-amber-300"}`}>{!card.published ? "Rascunho — não atribuível" : granted ? "Atribuída" : "Não atribuída"}</span>
                    {card.published && <p className="text-[10px] text-zinc-400">Exige Nv. {card.requiredClassLevel ?? 1} de {data.classes.find(c => c.id === book.classId)?.name || "classe"} · personagem Nv. {selectedClassLevel(book)}{selectedClassLevel(book) < (card.requiredClassLevel ?? 1) ? " · bloqueada por nível" : ""}</p>}</div>
                 <button type="button" disabled={saving || !card.published} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${granted ? "border-red-400/40 text-red-200 hover:bg-red-900/30" : "border-emerald-400/40 text-emerald-200 hover:bg-emerald-900/30"}`}
                   onClick={() => void mutate({ action: granted ? "revoke" : "grant", characterId, bookId: book.id, entryId: card.id })}>
                   {granted ? "Revogar" : "Atribuir"}
                 </button>
               </div>
             })}</div>
           </section>
         })}
         {characterId && data.books.length === 0 && <p className="text-xs text-zinc-400">Crie um grimório antes de atribuir cartas.</p>}
       </div>
    </>}
  </div>
}

export function CharacterBookShelf({ campaignId, character, isGm = false, refreshToken = 0, onCharacterUpdated }: {
  campaignId: string
  character: { id: string; name: string; classes?: unknown; ownerId?: string }
  isGm?: boolean
  refreshToken?: number
  onCharacterUpdated?: (character: any) => void
}) {
  const [data, setData] = useState<BooksResponse | null>(null)
  const [open, setOpen] = useState(false)
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const [bookId, setBookId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [lastPlay, setLastPlay] = useState<string | null>(null)
  const [newlyLearned, setNewlyLearned] = useState<{ bookId: string; entryId: string } | null>(null)
  // Reutiliza o mesmo id na retransmissão se houver falha de rede.
  const pendingLearningIds = useRef<Record<string, string>>({})
  const [clock, setClock] = useState(0)
  useEffect(() => {
    setClock(Date.now())
    const interval = window.setInterval(() => setClock(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [])
  // Mesma chave idempotente ao repetir uma tentativa após falha de rede.
  const pendingCastIds = useRef<Record<string, string>>({})
  const load = useCallback(async () => {
    const response = await call(campaignId, undefined, character.id)
    setData(response)
  }, [campaignId, character.id])
  // Se a classe evoluir enquanto o grimório está aberto, consulte novamente a API.
  const characterLevelSignature = JSON.stringify(character.classes ?? [])
  useEffect(() => { void load().catch(error => setError(error instanceof Error ? error.message : "Falha ao atualizar cartas.")) }, [load, refreshToken, characterLevelSignature])
  // Reabrir o grimório sempre consulta as permissões mais recentes.
  useEffect(() => { if (open) void load().catch(error => setError(error instanceof Error ? error.message : "Falha ao atualizar cartas.")) }, [open, load])
  const books = useMemo(() => data?.books || [], [data])
  const activeBook = books.find(b => b.id === bookId) || books[0]
  const progress = data?.progress
  const activeDeck = activeBook ? data?.deckView?.[activeBook.id] : undefined
  const isDeck = activeBook?.kind === "spellbook" && activeBook.playMode !== "gallery"
  const accessibleCopies = activeBook?.entries.reduce((total, card) => total + (card.copies ?? 1), 0) ?? 0
  const drawCount = activeDeck?.drawCount ?? accessibleCopies
  const eligibleCards = activeBook?.entries.length ?? 0
  const eligibleClassLevel = activeBook ? data?.characterClassLevels?.[character.id]?.[activeBook.classId] : undefined
  const levelSummary = activeBook ? (data?.levelSummary?.[activeBook.id] ?? []) : []
  const availableToLearn = levelSummary.reduce((total, group) => total + group.available, 0)
  const lorePoints = data?.lorePoints
  const learnedCard = newlyLearned && activeBook?.id === newlyLearned.bookId
    ? activeBook.entries.find(card => card.id === newlyLearned.entryId) : undefined
  const noAccessibleCards = isDeck && accessibleCopies === 0
  const hasCooldown = activeBook?.cooldownSeconds != null
  const cooldownEndsAt = activeDeck?.cooldownUntil || 0
  const cooldownRunning = hasCooldown && clock > 0 && cooldownEndsAt > clock
  const cycleExhausted = isDeck && drawCount === 0 && (activeDeck?.hand.length ?? 0) === 0
  const canRestart = !hasCooldown
    ? (isGm || activeBook?.allowPlayerReset === true)
    : Boolean(cycleExhausted && cooldownEndsAt > 0 && !cooldownRunning)
  const visibleCards = activeBook ? (isDeck
    ? (activeDeck?.hand || []).map(entryId => activeBook.entries.find(e => e.id === entryId)).filter((e): e is ClassBookEntry => !!e)
    : activeBook.entries) : []
  const selectedCard = visibleCards.find(entry => entry.id === selected)
  // O portal impede que transformações/overflow da ficha e da sala recortem o grimório.
  // O travamento de rolagem é removido ao fechar ou desmontar o componente.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== "Tab" || !modalRef.current) return
      const items = [...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getClientRects().length > 0)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
      triggerButtonRef.current?.focus()
    }
  }, [open])
  const subclasses = data?.classes.filter(c => c.parentClassId && characterClassIds(character).includes(c.parentClassId)) || []
  const useEntry = async (entry: ClassBookEntry) => {
    if (!activeBook || busy) return
    setBusy(true); setError("")
    const actionKey = `${character.id}:${activeBook.id}:${entry.id}`
    const requestId = pendingCastIds.current[actionKey] || id("play")
    pendingCastIds.current[actionKey] = requestId
    try {
      const result = await call(campaignId, { action: "use-entry", bookId: activeBook.id, entryId: entry.id, characterId: character.id, requestId })
      delete pendingCastIds.current[actionKey]
      if (result.character) onCharacterUpdated?.(result.character)
      setLastPlay(entry.id)
      // Uma falha de GET após conjurar não deve levar a novo débito.
      try { await load() }
      catch { setError("Carta utilizada com sucesso, mas a biblioteca não pôde ser atualizada. Reabra o grimório para conferir.") }
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível utilizar a carta.") }
    finally { setBusy(false) }
  }
  const learnCard = async () => {
    if (!activeBook || activeBook.kind !== "spellbook" || activeBook.unlockMode !== "learn" || busy ||
        !Number.isSafeInteger(lorePoints) || (lorePoints ?? 0) < 1 || availableToLearn < 1) return
    if (!window.confirm("Gastar 1 Ponto de Lore (LP) para aprender uma carta aleatória deste grimório?")) return
    setBusy(true); setError("")
    const bookKey = activeBook.id
    const requestId = pendingLearningIds.current[bookKey] || id("learn")
    pendingLearningIds.current[bookKey] = requestId
    try {
      const result = await call(campaignId, {
        action: "learn-card", characterId: character.id, bookId: bookKey, requestId,
      })
      // O resultado somente é confirmado após débito de LP + liberação no servidor.
      delete pendingLearningIds.current[bookKey]
      if (result.character) onCharacterUpdated?.(result.character)
      if (result.learnedEntryId) setNewlyLearned({ bookId: bookKey, entryId: result.learnedEntryId })
      try { await load() }
      catch { setError("Aprendizado confirmado, mas a lista não foi atualizada. Reabra o grimório.") }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aprender uma carta.")
    } finally { setBusy(false) }
  }
  if (!books.length && !subclasses.length) return null
  return <>
    <button type="button" ref={triggerButtonRef}
      className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/35 bg-accent/10 px-4 py-2.5 text-xs font-bold text-accent shadow-sm transition hover:border-accent/70 hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onClick={() => { setOpen(true); setBookId(books[0]?.id || null) }}>
      <BookOpen size={18} /> {books.some(b => b.kind === "spellbook") ? "Abrir Grimório" : "Abrir Livro de Projetos"}
      <ChevronRight size={16} className="ml-1" />
      {books.length > 1 && <span className="rounded-full border border-accent/25 px-2 py-0.5 text-[10px]">{books.length} livros</span>}
    </button>
    {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Grimório de ${character.name}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: .2 }}
            className="fixed inset-0 z-[2000] isolate flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground"
          >
            {/* CABEÇALHO INDEPENDENTE DA SESSÃO: sempre acessível. */}
            <header className="relative z-30 shrink-0 border-b border-border/80 bg-background shadow-sm">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-accent" />
              <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground sm:size-12"><BookMarked size={23}/></div>
                  <div className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[.24em] text-accent">Acervo pessoal / {character.name}</span>
                    <span className="block truncate text-lg font-black uppercase leading-tight tracking-tight sm:text-2xl">O Grimório</span>
                  </div>
                </div>
                <button type="button" ref={closeButtonRef} onClick={() => setOpen(false)}
                  aria-label="Fechar grimório e voltar à sessão"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-foreground/[0.045] px-3 text-xs font-bold text-foreground transition hover:border-accent/60 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-5">
                  <ArrowLeft size={16} /> <span className="hidden sm:inline">Voltar à sessão</span> <X size={16} className="sm:hidden" />
                </button>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar-sepia">
              <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-12 pt-5 sm:px-8 sm:pt-8 lg:space-y-8">
                {/* Seleção de volumes sempre acima do conteúdo de cada grimório. */}
                {books.length > 0 && <nav aria-label="Seus grimórios" className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar-sepia">
                  {books.map(book => <button type="button" key={book.id}
                    aria-pressed={activeBook?.id === book.id}
                    onClick={() => { setBookId(book.id); setSelected(null); setLastPlay(null); setNewlyLearned(null) }}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeBook?.id === book.id ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-foreground"}`}>
                    {book.kind === "spellbook" ? <WandSparkles size={15}/> : <Hammer size={15}/>} {book.name}
                  </button>)}
                </nav>}
                {subclasses.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-xs font-bold text-muted-foreground">Especialização</p>
                  <div className="flex flex-wrap gap-2">{subclasses.map(sub => <button type="button" key={sub.id} disabled={busy}
                    className={`rounded-full border px-3 py-2 text-xs font-bold transition ${progress?.subclassIds.includes(sub.id) ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-foreground hover:border-accent/40"}`}
                    onClick={async () => { setBusy(true); try { await call(campaignId, { action: "select-subclass", characterId: character.id, subclassId: sub.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Erro na especialização") } finally { setBusy(false) } }}>
                    {sub.name} {progress?.subclassIds.includes(sub.id) && <Check size={13} className="ml-1 inline" />}
                  </button>)}</div>
                </div>}

                {activeBook ? <>
                  {/* Editorial hero com cor dinâmica do tema, sem paleta fixa. */}
                  <section className="relative isolate overflow-hidden rounded-[26px] border border-border/80 bg-card px-5 py-7 sm:px-9 sm:py-10 lg:px-12">
                    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 size-72 rounded-full border-[48px] border-accent/10 sm:size-[440px] sm:border-[72px]" />
                    <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-1 w-1/3 bg-accent" />
                    <div className="relative flex flex-wrap items-end justify-between gap-6">
                      <div className="max-w-[800px] min-w-0">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.22em] text-accent">
                          <span className="size-1.5 rounded-full bg-accent" /> {activeBook.kind === "spellbook" ? "Coleção de Arcanas" : "Coleção de Projetos"}
                        </div>
                        <h1 className="break-words text-4xl font-black uppercase leading-[.95] tracking-[-.045em] text-foreground sm:text-5xl lg:text-[68px]">{activeBook.name}</h1>
                        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">{activeBook.description || "Descubra, organize e utilize as cartas do seu acervo."}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {typeof eligibleClassLevel === "number" && <span className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-bold text-accent">Classe · Nv. {eligibleClassLevel}</span>}
                        {activeBook.kind === "spellbook" && <span className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-foreground">{activeBook.playMode === "gallery" ? "Galeria" : "Deck de magias"}</span>}
                      </div>
                    </div>
                  </section>

                  <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <section className="min-w-0 space-y-5" aria-label="Cartas do grimório">
                      {/* Barra de ações compacta em vez da antiga faixa de texto. */}
                      {isDeck && <div className="rounded-[22px] border border-border bg-card p-4 sm:p-5">
                        <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-4">
                          {[
                            { label: "No monte", amount: drawCount },
                            { label: "Na mão", amount: activeDeck?.hand.length ?? 0 },
                            { label: "Descartadas", amount: activeDeck?.discardPile.length ?? 0 },
                          ].map(stat => <div key={stat.label} className="min-w-0 rounded-xl bg-foreground/[0.035] px-3 py-3 text-center">
                            <p className="text-2xl font-black tabular-nums text-foreground sm:text-3xl">{stat.amount}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                          </div>)}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Layers3 size={15} className="text-accent" /> {eligibleCards} cartas liberadas</span>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={busy || noAccessibleCards || drawCount === 0 || (activeDeck?.hand.length ?? 0) >= (activeBook.handLimit ?? 7)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-black text-accent-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={async () => { setBusy(true); setError(""); try { await call(campaignId, { action: "draw", characterId: character.id, bookId: activeBook.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Não foi possível comprar carta.") } finally { setBusy(false) } }}>
                              <Sparkles size={16}/> Comprar carta <ChevronRight size={15}/>
                            </button>
                            {(isGm || activeBook.allowPlayerReset === true || hasCooldown) && <button type="button" disabled={busy || !canRestart}
                              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground hover:border-accent/40 disabled:opacity-40"
                              onClick={async () => { if (!window.confirm("Reunir a mão e descarte, e embaralhar o deck novamente?")) return; setBusy(true); try { await call(campaignId, { action: "reset-deck", characterId: character.id, bookId: activeBook.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Erro ao embaralhar") } finally { setBusy(false) } }}>
                              <RefreshCw size={14}/> {hasCooldown ? "Reiniciar após recarga" : "Embaralhar / Reiniciar"}
                            </button>}
                          </div>
                        </div>
                        {cooldownRunning && activeDeck?.cooldownStartedAt && <div className="mt-4"><ClassTimerProgress label="Recarga do grimório" startedAt={activeDeck.cooldownStartedAt} endsAt={cooldownEndsAt} /></div>}
                        {hasCooldown && cycleExhausted && !cooldownRunning && cooldownEndsAt > 0 && <p className="mt-3 text-xs font-semibold text-emerald-500">Recarga concluída. Você já pode reiniciar o baralho.</p>}
                      </div>}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">Sua coleção</p><h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-foreground">{isDeck ? "Cartas na mão" : "Cartas disponíveis"}<span className="ml-2 text-lg text-muted-foreground">/ {visibleCards.length}</span></h2></div>
                        {isDeck && <span className="rounded-full border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">Toque para selecionar</span>}
                      </div>
                      {noAccessibleCards && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-xs leading-relaxed text-foreground">
                        {activeBook.unlockMode === "grant" ? "Este grimório usa atribuição manual. O Mestre precisa atribuir cartas publicadas a este personagem." : activeBook.unlockMode === "learn" ? "Você ainda não possui magias liberadas. Use Aprendizado para descobrir uma carta gastando 1 LP, quando houver cartas elegíveis." : "Não há cartas publicadas e liberadas até o nível da sua classe. Confira a publicação e a liberação pelo Mestre."}
                      </p>}
                      {isDeck && accessibleCopies > 0 && cycleExhausted && <p role="status" className="rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">Todas as cartas disponíveis já foram compradas. {hasCooldown ? "Aguarde a recarga para reiniciar." : activeDeck?.discardPile.length ? "Peça ao Mestre para embaralhar o descarte." : "Confira o estado do grimório."}</p>}
                      {visibleCards.length === 0 ? <div className="flex min-h-[250px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-border bg-card/60 px-5 py-10 text-center">
                        <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/10 text-accent"><BookOpen size={30}/></div>
                        <h3 className="text-lg font-black uppercase text-foreground">{noAccessibleCards ? "Ainda não há cartas liberadas" : isDeck ? "Sua mão está vazia" : "Nenhuma carta disponível"}</h3>
                        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{noAccessibleCards ? "Aprenda novas cartas ou aguarde a liberação do Mestre." : isDeck ? "Compre uma carta do monte para começar a conjurar." : "Quando houver cartas liberadas, elas aparecerão aqui."}</p>
                      </div> : <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                        {visibleCards.map((entry, index) => <motion.div key={`${entry.id}-${index}`}
                          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .23, delay: Math.min(index, 7) * .035 }}>
                          <BookCard player entry={entry} kind={activeBook.kind} selected={selected === entry.id} onClick={() => setSelected(selected === entry.id ? null : entry.id)}/>
                        </motion.div>)}
                      </div>}

                      <AnimatePresence>{lastPlay && <motion.div key={lastPlay} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 p-4 text-center text-sm font-bold text-accent"><Sparkles size={18}/> {activeBook.kind === "spellbook" ? "Magia conjurada!" : "Pedido de fabricação registrado!"}</motion.div>}</AnimatePresence>
                      {(data?.activity || []).filter(a => a.action === "craft-request").slice(-5).reverse().map(a => <p key={a.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">Projeto {activeBook.entries.find(e => e.id === a.entryId)?.name || "solicitado"}: {a.status === "approved" ? "aprovado pelo Mestre" : a.status === "rejected" ? "recusado" : "aguardando aprovação"}</p>)}
                    </section>

                    {/* Informação secundária sempre separada das cartas jogáveis. */}
                    <aside className="order-first min-w-0 space-y-4 xl:order-last" aria-label="Informações do grimório">
                      {activeBook.kind === "spellbook" && <section className="overflow-hidden rounded-[22px] border border-border bg-card p-5">
                        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-black uppercase text-foreground"><Layers3 size={17} className="text-accent" /> Cartas por nível</h2><span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-black text-accent">{eligibleClassLevel ?? 0} / 30</span></div>
                        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Veja quantas cartas existem. As que você ainda não conhece permanecem secretas.</p>
                        {data?.levelSummary ? (levelSummary.length ? <div className="space-y-2">
                          {levelSummary.map(group => <div key={group.level} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${group.level <= (eligibleClassLevel ?? 0) ? "border-accent/20 bg-accent/[0.045]" : "border-border bg-background opacity-70"}`}>
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-xs font-black text-foreground">{group.level}</div>
                            <div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground">Nível {group.level}</p><p className="text-[11px] text-muted-foreground">{group.unlocked} descoberta(s)</p></div>
                            <div className="flex items-center gap-1.5">{group.level > (eligibleClassLevel ?? 0) && <LockKeyhole size={13} className="text-muted-foreground"/>}<span className="text-lg font-black tabular-nums text-foreground">{group.total}</span><span className="text-[10px] text-muted-foreground">total</span></div>
                          </div>)}
                        </div> : <p className="text-xs text-muted-foreground">Nenhuma carta publicada neste grimório.</p>) : <p className="text-xs text-muted-foreground">Resumo aguardando dados do servidor.</p>}
                      </section>}

                      {activeBook.kind === "spellbook" && activeBook.unlockMode === "learn" && <section className="rounded-[22px] border border-accent/35 bg-accent/[0.055] p-5" aria-label="Aprendizado de cartas">
                        <div className="mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><GraduationCap size={22}/></div>
                        <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">Aprendizado</h2>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Desbloqueie uma carta aleatória publicada do seu nível ou inferior usando um Ponto de Lore.</p>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-accent/20 bg-background/70 px-3 py-3"><p className="text-2xl font-black tabular-nums text-foreground">{lorePoints ?? "—"}</p><p className="text-[10px] font-semibold text-muted-foreground">Lore disponível</p></div>
                          <div className="rounded-xl border border-accent/20 bg-background/70 px-3 py-3"><p className="text-2xl font-black tabular-nums text-foreground">{data?.levelSummary ? availableToLearn : "—"}</p><p className="text-[10px] font-semibold text-muted-foreground">Por descobrir</p></div>
                        </div>
                        <button type="button" disabled={busy || !data?.levelSummary || !Number.isSafeInteger(lorePoints) || (lorePoints ?? 0) < 1 || availableToLearn === 0}
                          onClick={() => void learnCard()}
                          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-xs font-black text-accent-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40">
                          {busy ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>} Aprender carta · 1 LP
                        </button>
                        {data?.levelSummary && availableToLearn === 0 && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Você já descobriu as cartas disponíveis ou precisa alcançar novos níveis.</p>}
                        {newlyLearned?.bookId === activeBook.id && <div role="status" aria-live="polite" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-foreground"><Check size={16} className="shrink-0 text-emerald-500"/><span><strong>Nova carta aprendida!</strong> {learnedCard ? learnedCard.name : "Consulte a coleção para vê-la."}</span></div>}
                      </section>}
                      <div className="rounded-[22px] border border-border bg-foreground/[0.025] p-5">
                        <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent"><Eye size={16}/> Regras do acervo</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">As cartas são liberadas de acordo com seu nível de classe e permissões. Conjurar uma magia aplica os efeitos configurados pelo Mestre.</p>
                      </div>
                    </aside>
                  </div>
                </> : <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Nenhum livro associado às classes deste personagem.</div>}
                {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">{error}</p>}
              </div>
            </main>

            {/* A ação selecionada é fixa, nunca empurra ou corta os cartões. */}
            {selectedCard && activeBook && <div className="relative z-20 shrink-0 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-8px_26px_rgba(0,0,0,.08)] backdrop-blur-xl sm:px-8">
              <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] font-black uppercase tracking-[.2em] text-accent">Carta selecionada</span>
                  <p className="truncate text-sm font-black text-foreground sm:text-lg">{selectedCard.name}</p>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{selectedCard.effects || selectedCard.description}</p>
                  {!!selectedCard.checkBonuses?.length && <p className="mt-1 line-clamp-1 text-[11px] text-accent">Ao conjurar ({selectedCard.bonusDurationSeconds == null ? "ilimitado" : `${selectedCard.bonusDurationSeconds}s`}): {selectedCard.checkBonuses.map(b => `+${b.value} ${bonusTargetName(b.target)}`).join(" · ")}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setSelected(null)} className="flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-xs font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
                  <button type="button" disabled={busy} onClick={() => void useEntry(selectedCard)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2 text-xs font-black text-accent-foreground hover:brightness-110 disabled:opacity-40">
                    {busy ? <Loader2 size={16} className="animate-spin"/> : <WandSparkles size={16}/>} {activeBook.kind === "spellbook" ? "Conjurar magia" : "Solicitar fabricação"}
                  </button>
                </div>
              </div>
            </div>}
          </motion.div>
        )}
      </AnimatePresence>, document.body,
    )}
  </>
}

/** Revelação compartilhada de conjurações, disparada pelo SSE já existente. */
export function ClassCardReveal({ value }: { value: {
  cardName: string
  cardImage?: string | null
  cardEffects?: string
  casterName: string
} | null }) {
  return typeof document !== "undefined" ? createPortal(<AnimatePresence>
    {value && <motion.div key={`${value.casterName}:${value.cardName}`} aria-live="polite"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-[2200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[3px]">
      <motion.div initial={{ y: 170, scale: .4, rotateY: -120, opacity: 0 }}
        animate={{ y: 0, scale: 1, rotateY: 0, opacity: 1 }}
        exit={{ scale: 1.2, opacity: 0 }} transition={{ type: "spring", damping: 16, stiffness: 115 }}
        className="relative w-[min(80vw,360px)] overflow-hidden rounded-2xl border-[6px] border-indigo-400/80 bg-[#18132f] p-2 text-center shadow-[0_0_90px_rgba(138,92,246,.65)]">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-violet-700/20 via-transparent to-amber-400/20" />
        <p className="relative p-2 text-xs font-bold uppercase tracking-widest text-violet-200">{value.casterName} conjurou</p>
        <h3 className="relative pb-2 font-serif text-xl font-black text-amber-200">{value.cardName}</h3>
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-800 via-indigo-950 to-black">
          {value.cardImage ? <img src={value.cardImage} alt="" className="h-full w-full object-cover" /> : <WandSparkles className="animate-pulse text-violet-200" size={90} />}
        </div>
        {value.cardEffects && <p className="relative line-clamp-3 px-4 py-3 text-xs italic text-zinc-200">{value.cardEffects}</p>}
      </motion.div>
    </motion.div>}
  </AnimatePresence>, document.body) : null
}
