"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/client"
import { EQUIPMENT, CLASSES } from "@/lib/game-data"
import { createPortal } from "react-dom"
import { BookOpen, CheckCheck, Coins, Eye, Gift, Loader2, Package, Search, ShieldCheck, Skull, Trash2, X } from "lucide-react"
import { MAX_DEATH_TOKEN_CLASSES, MAX_DEATH_TOKEN_ITEMS, type DeathToken, type DeathTokenRelic } from "@/lib/death-tokens"
import { isClassPublished } from "@/lib/class-visibility"
import { DeathTokenCatalogDetails, type DeathTokenCatalogItem, type DeathTokenCatalogSelection } from "./death-token-catalog-details"
import type { GameClass } from "@/lib/game-data"

type Member = { userId: string; name: string; role?: string }
type Item = DeathTokenCatalogItem | any

/** Abrir a partir do Grimório do Mestre / aba Classes; persistência exclusiva do servidor. */
export function DeathTokenWorkbench({ campaignId, members, customClasses, customEquipment, onClose }: {
  campaignId: string; members: Member[]; customClasses: GameClass[]; customEquipment: Item[]; onClose: () => void
}) {
  const players = members.filter(member => member.role === "player")
  const [tokens, setTokens] = useState<DeathToken[]>([])
  const [userId, setUserId] = useState(players[0]?.userId || "")
  const [maxLevels, setMaxLevels] = useState(10)
  const [startingZenit, setStartingZenit] = useState(500)
  const [startingItemIds, setStartingItemIds] = useState<string[]>([])
  const [startingRelics, setStartingRelics] = useState<DeathTokenRelic[]>([])
  const [allowedClassIds, setAllowedClassIds] = useState<string[]>([])
  const [classSearch, setClassSearch] = useState("")
  const [classSource, setClassSource] = useState<"all" | "system" | "custom">("all")
  const [classLimitNotice, setClassLimitNotice] = useState("")
  const [itemLimitNotice, setItemLimitNotice] = useState("")
  const [inspected, setInspected] = useState<DeathTokenCatalogSelection | null>(null)
  const closeInspection = useCallback(() => setInspected(null), [])
  const [itemSearch, setItemSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const classes = useMemo(() => [...CLASSES, ...customClasses.filter(cls => !CLASSES.some(standard => standard.id === cls.id))].filter(cls => !cls.parentClassId), [customClasses])
  const items = useMemo(() => [...EQUIPMENT, ...customEquipment.filter(item => !EQUIPMENT.some(standard => standard.id === item.id))], [customEquipment])
  const standardClassIds = useMemo(() => new Set(CLASSES.map(cls => cls.id)), [])
  const standardItemIds = useMemo(() => new Set(EQUIPMENT.map(item => item.id)), [])
  const toggle = (id: string, list: string[], setter: (next: string[]) => void) => setter(list.includes(id) ? list.filter(value => value !== id) : [...list, id])
  async function refresh() {
    const data = await apiFetch<{ tokens: DeathToken[] }>(`/api/campaigns/${encodeURIComponent(campaignId)}/death-tokens`, { cache: "no-store" })
    setTokens(data.tokens || [])
  }
  useEffect(() => {
    void refresh().catch(e => setError(e instanceof Error ? e.message : "Falha ao carregar tokens."))
      .finally(() => setLoading(false))
  }, [campaignId])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy && !inspected) onClose() }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [onClose, busy, inspected])
  async function give() {
    if (busy || !userId) return
    setError(""); setMessage(""); setBusy(true)
    try {
      await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/death-tokens`, {
        method: "POST", body: JSON.stringify({ userId, maxLevels, startingZenit, startingItemIds, startingRelics, allowedClassIds }),
      })
      await refresh()
      setMessage("Token concedido e persistido. O jogador poderá utilizá-lo na Forja do Viajante.")
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível conceder o token.") }
    finally { setBusy(false) }
  }
  async function revoke(id: string) {
    if (busy || !window.confirm("Revogar este token ainda não utilizado?")) return
    setBusy(true); setError(""); setMessage("")
    try {
      await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/death-tokens`, { method: "DELETE", body: JSON.stringify({ tokenId: id }) })
      await refresh()
      setMessage("Token revogado.")
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível revogar o token.") }
    finally { setBusy(false) }
  }
  const selectableClasses = classes.filter(cls => {
    const matchesSearch = `${cls.name} ${cls.archetype}`.toLocaleLowerCase("pt-BR").includes(classSearch.toLocaleLowerCase("pt-BR"))
    const source = standardClassIds.has(cls.id) ? "system" : "custom"
    return matchesSearch && (classSource === "all" || classSource === source)
  })
  const selectableItems = items.filter(item => `${item.name} ${item.category || ""} ${item.type || ""}`.toLocaleLowerCase("pt-BR").includes(itemSearch.toLocaleLowerCase("pt-BR")))
  function toggleClass(id: string) {
    if (!allowedClassIds.includes(id) && allowedClassIds.length >= MAX_DEATH_TOKEN_CLASSES) {
      setClassLimitNotice(`O limite por token é de ${MAX_DEATH_TOKEN_CLASSES} classes.`)
      return
    }
    setClassLimitNotice("")
    toggle(id, allowedClassIds, setAllowedClassIds)
  }
  function toggleItem(id: string) {
    if (!startingItemIds.includes(id) && startingItemIds.length >= MAX_DEATH_TOKEN_ITEMS) {
      setItemLimitNotice(`O limite por token é de ${MAX_DEATH_TOKEN_ITEMS} itens gratuitos.`)
      return
    }
    setItemLimitNotice("")
    toggle(id, startingItemIds, setStartingItemIds)
  }
  function chooseAllClasses() {
    setAllowedClassIds(classes.slice(0, MAX_DEATH_TOKEN_CLASSES).map(cls => cls.id))
    setClassLimitNotice(classes.length > MAX_DEATH_TOKEN_CLASSES
      ? `O catálogo tem ${classes.length} classes; foram marcadas as primeiras ${MAX_DEATH_TOKEN_CLASSES}, limite atual do token.` : "")
  }
  function chooseAllItems() {
    setStartingItemIds(items.slice(0, MAX_DEATH_TOKEN_ITEMS).map(item => item.id))
    setItemLimitNotice(items.length > MAX_DEATH_TOKEN_ITEMS
      ? `O catálogo tem ${items.length} itens; foram marcados os primeiros ${MAX_DEATH_TOKEN_ITEMS}, limite atual do token.` : "")
  }
  const ui = <div role="presentation" className="fixed inset-0 z-[12030] flex min-h-0 items-center justify-center bg-background/95 p-2 backdrop-blur-xl sm:p-5">
    <section role="dialog" aria-modal="true" aria-label="Tokens de morte do Mestre" className="flex h-[min(96dvh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background text-foreground shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-primary/20 bg-card/70 px-4 py-4 sm:px-7">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary"><Skull className="size-6" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Grimório do Mestre · Recompensas de renascimento</p><h2 className="font-serif text-xl font-black sm:text-2xl">Tokens de morte</h2></div></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar" className="grid size-10 place-items-center rounded-lg border border-border hover:border-primary/50"><X className="size-5" /></button>
      </header>
      <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)] lg:overflow-hidden">
        <div className="space-y-5 overflow-y-auto p-4 sm:p-7">
          <div className="border-l-2 border-primary pl-4"><h3 className="font-serif text-xl font-bold">Conceder um renascimento</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">O token pertence à conta do jogador nesta campanha e é consumido somente quando ele conclui uma nova ficha.</p></div>
          <label className="block text-xs font-semibold">Jogador destinatário<select aria-label="Jogador" value={userId} onChange={e => setUserId(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 text-sm">{players.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold">Máximo de níveis iniciais<input type="number" min={1} max={100} value={maxLevels} onChange={e => setMaxLevels(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 font-mono text-lg text-primary" /></label>
            <label className="block text-xs font-semibold">Zenits iniciais<input type="number" min={0} max={1000000} value={startingZenit} onChange={e => setStartingZenit(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 font-mono text-lg text-primary" /></label>
          </div>
          {/* Classes: a seleção vazia mantém o significado legado de catálogo público. */}
          <section className="overflow-hidden rounded-xl border border-border/65 bg-card/35" aria-label="Classes iniciais autorizadas">
            <div className="space-y-3 border-b border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold">Classes iniciais autorizadas</h4>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{allowedClassIds.length ? `${allowedClassIds.length} de ${classes.length} selecionadas` : "Catálogo público"}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Sem seleção: catálogo público normal. Ao selecionar classes específicas, somente elas poderão ser usadas, inclusive personalizadas ocultas autorizadas pelo Mestre.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={chooseAllClasses} disabled={classes.length === 0}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                  title={`Selecionar todas as classes (até ${MAX_DEATH_TOKEN_CLASSES})`}><CheckCheck className="size-3.5" /> Todas</button>
                <button type="button" onClick={() => { setAllowedClassIds([]); setClassLimitNotice("") }} disabled={!allowedClassIds.length}
                  className="min-h-8 rounded-md border border-border px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">Limpar</button>
                <span className="ml-auto text-[10px] text-muted-foreground">Máximo {MAX_DEATH_TOKEN_CLASSES}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3">
                  <Search className="size-4 shrink-0 text-primary" />
                  <input aria-label="Buscar classes" value={classSearch} onChange={e => setClassSearch(e.target.value)} placeholder="Buscar classe..." className="min-w-0 w-full bg-transparent py-2.5 text-xs outline-none" />
                </label>
                <div className="flex gap-1 rounded-md border border-border bg-background p-1" aria-label="Filtrar origem da classe">
                  {([ ["all", "Ambas"], ["system", "Sistema"], ["custom", "Personalizadas"] ] as const).map(([value, label]) =>
                    <button key={value} type="button" aria-pressed={classSource === value} onClick={() => setClassSource(value)}
                      className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${classSource === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
                </div>
              </div>
              {classLimitNotice && <p role="status" className="text-[11px] text-amber-400">{classLimitNotice}</p>}
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
              {selectableClasses.map(cls => {
                const isSystem = standardClassIds.has(cls.id)
                const selected = allowedClassIds.includes(cls.id)
                const hidden = !isSystem && !isClassPublished(cls)
                return <article key={cls.id} className={`min-w-0 rounded-lg border p-2.5 transition-colors ${selected ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/60 hover:border-primary/25"}`}>
                  <div className="flex min-w-0 items-start gap-2">
                    <input id={`token-class-${cls.id}`} type="checkbox" checked={selected} onChange={() => toggleClass(cls.id)} className="mt-0.5 shrink-0 accent-primary" />
                    <label htmlFor={`token-class-${cls.id}`} className="min-w-0 flex-1 cursor-pointer break-words text-xs font-semibold">{cls.name}</label>
                    <button type="button" onClick={() => setInspected({ kind: "class", value: cls, source: isSystem ? "system" : "custom" })}
                      title={`Ver detalhes da classe ${cls.name}`} aria-label={`Ver classe ${cls.name}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"><BookOpen className="size-3" /> Ver classe</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${isSystem ? "border-border bg-card text-muted-foreground" : "border-primary/35 bg-primary/[.08] text-primary"}`}>{isSystem ? "Sistema" : "Personalizada"}</span>
                    {hidden && <span className="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">Oculta</span>}
                  </div>
                </article>
              })}
              {!selectableClasses.length && <p className="col-span-full py-5 text-center text-xs text-muted-foreground">Nenhuma classe encontrada neste filtro.</p>}
            </div>
          </section>
          {/* Itens: gratuitos são adicionados no nascimento da nova ficha. */}
          <section className="overflow-hidden rounded-xl border border-border/65 bg-card/35" aria-label="Itens iniciais gratuitos">
            <div className="space-y-3 border-b border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold">Itens iniciais gratuitos</h4>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{startingItemIds.length} de {items.length} escolhidos</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Adicionados automaticamente à mochila, sem desconto dos Zenits. Confira detalhes e propriedades antes de conceder.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={chooseAllItems} disabled={items.length === 0}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                  title={`Selecionar todos os itens (até ${MAX_DEATH_TOKEN_ITEMS})`}><CheckCheck className="size-3.5" /> Todas</button>
                <button type="button" onClick={() => { setStartingItemIds([]); setItemLimitNotice("") }} disabled={!startingItemIds.length}
                  className="min-h-8 rounded-md border border-border px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">Limpar</button>
                <span className="ml-auto text-[10px] text-muted-foreground">Máximo {MAX_DEATH_TOKEN_ITEMS}</span>
              </div>
              <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3">
                <Search className="size-4 text-primary" /><input aria-label="Buscar itens" value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Buscar equipamento..." className="w-full bg-transparent py-2.5 text-xs outline-none" />
              </label>
              {itemLimitNotice && <p role="status" className="text-[11px] text-amber-400">{itemLimitNotice}</p>}
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
              {selectableItems.map(item => {
                const isSystem = standardItemIds.has(item.id)
                const selected = startingItemIds.includes(item.id)
                return <article key={item.id} className={`min-w-0 rounded-lg border p-2.5 transition-colors ${selected ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/60 hover:border-primary/25"}`}>
                  <div className="flex min-w-0 items-start gap-2">
                    <input id={`token-item-${item.id}`} type="checkbox" checked={selected} onChange={() => toggleItem(item.id)} className="mt-0.5 shrink-0 accent-primary" />
                    <label htmlFor={`token-item-${item.id}`} className="min-w-0 flex-1 cursor-pointer break-words text-xs font-semibold">{item.name}</label>
                    <button type="button" onClick={() => setInspected({ kind: "item", value: item, source: isSystem ? "system" : "custom" })}
                      aria-label={`Ver detalhes do item ${item.name}`} title={`Ver detalhes de ${item.name}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"><Eye className="size-3" /> Detalhes</button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5 text-[9px] text-muted-foreground">
                    <span className="rounded border border-border px-1.5 py-0.5">{isSystem ? "Sistema" : "Personalizado"}</span>
                    <span className="inline-flex items-center gap-1"><Coins className="size-3" />{Number(item.cost || 0).toLocaleString("pt-BR")} Z</span>
                  </div>
                </article>
              })}
              {!selectableItems.length && <p className="col-span-full py-5 text-center text-xs text-muted-foreground">Nenhum equipamento encontrado nesta busca.</p>}
            </div>
          </section>
          <div className="rounded-xl border border-border/65 bg-card/35 p-4">
            <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-bold">Relíquias personalizadas</h4><p className="mt-1 text-[11px] text-muted-foreground">Crie até dez objetos narrativos exclusivos. Serão adicionados à mochila como itens de texto sem custo de Zenits.</p></div><button type="button" disabled={startingRelics.length >= 10} onClick={() => setStartingRelics(prev => [...prev, { name: "", content: "", weight: 100, weightUnit: "g" }])} className="shrink-0 rounded-lg border border-primary/35 px-3 py-2 text-xs font-bold text-primary disabled:opacity-40">+ Relíquia</button></div>
            <div className="mt-3 space-y-3">{startingRelics.map((relic, index) => <div key={index} className="space-y-2 rounded-lg border border-border/60 bg-background/55 p-3"><div className="flex gap-2"><input aria-label={`Nome da relíquia ${index+1}`} value={relic.name} onChange={e => setStartingRelics(prev => prev.map((item,i) => i === index ? { ...item, name: e.target.value } : item))} placeholder="Nome da relíquia" maxLength={100} className="min-w-0 flex-1 border border-border bg-card px-3 py-2 text-xs"/><button type="button" aria-label={`Remover relíquia ${index+1}`} onClick={() => setStartingRelics(prev => prev.filter((_,i) => i !== index))} className="rounded-lg p-2 text-destructive"><Trash2 className="size-4"/></button></div><textarea aria-label={`Descrição da relíquia ${index+1}`} value={relic.content} onChange={e => setStartingRelics(prev => prev.map((item,i) => i === index ? { ...item, content: e.target.value } : item))} placeholder="Descrição e efeito narrativo" rows={2} maxLength={5000} className="w-full resize-y border border-border bg-card p-3 text-xs"/><div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground">Peso</span><input type="number" min={0} value={relic.weight} onChange={e => setStartingRelics(prev => prev.map((item,i) => i === index ? { ...item, weight: Number(e.target.value) } : item))} className="w-24 border border-border bg-card p-2 font-mono text-xs"/><select value={relic.weightUnit} onChange={e => setStartingRelics(prev => prev.map((item,i) => i === index ? { ...item, weightUnit: e.target.value as DeathTokenRelic["weightUnit"] } : item))} className="border border-border bg-card p-2 text-xs"><option value="g">g</option><option value="kg">kg</option></select></div></div>)}</div>
          </div>
          <button type="button" disabled={busy || !userId || !Number.isInteger(maxLevels) || maxLevels < 1 || maxLevels > 100 || startingZenit < 0 || startingZenit > 1000000} onClick={() => void give()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-45">{busy ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4"/>} Conceder token de morte</button>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-primary/35 bg-primary/10 p-3 text-xs text-primary">{message}</p>}
        </div>
        <aside className="space-y-4 overflow-y-auto border-t border-border/70 bg-card/35 p-4 sm:p-7 lg:border-l lg:border-t-0"><div className="flex items-center gap-2 border-b border-border/50 pb-3"><ShieldCheck className="size-5 text-primary"/><h3 className="font-serif text-lg font-bold">Tokens da campanha</h3></div><p className="text-xs text-muted-foreground">Cada token é individual, transferências não são permitidas e apenas os disponíveis podem ser revogados.</p>
          {loading ? <div className="flex items-center gap-2 text-xs"><Loader2 className="size-4 animate-spin"/> Consultando registros...</div> : tokens.length === 0 ? <p className="border border-dashed border-border p-4 text-xs text-muted-foreground">Nenhum token concedido.</p> : <div className="space-y-2">{[...tokens].reverse().map(token => <article key={token.id} className="rounded-xl border border-border/60 bg-background/50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-sm">{players.find(member => member.userId === token.userId)?.name || "Jogador"}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{token.maxLevels} níveis · {token.startingZenit} Zenits</p></div><span className={`rounded-full border px-2 py-1 text-[10px] ${token.status === "available" ? "border-primary/35 text-primary" : "border-border text-muted-foreground"}`}>{token.status === "available" ? "Disponível" : token.status === "used" ? "Usado" : "Revogado"}</span></div><p className="mt-2 text-[10px] text-muted-foreground">{token.startingItemIds.length} itens + {(token.startingRelics || []).length} relíquias · {token.allowedClassIds.length || "Todas"} classes</p>{token.status === "available" && <button type="button" disabled={busy} onClick={() => void revoke(token.id)} className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-destructive hover:underline"><Trash2 className="size-3.5"/> Revogar token</button>}</article>)}</div>}
        </aside>
      </div>
    </section>
  </div>
  return typeof document !== "undefined" ? <>
    {createPortal(ui, document.body)}
    {inspected && <DeathTokenCatalogDetails selection={inspected} onClose={closeInspection} />}
  </> : null
}
