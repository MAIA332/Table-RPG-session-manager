"use client"
import { controllerConfirm } from '@/lib/input/dialogs'

import { AbilityEditor } from "./creature-combat-editor"
import { BestiaryAttackEditor } from "./bestiary-attack-editor"
import { BESTIARY_DICE, validateBestiaryCombat, validateBestiaryDice, formatBestiaryFormula } from "@/lib/bestiary-attack-formula"
import { createClientId } from "@/lib/client-id"
import { defaultAttack, type Ability, type Attack, type CreatureCombat } from "@/lib/combat-model"

import { useEffect, useRef, useState } from "react"
import { useControllerModalNavigation } from "@/lib/input/modal-focus-return"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { useController } from "@/components/controller/controller-provider"
import { focusControllerElement } from "@/lib/input/focus"
import { ControllerGlyph } from "@/components/controller/controller-glyph"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Skull, X, Search, Heart, Zap, Target, Plus, Save, Trash2, FolderOpen, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BESTIARY } from "@/lib/game-data"
import { ELEMENTS, ELEMENT_NAMES, elementId } from "@/lib/elemental-affinities"
import type { Creature } from "@/lib/types"

function normalizeCreatureAffinities(value: unknown): Record<string, string> {
  const normalized: Record<string, string> = Object.fromEntries(ELEMENTS.map(element => [element, "none"]))
  if (!value || typeof value !== "object") return normalized
  for (const [key, raw] of Object.entries(value)) {
    const element = elementId(key)
    if (!element || typeof raw !== "string") continue
    if (normalized[element] === "none" || key === element) normalized[element] = raw
  }
  return normalized
}

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } }
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } }

interface GmBestiaryProps {
  isOpen: boolean
  onClose: () => void
  onSpawn: (creature: Creature) => void | Promise<void>
  onConvertToNpc: (creature: Creature) => Promise<void>
  customCreatures: Creature[]
  onCreate: (creature: Creature) => void | Promise<void>
  onUpdate: (creature: Creature) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

export function GmBestiary({ isOpen, onClose, onSpawn, onConvertToNpc, customCreatures, onCreate, onUpdate, onDelete }: GmBestiaryProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const {active: controllerActive} = useController()
  const [mobileSection, setMobileSection] = useState<"catalog" | "details">("catalog")
  const [editingCreature, setEditingCreature] = useState<Creature | null>(null)
  const [saving, setSaving] = useState(false)
  const [spawning, setSpawning] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState("")
  const [affinities, setAffinities] = useState<Record<string, string>>(() => normalizeCreatureAffinities(null))
  const [equipmentText, setEquipmentText] = useState("")
  const [spellsText, setSpellsText] = useState("")
  async function closeEditor() {
    if (savingRef.current) return
    if (isCreating && !await controllerConfirm("Descartar as alterações não salvas?")) return
    setIsCreating(false)
    setError("")
    onClose()
  }
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredCreature, setHoveredCreature] = useState<Creature | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  // B retorna à lista no celular; no desktop fecha com confirmação de rascunho.
  useControllerModalNavigation(isOpen, dialogRef, () => {
    if (typeof window !== "undefined" && window.innerWidth < 768 && mobileSection === "details" && !isCreating) {
      setMobileSection("catalog")
    } else void closeEditor()
  }, 325)

