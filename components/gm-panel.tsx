"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Gift, Search, ChevronDown, Package, Info, Coins, Loader2, Send, Sword, Shield, Gem, Plus, Save, Trash2, GraduationCap, Heart, Zap, Dices, FolderOpen, FolderPlus, EyeOff, Eye, ArrowRightLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CharacterPortrait } from "@/components/character-portrait"
import { EQUIPMENT } from "@/lib/game-data"
import type { Character, ActiveCreature, CustomItem } from "@/lib/types"
import { GMHazardPanel, HazardData } from "./condition-manager"
import type { StoreFolder } from "@/lib/types"

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

export interface Member {
  userId: string;
  role?: string;
  name: string;
}

interface GmPanelProps {
  isOpen: boolean
  onClose: () => void
  characters: Character[]
  activeCreatures: ActiveCreature[]
  members: Member[]
  customEquipment: any[]
  customClasses: any[]
  onCreateEquipment: (eq: any) => void
  onDeleteEquipment: (id: string) => void
  onCreateClass: (cls: any) => void
  onDeleteClass: (id: string) => void
  onGiveZenits: (targetId: string, amount: number) => Promise<void>
  onGiveCustomItem: (targetId: string, name: string, type: string, content: string) => Promise<void>
  onGiveSystemItem: (targetId: string, itemId: string) => Promise<void>
  storeFolders: StoreFolder[]
  onCreateFolder: (folder: StoreFolder) => void
  onUpdateFolder: (id: string, updates: Partial<StoreFolder>) => void
  onDeleteFolder: (id: string) => void
  onMoveCustomItem: (itemId: string, folderId: string) => void

  activeHazards: HazardData[]

  onLaunchHazard: (
    type: "oxygen" | "bleeding" | "reaction",
    minutes: number,
    targetCharacterIds: string[] | null
  ) => void

  onStopHazard: (
    type: "oxygen" | "bleeding" | "reaction",
    targetCharacterIds: string[] | null
  ) => void
}

