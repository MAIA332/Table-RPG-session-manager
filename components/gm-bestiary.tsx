"use client"

import { AttackEditor, AbilityEditor } from "./creature-combat-editor"
import { defaultAttack, validateCombat, type Ability, type Attack, type CreatureCombat } from "@/lib/combat-model"

import { useRef, useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Skull, X, Search, Heart, Zap, Target, Plus, Save, Trash2, FolderOpen, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BESTIARY } from "@/lib/game-data"
import type { Creature } from "@/lib/types"

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } }
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } }

interface GmBestiaryProps {
  isOpen: boolean
  onClose: () => void
  onSpawn: (creature: Creature) => void
  customCreatures: Creature[]
  onCreate: (creature: Creature) => void | Promise<void>
  onUpdate: (creature: Creature) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

export function GmBestiary({ isOpen, onClose, onSpawn, customCreatures, onCreate, onUpdate, onDelete }: GmBestiaryProps) {
  const [editingCreature, setEditingCreature] = useState<Creature | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState("")
  const [affinities, setAffinities] = useState<Creature["affinities"]>({ physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "none", ice: "none", light: "none", poison: "none" })
  const [equipmentText, setEquipmentText] = useState("")
  const [spellsText, setSpellsText] = useState("")
  function closeEditor() {
    if (savingRef.current) return
    if (isCreating && !confirm("Descartar as alterações não salvas?")) return
    setIsCreating(false)
    setError("")
    onClose()
  }
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredCreature, setHoveredCreature] = useState<Creature | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

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

  function openEditor(creature?: Creature) {
    if (savingRef.current) return
    if (isCreating && !confirm("Descartar as alterações não salvas?")) return
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
    setAffinities({ physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "none", ice: "none", light: "none", poison: "none", ...creature?.affinities })
    setEquipmentText((creature?.equipment || []).join("\n"))
    setSpellsText((creature?.spells || []).join("\n"))
    setIsCreating(true)
  }