  // Ao alternar catálogo/ficha no controle, não deixar o foco numa área oculta.
  useEffect(() => {
    if (!isOpen || !controllerActive || typeof window === "undefined" || window.innerWidth >= 768) return
    const frame = requestAnimationFrame(() => {
      const scope = dialogRef.current?.querySelector<HTMLElement>(mobileSection === "catalog" ? ".rpg-bestiary-catalog" : ".rpg-bestiary-details")
      const target = mobileSection === "catalog"
        ? scope?.querySelector<HTMLElement>('[data-controller-initial],button:not([disabled])')
        : scope?.querySelector<HTMLElement>('[data-bestiary-detail-start],input:not([disabled]),button:not([disabled])')
      if (target) focusControllerElement(target)
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, controllerActive, mobileSection, hoveredCreature?.id, isCreating])

  // Junta o bestiário fixo com as criaturas criadas pelo mestre
  const allCreatures = [...customCreatures, ...BESTIARY.filter(base => !customCreatures.some(custom => custom.id === base.id))]

  // Filtra as criaturas com base na pesquisa
  const filteredBestiary = allCreatures.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.species.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Agrupa as criaturas por Espécie (Pastas)
  const groupedCreatures = allCreatures.reduce((acc, c) => {
    const folder = c.species?.trim() || "Outros";
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(c);
    return acc;
  }, {} as Record<string, Creature[]>);

  // Ordena as pastas em ordem alfabética
  const sortedFolders = Object.keys(groupedCreatures).sort((a, b) => a.localeCompare(b));

  const isSearching = searchQuery.trim().length > 0;
  const firstVisibleFolder = sortedFolders.find(folder => groupedCreatures[folder].some(c => filteredBestiary.includes(c)))
  const firstVisibleCreatureId = firstVisibleFolder && groupedCreatures[firstVisibleFolder].find(c => filteredBestiary.includes(c))?.id

  function toggleFolder(folder: string) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  // Estado do formulário de rascunho da criatura
  const [draft, setDraft] = useState({
    name: "",
    imageUrl: "",
    level: 5,
    species: "Monstro",
    maxHp: 40,
    maxMp: 20,
    def: 10,
    mdef: 10,
    attributes: { dex: "d6", ins: "d6", mig: "d6", wlp: "d6" },

  })

  const [attacks, setAttacks] = useState<Attack[]>([defaultAttack()])
  const [abilities, setAbilities] = useState<Ability[]>([])

  async function openEditor(creature?: Creature) {
    if (savingRef.current) return
    if (isCreating && !await controllerConfirm("Descartar as alterações não salvas?")) return
    setError("")
    setEditingCreature(creature ? structuredClone(creature) : null)
    setDraft(creature ? {
      name: creature.name, imageUrl: creature.imageUrl, level: creature.level,
      species: creature.species, maxHp: creature.maxHp, maxMp: creature.maxMp,
      def: creature.def, mdef: creature.mdef, attributes: { ...creature.attributes },
    } : { name: "", imageUrl: "", level: 5, species: "Monstro", maxHp: 40, maxMp: 20, def: 10, mdef: 10, attributes: { dex: "d6", ins: "d6", mig: "d6", wlp: "d6" } })
    const modern = creature?.basicAttacksV2 as Attack[] | undefined
    setAttacks(modern?.length ? structuredClone(modern) : creature?.basicAttacks?.length ? creature.basicAttacks.map(a => ({
      ...a, damage: String(a.description?.match(/Dano:\s*([^;]+)/i)?.[1] || a.damage),
      attributes: [...a.attributes], targetDefense: /Defesa Mágica/i.test(a.description || "") ? "magical" : "physical",
    })) : [defaultAttack()])
    setAbilities(structuredClone(creature?.abilities || []))
    setAffinities(normalizeCreatureAffinities(creature?.affinities))
    setEquipmentText((creature?.equipment || []).join("\n"))
    setSpellsText((creature?.spells || []).join("\n"))
    setIsCreating(true)
    setMobileSection("details")
  }

  async function handleSaveDraft() {
    if (savingRef.current) return
    const diceError = validateBestiaryDice(draft.attributes)
    if (diceError) return setError(diceError)
    const combatError = validateBestiaryCombat(attacks, abilities)
    if (combatError) return setError(combatError)
    if (!draft.name.trim()) return setError("Dê um nome à criatura.")
    if (!draft.species.trim()) return setError("Informe a espécie da criatura.")
    if (![draft.level, draft.maxHp, draft.maxMp, draft.def, draft.mdef].every(n => Number.isSafeInteger(n) && n >= 0) || draft.level < 1 || draft.maxHp < 1) return setError("Use números inteiros positivos para nível e vida; mana e defesas não podem ser negativas.")
    const newCreature: Creature & CreatureCombat = {
      ...editingCreature,
      ...draft,
      id: editingCreature?.id || "custom-" + createClientId(),
      name: draft.name.trim(), species: draft.species.trim(),
      imageUrl: draft.imageUrl.trim() || "/mystic-adventurer-portrait.png",
      attributes: draft.attributes as Creature["attributes"],
      affinities: affinities as unknown as Creature["affinities"],
      basicAttacks: attacks.map(attack => ({ name: attack.name, attributes: attack.attributes as Creature["basicAttacks"][number]["attributes"], damage: /^\d+$/.test(attack.damage.trim()) ? Number(attack.damage) : 0, type: attack.type, description: `Dano: ${attack.damage}; alvo: ${attack.targetDefense === "physical" ? "Defesa Física" : "Defesa Mágica"}${attack.description ? "; " + attack.description : ""}` })),
      combatVersion: 2, basicAttacksV2: attacks, abilities,
      spells: spellsText.split("\n").map(s => s.trim()).filter(Boolean),
      equipment: equipmentText.split("\n").map(s => s.trim()).filter(Boolean),
    }
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      if (editingCreature) await onUpdate(newCreature)
      else await onCreate(newCreature)
      setHoveredCreature(newCreature)
      setIsCreating(false)
      setEditingCreature(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Os atalhos são físicos e temporários: RB invoca, LB edita. Nunca
  // executam a ação sobre um formulário aberto ou uma criatura não selecionada.
  useControllerActions({
    'bestiary.spawn': () => {
      if (!isCreating && hoveredCreature && !savingRef.current && !spawning) void spawnSelected()
      return true
    },
    'bestiary.edit': () => {
      if (!isCreating && hoveredCreature && !savingRef.current && !spawning)
        void openEditor(hoveredCreature)
      return true
    },
  }, { enabled: isOpen && controllerActive, priority: 360 })

  async function spawnSelected() {
    if (!hoveredCreature || spawning || saving) return
    setSpawning(true)
    setError("")
    try { await onSpawn(hoveredCreature) }
    catch (error) { setError(error instanceof Error ? error.message : "Invocação não confirmada.") }
    finally { setSpawning(false) }
  }

  async function deleteSelected() {
    if (!hoveredCreature || savingRef.current || !await controllerConfirm("Excluir esta criatura do bestiário?")) return
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      await onDelete(hoveredCreature.id)
      setHoveredCreature(null)
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir.") }
    finally { savingRef.current = false; setSaving(false) }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="rpg-archive-overlay fixed inset-0 z-[820] flex h-[100dvh] w-screen overflow-hidden bg-[#060c12]" onClick={closeEditor}>
          <motion.div ref={dialogRef} variants={modalVariants} role="dialog" aria-modal="true" aria-label="Bestiário do mestre" data-controller-layer="active" data-controller-scroll-root="bestiary" data-controller-bestiary-shortcuts="active" data-mobile-section={mobileSection} className="rpg-bestiary-fullscreen relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); void closeEditor() } }} onClick={(event) => event.stopPropagation()}>
            
            <header className="rpg-archive-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10">
              <div className="min-w-0">
                <span className="rpg-archive-eyebrow">Biblioteca da campanha / Compêndio</span>
                <h4 className="flex items-center gap-3 font-serif text-xl font-black text-foreground sm:text-2xl">
                  <span className="rpg-bestiary-emblem grid size-10 shrink-0 place-items-center rounded-xl"><Skull className="size-5"/></span>
                  Bestiário do Mestre
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{allCreatures.length} criaturas no acervo · {sortedFolders.length} categorias</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rpg-bestiary-mobile-switch inline-flex items-center gap-1 rounded-xl border border-white/10 p-1 md:hidden" role="group" aria-label="Navegação do bestiário">
                  <button type="button" onClick={() => setMobileSection("catalog")} aria-pressed={mobileSection === "catalog"} className="rounded-lg px-3 py-2 text-xs font-bold">Criaturas</button>
                  <button type="button" onClick={() => setMobileSection("details")} aria-pressed={mobileSection === "details"} className="rounded-lg px-3 py-2 text-xs font-bold">Detalhes</button>
                </div>
                <button type="button" aria-label="Fechar bestiário" onClick={() => void closeEditor()} className="rpg-archive-close grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"><X className="size-5" /></button>
              </div>
            </header>

            <div className="rpg-bestiary-layout flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
              {/* COLUNA ESQUERDA: LISTA EM PASTAS */}
              <aside className="rpg-bestiary-catalog flex min-h-0 flex-col gap-3 border-r border-white/10 bg-black/20 p-3 sm:p-4 md:w-[min(31vw,365px)] md:shrink-0">
                <div className="flex gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar criatura..." 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="w-full bg-black/40 border border-white/10 rounded-md py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive/50 transition-colors" 
                    />
                  </div>
                  <Button size="icon" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0" disabled={saving} onClick={() => openEditor()} title="Forjar nova criatura">
                    <Plus className="size-4" />
                  </Button>
                </div>
                
                <div data-controller-scrollport="true" className="rpg-bestiary-list min-h-0 flex-1 overflow-y-auto custom-scrollbar-sepia flex flex-col gap-4 pr-2">
                  {sortedFolders.map(folder => {
                    // Se estiver pesquisando, filtra o que aparece dentro da pasta
                    const folderCreatures = groupedCreatures[folder].filter(c => 
                      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      c.species.toLowerCase().includes(searchQuery.toLowerCase())
                    );

                    // Se não tiver nenhuma criatura correspondente na pasta durante a pesquisa, oculta a pasta
                    if (folderCreatures.length === 0) return null;

                    // A pasta abre automaticamente se houver uma pesquisa em andamento
                    const isCollapsed = collapsedFolders.has(folder) && !isSearching;

                    return (
                      <div key={folder} className="flex flex-col gap-2 shrink-0">
                        <button 
                          onClick={() => toggleFolder(folder)} 
                          className="flex items-center justify-between p-2 bg-black/60 border border-white/10 rounded-md hover:bg-black transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FolderOpen className="size-4 text-destructive/70" />
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{folder}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground bg-black/50 px-2 py-0.5 rounded">{folderCreatures.length}</span>
                            <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-300 ${isCollapsed ? "" : "rotate-180 text-destructive"}`} />
                          </div>
                        </button>
                        
                        <AnimatePresence>
                          {!isCollapsed && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="flex flex-col gap-2 pl-2 border-l border-white/5 ml-2 overflow-hidden"
                            >
                              {folderCreatures.map(c => {
                                const isCustom = customCreatures.some(custom => custom.id === c.id);
                                return (
                                  <button 
                                    key={c.id} 
                                    onClick={async () => { if (!savingRef.current && (!isCreating || await controllerConfirm("Descartar as alterações não salvas?"))) { setHoveredCreature(c); setIsCreating(false); setMobileSection("details"); } }} 
                                    // IMPORTANTE: O shrink-0 previne o esmagamento dos botões como na imagem que você mandou
                                    aria-pressed={hoveredCreature?.id === c.id && !isCreating}
                                    data-controller-initial={c.id === firstVisibleCreatureId ? "true" : undefined}
                                    className={`rpg-bestiary-creature shrink-0 text-left p-3 rounded-xl border transition-colors relative overflow-hidden ${hoveredCreature?.id === c.id && !isCreating ? "is-selected bg-destructive/10 border-destructive/50" : "bg-card/40 border-border/30 hover:border-destructive/30"}`}
                                  >
                                    {isCustom && <div className="absolute top-0 right-0 border-l border-b border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 rounded-bl text-[8px] font-bold uppercase tracking-widest text-purple-400 shadow-sm">Custom</div>}
                                    <p className="font-bold text-foreground text-sm pr-10 truncate">{c.name}</p>
                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Lv. {c.level}</p>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                  {filteredBestiary.length === 0 && <p className="text-xs text-muted-foreground text-center mt-4 border border-dashed border-white/10 p-4 rounded-lg bg-black/20">Nenhuma criatura encontrada.</p>}
                </div>
              </aside>

              {/* COLUNA DIREITA: VISUALIZAÇÃO OU CRIAÇÃO */}
              <main data-controller-scrollport="true" className="rpg-bestiary-details min-h-0 min-w-0 flex-1 overflow-y-auto custom-scrollbar-sepia bg-black/10 p-4 sm:p-6 lg:p-8">
                {error && <p role="alert" className="mb-4 rounded-lg border border-red-400 bg-red-950 p-3 text-red-100">{error}</p>}
                {isCreating ? (
                  <fieldset disabled={saving} className="flex min-w-0 flex-col gap-6 animate-in fade-in slide-in-from-right-4 max-w-2xl mx-auto">
                    <div className="flex items-center justify-between border-b border-destructive/30 pb-4">
                      <h2 tabIndex={-1} data-controller-item="true" data-bestiary-detail-start="true" className="font-serif text-2xl font-black text-foreground flex items-center gap-2"><Plus className="size-5 text-destructive" /> {editingCreature ? "Editar Criatura" : "Forjar Nova Criatura"}</h2>
                      <Button variant="ghost" size="sm" onClick={async () => { if (await controllerConfirm("Descartar as alterações não salvas?")) { setIsCreating(false); setError(""); } }}>Cancelar</Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Nome da Criatura</span>
                        <input type="text" value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} className="bg-black/50 border border-white/10 rounded p-2.5 text-sm focus:border-destructive/50 outline-none" placeholder="Ex: Dragão Infernal" />
                      </label>
                      <label className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">URL da Imagem</span>
                        <input type="text" value={draft.imageUrl} onChange={e => setDraft({...draft, imageUrl: e.target.value})} className="bg-black/50 border border-white/10 rounded p-2.5 text-sm focus:border-destructive/50 outline-none" placeholder="https://..." />
                      </label>

                      <div className="col-span-2 grid grid-cols-4 gap-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Level</span>
                          <input type="number" value={draft.level} onChange={e => setDraft({...draft, level: Number(e.target.value)})} className="bg-black/50 border border-white/10 rounded p-2.5 text-sm font-mono focus:border-destructive/50 outline-none" />
                        </label>
                        <label className="flex flex-col gap-1.5 col-span-3">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Espécie (Define a Pasta)</span>
                          <input type="text" value={draft.species} onChange={e => setDraft({...draft, species: e.target.value})} className="bg-black/50 border border-white/10 rounded p-2.5 text-sm focus:border-destructive/50 outline-none" placeholder="Besta, Humanóide, Monstro..." />
                        </label>
                      </div>

                      <div className="col-span-2 border border-border/30 rounded-lg p-4 bg-card/10 mt-2">
                        <p className="text-xs font-bold text-primary mb-3">Atributos (Dados)</p>
                        <div className="grid grid-cols-4 gap-3">
                          {(["dex", "ins", "mig", "wlp"] as const).map(attr => (
                            <label key={attr} className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{attr}</span>
                              <select value={(draft.attributes as any)[attr]} onChange={e => setDraft({...draft, attributes: {...draft.attributes, [attr]: e.target.value}})} className="bg-black/50 border border-white/10 rounded p-2 text-xs font-mono focus:border-destructive/50 outline-none">
                                {BESTIARY_DICE.map((die:any) => <option key={die} value={die}>{die}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="col-span-2 grid grid-cols-4 gap-3">
                        <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest text-[color:var(--hp)] font-bold">Max HP</span><input type="number" value={draft.maxHp} onChange={e => setDraft({...draft, maxHp: Number(e.target.value)})} className="bg-black/50 border border-white/10 rounded p-2 text-sm font-mono outline-none" /></label>
                        <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest text-[color:var(--mp)] font-bold">Max MP</span><input type="number" value={draft.maxMp} onChange={e => setDraft({...draft, maxMp: Number(e.target.value)})} className="bg-black/50 border border-white/10 rounded p-2 text-sm font-mono outline-none" /></label>
                        <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Defesa</span><input type="number" value={draft.def} onChange={e => setDraft({...draft, def: Number(e.target.value)})} className="bg-black/50 border border-white/10 rounded p-2 text-sm font-mono outline-none" /></label>
                        <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Def. Mág.</span><input type="number" value={draft.mdef} onChange={e => setDraft({...draft, mdef: Number(e.target.value)})} className="bg-black/50 border border-white/10 rounded p-2 text-sm font-mono outline-none" /></label>
                      </div>

                      <div className="col-span-2 border border-border/30 rounded-lg p-4 bg-card/10 mt-2">
                        <p className="text-xs font-bold text-destructive mb-3">Ataques básicos</p>
                        {attacks.map((attack, index) => <div key={index} className="mb-4 space-y-2 rounded-lg border border-white/10 p-3">
                          <BestiaryAttackEditor value={attack} creatureDice={draft.attributes} onChange={value => setAttacks(previous => previous.map((entry, i) => i === index ? value : entry))} />
                          <Button variant="ghost" size="sm" disabled={attacks.length === 1} onClick={() => setAttacks(previous => previous.filter((_, i) => i !== index))}>Remover ataque</Button>
                        </div>)}
                        <Button variant="outline" onClick={() => setAttacks(previous => [...previous, defaultAttack()])}>+ Adicionar ataque</Button>
                      </div>
                      <div className="col-span-2 space-y-3">
                        <p className="text-sm font-bold">Afinidades</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {ELEMENTS.map(key => <label key={key} className="flex flex-col gap-1 text-xs">
                            {ELEMENT_NAMES[key]}
                            <select className="rounded bg-zinc-900 p-2" value={affinities[key] || "none"} onChange={e => setAffinities(previous => ({...previous, [key]: e.target.value}))}>
                              <option value="none">Normal (1×)</option><option value="WK">Fraqueza (2×)</option><option value="VU">Vulnerável (1,5×)</option><option value="RS">Resistente (0,5×)</option><option value="AB">Absorve (0,2×)</option><option value="IM">Imune (0×)</option>
                            </select>
                          </label>)}
                        </div>
                        <label className="flex flex-col gap-2 text-sm">Equipamentos (um ID por linha)<textarea className="rounded bg-zinc-900 p-3" rows={3} value={equipmentText} onChange={e => setEquipmentText(e.target.value)} /></label>
                        <label className="flex flex-col gap-2 text-sm">Anotações de magias antigas (uma por linha)<textarea className="rounded bg-zinc-900 p-3" rows={3} value={spellsText} onChange={e => setSpellsText(e.target.value)} /></label>
                        <p className="text-xs text-muted-foreground">As anotações são preservadas. Cadastre abaixo as habilidades que deseja automatizar. Alterações no bestiário valem para as próximas invocações.</p>
                      </div>
                      <div className="col-span-2"><AbilityEditor value={abilities} onChange={setAbilities} creatureDice={draft.attributes} /></div>

                    </div>

                    <div className="flex justify-end pt-4 mt-2 border-t border-border/40">
                      <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground px-8 font-bold gap-2" onClick={handleSaveDraft}>
                        <Save className="size-4" /> {saving ? "Salvando..." : editingCreature ? "Salvar alterações" : "Registrar Criatura"}
                      </Button>
                    </div>
                  </fieldset>
                ) : hoveredCreature ? (
                  <div className="flex flex-col gap-6 animate-in fade-in">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-6">
                        <div className="relative w-32 h-32 rounded-xl border border-destructive/30 overflow-hidden shrink-0 shadow-[0_0_15px_rgba(255,0,0,0.1)]">
                          <Image src={hoveredCreature.imageUrl} alt={hoveredCreature.name} fill className="object-cover" />
                        </div>
                        <div className="flex flex-col justify-center">
                          <h2 tabIndex={-1} data-controller-item="true" data-bestiary-detail-start="true" className="font-serif text-3xl font-black text-foreground">{hoveredCreature.name}</h2>
                          <p className="text-sm font-bold tracking-widest uppercase text-destructive mt-1">Lv. {hoveredCreature.level} · {hoveredCreature.species}</p>
                          <div className="flex gap-4 mt-4">
                            <span className="flex items-center gap-1.5 text-sm text-[color:var(--hp)]"><Heart className="size-4" /> {hoveredCreature.maxHp} HP</span>
                            <span className="flex items-center gap-1.5 text-sm text-[color:var(--mp)]"><Zap className="size-4" /> {hoveredCreature.maxMp} MP</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={saving || spawning} onClick={() => openEditor(hoveredCreature)} className="gap-2"><ControllerGlyph button="LB" small/> Editar criatura</Button>
                        {customCreatures.some(custom => custom.id === hoveredCreature.id) &&
                          <Button variant="ghost" disabled={saving} onClick={deleteSelected} aria-label="Excluir criatura"><Trash2 className="size-4" /></Button>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {(["dex", "ins", "mig", "wlp"] as const).map((k) => (
                        <div key={k} className="p-2 border border-border/40 bg-card/30 rounded text-center">
                          <span className="text-[10px] uppercase text-muted-foreground font-bold">{k}</span>
                          <p className="font-mono text-lg font-black text-primary">{hoveredCreature.attributes[k]}</p>
                        </div>
                      ))}
                      <div className="p-2 border border-border/40 bg-card/30 rounded text-center col-span-2"><span className="text-[10px] uppercase text-muted-foreground font-bold">Defesa</span><p className="font-mono text-lg font-black text-foreground">{hoveredCreature.def}</p></div>
                      <div className="p-2 border border-border/40 bg-card/30 rounded text-center col-span-2"><span className="text-[10px] uppercase text-muted-foreground font-bold">Defesa Mágica</span><p className="font-mono text-lg font-black text-foreground">{hoveredCreature.mdef}</p></div>
                    </div>
                    
                    {/* Exibição de Ataques e Magias */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-black/30 border border-white/5 rounded-lg p-4">
                        <p className="text-xs font-bold text-destructive uppercase tracking-widest mb-3">Ataques</p>
                        <div className="space-y-3">
                          {((hoveredCreature as Creature & Partial<CreatureCombat>).basicAttacksV2 || hoveredCreature.basicAttacks)?.map((atk: any, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-bold text-foreground">{atk.name}</span> <span className="text-muted-foreground">({formatBestiaryFormula(atk.attributes || [], hoveredCreature.attributes)})</span>
                              <p className="text-xs text-muted-foreground mt-0.5">Dano: <span className="text-white font-mono">{atk.damage}</span> {atk.type}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-black/30 border border-white/5 rounded-lg p-4">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Habilidades / Passivas</p>
                        <ul className="space-y-2 list-disc list-inside text-sm text-muted-foreground ml-3">
                          {hoveredCreature.abilities?.map((ability: Ability) => <li key={ability.id}>{ability.name} — {ability.kind === "passive" ? `${ability.trigger}: ${ability.effect}` : ability.kind === "attack" ? `${formatBestiaryFormula(ability.attack.attributes, hoveredCreature.attributes)} · ${ability.attack.damage} ${ability.attack.type}` : `QTE ${ability.seconds}s · dificuldade ${ability.difficulty}`}</li>)}
                          {hoveredCreature.spells?.map((spell, idx) => (
                            <li key={idx} className="leading-relaxed">{spell}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <Button variant="outline" disabled={spawning || saving} onClick={async () => { setSpawning(true); setError(""); try { await onConvertToNpc(hoveredCreature); onClose() } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na conversão.") } finally { setSpawning(false) } }}>Converter em NPC do Berçário</Button>
                    <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)] mt-2" disabled={spawning || saving} onClick={() => void spawnSelected()}>
                      <ControllerGlyph button="RB" small/><Target className="size-5" /> {spawning ? "Invocando..." : "Invocar para a Mesa"}
                    </Button>
                  </div>
                ) : (
                  <div className="rpg-bestiary-empty flex min-h-full flex-col items-center justify-center gap-3 text-center">
                    <span className="rpg-bestiary-emblem grid size-20 place-items-center rounded-2xl"><Skull className="size-10"/></span>
                    <h2 className="mt-2 font-serif text-2xl font-bold text-foreground">Seu bestiário, seu mundo</h2>
                    <p className="max-w-md text-sm leading-relaxed text-muted-foreground">Escolha uma criatura na lista para ver atributos e ataques, invocá-la na mesa ou preparar novas ameaças.</p>
                    <Button variant="outline" className="mt-3 gap-2" onClick={() => void openEditor()}><Plus className="size-4"/> Forjar criatura</Button>
                  </div>
                )}
              </main>
            </div>
            <footer className="rpg-archive-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 text-[11px] text-muted-foreground">
              <span>Selecione uma criatura para ver atributos, ataques e ações.</span>
              <span className="inline-flex flex-wrap items-center gap-2">Direcional navegar <ControllerGlyph button="A" small/> Selecionar <ControllerGlyph button="B" small/> Voltar <ControllerGlyph button="RB" small/> Invocar <ControllerGlyph button="LB" small/> Editar</span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
