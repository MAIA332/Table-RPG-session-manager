"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { UserPlus, X, Save, Target, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NPCCreator, type NPCDraft } from "@/components/character-sheet"

// Variantes de animação (trazidas para o componente para mantê-lo independente)
const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

interface NpcNurseryProps {
  isOpen: boolean;
  onClose: () => void;
  customNPCs: NPCDraft[];
  onSpawn: (npc: NPCDraft) => void;
  onDelete: (id: string) => void;
  onCreated: (newNpc: NPCDraft) => void;
}

export function NpcNursery({ isOpen, onClose, customNPCs, onSpawn, onDelete, onCreated }: NpcNurseryProps) {
  // O estado de expansão do texto agora fica isolado apenas aqui!
  const [expandedNpcId, setExpandedNpcId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden">
          <motion.div variants={modalVariants} className="relative w-full max-w-6xl h-full bg-zinc-950 border border-destructive/50 rounded-xl shadow-2xl flex flex-col overflow-hidden">

            <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
              <div>
                <h4 className="font-serif text-2xl font-black text-destructive flex items-center gap-2">
                  <UserPlus className="size-6" /> Berçário de NPCs
                </h4>
                <p className="text-sm text-muted-foreground mt-1">Forje novas ameaças usando o sistema completo de classes e atributos.</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors">
                <X className="size-5 text-muted-foreground hover:text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              <div className="lg:w-1/3 border-r border-border/40 p-6 flex flex-col gap-4 bg-black/20 overflow-y-auto custom-scrollbar-sepia">
                <h5 className="text-xs font-bold uppercase tracking-widest text-destructive border-b border-white/10 pb-2 flex items-center gap-2">
                  <Save className="size-3" /> Prontos para Invocação
                </h5>

                <div className="flex flex-col gap-3">
                  {customNPCs.length === 0 && <p className="text-sm text-muted-foreground italic text-center mt-4">Nenhum NPC no berçário.</p>}

                  {customNPCs.map(npc => {
                    const isExpanded = expandedNpcId === npc.id;

                    return (
                      <div key={npc.id} className={`flex flex-col gap-3 p-4 rounded-xl border transition-all duration-300 ${isExpanded ? 'border-destructive/50 bg-black/40 shadow-lg' : 'border-border/40 bg-card/20'}`}>
                        
                        {/* CABEÇALHO DO CARD */}
                        <div className="flex items-start gap-3">
                          <div className="relative size-12 rounded border border-destructive/30 overflow-hidden shrink-0 mt-1">
                            <Image src={npc.avatarUrl || "/mystic-adventurer-portrait.png"} alt={npc.name} fill className="object-cover" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-bold text-foreground truncate pr-2">{npc.name}</p>
                              <button 
                                onClick={() => setExpandedNpcId(isExpanded ? null : npc.id)}
                                className="shrink-0 p-1 bg-white/5 hover:bg-white/10 rounded text-muted-foreground transition-colors"
                              >
                                <ChevronDown className={`size-4 transition-transform duration-300 ${isExpanded ? "rotate-180 text-destructive" : ""}`} />
                              </button>
                            </div>
                            
                            {/* Resumo compacto (some quando expandido) */}
                            {!isExpanded && (
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-relaxed mt-1 line-clamp-2">
                                NPC • {npc.origin || "Sem origem"}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* ÁREA EXPANDIDA DETALHADA */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex flex-col gap-4 pt-2 pb-3 border-t border-white/5 mt-1">
                                
                                {/* LORE */}
                                <div>
                                  <span className="text-[9px] font-bold text-destructive uppercase tracking-widest mb-1.5 block">História / Origem</span>
                                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap bg-black/30 p-2.5 rounded border border-white/5">
                                    {npc.origin || "Origem desconhecida."}
                                  </p>
                                </div>

                                {/* IDENTIDADE E TEMA */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-black/30 border border-white/5 p-2 rounded">
                                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-0.5">Identidade</span>
                                    <span className="text-xs text-foreground font-medium">{npc.identity || "-"}</span>
                                  </div>
                                  <div className="bg-black/30 border border-white/5 p-2 rounded">
                                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-0.5">Tema</span>
                                    <span className="text-xs text-foreground font-medium italic">{npc.theme || "-"}</span>
                                  </div>
                                </div>

                                {/* ATRIBUTOS */}
                                <div>
                                  <span className="text-[9px] font-bold text-destructive uppercase tracking-widest mb-1.5 block">Atributos Base</span>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {['dex', 'ins', 'mig', 'wlp'].map((attr) => (
                                      <div key={attr} className="bg-black/30 border border-destructive/20 p-1.5 rounded text-center">
                                        <span className="text-[9px] uppercase text-muted-foreground font-bold block mb-0.5">{attr}</span>
                                        <span className="text-sm font-mono font-black text-destructive">{(npc.attributes as any)[attr]}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* CLASSES & EQUIPAMENTOS */}
                                <div className="flex justify-between items-end mt-1">
                                  <div className="flex gap-1.5 flex-wrap">
                                    {npc.classes?.map((c) => (
                                      <span key={c.classId} className="text-[9px] px-1.5 py-0.5 bg-destructive/10 text-destructive border border-destructive/20 rounded uppercase tracking-wider font-bold">
                                        {c.classId.split('-').pop()} Nv.{c.level}
                                      </span>
                                    ))}
                                    {(!npc.classes || npc.classes.length === 0) && (
                                      <span className="text-[9px] text-muted-foreground italic bg-black/40 px-2 py-1 rounded">Sem classes</span>
                                    )}
                                  </div>
                                  
                                  <span className="text-[10px] text-muted-foreground font-mono bg-black/40 px-2 py-1 rounded border border-white/5 shrink-0">
                                    {npc.equipment?.length || 0} Itens
                                  </span>
                                </div>

                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* AÇÕES INFERIORES */}
                        <div className="flex gap-2 w-full mt-1">
                          <Button size="sm" className="flex-1 bg-destructive/10 border border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onSpawn(npc)}>
                            <Target className="size-3 mr-1.5" /> Invocar
                          </Button>
                          <Button size="sm" variant="outline" className="px-3 border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(npc.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:w-2/3 p-6 overflow-y-auto custom-scrollbar-sepia flex justify-center">
                <NPCCreator
                  onCreated={onCreated}
                  onCancel={onClose}
                />
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}