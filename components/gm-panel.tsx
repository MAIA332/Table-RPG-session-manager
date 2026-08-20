"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Gift, Search, ChevronDown, Package, Info, Coins, Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CharacterPortrait } from "@/components/character-portrait"
import { EQUIPMENT } from "@/lib/game-data"
import type { Character, ActiveCreature, CustomItem } from "@/lib/types"

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
  onGiveZenits: (targetId: string, amount: number) => Promise<void>
  onGiveCustomItem: (targetId: string, name: string, type: string, content: string) => Promise<void>
  onGiveSystemItem: (targetId: string, itemId: string) => Promise<void>
}

export function GmPanel({
  isOpen,
  onClose,
  characters,
  activeCreatures,
  members,
  onGiveZenits,
  onGiveCustomItem,
  onGiveSystemItem
}: GmPanelProps) {
  // Estados transferidos do CampaignRoom para cá
  const [gmPanelTab, setGmPanelTab] = useState<"catalog" | "custom" | "zenits">("catalog")
  const [zenitAmount, setZenitAmount] = useState<number | "">("")
  const [selectedLoot, setSelectedLoot] = useState<string | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<string | null>(null)
  const [sendingLoot, setSendingLoot] = useState(false)
  const [lootSearchQuery, setLootSearchQuery] = useState("")
  
  const [customItemName, setCustomItemName] = useState("")
  const [customItemType, setCustomItemType] = useState<"text" | "image" | "video" | "app-blueprints">("text")
  const [customItemContent, setCustomItemContent] = useState("")

  const filteredLoot = EQUIPMENT.filter(item =>
    item.name.toLowerCase().includes(lootSearchQuery.toLowerCase()) ||
    item.detail.toLowerCase().includes(lootSearchQuery.toLowerCase())
  )

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
        if (!customItemName || (!customItemContent && customItemType !== 'app-blueprints')) {
          setSendingLoot(false)
          return alert("Preencha o nome e o conteúdo da Relíquia.")
        }
        if (customItemType === 'app-blueprints' && targetCharacter) {
          const gadgetsLevel = targetCharacter.skills["ti-gadgets"] || 0
          if (gadgetsLevel === 0) {
            setSendingLoot(false)
            return alert(`O personagem ${targetCharacter.name} não possui a perícia 'Aparelhos' (Classe: Inventor). Não é possível equipar o Almanaque Magitech.`)
          }
        }
        await onGiveCustomItem(selectedTargetCharId, customItemName, customItemType, customItemContent)
        setCustomItemName("")
        setCustomItemContent("")
      } 
      else {
        if (!selectedLoot) {
          setSendingLoot(false)
          return alert("Selecione um item do catálogo.")
        }
        await onGiveSystemItem(selectedTargetCharId, selectedLoot)
        setSelectedLoot(null)
      }
    } catch (err) {
      alert("Erro ao enviar.")
    } finally {
      setSendingLoot(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-hidden">
          <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-accent/30 bg-[#0a0a0a]">
            
            {/* HEADER */}
            <div className="flex justify-between items-center p-6 border-b border-white/5 bg-black/60 shrink-0 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent"></div>
              <div>
                <h4 className="font-serif text-2xl font-black flex items-center gap-3">
                  <Gift className="size-6 text-accent" /> <span className="text-foreground">Baú do mestre</span>
                </h4>
                <p className="text-sm text-muted-foreground mt-1">Forje relíquias, distribua itens ou envie dinheiro (Zenits).</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                <X className="size-5 text-muted-foreground hover:text-white" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-8 relative">
              {/* TABS DO BAÚ */}
              <div className="flex bg-black/50 rounded-xl p-1.5 border border-white/5 w-full mx-auto max-w-lg shrink-0 shadow-inner">
                <button onClick={() => { setGmPanelTab('catalog'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm py-2.5 rounded-lg transition-all duration-300 font-semibold ${gmPanelTab === 'catalog' ? 'bg-accent text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Itens de Sistema</button>
                <button onClick={() => { setGmPanelTab('custom'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm py-2.5 rounded-lg transition-all duration-300 font-semibold ${gmPanelTab === 'custom' ? 'bg-accent text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Criar Relíquia</button>
                <button onClick={() => { setGmPanelTab('zenits'); setSelectedLoot(null); }} className={`flex-1 text-xs sm:text-sm py-2.5 rounded-lg transition-all duration-300 font-semibold ${gmPanelTab === 'zenits' ? 'bg-accent text-black shadow-md' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}>Dar Dinheiro (Zenits)</button>
              </div>

              <div className="flex flex-col gap-6">
                {/* PASSO 1: O QUÊ? */}
                <div className="flex flex-col gap-3">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                    <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">1</span>
                    {gmPanelTab === 'catalog' ? "Escolha o Item" : gmPanelTab === 'custom' ? "Forjar Nova Relíquia" : "Quantidade de Zenits"}
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
                          return (
                            <button key={item.id} onClick={() => setSelectedLoot(isSelected ? null : item.id)} className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-300 overflow-hidden group ${isSelected ? 'border-accent bg-accent/5 shadow-[0_0_20px_rgba(var(--accent-rgb, 212,175,55),0.1)]' : 'border-white/5 bg-[#161616] hover:border-white/20 hover:bg-[#1a1a1a]'}`}>
                              <div className="flex justify-between items-start w-full gap-2">
                                <div className="flex flex-col items-start gap-1.5">
                                  <p className={`font-bold text-sm transition-colors ${isSelected ? 'text-accent' : 'text-foreground group-hover:text-accent/80'}`}>{item.name}</p>
                                  <div className="flex items-center gap-1.5">
                                    {(item as any).type && <span className="text-[9px] bg-black/60 text-muted-foreground px-2 py-0.5 rounded-full border border-white/5 uppercase tracking-widest">{(item as any).type}</span>}
                                    {(item as any).purchasable === false && <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">Exclusivo</span>}
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
                                    <p className="text-xs text-muted-foreground leading-relaxed">{(item as any).detail || "Sem descrição."}</p>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {(item as any).damage && <span className="text-[10px] font-mono bg-destructive/10 text-red-300 px-2 py-1 rounded border border-destructive/20">Dano: {(item as any).damage}</span>}
                                      {(item as any).defense && <span className="text-[10px] font-mono bg-blue-500/10 text-blue-300 px-2 py-1 rounded border border-blue-500/20">DEF: {(item as any).defense}</span>}
                                      {(item as any).mdef && <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20">M.DEF: {(item as any).mdef}</span>}
                                      {(item as any).bonus && <span className="text-[10px] font-mono bg-green-500/10 text-green-300 px-2 py-1 rounded border border-green-500/20">Bônus: {(item as any).bonus}</span>}
                                      {(item as any).effect && <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 px-2 py-1 rounded border border-amber-500/20">Efeito: {(item as any).effect}</span>}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </button>
                          )
                        })}
                        {filteredLoot.length === 0 && (
                          <div className="col-span-2 py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-white/5 rounded-xl">
                            <Package className="size-8 opacity-20 mb-2" />
                            <p className="text-sm">Nenhum item encontrado no compêndio.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : gmPanelTab === 'custom' ? (
                    <div className="flex flex-col gap-4 border border-white/5 rounded-xl p-5 bg-black/40 shadow-inner">
                      <input type="text" value={customItemName} onChange={e => setCustomItemName(e.target.value)} placeholder="Nome do Item (Ex: Carta do Rei)" className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all" />

                      <select value={customItemType} onChange={e => setCustomItemType(e.target.value as any)} className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-accent/50 transition-all">
                        <option value="text">Pergaminho / Carta (Texto Escrito)</option>
                        <option value="image">Magia de Fótons (Imagem via URL)</option>
                        <option value="video">Orbe da Lembrança (Vídeo do YouTube)</option>
                        <option value="app-blueprints">Interface: Almanaque Magitech</option>
                      </select>

                      {customItemType === 'text' ? (
                        <textarea value={customItemContent} onChange={e => setCustomItemContent(e.target.value)} placeholder="Escreva o conteúdo da carta aqui..." rows={4} className="w-full bg-[#111] border border-white/10 rounded-lg py-3 px-4 text-sm text-foreground focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all custom-scrollbar-sepia resize-none" />
                      ) : customItemType === 'app-blueprints' ? (
                        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-200 flex gap-3 items-center">
                          <Info className="size-5 shrink-0 text-blue-400" />
                          Este item instalará um mini-aplicativo na mochila do jogador. Necessita da classe Inventor.
                        </div>
                      ) : (
                        <input type="text" value={customItemContent} onChange={e => setCustomItemContent(e.target.value)} placeholder={`Cole a URL ${customItemType === 'video' ? 'do Youtube' : 'da Imagem'} aqui...`} className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all" />
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 border border-white/5 rounded-xl p-5 bg-black/40 shadow-inner">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-bold text-lg">Z</span>
                        <input type="number" value={zenitAmount} onChange={e => setZenitAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Ex: 500" className="w-full bg-[#111] border border-white/10 rounded-lg py-4 pl-12 pr-4 text-xl font-mono font-bold text-accent placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all" />
                      </div>
                      <p className="text-xs text-muted-foreground bg-accent/5 p-3 rounded-lg border border-accent/10 flex items-center gap-2">
                        <Coins className="size-4 text-accent shrink-0" /> O valor será somado diretamente à carteira do personagem selecionado no passo 2 abaixo.
                      </p>
                    </div>
                  )}
                </div>

                {/* PASSO 2: PARA QUEM? */}
                <div className={`flex flex-col gap-3 transition-opacity duration-300 ${(selectedLoot || gmPanelTab === 'custom' || gmPanelTab === 'zenits') ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                    <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">2</span>
                    Destinatário (Inventário)
                  </h5>

                  <div className="grid gap-3 sm:grid-cols-3 bg-black/40 border border-white/5 rounded-xl p-4 shadow-inner max-h-[200px] overflow-y-auto custom-scrollbar-sepia">
                    {characters.map((c) => {
                      const owner = members.find(m => m.userId === c.ownerId)
                      const isSelected = selectedTargetCharId === c.id
                      return (
                        <button key={c.id} onClick={() => setSelectedTargetCharId(c.id)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${isSelected ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.15)]' : 'border-white/5 bg-[#161616] hover:border-white/20 hover:bg-[#1a1a1a]'}`}>
                          <CharacterPortrait src={c.avatarUrl} alt={`Retrato de ${c.name}`} frame={c.portraitFrame} className={`size-10 shrink-0 ${isSelected ? "is-selected" : ""}`} sizes="40px" />
                          <div className="flex flex-col items-start min-w-0">
                            <p className="font-serif font-bold text-sm text-foreground truncate w-full text-left">{c.name}</p>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 truncate w-full text-left">{owner?.name || "Desconhecido"}</p>
                          </div>
                        </button>
                      )
                    })}

                    {gmPanelTab === 'catalog' && activeCreatures.map((c) => (
                      <button key={c.instanceId} onClick={() => setSelectedTargetCharId(c.instanceId)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${selectedTargetCharId === c.instanceId ? 'border-destructive bg-destructive/10 shadow-[0_0_15px_rgba(255,0,0,0.15)]' : 'border-white/5 bg-[#161616] hover:border-destructive/30 hover:bg-[#1a1a1a]'}`}>
                        <div className={`size-10 rounded-full border overflow-hidden shrink-0 ${selectedTargetCharId === c.instanceId ? 'border-destructive' : 'border-white/10'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
              </div>
            </div>

            {/* FOOTER */}
            <div className="p-6 border-t border-white/5 bg-black/60 flex justify-between gap-4 shrink-0 relative overflow-hidden">
              <Button variant="ghost" className="text-muted-foreground hover:text-white" onClick={onClose}>Cancelar</Button>
              <Button size="lg" className="gap-2 bg-accent text-black hover:bg-accent/90 font-bold px-8 shadow-[0_0_20px_rgba(var(--accent-rgb, 212,175,55),0.3)] transition-all disabled:opacity-50 disabled:shadow-none" disabled={(!selectedLoot && gmPanelTab === 'catalog') || (!zenitAmount && gmPanelTab === 'zenits') || !selectedTargetCharId || sendingLoot} onClick={handleGiveLoot}>
                {sendingLoot ? (
                  <span className="animate-pulse flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Enviando...</span>
                ) : (
                  <><Send className="size-4" /> {gmPanelTab === 'custom' ? "Entregar Relíquia" : gmPanelTab === 'zenits' ? "Enviar Dinheiro" : "Entregar Item"}</>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}