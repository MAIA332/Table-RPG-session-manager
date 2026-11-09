"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, CircleHelp, Layers3, Loader2, Package, Rotate3D, Save, Search, Shield, Shirt, Sword, X } from "lucide-react"
import {
  MANNEQUIN_ZONES, initialMannequinPlacements, normalizeMannequinPlacements,
  findMannequinSlotCollision, assertUniqueMannequinSlots,
  type MannequinItem, type MannequinPlacement, type MannequinZone,
} from "@/lib/equipment-mannequin"
import { MannequinModel3D } from "./mannequin-model-3d"

type Props = {
  characterId: string
  characterName: string
  items: MannequinItem[]
  editable: boolean
  onClose: () => void
  onOpenInventory: (item: MannequinItem) => void
}
const ZONE_NAME = new Map(MANNEQUIN_ZONES.map(zone => [zone.id, zone.name] as const))
const KIND_NAME = { weapon: "Arma", armor: "Armadura", shield: "Escudo", accessory: "Acessório" }
const ICON = { weapon: Sword, armor: Shirt, shield: Shield, accessory: Layers3 }
const same = (a: MannequinPlacement[], b: MannequinPlacement[]) => JSON.stringify(a) === JSON.stringify(b)

export function EquipmentMannequin({ characterId, characterName, items, editable, onClose, onOpenInventory }: Props) {
  const [placements, setPlacements] = useState<MannequinPlacement[]>([])
  const [serverPlacements, setServerPlacements] = useState<MannequinPlacement[]>([])
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(items[0]?.key ?? null)
  const [activeLayer, setActiveLayer] = useState(0)
  const modalRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<HTMLButtonElement>(null)
  const latestItems = useRef(items)
  const loadVersion = useRef(0)
  latestItems.current = items
  const itemByKey = useMemo(() => new Map(items.map(item => [item.key, item])), [items])
  const selected = itemByKey.get(selectedKey ?? "") || items[0]
  const selectedPlacement = placements.find(p => p.key === selected?.key)
  const dirty = loaded && !same(placements, serverPlacements)
  const assigned = placements.filter(p => itemByKey.has(p.key))
  const shownItems = items.filter(item => !search || `${item.name} ${KIND_NAME[item.category]}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
  const endpoint = `/api/characters/${encodeURIComponent(characterId)}/mannequin`

  async function load() {
    const currentVersion = ++loadVersion.current
    setLoading(true); setError(""); setNotice("")
    try {
      const response = await fetch(endpoint, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success !== true) throw new Error(data.error || `Erro ${response.status} ao carregar.`)
      if (currentVersion !== loadVersion.current) return
      const stored = normalizeMannequinPlacements(data.placements)
      const next = initialMannequinPlacements(latestItems.current, stored)
      setRevision(data.revision)
      setServerPlacements(stored.filter(p => latestItems.current.some(item => item.key === p.key)))
      setPlacements(next)
      if (stored.some((entry, index) => stored.some((other, otherIndex) => otherIndex < index && other.zone === entry.zone && other.layer === entry.layer)))
        setNotice("Posições antigas em conflito foram redistribuídas sem remover itens. Confira e clique em Salvar posições para confirmar no MongoDB.")
      setActiveLayer(next[0]?.layer ?? 0)
      setLoaded(true)
    } catch (cause) {
      if (currentVersion !== loadVersion.current) return
      setLoaded(false)
      setError(cause instanceof Error ? cause.message : "Falha ao carregar as posições.")
    } finally { if (currentVersion === loadVersion.current) setLoading(false) }
  }

  useEffect(() => {
    void load()
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    focusRef.current?.focus()
    return () => { document.body.style.overflow = previous }
    // Um novo personagem remonta o painel (key={characterId} na ficha).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  const itemSignature = items.map(item => item.key).join("|")
  useEffect(() => {
    if (!loaded) return
    const available = new Set(latestItems.current.map(item => item.key))
    setPlacements(previous => initialMannequinPlacements(latestItems.current,
      previous.filter(placement => available.has(placement.key))))
    setServerPlacements(previous => previous.filter(placement => available.has(placement.key)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSignature, loaded])

  function safelyClose() {
    if (saving) return
    if (dirty && !window.confirm("As mudanças no Manequim ainda não foram salvas. Deseja sair sem salvar?")) return
    onClose()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); safelyClose() }
      if (event.key !== "Tab" || !modalRef.current) return
      const controls = [...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')]
      if (!controls.length) return
      const first = controls[0],last = controls[controls.length-1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  function updateItem(key: string, change: Partial<Pick<MannequinPlacement,"zone" | "layer">>) {
    if (!editable || saving) return
    const existing = placements.find(entry => entry.key === key)
    if (!existing) return
    const zone = change.zone ?? existing.zone
    const layer = change.layer ?? existing.layer
    const occupant = findMannequinSlotCollision(placements, zone, layer, key)
    if (occupant) {
      const name = itemByKey.get(occupant.key)?.name || "Outro item"
      setNotice(`${name} já está em ${ZONE_NAME.get(zone)}, camada ${layer + 1}. Escolha outra região ou camada.`)
      return
    }
    setNotice("")
    setPlacements(previous => previous.map(entry => entry.key === key ? { ...entry, ...change } : entry))
    if (typeof change.layer === "number") setActiveLayer(change.layer)
  }
  async function save() {
    if (!editable || !loaded || saving || !dirty) return
    setSaving(true);setError("");setNotice("")
    try {
      const payload = placements.filter(p => itemByKey.has(p.key))
      assertUniqueMannequinSlots(payload)
      const response = await fetch(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, placements: payload }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true) throw new Error(result.error || `Erro HTTP ${response.status}`)
      const confirmed = normalizeMannequinPlacements(result.placements)
      if (!same(confirmed,payload)) throw new Error("O servidor não confirmou a disposição completa.")
      setRevision(result.revision)
      setServerPlacements(confirmed)
      setPlacements(confirmed)
      setNotice("Posições confirmadas no MongoDB.")
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Não foi possível salvar no servidor.")}
    finally {setSaving(false)}
  }

  function goToInventory(item: MannequinItem) {
    if (saving) return
    if (dirty && !window.confirm("Abrir a mochila sem salvar as mudanças de posição?")) return
    onOpenInventory(item)
  }
  return <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="mannequin-title"
    className="rpg-themed-workspace fixed inset-0 z-[12000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground">
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-24 -top-44 size-[580px] rounded-full bg-primary/[.10] blur-[110px]" />
      <div className="absolute -right-40 top-1/3 size-[600px] rounded-full bg-primary/[.06] blur-[110px]" />
    </div>
    <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border/55 bg-background/85 px-4 py-3 backdrop-blur-2xl md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/15 text-primary"><Rotate3D className="size-6"/></div>
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Ficha / Equipamentos</p>
          <h2 id="mannequin-title" className="truncate font-serif text-xl font-black md:text-2xl">Manequim <span className="hidden font-sans text-sm font-medium text-muted-foreground sm:inline">· {characterName}</span></h2></div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full border border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground sm:block">{assigned.length} itens em uso</span>
        <button disabled={!dirty || !editable || saving || !loaded} onClick={()=>void save()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-40">
          {saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}<span className="hidden sm:inline">{saving ? "Salvando..." : "Salvar posições"}</span><span className="sm:hidden">Salvar</span>
        </button>
        <button ref={focusRef} type="button" onClick={safelyClose} aria-label="Fechar Manequim" className="grid size-10 place-items-center rounded-lg border border-border/70 bg-card/70 hover:border-primary/50"><X className="size-5"/></button>
      </div>
    </header>
    {(error || notice || loading) && <div className={`relative z-10 shrink-0 border-b px-5 py-2.5 text-xs ${error ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/10 text-primary"}`} role={error ? "alert" : "status"}>
      {loading ? "Carregando posições do MongoDB..." : error || notice}
      {error && <button type="button" onClick={()=>{if(!dirty||window.confirm("Descartar as posições locais e recarregar o MongoDB?")) void load()}} className="ml-3 font-bold underline">Recarregar do banco</button>}
    </div>}
    <div className="relative z-0 grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(225px,.85fr)_minmax(340px,1.6fr)_minmax(265px,.95fr)] lg:overflow-hidden">
      <aside className="order-2 min-h-0 border-t border-border/50 bg-card/25 p-4 backdrop-blur-xl lg:order-1 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:p-6">
        <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-widest text-primary">Itens em uso</h3><span className="font-mono text-xs text-muted-foreground">{items.length}</span></div>
        <div className="relative mb-4"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar equipamento..." aria-label="Buscar equipamento" className="w-full rounded-xl border border-border/60 bg-background/70 py-2.5 pl-10 pr-3 text-xs outline-none focus:border-primary/50"/></div>
        <div className="space-y-2">
          {shownItems.map((item,index)=>{
            const placement=placements.find(entry=>entry.key===item.key)
            const Icon=ICON[item.category]
            const active=item.key===selected?.key
            return <button type="button" key={item.key} disabled={!loaded} onClick={()=>{setSelectedKey(item.key);if(placement)setActiveLayer(placement.layer)}} aria-pressed={active}
              className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${active ? "border-primary/55 bg-primary/15" : "border-border/45 bg-background/40 hover:border-primary/35"}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg border ${active ? "border-primary/40 bg-primary/20 text-primary" : "border-border/40 bg-card/65 text-muted-foreground"}`}><Icon className="size-4"/></span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-bold">{item.name}</strong>
                <span className="mt-1 block text-[10px] text-muted-foreground">{KIND_NAME[item.category]} · {placement ? ZONE_NAME.get(placement.zone) : "Sem posição"}</span>
                <span className="mt-1 block font-mono text-[10px] text-primary">Camada {(placement?.layer??0)+1} · peça {index+1}{placement&&placement.layer!==activeLayer ? " · fora da camada visível" : ""}</span></span>
              {active && <Check className="mt-1 size-3.5 shrink-0 text-primary"/>}
            </button>
          })}
          {!items.length && <p className="rounded-xl border border-dashed border-border/50 p-5 text-xs leading-relaxed text-muted-foreground">Nenhuma arma, armadura ou acessório ativo na mochila. Equipe os itens primeiro.</p>}
          {!!items.length&&!shownItems.length&&<p className="p-3 text-xs text-muted-foreground">Nenhum equipamento encontrado.</p>}
        </div>
      </aside>
      <main className="order-1 relative h-[45dvh] min-h-[350px] p-3 sm:h-[60dvh] lg:order-2 lg:h-auto lg:min-h-0 lg:p-5">
        <MannequinModel3D placements={assigned} items={items} selected={selectedPlacement?.zone??"chest"}
          selectedKey={selected?.key} activeLayer={activeLayer}
          onZone={zone=>{if(selected&&loaded) updateItem(selected.key,{zone})}}
          onSelectItem={key=>{const placement=placements.find(entry=>entry.key===key);setSelectedKey(key);if(placement)setActiveLayer(placement.layer)}}/>
        <div className="absolute bottom-8 right-7 flex w-[210px] flex-col gap-2 rounded-xl border border-primary/30 bg-background/90 p-3 text-[10px] shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-primary">Camada isolada</span><span className="rounded-md bg-primary/15 px-2 py-1 font-mono text-primary">{activeLayer+1}/20</span></div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Camada anterior" disabled={activeLayer===0} onClick={()=>setActiveLayer(v=>Math.max(0,v-1))} className="rounded-md border border-border/60 p-1.5 disabled:opacity-30"><ChevronLeft className="size-3.5"/></button>
            <input type="range" min={0} max={19} step={1} value={activeLayer} aria-label="Camada visível isolada" onChange={event=>setActiveLayer(Number(event.target.value))} className="min-w-0 flex-1 accent-primary"/>
            <button type="button" aria-label="Próxima camada" disabled={activeLayer===19} onClick={()=>setActiveLayer(v=>Math.min(19,v+1))} className="rounded-md border border-border/60 p-1.5 disabled:opacity-30"><ChevronRight className="size-3.5"/></button>
          </div>
          <span className="leading-relaxed text-muted-foreground">{assigned.filter(entry=>entry.layer===activeLayer).length} peça(s). Apenas esta camada é desenhada. Outras camadas e bônus permanecem ativos.</span>
        </div>
      </main>
      <aside className="order-3 border-t border-border/50 bg-card/30 p-5 backdrop-blur-xl lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
        <div className="mb-5 flex items-center gap-2 border-b border-border/50 pb-4"><Layers3 className="size-5 text-primary"/><h3 className="font-serif text-lg font-black">Disposição do item</h3></div>
        {selected&&selectedPlacement ? <div className="space-y-5">
          <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Selecionado</p><h4 className="mt-2 break-words font-serif text-xl font-bold text-primary">{selected.name}</h4><p className="mt-1 text-xs text-muted-foreground">{KIND_NAME[selected.category]}</p></div>
          <label className="block space-y-2"><span className="text-xs font-bold text-foreground">Região do corpo</span>
            <select value={selectedPlacement.zone} disabled={!editable || !loaded || saving} onChange={event=>updateItem(selected.key,{zone:event.target.value as MannequinZone})}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-3 text-sm text-foreground outline-none focus:border-primary/60">
              {MANNEQUIN_ZONES.map(zone=>{
                const occupant=findMannequinSlotCollision(placements,zone.id,selectedPlacement.layer,selected.key)
                return <option key={zone.id} value={zone.id} disabled={!!occupant}>{zone.name}{occupant?" · camada ocupada":""}</option>
              })}
            </select></label>
          <label className="block space-y-2"><span className="flex items-center justify-between text-xs font-bold">Camada sobre o corpo <span className="font-mono text-primary">{selectedPlacement.layer+1}</span></span>
            <input type="range" min={0} max={19} step={1} disabled={!editable || !loaded || saving} value={selectedPlacement.layer}
              onChange={event=>updateItem(selected.key,{layer:Number(event.target.value)})} aria-label="Camada do equipamento" className="w-full accent-primary"/>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">Um item por região e camada. Duas armaduras podem ocupar o mesmo lugar em camadas diferentes. Camada 1 é a mais próxima da pele.</span>
            <select aria-label="Escolher camada livre" value={selectedPlacement.layer} disabled={!editable || !loaded || saving}
              onChange={event=>updateItem(selected.key,{layer:Number(event.target.value)})}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-foreground">
              {Array.from({length:20},(_,layer)=>{
                const occupant=findMannequinSlotCollision(placements,selectedPlacement.zone,layer,selected.key)
                return <option key={layer} value={layer} disabled={!!occupant}>Camada {layer+1}{occupant?` · ocupada por ${itemByKey.get(occupant.key)?.name||"outro item"}`:" · livre"}</option>
              })}
            </select>
          </label>
          <div className="rounded-xl border border-primary/20 bg-primary/[.055] p-4 text-xs leading-relaxed text-muted-foreground"><CircleHelp className="mb-2 size-4 text-primary"/>Esta disposição é apenas visual. As regras da mochila continuam controlando os bônus e o uso do item.</div>
          <button type="button" onClick={()=>goToInventory(selected)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/45 bg-primary/10 px-4 py-3 text-xs font-bold text-primary transition-colors hover:bg-primary/20"><Package className="size-4"/> Ver na mochila</button>
          {selected.detail && <div className="border-t border-border/50 pt-4"><p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Descrição do equipamento</p><p className="max-h-32 overflow-y-auto whitespace-pre-line text-[11px] text-muted-foreground">{selected.detail}</p></div>}
        </div> : <p className="text-sm text-muted-foreground">Selecione um item da lista para definir posição e camada.</p>}
        <div className="mt-8 flex items-start gap-2 border-t border-border/50 pt-4 text-[11px] leading-relaxed text-muted-foreground"><Shield className="mt-0.5 size-4 shrink-0 text-primary"/><p>Salvo por personagem no MongoDB. Redeploys não devem redefinir as posições. Alterações simultâneas pedem revisão antes de sobrescrever.</p></div>
      </aside>
    </div>
    <footer className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-background/80 px-5 py-3 text-[11px] text-muted-foreground backdrop-blur-xl md:px-8">
      <span>{dirty ? "Alterações ainda não confirmadas." : loaded ? "Disposição sincronizada com o banco." : "Aguardando dados do servidor."}</span>
      <div className="flex items-center gap-3"><span className="hidden sm:inline">{items.length} peças · {new Set(assigned.map(entry=>entry.zone)).size} regiões</span><button type="button" onClick={safelyClose} className="rounded-lg border border-border/70 bg-card px-4 py-2 font-bold text-foreground hover:border-primary/40">Voltar à ficha</button></div>
    </footer>
  </div>
}