  async function handleSaveDraft() {
    if (savingRef.current) return
    const combatError = validateCombat(attacks, abilities)
    if (combatError) return setError(combatError)
    if (!draft.name.trim()) return setError("Dê um nome à criatura.")
    if (!draft.species.trim()) return setError("Informe a espécie da criatura.")
    if (![draft.level, draft.maxHp, draft.maxMp, draft.def, draft.mdef].every(n => Number.isSafeInteger(n) && n >= 0) || draft.level < 1 || draft.maxHp < 1) return setError("Use números inteiros positivos para nível e vida; mana e defesas não podem ser negativas.")
    const newCreature: Creature & CreatureCombat = {
      ...editingCreature,
      ...draft,
      id: editingCreature?.id || "custom-" + crypto.randomUUID(),
      name: draft.name.trim(), species: draft.species.trim(),
      imageUrl: draft.imageUrl.trim() || "/mystic-adventurer-portrait.png",
      attributes: draft.attributes as Creature["attributes"],
      affinities,
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

  async function deleteSelected() {
    if (!hoveredCreature || savingRef.current || !confirm("Excluir esta criatura do bestiário?")) return
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
        <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden" onClick={closeEditor}>
          <motion.div variants={modalVariants} className="rpg-modal relative flex h-full w-full max-w-6xl flex-col overflow-hidden border border-destructive/50 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            
            <div className="flex justify-between items-center gap-4 p-6 border-b border-white/10 bg-black/40 shrink-0">
              <h4 className="font-serif text-2xl md:text-3xl font-black flex items-center gap-3">
                <Skull className="size-6 text-destructive md:size-8" /> 
                <span className="text-foreground">Bestiário do Mestre</span>
              </h4>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={closeEditor} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors">
                  <X className="size-5 md:size-6 text-muted-foreground hover:text-white" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* COLUNA ESQUERDA: LISTA EM PASTAS */}
              <div className="lg:w-1/3 border-r border-border/40 p-4 flex flex-col gap-4 bg-black/20">
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
                
                <div className="overflow-y-auto custom-scrollbar-sepia flex flex-col gap-4 flex-1 pr-2">
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
                                    onClick={() => { if (!savingRef.current && (!isCreating || confirm("Descartar as alterações não salvas?"))) { setHoveredCreature(c); setIsCreating(false); } }} 
                                    // IMPORTANTE: O shrink-0 previne o esmagamento dos botões como na imagem que você mandou
                                    className={`shrink-0 text-left p-3 rounded-lg border transition-colors relative overflow-hidden ${hoveredCreature?.id === c.id && !isCreating ? "bg-destructive/10 border-destructive/50 shadow-[0_0_10px_rgba(255,0,0,0.1)]" : "bg-card/40 border-border/30 hover:border-destructive/30"}`}
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
              </div>

              {/* COLUNA DIREITA: VISUALIZAÇÃO OU CRIAÇÃO */}
              <div className="lg:w-2/3 p-6 overflow-y-auto custom-scrollbar-sepia bg-black/20 relative">
                {error && <p role="alert" className="mb-4 rounded-lg border border-red-400 bg-red-950 p-3 text-red-100">{error}</p>}
                {isCreating ? (
                  <fieldset disabled={saving} className="flex min-w-0 flex-col gap-6 animate-in fade-in slide-in-from-right-4 max-w-2xl mx-auto">
                    <div className="flex items-center justify-between border-b border-destructive/30 pb-4">
                      <h2 className="font-serif text-2xl font-black text-foreground flex items-center gap-2"><Plus className="size-5 text-destructive" /> {editingCreature ? "Editar Criatura" : "Forjar Nova Criatura"}</h2>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Descartar as alterações não salvas?")) { setIsCreating(false); setError(""); } }}>Cancelar</Button>
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
                                <option value="d6">d6</option><option value="d8">d8</option><option value="d10">d10</option><option value="d12">d12</option>
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
                          <AttackEditor value={attack} onChange={value => setAttacks(previous => previous.map((entry, i) => i === index ? value : entry))} />
                          <Button variant="ghost" size="sm" disabled={attacks.length === 1} onClick={() => setAttacks(previous => previous.filter((_, i) => i !== index))}>Remover ataque</Button>
                        </div>)}
                        <Button variant="outline" onClick={() => setAttacks(previous => [...previous, defaultAttack()])}>+ Adicionar ataque</Button>
                      </div>
                      <div className="col-span-2 space-y-3">
                        <p className="text-sm font-bold">Afinidades</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {(Object.keys(affinities) as (keyof Creature["affinities"])[]).map(key => <label key={key} className="flex flex-col gap-1 text-xs">
                            {{physical: "Físico", air: "Ar", bolt: "Raio", dark: "Trevas", earth: "Terra", fire: "Fogo", ice: "Gelo", light: "Luz", poison: "Veneno"}[key]}
                            <select className="rounded bg-zinc-900 p-2" value={affinities[key]} onChange={e => setAffinities(previous => ({...previous, [key]: e.target.value as Creature["affinities"][typeof key]}))}>
                              <option value="none">Normal</option><option value="VU">Vulnerável</option><option value="RS">Resistente</option><option value="IM">Imune</option><option value="AB">Absorve</option>
                            </select>
                          </label>)}
                        </div>
                        <label className="flex flex-col gap-2 text-sm">Equipamentos (um ID por linha)<textarea className="rounded bg-zinc-900 p-3" rows={3} value={equipmentText} onChange={e => setEquipmentText(e.target.value)} /></label>
                        <label className="flex flex-col gap-2 text-sm">Anotações de magias antigas (uma por linha)<textarea className="rounded bg-zinc-900 p-3" rows={3} value={spellsText} onChange={e => setSpellsText(e.target.value)} /></label>
                        <p className="text-xs text-muted-foreground">As anotações são preservadas. Cadastre abaixo as habilidades que deseja automatizar. Alterações no bestiário valem para as próximas invocações.</p>
                      </div>
                      <div className="col-span-2"><AbilityEditor value={abilities} onChange={setAbilities} /></div>

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
                          <h2 className="font-serif text-3xl font-black text-foreground">{hoveredCreature.name}</h2>
                          <p className="text-sm font-bold tracking-widest uppercase text-destructive mt-1">Lv. {hoveredCreature.level} · {hoveredCreature.species}</p>
                          <div className="flex gap-4 mt-4">
                            <span className="flex items-center gap-1.5 text-sm text-[color:var(--hp)]"><Heart className="size-4" /> {hoveredCreature.maxHp} HP</span>
                            <span className="flex items-center gap-1.5 text-sm text-[color:var(--mp)]"><Zap className="size-4" /> {hoveredCreature.maxMp} MP</span>
                          </div>
                        </div>
                      </div>
                      
                      {customCreatures.some(custom => custom.id === hoveredCreature.id) && (
                        <div className="flex gap-2">
                          <Button variant="outline" disabled={saving} onClick={() => openEditor(hoveredCreature)}>Editar criatura</Button>
                          <Button variant="ghost" disabled={saving} onClick={deleteSelected} aria-label="Excluir criatura"><Trash2 className="size-4" /></Button>
                        </div>
                      )}
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
                              <span className="font-bold text-foreground">{atk.name}</span> <span className="text-muted-foreground">({atk.attributes?.join("+")?.toUpperCase()})</span>
                              <p className="text-xs text-muted-foreground mt-0.5">Dano: <span className="text-white font-mono">{atk.damage}</span> {atk.type}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-black/30 border border-white/5 rounded-lg p-4">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Habilidades / Passivas</p>
                        <ul className="space-y-2 list-disc list-inside text-sm text-muted-foreground ml-3">
                          {hoveredCreature.abilities?.map((ability: Ability) => <li key={ability.id}>{ability.name} — {ability.kind === "passive" ? `${ability.trigger}: ${ability.effect}` : ability.kind === "attack" ? `${ability.attack.damage} ${ability.attack.type}` : `QTE ${ability.seconds}s · dificuldade ${ability.difficulty}`}</li>)}
                          {hoveredCreature.spells?.map((spell, idx) => (
                            <li key={idx} className="leading-relaxed">{spell}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)] mt-2" onClick={() => onSpawn(hoveredCreature)}>
                      <Target className="size-5" /> Invocar para a Mesa
                    </Button>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic text-sm">Selecione uma criatura na lista ou forje uma nova.</div>
                )}
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}