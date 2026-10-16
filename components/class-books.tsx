"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BookOpen, Hammer, Layers3, Plus, Save, Trash2, Sparkles, LockKeyhole, WandSparkles, X, Check, Loader2 } from "lucide-react"
import type { ClassBook, ClassBookEntry, ClassBookProgress, BookKind, CampaignClassBooks, ClassBookDeckView, ClassBookActivity } from "@/lib/class-books"
import { characterClassIds } from "@/lib/class-books"

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
  deckView?: Record<string, ClassBookDeckView>
  activity?: ClassBookActivity[]
  revision: number
}

async function call(campaignId: string, payload?: Record<string, unknown>, characterId?: string): Promise<BooksResponse & { success?: boolean }> {
  // 1. Evita fazer o fetch se o ID da campanha estiver faltando (o que causaria um erro 404)
  if (!campaignId || campaignId === "undefined") {
    throw new Error("ID da campanha inválido ou ausente.");
  }

  const url = `/api/campaigns/${encodeURIComponent(campaignId)}/class-books${characterId ? `?characterId=${encodeURIComponent(characterId)}` : ""}`
  
  const response = await fetch(url, payload ? {
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(payload),
  } : { 
    cache: "no-store" 
  })

  // 2. Verifica o tipo de conteúdo antes de tentar fazer o parse para JSON
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("A API não retornou JSON. Resposta bruta:", text);
    throw new Error(`Erro na API (Status: ${response.status}). A rota pode não existir ou falhou criticamente.`);
  }

  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || "Erro ao carregar o grimório.")
  }
  
  return data
}

function blankEntry(): ClassBookEntry {
  return { id: id("card"), name: "Nova criação", description: "", published: false, tier: 1, rarity: "Comum", materials: [], tags: [] }
}

function blankBook(classId: string, kind: BookKind): ClassBook {
  return { id: id("book"), classId, kind, name: kind === "spellbook" ? "Novo Grimório" : "Livro de Projetos", description: "", unlockMode: "grant", playMode: kind === "spellbook" ? "deck" : "gallery", handLimit: 7, entries: [], updatedAt: Date.now() }
}

function BookCard({ entry, kind, onClick, selected = false, disabled = false }: {
  entry: ClassBookEntry
  kind: BookKind
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
}) {
  const blueprints = kind === "blueprints"
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
    <div className="flex justify-between bg-black/50 px-2 py-1 text-[9px] text-white/60"><span>Nível {entry.tier ?? 1}</span><span>{entry.cost ? `${entry.cost.amount} ${entry.cost.resource.toUpperCase()}` : "Sem custo"}</span></div>
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
            <option value="grant">Mestre libera uma por uma</option><option value="all">Todas as cartas publicadas</option></select></label>
          {draft.kind === "spellbook" && <>
            <label className="text-xs">Modo do grimório<select className={field} value={draft.playMode || "deck"} onChange={e => update({ playMode: e.target.value as "deck" | "gallery" })}><option value="deck">Deck — comprar, usar, descartar</option><option value="gallery">Grimório — todas as cartas visíveis</option></select></label>
            <label className="text-xs">Máximo de cartas na mão<input className={field} type="number" min={1} max={20} value={draft.handLimit ?? 7} onChange={e => update({ handLimit: Number(e.target.value) })} /></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.allowPlayerReset === true} onChange={e => update({ allowPlayerReset: e.target.checked })} /> Jogador pode embaralhar/reiniciar o deck</label>
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
            <label className="text-xs">Nível<input type="number" min={1} max={30} className={field} value={entry.tier ?? 1} onChange={e => editEntry(entry.id, { tier: Number(e.target.value) })} /></label>
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
            <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={entry.published} onChange={e => editEntry(entry.id, { published: e.target.checked })} /> Publicada (rascunhos nunca aparecem para jogadores)</label>
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
      <div className="space-y-2 border-t border-white/10 pt-3">
        <h4 className="flex items-center gap-2 text-xs font-bold text-violet-200"><LockKeyhole size={14} /> Conceder cartas a personagens</h4>
        <select className={field} value={characterId} onChange={e => setCharacterId(e.target.value)}><option value="">Selecione um personagem</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {characterId && data.books.filter(book => book.unlockMode === "grant").map(book => <div key={book.id} className="rounded-lg border border-white/10 p-2"><p className="mb-2 text-xs font-bold">{book.name}</p>
          <div className="flex flex-wrap gap-2">{book.entries.filter(e => e.published).map(entry => {
            const granted = (data.characterProgress?.[characterId]?.granted?.[book.id] || []).includes(entry.id)
            return <button key={entry.id} disabled={saving} className={`${ghost} ${granted ? "border-emerald-400/70 text-emerald-200" : ""}`} onClick={() => void mutate({ action: granted ? "revoke" : "grant", characterId, bookId: book.id, entryId: entry.id })}>{granted ? <Check size={13} className="inline" /> : <Plus size={13} className="inline" />} {entry.name}</button>
          })}</div>
        </div>)}
      </div>
    </>}
  </div>
}

