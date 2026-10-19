"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BookOpen, Hammer, Layers3, Plus, Save, Trash2, Sparkles, LockKeyhole, WandSparkles, X, Check, Loader2 } from "lucide-react"
import type { ClassBook, ClassBookEntry, ClassBookProgress, BookKind, CampaignClassBooks, ClassBookDeckView, ClassBookActivity } from "@/lib/class-books"
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
            <option value="all">Automático: cartas publicadas entram no deck da classe</option><option value="grant">Manual: cada carta precisa ser atribuída pelo Mestre</option></select>
            <span className="mt-1 block text-[11px] text-amber-200">{draft.unlockMode === "grant"
              ? "Modo manual: PUBLICAR não libera a carta. Escolha um personagem em Atribuir e revogar cartas, abaixo."
              : "Modo automático: ao publicar, a carta fica disponível no baralho de quem possui esta classe. Revogações individuais continuam valendo."}</span></label>
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
             <label className="text-xs">Nível da classe vinculada (exato)<input aria-label="Nível exigido da classe" type="number" min={1} max={30} step={1} className={field} value={entry.requiredClassLevel ?? 1} onChange={e => editEntry(entry.id, { requiredClassLevel: Number(e.target.value) })} /><span className="mt-1 block text-[11px] text-amber-200">Somente personagens com este nível exato na classe do grimório veem e usam a carta.</span></label>
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
                ? "Publicar apenas prepara a carta: selecione o viajante em Atribuir e revogar cartas, abaixo, e clique Atribuir."
                : "Publicar libera a carta automaticamente para personagens da classe, salvo se houver uma revogação individual."} Rascunhos nunca podem ser conjurados.</p>
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
                 <p className="text-[11px] text-zinc-400">{data.classes.find(c => c.id === book.classId)?.name || book.classId} · {book.unlockMode === "all" ? "Liberação automática da classe, com revogação individual" : "Liberação manual"} · {assigned}/{published.length} acessíveis</p>
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
                    {card.published && <p className="text-[10px] text-zinc-400">Exige Nv. {card.requiredClassLevel ?? 1} de {data.classes.find(c => c.id === book.classId)?.name || "classe"} · personagem Nv. {selectedClassLevel(book)}{selectedClassLevel(book) !== (card.requiredClassLevel ?? 1) ? " · bloqueada por nível" : ""}</p>}</div>
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
  const [bookId, setBookId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [lastPlay, setLastPlay] = useState<string | null>(null)
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
        <p className="mb-5 mt-1 text-xs text-zinc-400">Somente cartas publicadas e liberadas podem ser usadas. Magias descontam o recurso configurado e ativam os bônus programados; projetos são solicitações de fabricação.</p>
        {subclasses.length > 0 && <div className="mb-5 rounded-xl border border-violet-500/25 bg-violet-950/20 p-3"><p className="mb-2 text-xs font-bold text-violet-200">Escolher subclasse</p>
          <div className="flex flex-wrap gap-2">{subclasses.map(sub => <button key={sub.id} disabled={busy} className={`${ghost} ${progress?.subclassIds.includes(sub.id) ? "border-amber-400 text-amber-300" : ""}`} onClick={async () => { setBusy(true); try { await call(campaignId, { action: "select-subclass", characterId: character.id, subclassId: sub.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Erro na especialização") } finally { setBusy(false) } }}>{sub.name} {progress?.subclassIds.includes(sub.id) && "✓"}</button>)}</div>
        </div>}
        <div className="mb-4 flex flex-wrap gap-2">{books.map(book => <button key={book.id} onClick={() => { setBookId(book.id); setSelected(null); setLastPlay(null) }} className={`${ghost} ${activeBook?.id === book.id ? "border-amber-400 text-amber-200" : ""}`}>{book.kind === "spellbook" ? <WandSparkles size={13} className="mr-1 inline" /> : <Hammer size={13} className="mr-1 inline" />}{book.name}</button>)}</div>
        {activeBook ? <>
          <p className="mb-3 text-sm text-zinc-300">{activeBook.description}</p>
          {isDeck && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-4 py-3">
            <div className="text-xs text-indigo-200"><Layers3 className="mr-2 inline" size={16} /> <strong>{eligibleCards}</strong> carta(s) do seu nível{eligibleClassLevel ? ` (${eligibleClassLevel})` : ""} · <strong>{drawCount}</strong> no deck · <strong>{activeDeck?.hand.length ?? 0}</strong> na mão · <strong>{activeDeck?.discardPile.length ?? 0}</strong> no descarte</div>
            <button disabled={busy || noAccessibleCards || drawCount === 0 || (activeDeck?.hand.length ?? 0) >= (activeBook.handLimit ?? 7)} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold disabled:opacity-50" onClick={async () => { setBusy(true); setError(""); try { await call(campaignId, { action: "draw", characterId: character.id, bookId: activeBook.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Não foi possível comprar carta.") } finally { setBusy(false) } }}><Sparkles size={14} className="mr-1 inline" /> Comprar carta</button>
            {(isGm || activeBook.allowPlayerReset === true || hasCooldown) && <button disabled={busy || !canRestart} className={ghost} onClick={async () => { if (!window.confirm("Reunir a mão e descarte, e embaralhar o deck novamente?")) return; setBusy(true); try { await call(campaignId, { action: "reset-deck", characterId: character.id, bookId: activeBook.id }); await load() } catch(e) { setError(e instanceof Error ? e.message : "Erro ao embaralhar") } finally { setBusy(false) } }}>{hasCooldown ? "Reiniciar após recarga" : "Embaralhar / Reiniciar"}</button>}
            {cooldownRunning && activeDeck?.cooldownStartedAt && <div className="w-full"><ClassTimerProgress label="Recarga do grimório" startedAt={activeDeck.cooldownStartedAt} endsAt={cooldownEndsAt} /></div>}
            {hasCooldown && cycleExhausted && !cooldownRunning && cooldownEndsAt > 0 && <p className="w-full text-xs text-emerald-300">Recarga concluída. Você já pode reiniciar o baralho.</p>}
          </div>}
          {noAccessibleCards && <div role="status" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200">
            {activeBook.unlockMode === "grant"
              ? "Este grimório usa atribuição manual. Apesar de haver cartas publicadas, o Mestre precisa selecionar este personagem em ‘Atribuir e revogar cartas’ e atribuí-las para entrarem no deck."
              : "Não há cartas deste nível da classe publicadas e liberadas para o personagem. Confira o nível exigido, a classe vinculada, a publicação e a atribuição pelo Mestre."}
          </div>}
          {isDeck && accessibleCopies > 0 && drawCount === 0 && (activeDeck?.hand.length ?? 0) === 0 && <p role="status" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200">Todas as cartas disponíveis já foram compradas. {hasCooldown ? "Aguarde a recarga do grimório para reiniciar." : activeDeck?.discardPile.length ? "Peça ao mestre para embaralhar o descarte." : "Confira as cartas em uso e o estado do grimório."}</p>}
          {visibleCards.length === 0 ? <div className="rounded-xl border border-dashed border-white/20 p-10 text-center text-zinc-400"><BookOpen size={36} className="mx-auto mb-2" /> {noAccessibleCards ? "Nenhuma carta liberada para sua ficha." : isDeck ? "Sua mão está vazia. Compre uma carta para começar." : "Este livro ainda não possui cartas liberadas."}</div> : <div className="flex flex-wrap justify-center gap-5 py-3">
            {visibleCards.map((entry, index) => <motion.div key={`${entry.id}-${index}`} initial={{ opacity: 0, y: 55, rotate: -9 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 170, damping: 18 }} className="space-y-3"><BookCard entry={entry} kind={activeBook.kind} selected={selected === entry.id} onClick={() => setSelected(entry.id)} />
              {selected === entry.id && <div className="w-[214px] space-y-2">{entry.checkBonuses?.length ? <div className="rounded border border-emerald-400/30 bg-emerald-950/20 p-2 text-[11px] text-emerald-200">Ao conjurar ({entry.bonusDurationSeconds == null ? "ilimitado" : `${entry.bonusDurationSeconds}s`}): {entry.checkBonuses.map(b => `+${b.value} ${bonusTargetName(b.target)}`).join(" · ")}</div> : null}<button disabled={busy} className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-50" onClick={() => void useEntry(entry)}>{busy ? "Processando..." : activeBook.kind === "spellbook" ? "Conjurar magia" : "Solicitar fabricação"}</button></div>}</motion.div>)}
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