export function GmPanel({
  isOpen,
  onClose,
  characters,
  activeCreatures,
  members,
  customEquipment,
  customClasses,
  onCreateEquipment,
  onDeleteEquipment,
  onCreateClass,
  onDeleteClass,
  onGiveZenits,
  onGiveCustomItem,
  onGiveSystemItem,

  // Pastas da loja
  storeFolders,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveCustomItem,

  activeHazards,
  onLaunchHazard,
  onStopHazard
}: GmPanelProps) {

  const [gmPanelTab, setGmPanelTab] = useState<"catalog" | "custom" | "zenits" | "classes" | "hazards" | "store-config">("catalog")
  const [zenitAmount, setZenitAmount] = useState<number | "">("")
  const [selectedLoot, setSelectedLoot] = useState<string | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<string | null>(null)
  const [sendingLoot, setSendingLoot] = useState(false)
  const [lootSearchQuery, setLootSearchQuery] = useState("")
  const [newFolderName, setNewFolderName] = useState("")

  // Rascunho Relíquias
  const [customItemName, setCustomItemName] = useState("")
  const [customItemType, setCustomItemType] = useState<"text" | "image" | "video" | "app-blueprints">("text")
  const [customItemContent, setCustomItemContent] = useState("")

  // 3. APAGUEI O STATE activeHazards DAQUI, ELE AGORA VEM DAS PROPS LÁ DE CIMA
  // 4. APAGUEI O handleLaunchHazard E O handleStopHazard DAQUI TAMBÉM

  // Rascunho Equipamentos de Sistema
  const [creationMode, setCreationMode] = useState<"relic" | "system">("system")
  const [sysDraft, setSysDraft] = useState({
    name: "", category: "weapon", cost: 100, purchasable: true,
    detail: "", damage: "", defense: "", mdef: "", type: "", bonus: "", effect: ""
  })

  // Rascunho de Classe (Homebrew)
  const [classDraft, setClassDraft] = useState({
    name: "", archetype: "", description: "", hpPerLevel: 5, mpPerLevel: 5, primaryAttribute: "mig",
    skills: [
      { id: "sk1", name: "", maxLevel: 5, description: "" }
    ]
  })

  const defaultFolders: StoreFolder[] = [
    {
      id: "system",
      name: "SISTEMA",
      isVisible: true,
      isSystem: true
    },
    {
      id: "custom",
      name: "CUSTOM",
      isVisible: true,
      isSystem: true
    }
  ]

  const persistedFolders = Array.isArray(storeFolders) ? storeFolders : []

  const allFolders: StoreFolder[] = [
    ...defaultFolders.map(defaultFolder => {
      const persisted = persistedFolders.find(
        folder => folder.id === defaultFolder.id
      )

      return persisted
        ? {
          ...defaultFolder,
          ...persisted,
          isSystem: true
        }
        : defaultFolder
    }),

    ...persistedFolders.filter(folder => !folder.isSystem)
  ]

  // Função para criar pasta
  function handleCreateFolder() {
    if (!newFolderName.trim()) return alert("Dê um nome para a pasta.")
    onCreateFolder({
      id: "folder-" + Math.random().toString(36).substring(2, 9),
      name: newFolderName,
      isVisible: true,
      isSystem: false
    })
    setNewFolderName("")
  }

  const allLoot = [...customEquipment, ...EQUIPMENT]
  const filteredLoot = allLoot.filter(item =>
    item.name.toLowerCase().includes(lootSearchQuery.toLowerCase()) ||
    item.detail.toLowerCase().includes(lootSearchQuery.toLowerCase())
  )



  function handleSaveSystemItem() {
    if (!sysDraft.name.trim() || !sysDraft.detail.trim()) return alert("Preencha o nome e a descrição do equipamento.")

    const newEq = {
      id: "custom-eq-" + Math.random().toString(36).substring(2, 10),
      name: sysDraft.name,
      category: sysDraft.category,
      cost: Number(sysDraft.cost),
      purchasable: String(sysDraft.purchasable) === "true",
      detail: sysDraft.detail,
      damage: sysDraft.damage,
      defense: sysDraft.defense,
      mdef: sysDraft.mdef,
      type: sysDraft.type,
      bonus: sysDraft.bonus,
      effect: sysDraft.effect,

      // Todo item custom começa na pasta CUSTOM
      folderId: "custom"
    }
    onCreateEquipment(newEq)
    setSysDraft({ name: "", category: "weapon", cost: 100, purchasable: true, detail: "", damage: "", defense: "", mdef: "", type: "", bonus: "", effect: "" })
    alert("Equipamento Forjado com sucesso! Ele agora aparece no Catálogo e na Loja.")
    setGmPanelTab("catalog")
  }

  const customDestinationFolders = [
    allFolders.find(folder => folder.id === "custom"),
    ...allFolders.filter(folder => !folder.isSystem)
  ].filter(Boolean) as StoreFolder[]

  function handleSaveClass() {
    if (!classDraft.name.trim() || !classDraft.archetype.trim() || !classDraft.description.trim()) {
      return alert("Preencha nome, arquétipo e descrição da classe.")
    }

    const validSkills = classDraft.skills.filter(s => s.name.trim() !== "" && s.description.trim() !== "");
    if (validSkills.length === 0) {
      return alert("A classe precisa ter pelo menos 1 habilidade válida preenchida.")
    }

    const newClass = {
      id: "custom-class-" + Math.random().toString(36).substring(2, 10),
      name: classDraft.name,
      archetype: classDraft.archetype,
      description: classDraft.description,
      hpPerLevel: Number(classDraft.hpPerLevel),
      mpPerLevel: Number(classDraft.mpPerLevel),
      primaryAttribute: classDraft.primaryAttribute,
      skills: validSkills.map((s, idx) => ({
        id: `cskill-${Math.random().toString(36).substring(2, 6)}-${idx}`,
        name: s.name,
        maxLevel: Number(s.maxLevel),
        description: s.description
      }))
    }
    onCreateClass(newClass)
    setClassDraft({
      name: "", archetype: "", description: "", hpPerLevel: 5, mpPerLevel: 5, primaryAttribute: "mig",
      skills: [{ id: "sk1", name: "", maxLevel: 5, description: "" }]
    })
    alert("Classe criada! Jogadores agora poderão subir o nível dela.")
  }

  async function handleGiveLoot() {
    if (!selectedTargetCharId) return alert("Selecione um alvo.")
    const targetCharacter = characters.find(c => c.id === selectedTargetCharId)

    setSendingLoot(true)
    try {
      if (gmPanelTab === 'zenits') {
        if (!zenitAmount || Number(zenitAmount) <= 0) {
          setSendingLoot(false)
          return alert("Insira um valor válido de Zenits.")
        }
        await onGiveZenits(selectedTargetCharId, Number(zenitAmount))
        setZenitAmount("")
      }
      else if (gmPanelTab === 'custom') {
        if (creationMode === "system") {
          setSendingLoot(false)
          return alert("Para entregar um Equipamento de Sistema, forje-o primeiro e depois entregue via Catálogo.")
        }
        if (!customItemName || (!customItemContent && customItemType !== 'app-blueprints')) {
          setSendingLoot(false)
          return alert("Preencha o nome e o conteúdo da Relíquia.")
        }
        if (customItemType === 'app-blueprints' && targetCharacter) {
          const gadgetsLevel = targetCharacter.skills["ti-gadgets"] || 0
          if (gadgetsLevel === 0) {
            setSendingLoot(false)
            return alert(`O personagem ${targetCharacter.name} não possui a perícia 'Aparelhos'.`)
          }
        }
        await onGiveCustomItem(selectedTargetCharId, customItemName, customItemType, customItemContent)
        setCustomItemName("")
        setCustomItemContent("")
      }
      else if (gmPanelTab === 'catalog') {
        if (!selectedLoot) {
          setSendingLoot(false)
          return alert("Selecione um item do catálogo.")
        }
        await onGiveSystemItem(selectedTargetCharId, selectedLoot)
        setSelectedLoot(null)
      }
    } catch (err) { alert("Erro ao enviar.") } finally { setSendingLoot(false) }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-hidden">
          <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-accent/30 bg-[#0a0a0a]">

            <div className="flex justify-between items-center p-6 border-b border-white/5 bg-black/60 shrink-0 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent"></div>
              <div>
                <h4 className="font-serif text-2xl font-black flex items-center gap-3">
                  <Gift className="size-6 text-accent" /> <span className="text-foreground">Baú do mestre</span>
                </h4>
                <p className="text-sm text-muted-foreground mt-1">Forje relíquias, armas de sistema ou construa classes homebrew.</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                <X className="size-5 text-muted-foreground hover:text-white" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-8 relative">
              <div className="flex bg-black/50 rounded-xl p-1.5 border border-white/5 w-full mx-auto max-w-2xl shrink-0 shadow-inner overflow-x-auto">
                <button onClick={() => { setGmPanelTab('catalog'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === 'catalog' ? 'bg-accent text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Catálogo</button>
                <button onClick={() => { setGmPanelTab('custom'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === 'custom' ? 'bg-accent text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Forjar Item</button>
                <button onClick={() => { setGmPanelTab('classes'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === 'classes' ? 'bg-amber-600 text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Classes (Homebrew)</button>
                <button onClick={() => { setGmPanelTab('zenits'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === 'zenits' ? 'bg-accent text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Dar Dinheiro</button>
                <button
                  onClick={() => { setGmPanelTab('hazards'); setSelectedLoot(null); }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === 'hazards' ? 'bg-red-900 text-white shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>
                  Ameaças
                </button>
                <button onClick={() => { setGmPanelTab('store-config'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === 'store-config' ? 'bg-indigo-600 text-white shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Loja & Pastas</button>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                    <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">1</span>
                    {gmPanelTab === 'catalog' ? "Escolha o Item" : gmPanelTab === 'custom' ? "O Que Deseja Forjar?" : gmPanelTab === 'classes' ? "Forjar Classe de Jogador" : "Quantidade de Zenits"}
                  </h5>

                  {gmPanelTab === 'catalog' ? (
                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 shadow-inner">
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <input type="text" placeholder="Buscar no compêndio..." value={lootSearchQuery} onChange={(e) => setLootSearchQuery(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all" />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar-sepia">
                        {filteredLoot.map((item) => {
                          const isSelected = selectedLoot === item.id;
                          const isCustom = item.id.startsWith("custom-eq-");
                          return (
                            <div key={item.id} className="relative group/card">
                              <button onClick={() => setSelectedLoot(isSelected ? null : item.id)} className={`w-full flex flex-col text-left p-4 rounded-xl border transition-all duration-300 overflow-hidden ${isSelected ? 'border-accent bg-accent/5 shadow-[0_0_20px_rgba(var(--accent-rgb, 212,175,55),0.1)]' : 'border-white/5 bg-[#161616] hover:border-white/20 hover:bg-[#1a1a1a]'}`}>
                                <div className="flex justify-between items-start w-full gap-2 pr-6">
                                  <div className="flex flex-col items-start gap-1.5">
                                    <p className={`font-bold text-sm transition-colors ${isSelected ? 'text-accent' : 'text-foreground'}`}>{item.name}</p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isCustom && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 uppercase tracking-widest">Custom</span>}
                                      {item.type && <span className="text-[9px] bg-black/60 text-muted-foreground px-2 py-0.5 rounded-full border border-white/5 uppercase tracking-widest">{item.type}</span>}
                                      {item.purchasable === false && <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">Oculto</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-mono text-accent/80 border border-accent/20 px-2 py-1 rounded-md bg-accent/5">{item.cost}z</span>
                                    <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-300 ${isSelected ? 'rotate-180 text-accent' : ''}`} />
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {isSelected && (
                                    <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 16 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} className="border-t border-accent/20 pt-4 flex flex-col gap-3 w-full">
                                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{item.detail || "Sem descrição."}</p>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {item.damage && <span className="text-[10px] font-mono bg-destructive/10 text-red-300 px-2 py-1 rounded border border-destructive/20">Dano: {item.damage}</span>}
                                        {item.defense && <span className="text-[10px] font-mono bg-blue-500/10 text-blue-300 px-2 py-1 rounded border border-blue-500/20">DEF: {item.defense}</span>}
                                        {item.mdef && <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20">M.DEF: {item.mdef}</span>}
                                        {item.bonus && <span className="text-[10px] font-mono bg-green-500/10 text-green-300 px-2 py-1 rounded border border-green-500/20">Bônus: {item.bonus}</span>}
                                        {item.effect && <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 px-2 py-1 rounded border border-amber-500/20">Efeito: {item.effect}</span>}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </button>

                              {isCustom && (
                                <button onClick={(e) => { e.stopPropagation(); onDeleteEquipment(item.id); if (selectedLoot === item.id) setSelectedLoot(null); }} className="absolute top-2 right-2 p-2 rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive opacity-0 group-hover/card:opacity-100 transition-all z-10" title="Apagar equipamento">
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {filteredLoot.length === 0 && (
                          <div className="col-span-2 py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-white/5 rounded-xl">
                            <Package className="size-8 opacity-20 mb-2" />
                            <p className="text-sm">Nenhum item encontrado.</p>
                          </div>
                        )}
                      </div>
                    </div>

                  ) : gmPanelTab === 'custom' ? (
                    <div className="flex flex-col gap-4 border border-white/5 rounded-xl p-5 bg-black/40 shadow-inner">

                      <div className="flex gap-2 p-1 bg-black/50 border border-white/10 rounded-lg">
                        <button onClick={() => setCreationMode("system")} className={`flex-1 text-xs py-2 rounded-md font-bold transition-all ${creationMode === "system" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-white"}`}>Equipamento (Sistema)</button>
                        <button onClick={() => setCreationMode("relic")} className={`flex-1 text-xs py-2 rounded-md font-bold transition-all ${creationMode === "relic" ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-white"}`}>Relíquia (Narrativa)</button>
                      </div>

                      {creationMode === "relic" ? (
                        <>
                          <input type="text" value={customItemName} onChange={e => setCustomItemName(e.target.value)} placeholder="Nome da Relíquia (Ex: Carta do Rei)" className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all" />
                          <select value={customItemType} onChange={e => setCustomItemType(e.target.value as any)} className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all">
                            <option value="text">Pergaminho / Carta (Texto Escrito)</option>
                            <option value="image">Magia de Fótons (Imagem via URL)</option>
                            <option value="video">Orbe da Lembrança (Vídeo do YouTube)</option>
                            <option value="app-blueprints">Interface: Almanaque Magitech</option>
                          </select>
                          {customItemType === 'text' ? (
                            <textarea value={customItemContent} onChange={e => setCustomItemContent(e.target.value)} placeholder="Escreva o conteúdo da carta aqui..." rows={4} className="w-full bg-[#111] border border-white/10 rounded-lg py-3 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all custom-scrollbar-sepia resize-none" />
                          ) : customItemType === 'app-blueprints' ? (
                            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-200 flex gap-3 items-center"><Info className="size-5 shrink-0 text-blue-400" /> Este item instalará um aplicativo na mochila do jogador. Necessita da classe Inventor.</div>
                          ) : (
                            <input type="text" value={customItemContent} onChange={e => setCustomItemContent(e.target.value)} placeholder={`Cole a URL ${customItemType === 'video' ? 'do Youtube' : 'da Imagem'} aqui...`} className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all" />
                          )}
                        </>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <label className="col-span-2 sm:col-span-1 flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Nome</span><input type="text" value={sysDraft.name} onChange={e => setSysDraft({ ...sysDraft, name: e.target.value })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-accent/50" /></label>
                          <label className="col-span-2 sm:col-span-1 flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Categoria</span>
                            <select value={sysDraft.category} onChange={e => setSysDraft({ ...sysDraft, category: e.target.value })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-accent/50">
                              <option value="weapon">Arma</option><option value="armor">Armadura</option><option value="shield">Escudo</option><option value="accessory">Acessório</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Valor (Z)</span><input type="number" value={sysDraft.cost} onChange={e => setSysDraft({ ...sysDraft, cost: Number(e.target.value) })} className="bg-[#111] border border-white/10 rounded p-2 text-sm font-mono outline-none focus:border-accent/50" /></label>
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Na Loja?</span>
                            <select value={String(sysDraft.purchasable)} onChange={e => setSysDraft({ ...sysDraft, purchasable: e.target.value === "true" })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-accent/50">
                              <option value="true">Sim (Visível)</option><option value="false">Não (Loot Oculto)</option>
                            </select>
                          </label>
                          <label className="col-span-2 flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Regras e Descrição</span><textarea value={sysDraft.detail} onChange={e => setSysDraft({ ...sysDraft, detail: e.target.value })} rows={3} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none resize-none focus:border-accent/50 custom-scrollbar-sepia" placeholder="[BÔNUS: +1 Dano]\n[MODIFICADOR: Precisão usa DES+VIG]" /></label>

                          <div className="col-span-2 border-t border-white/5 pt-3 mt-1 grid grid-cols-3 gap-3">
                            <input type="text" value={sysDraft.type} onChange={e => setSysDraft({ ...sysDraft, type: e.target.value })} placeholder="Tipo (Fogo, Leve)" className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none" />
                            <input type="text" value={sysDraft.damage} onChange={e => setSysDraft({ ...sysDraft, damage: e.target.value })} placeholder="Dano (Ex: 10, d10)" className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none font-mono" />
                            <input type="text" value={sysDraft.bonus} onChange={e => setSysDraft({ ...sysDraft, bonus: e.target.value })} placeholder="Bônus (Ex: +2 Iniciativa)" className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none" />
                            <input type="text" value={sysDraft.defense} onChange={e => setSysDraft({ ...sysDraft, defense: e.target.value })} placeholder="DEF (Ex: 11)" className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none font-mono" />
                            <input type="text" value={sysDraft.mdef} onChange={e => setSysDraft({ ...sysDraft, mdef: e.target.value })} placeholder="M.DEF (Ex: 8)" className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none font-mono" />
                            <input type="text" value={sysDraft.effect} onChange={e => setSysDraft({ ...sysDraft, effect: e.target.value })} placeholder="Efeito Secundário" className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none" />
                          </div>

                          <Button className="col-span-2 mt-2 bg-accent text-black hover:bg-accent/90 font-bold" onClick={handleSaveSystemItem}><Save className="size-4 mr-2" /> Salvar Equipamento</Button>
                        </div>
                      )}
                    </div>

                  ) : gmPanelTab === 'hazards' ? (
                    <GMHazardPanel
                      activeHazards={activeHazards}
                      characters={characters}
                      onLaunch={onLaunchHazard}
                      onStop={onStopHazard}
                    />
                  ) : gmPanelTab === 'classes' ? (
                    <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-[2] flex flex-col gap-4 border border-amber-600/30 rounded-xl p-5 bg-black/40 shadow-inner">
                        <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-amber-500">Nome da Classe</span><input type="text" value={classDraft.name} onChange={e => setClassDraft({ ...classDraft, name: e.target.value })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-amber-600/50" placeholder="Ex: Necromante" /></label>
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-amber-500">Arquétipo</span><input type="text" value={classDraft.archetype} onChange={e => setClassDraft({ ...classDraft, archetype: e.target.value })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-amber-600/50" placeholder="Ex: Invocador das Trevas" /></label>
                          <label className="col-span-2 flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-amber-500">Descrição Visual e Narrativa</span><textarea value={classDraft.description} onChange={e => setClassDraft({ ...classDraft, description: e.target.value })} rows={2} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none resize-none focus:border-amber-600/50 custom-scrollbar-sepia" placeholder="Surgem das cinzas..." /></label>
                        </div>
                        <div className="grid grid-cols-3 gap-4 border-b border-white/5 pb-4">
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1"><Heart className="size-3 text-red-500" /> HP p/ Nível</span><input type="number" value={classDraft.hpPerLevel} onChange={e => setClassDraft({ ...classDraft, hpPerLevel: Number(e.target.value) })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-amber-600/50 font-mono" /></label>
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1"><Zap className="size-3 text-blue-500" /> MP p/ Nível</span><input type="number" value={classDraft.mpPerLevel} onChange={e => setClassDraft({ ...classDraft, mpPerLevel: Number(e.target.value) })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-amber-600/50 font-mono" /></label>
                          <label className="flex flex-col gap-1.5"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1"><Dices className="size-3 text-purple-500" /> Atributo Chave</span>
                            <select value={classDraft.primaryAttribute} onChange={e => setClassDraft({ ...classDraft, primaryAttribute: e.target.value })} className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-amber-600/50 uppercase font-mono">
                              <option value="mig">Vigor (MIG)</option><option value="dex">Destreza (DEX)</option><option value="ins">Intuição (INS)</option><option value="wlp">Vontade (WLP)</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto custom-scrollbar-sepia pr-2">
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-amber-500 flex items-center gap-2"><GraduationCap className="size-4" /> Habilidades da Classe</span>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] border-amber-600/30 text-amber-500 hover:bg-amber-600/20" onClick={() => setClassDraft({ ...classDraft, skills: [...classDraft.skills, { id: "sk" + Math.random(), name: "", maxLevel: 5, description: "" }] })}>+ Habilidade</Button>
                          </div>
                          {classDraft.skills.map((sk, idx) => (
                            <div key={sk.id} className="p-3 bg-black/50 border border-white/5 rounded-lg flex flex-col gap-2 relative group/skill">
                              <div className="flex gap-2">
                                <input type="text" value={sk.name} onChange={e => { const newSkills = [...classDraft.skills]; newSkills[idx].name = e.target.value; setClassDraft({ ...classDraft, skills: newSkills }); }} placeholder="Nome da Habilidade" className="flex-[3] bg-[#111] border border-white/10 rounded p-1.5 text-xs outline-none focus:border-amber-600/50 font-bold text-primary" />
                                <input type="number" value={sk.maxLevel} onChange={e => { const newSkills = [...classDraft.skills]; newSkills[idx].maxLevel = Number(e.target.value); setClassDraft({ ...classDraft, skills: newSkills }); }} placeholder="Nv Máx" className="flex-1 min-w-[60px] bg-[#111] border border-white/10 rounded p-1.5 text-xs outline-none focus:border-amber-600/50 font-mono text-center" title="Nível Máximo" />
                              </div>
                              <textarea value={sk.description} onChange={e => { const newSkills = [...classDraft.skills]; newSkills[idx].description = e.target.value; setClassDraft({ ...classDraft, skills: newSkills }); }} rows={2} placeholder="Descreva o que a habilidade faz..." className="bg-[#111] border border-white/10 rounded p-1.5 text-xs outline-none resize-none focus:border-amber-600/50 custom-scrollbar-sepia text-muted-foreground" />
                              {classDraft.skills.length > 1 && (
                                <button onClick={() => { const newSkills = [...classDraft.skills]; newSkills.splice(idx, 1); setClassDraft({ ...classDraft, skills: newSkills }); }} className="absolute -top-2 -right-2 bg-destructive/80 text-white rounded-full p-1 opacity-0 group-hover/skill:opacity-100 transition-opacity"><X className="size-3" /></button>
                              )}
                            </div>
                          ))}
                        </div>
                        <Button className="mt-2 bg-amber-600 text-white hover:bg-amber-700 font-bold" onClick={handleSaveClass}><Save className="size-4 mr-2" /> Oficializar Classe</Button>
                      </div>

                      <div className="flex-1 flex flex-col gap-3 bg-black/20 border-l border-white/5 pl-6">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-2">Classes Existentes</h5>
                        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto custom-scrollbar-sepia pr-2">
                          {customClasses.length === 0 ? <p className="text-xs text-muted-foreground italic border border-dashed border-white/5 p-4 rounded-lg text-center">Nenhuma classe homebrew forjada.</p> : customClasses.map(c => (
                            <div key={c.id} className="p-3 border border-amber-600/20 bg-amber-600/5 rounded-lg flex justify-between items-center group/class">
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-amber-500">{c.name}</span>
                                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{c.skills?.length || 0} Habilidades</span>
                              </div>
                              <button onClick={() => { if (confirm("Deletar a classe? (Jogadores que já possuem ela não a perderão, mas novos jogadores não poderão pegá-la)")) onDeleteClass(c.id); }} className="p-2 bg-destructive/20 text-destructive rounded-md opacity-0 group-hover/class:opacity-100 transition-opacity"><Trash2 className="size-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  ) : (
                    <div className="flex flex-col gap-4 border border-white/5 rounded-xl p-5 bg-black/40 shadow-inner">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-bold text-lg">Z</span>
                        <input type="number" value={zenitAmount} onChange={e => setZenitAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Ex: 500" className="w-full bg-[#111] border border-white/10 rounded-lg py-4 pl-12 pr-4 text-xl font-mono font-bold text-accent placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all" />
                      </div>
                      <p className="text-xs text-muted-foreground bg-accent/5 p-3 rounded-lg border border-accent/10 flex items-center gap-2">
                        <Coins className="size-4 text-accent shrink-0" /> O valor será somado diretamente à carteira do personagem selecionado.
                      </p>
                    </div>
                  )}
                </div>

                {/* PASSO 2: PARA QUEM? (Não aparece na aba de Classes) */}
                {gmPanelTab !== 'classes' && (
                  <div className={`flex flex-col gap-3 transition-opacity duration-300 ${(selectedLoot || (gmPanelTab === 'custom' && creationMode === 'relic') || gmPanelTab === 'zenits') ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                      <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">2</span>
                      Destinatário (Inventário)
                    </h5>

                    <div className="grid gap-3 sm:grid-cols-3 bg-black/40 border border-white/5 rounded-xl p-4 shadow-inner max-h-[200px] overflow-y-auto custom-scrollbar-sepia">
                      {characters.map((c) => {
                        const owner = members.find(m => m.userId === c.ownerId);
                        const isSelected = selectedTargetCharId === c.id;
                        return (
                          <button key={c.id} onClick={() => setSelectedTargetCharId(c.id)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${isSelected ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.15)]' : 'border-white/5 bg-[#161616] hover:border-white/20 hover:bg-[#1a1a1a]'}`}>
                            <CharacterPortrait src={c.avatarUrl} alt={`Retrato de ${c.name}`} frame={c.portraitFrame} crop={c.portraitCrop} className={`size-10 shrink-0 ${isSelected ? "is-selected" : ""}`} sizes="40px" />
                            <div className="flex flex-col items-start min-w-0">
                              <p className="font-serif font-bold text-sm text-foreground truncate w-full text-left">{c.name}</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 truncate w-full text-left">{owner?.name || "Desconhecido"}</p>
                            </div>
                          </button>
                        );
                      })}

                      {gmPanelTab === 'catalog' && activeCreatures.map((c) => (
                        <button key={c.instanceId} onClick={() => setSelectedTargetCharId(c.instanceId)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${selectedTargetCharId === c.instanceId ? 'border-destructive bg-destructive/10 shadow-[0_0_15px_rgba(255,0,0,0.15)]' : 'border-white/5 bg-[#161616] hover:border-destructive/30 hover:bg-[#1a1a1a]'}`}>
                          <div className={`size-10 rounded-full border overflow-hidden shrink-0 ${selectedTargetCharId === c.instanceId ? 'border-destructive' : 'border-white/10'}`}>
                            <img src={c.imageUrl || "/mystic-adventurer-portrait.png"} alt="" className="w-full h-full object-cover grayscale" />
                          </div>
                          <div className="flex flex-col items-start min-w-0">
                            <p className="font-serif font-bold text-sm text-destructive truncate w-full text-left">{c.name}</p>
                            <p className="text-[9px] text-destructive/60 uppercase tracking-widest mt-0.5 truncate w-full text-left">Na Mesa</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {gmPanelTab === 'store-config' && (
                  <div className="grid lg:grid-cols-2 gap-6">
                    {/* Coluna 1: Gerenciar Pastas */}
                    <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-inner">
                      <h3 className="text-sm font-bold text-indigo-400 mb-4 flex items-center gap-2"><FolderOpen className="size-4" /> Pastas da Loja</h3>

                      <div className="flex gap-2 mb-4">
                        <input type="text" placeholder="Nome da nova pasta..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="flex-1 bg-[#111] border border-white/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50" />
                        <Button onClick={handleCreateFolder} className="bg-indigo-600 hover:bg-indigo-700 text-white"><FolderPlus className="size-4 mr-2" /> Criar</Button>
                      </div>

                      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar-sepia pr-2">
                        {allFolders.map(folder => {
                          // O estado de visibilidade das pastas de sistema pode ser sobrescrito pelo BD
                          const dbFolder = storeFolders?.find(f => f.id === folder.id)
                          const isVisible = dbFolder ? dbFolder.isVisible : folder.isVisible

                          return (
                            <div key={folder.id} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-[#161616]">
                              <div>
                                <p className="text-sm font-bold text-white">{folder.name}</p>
                                {folder.isSystem && <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Pasta de Sistema</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (folder.isSystem && !dbFolder) {
                                      // Se for sistema e ainda não existe no BD, cria para salvar o estado de visibility
                                      onCreateFolder({ ...folder, isVisible: !isVisible })
                                    } else {
                                      onUpdateFolder(folder.id, { isVisible: !isVisible })
                                    }
                                  }}
                                  className={`p-2 rounded-md transition-colors ${isVisible ? "text-green-400 bg-green-400/10 hover:bg-green-400/20" : "text-red-400 bg-red-400/10 hover:bg-red-400/20"}`}
                                  title={isVisible ? "Esconder dos jogadores" : "Mostrar para jogadores"}
                                >
                                  {isVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                </button>
                                {!folder.isSystem && (
                                  <button onClick={() => onDeleteFolder(folder.id)} className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors">
                                    <Trash2 className="size-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Coluna 2: Mover Itens (Apenas Custom) */}
                    <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-inner">
                      <h3 className="text-sm font-bold text-accent mb-4 flex items-center gap-2"><ArrowRightLeft className="size-4" /> Organizar Itens (Custom)</h3>
                      <p className="text-xs text-muted-foreground mb-4">Os itens base (SISTEMA) são fixos. Apenas itens forjados (CUSTOM) podem ser movidos.</p>

                      <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar-sepia pr-2">
                        {customEquipment.length === 0 ? (
                          <p className="text-sm text-center text-muted-foreground p-4 italic">Nenhum equipamento customizado forjado.</p>
                        ) : (
                          customEquipment.map(item => (
                            <div key={item.id} className="p-3 rounded-lg border border-white/5 bg-[#161616] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-white truncate">{item.name}</p>
                              </div>
                              <select
                                value={item.folderId || "custom"}
                                onChange={(e) => onMoveCustomItem(item.id, e.target.value)}
                                className="bg-[#0a0a0a] border border-white/10 text-xs text-white rounded p-1.5 focus:outline-none focus:border-accent"
                              >
                                {customDestinationFolders.map(folder => (
                                  <option key={folder.id} value={folder.id}>
                                    {folder.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}


              </div>
            </div>

            {/* FOOTER */}
            <div className="p-6 border-t border-white/5 bg-black/60 flex justify-between gap-4 shrink-0 relative overflow-hidden">
              <Button variant="ghost" className="text-muted-foreground hover:text-white" onClick={onClose}>Cancelar</Button>
              {gmPanelTab !== 'classes' && (
                <Button size="lg" className="gap-2 bg-accent text-black hover:bg-accent/90 font-bold px-8 shadow-[0_0_20px_rgba(var(--accent-rgb, 212,175,55),0.3)] transition-all disabled:opacity-50 disabled:shadow-none" disabled={(!selectedLoot && gmPanelTab === 'catalog') || (!zenitAmount && gmPanelTab === 'zenits') || !selectedTargetCharId || sendingLoot} onClick={handleGiveLoot}>
                  {sendingLoot ? (
                    <span className="animate-pulse flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Enviando...</span>
                  ) : (
                    <><Send className="size-4" /> {gmPanelTab === 'custom' ? "Entregar" : gmPanelTab === 'zenits' ? "Enviar Dinheiro" : "Entregar Item"}</>
                  )}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}