export function CharacterBookShelf({ campaignId, character, isGm = false, refreshToken = 0 }: {
  campaignId: string
  character: { id: string; name: string; classes?: unknown; ownerId?: string }
  isGm?: boolean
  refreshToken?: number
}) {
  const [data, setData] = useState<BooksResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [bookId, setBookId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [lastPlay, setLastPlay] = useState<string | null>(null)
  const load = useCallback(async () => {
    const response = await call(campaignId, undefined, character.id)
    setData(response)
  }, [campaignId, character.id])
  useEffect(() => { void load().catch(() => undefined) }, [load, refreshToken])
  const books = useMemo(() => data?.books || [], [data])
  const activeBook = books.find(b => b.id === bookId) || books[0]
  const progress = data?.progress
  const activeDeck = activeBook ? data?.deckView?.[activeBook.id] : undefined
  const isDeck = activeBook?.kind === "spellbook" && activeBook.playMode !== "gallery"
  const visibleCards = activeBook ? (isDeck
    ? (activeDeck?.hand || []).map(entryId => activeBook.entries.find(e => e.id === entryId)).filter((e): e is ClassBookEntry => !!e)
    : activeBook.entries) : []
  const subclasses = data?.classes.filter(c => c.parentClassId && characterClassIds(character).includes(c.parentClassId)) || []
  const useEntry = async (entry: ClassBookEntry) => {
    if (!activeBook) return
    setBusy(true); setError("")
    try {
      await call(campaignId, { action: "use-entry", bookId: activeBook.id, entryId: entry.id, characterId: character.id, requestId: id("play") })
      setLastPlay(entry.id)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível utilizar a carta.") }
    finally { setBusy(false) }
  }
  if (!books.length && !subclasses.length) return null
  return <>
    <button type="button" className="mb-2 flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-950/30 px-3 py-2 text-xs font-semibold text-violet-100 shadow-lg transition hover:scale-[1.01] hover:bg-violet-900/30" onClick={() => { setOpen(true); setBookId(books[0]?.id || null) }}>
      <BookOpen size={17} className="text-amber-300" /> {books.some(b => b.kind === "spellbook") ? "Abrir Grimório" : "Abrir Livro de Projetos"}
      {books.length > 1 && <span className="rounded-full bg-white/10 px-2">{books.length} livros</span>}
    </button>
    <AnimatePresence>{open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[880] flex items-center justify-center overflow-auto bg-black/90 p-4 backdrop-blur-md" onClick={() => setOpen(false)}>
      <motion.div initial={{ y: 35, scale: .94 }} animate={{ y: 0, scale: 1 }} exit={{ scale: .96, opacity: 0 }} onClick={e => e.stopPropagation()} className="relative max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-amber-700/30 bg-[#0b0b14] p-5 text-white shadow-[0_0_80px_rgba(107,73,194,.19)]">
        <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-lg bg-white/10 p-2"><X size={18} /></button>
        <h2 className="flex items-center gap-3 pr-10 font-serif text-2xl font-bold text-amber-200"><BookOpen size={26} /> Biblioteca de {character.name}</h2>
        <p className="mb-5 mt-1 text-xs text-zinc-400">As cartas conhecidas são liberadas pelo mestre. Magias consomem o recurso configurado; projetos são solicitações de fabricação.</p>
        {subclasses.length > 0 && <div className="mb-5 rounded-xl border border-violet-500/25 bg-violet-950/20 p-3"><p className="mb-2 text-xs font-bold text-violet-200">Escolher subclasse</p>
          <div className="flex flex-wrap gap-2">{subclasses.map(sub => <button key={sub.id} disabled={busy} className={`${ghost} ${progress?.subclassIds.includes(sub.id) ? "border-amber-400 text-amber-300" : ""}`} onClick={async () => { setBusy(true); try { await call(campaignId, { action: "select-subclass", characterId: character.id, subclassId: sub.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Erro na especialização") } finally { setBusy(false) } }}>{sub.name} {progress?.subclassIds.includes(sub.id) && "✓"}</button>)}</div>
        </div>}
        <div className="mb-4 flex flex-wrap gap-2">{books.map(book => <button key={book.id} onClick={() => { setBookId(book.id); setSelected(null); setLastPlay(null) }} className={`${ghost} ${activeBook?.id === book.id ? "border-amber-400 text-amber-200" : ""}`}>{book.kind === "spellbook" ? <WandSparkles size={13} className="mr-1 inline" /> : <Hammer size={13} className="mr-1 inline" />}{book.name}</button>)}</div>
        {activeBook ? <>
          <p className="mb-3 text-sm text-zinc-300">{activeBook.description}</p>
          {isDeck && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-4 py-3">
            <div className="text-xs text-indigo-200"><Layers3 className="mr-2 inline" size={16} /> <strong>{activeDeck?.drawCount ?? activeBook.entries.reduce((sum,e) => sum + (e.copies ?? 1),0)}</strong> no deck · <strong>{activeDeck?.hand.length ?? 0}</strong> na mão · <strong>{activeDeck?.discardPile.length ?? 0}</strong> no descarte</div>
            <button disabled={busy || (activeDeck?.hand.length ?? 0) >= (activeBook.handLimit ?? 7)} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold disabled:opacity-50" onClick={async () => { setBusy(true); setError(""); try { await call(campaignId, { action: "draw", characterId: character.id, bookId: activeBook.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Não foi possível comprar carta.") } finally { setBusy(false) } }}><Sparkles size={14} className="mr-1 inline" /> Comprar carta</button>
            {(isGm || activeBook.allowPlayerReset === true) && <button disabled={busy} className={ghost} onClick={async () => { if (!window.confirm("Reunir a mão e descarte, e embaralhar o deck novamente?")) return; setBusy(true); try { await call(campaignId, { action: "reset-deck", characterId: character.id, bookId: activeBook.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Erro ao embaralhar") } finally { setBusy(false) } }}>Embaralhar / Reiniciar</button>}
          </div>}
          {visibleCards.length === 0 ? <div className="rounded-xl border border-dashed border-white/20 p-10 text-center text-zinc-400"><BookOpen size={36} className="mx-auto mb-2" /> {isDeck ? "Sua mão está vazia. Compre uma carta para começar." : "Este livro ainda não possui cartas liberadas."}</div> : <div className="flex flex-wrap justify-center gap-5 py-3">
            {visibleCards.map((entry, index) => <motion.div key={`${entry.id}-${index}`} initial={{ opacity: 0, y: 55, rotate: -9 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 170, damping: 18 }} className="space-y-3"><BookCard entry={entry} kind={activeBook.kind} selected={selected === entry.id} onClick={() => setSelected(entry.id)} />
              {selected === entry.id && <button disabled={busy} className="w-[214px] rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-50" onClick={() => void useEntry(entry)}>{busy ? "Processando..." : activeBook.kind === "spellbook" ? "Conjurar magia" : "Solicitar fabricação"}</button>}</motion.div>)}
          </div>}
          <AnimatePresence>{lastPlay && <motion.div key={lastPlay} initial={{ scale: .7, opacity: 0, filter: "blur(12px)" }} animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} className="mx-auto mt-4 flex max-w-sm items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-center text-amber-200"><Sparkles className="animate-pulse" /> {activeBook.kind === "spellbook" ? "Magia conjurada!" : "Pedido de fabricação registrado!"}</motion.div>}</AnimatePresence>
        </> : <p className="text-xs text-zinc-400">Nenhum livro associado às classes desse personagem.</p>}
        {(data?.activity || []).filter(a => a.action === "craft-request").slice(-5).reverse().map(a => <p key={a.id} className="mt-2 text-xs text-amber-300">Projeto {activeBook?.entries.find(e => e.id === a.entryId)?.name || a.entryId}: {a.status === "approved" ? "aprovado pelo mestre" : a.status === "rejected" ? "recusado" : "aguardando aprovação"}</p>)}
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
      </motion.div>
    </motion.div>}</AnimatePresence>
  </>
}

/** Revelação compartilhada de conjurações, disparada pelo SSE já existente. */
export function ClassCardReveal({ value }: { value: {
  cardName: string
  cardImage?: string | null
  cardEffects?: string
  casterName: string
} | null }) {
  return <AnimatePresence>
    {value && <motion.div key={`${value.casterName}:${value.cardName}`} aria-live="polite"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-[950] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[3px]">
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
  </AnimatePresence>
}
