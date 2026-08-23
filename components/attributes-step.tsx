"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Info, X, Plus, Minus, BookOpenText } from "lucide-react"
import { ATTRIBUTE_PROFILES, ATTRIBUTE_META } from "@/lib/game-data"
import type { AttributeKey, DieSize } from "@/lib/types"
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.2 } }
} as any

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
} as any



const DETAILED_EXPLANATIONS: Record<AttributeKey, { title: string; text: string[]; examples: string[] }> = {
  dex: {
    title: "Destreza (DEX)",
    text: [
      "A Destreza mede a agilidade, os reflexos, a graciosidade e a coordenação motora geral do seu personagem.",
      "Personagens com alta Destreza são rápidos, difíceis de serem atingidos e excelentes em manobras acrobáticas ou furtivas."
    ],
    examples: [
      "Atacar com armas leves, arcos e armas de fogo.",
      "Esquivar-se de armadilhas, desabamentos ou ataques físicos.",
      "Mover-se furtivamente, roubar itens ou realizar truques de prestidigitação."
    ]
  },
  ins: {
    title: "Intuição (INS)",
    text: [
      "A Intuição representa seu raciocínio, atenção aos detalhes, instinto e capacidade de perceber o fluxo mágico (Éter) ao redor.",
      "Personagens com alta Intuição são observadores perspicazes, investigadores exímios e conjuradores precisos."
    ],
    examples: [
      "Conjurar feitiços elementais, analíticos ou ilusórios.",
      "Investigar uma cena em busca de pistas ou passagens secretas.",
      "Perceber mentiras, intenções ocultas ou emboscadas."
    ]
  },
  mig: {
    title: "Vigor (MIG)",
    text: [
      "O Vigor determina sua força física, resistência, atletismo e vitalidade natural.",
      "Personagens com alto Vigor aguentam receber muito dano, resistem à exaustão e são capazes de brandir as armas mais pesadas com facilidade."
    ],
    examples: [
      "Atacar com montantes, machados, martelos e armas pesadas.",
      "Resistir a venenos, doenças e dor extrema.",
      "Levantar portões pesados, quebrar obstáculos ou segurar inimigos."
    ]
  },
  wlp: {
    title: "Vontade (WLP)",
    text: [
      "A Vontade é a medida da sua determinação, carisma, resiliência mental e força de espírito.",
      "Personagens com alta Vontade são líderes natos, conjuradores de magias espirituais formidáveis e mentes difíceis de serem quebradas ou manipuladas."
    ],
    examples: [
      "Conjurar magias espirituais, curativas ou que alteram emoções.",
      "Inspirar aliados, intimidar inimigos ou aplicar diplomacia em tensões.",
      "Resistir a controle mental, medo e feitiços de ilusão."
    ]
  }
}

const DIE_POINTS: Record<DieSize, number> = { d6: 1, d8: 2, d10: 3, d12: 4 }
const POINTS_TO_DIE: Record<number, DieSize> = { 1: "d6", 2: "d8", 3: "d10", 4: "d12" }

interface Props {
  profileId: string
  setProfileId: (id: string) => void
  attributes: Record<AttributeKey, DieSize>
  customAttributes: Record<AttributeKey, DieSize>
  setCustomAttributes: (attrs: Record<AttributeKey, DieSize>) => void
}

export function AttributesStep({ profileId, setProfileId, attributes, customAttributes, setCustomAttributes }: Props) {
  const [mounted, setMounted] = useState(false)
  const [selectedAttr, setSelectedAttr] = useState<AttributeKey | null>(null)
  
  useEffect(() => setMounted(true), [])

  const keys: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
  const totalPoints = Object.values(customAttributes).reduce((acc, die) => acc + DIE_POINTS[die], 0)
  const remainingPoints = 8 - totalPoints

  const handleIncrease = (k: AttributeKey) => {
    if (profileId !== "custom") return
    const currentPoints = DIE_POINTS[customAttributes[k]]
    if (currentPoints < 4 && totalPoints < 8) {
      setCustomAttributes({ ...customAttributes, [k]: POINTS_TO_DIE[currentPoints + 1] })
    }
  }

  const handleDecrease = (k: AttributeKey) => {
    if (profileId !== "custom") return
    const currentPoints = DIE_POINTS[customAttributes[k]]
    if (currentPoints > 1) {
      setCustomAttributes({ ...customAttributes, [k]: POINTS_TO_DIE[currentPoints - 1] })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-bold text-foreground">Distribuição de Atributos</h3>
        {profileId === "custom" && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${remainingPoints === 0 ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent animate-pulse"}`}>
            {remainingPoints > 0 ? `${remainingPoints} Ponto(s) Restante(s)` : "Pontos Distribuídos"}
          </span>
        )}
      </div>
      
      {/* Botões dos Perfis + Personalizado */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ATTRIBUTE_PROFILES.map((p) => (
          <button key={p.id} onClick={() => setProfileId(p.id)} className={`rounded-sm border-l-2 p-4 text-left transition-colors ${profileId === p.id ? "border-primary bg-primary/10 shadow-inner" : "border-border/60 bg-card/40 hover:border-primary/50"}`}>
            <p className="font-serif font-bold text-foreground">{p.name}</p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">{p.description}</p>
          </button>
        ))}
        {/* NOVO: Botão Custom */}
        <button onClick={() => setProfileId("custom")} className={`rounded-sm border-l-2 p-4 text-left transition-colors ${profileId === "custom" ? "border-primary bg-primary/10 shadow-inner" : "border-border/60 bg-card/40 hover:border-primary/50"}`}>
          <p className="font-serif font-bold text-foreground">Personalizado</p>
          <p className="mt-1 text-xs text-muted-foreground leading-snug">Aumente um dado reduzindo outro livremente.</p>
        </button>
      </div>
      
      {/* Grid de Dados */}
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {keys.map((k) => (
          <div key={k} className={`rounded-lg border p-4 text-center relative group transition-colors ${profileId === "custom" ? "border-accent/40 bg-accent/5" : "border-border/60 bg-card/40"}`}>
            
            {/* Botão de Info (Abre Modal) */}
            <button onClick={() => setSelectedAttr(k)} className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground hover:bg-background hover:text-primary transition-colors">
              <Info className="size-4" />
            </button>
            
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {ATTRIBUTE_META[k].short}
            </p>

            {profileId === "custom" ? (
              <div className="flex items-center justify-center gap-3 mt-3">
                <button onClick={() => handleDecrease(k)} disabled={DIE_POINTS[customAttributes[k]] <= 1} className="size-7 flex items-center justify-center rounded bg-background border border-border/50 hover:bg-muted disabled:opacity-20 hover:text-destructive transition-colors">
                  <Minus className="size-3.5" />
                </button>
                <p className="font-serif text-3xl font-black text-primary text-glow w-12">
                  {attributes[k]}
                </p>
                <button onClick={() => handleIncrease(k)} disabled={DIE_POINTS[customAttributes[k]] >= 4 || remainingPoints <= 0} className="size-7 flex items-center justify-center rounded bg-background border border-border/50 hover:bg-muted disabled:opacity-20 hover:text-accent transition-colors">
                  <Plus className="size-3.5" />
                </button>
              </div>
            ) : (
              <p className="mt-3 font-serif text-3xl font-black text-primary text-glow">
                {attributes[k]}
              </p>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground/70 uppercase tracking-widest">{ATTRIBUTE_META[k].label}</p>
          </div>
        ))}
      </div>

      {/* Modal Full Screen (Portal) */}
      {mounted && createPortal(
        <AnimatePresence>
          {selectedAttr && (
            <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setSelectedAttr(null)}>
              <motion.div variants={modalVariants} className="rpg-modal relative flex w-full max-w-lg flex-col overflow-hidden border border-primary/40 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                
                <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                  <h4 className="font-serif text-2xl font-black text-primary flex items-center gap-3">
                    <BookOpenText className="size-6 text-primary" /> {DETAILED_EXPLANATIONS[selectedAttr].title}
                  </h4>
                  <button onClick={() => setSelectedAttr(null)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors">
                    <X className="size-5 text-muted-foreground hover:text-white" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="space-y-3">
                    {DETAILED_EXPLANATIONS[selectedAttr].text.map((txt, idx) => (
                      <p key={idx} className="text-sm text-muted-foreground leading-relaxed">{txt}</p>
                    ))}
                  </div>
                  
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Exemplos de Uso</h5>
                    <ul className="space-y-2">
                      {DETAILED_EXPLANATIONS[selectedAttr].examples.map((ex, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-foreground bg-white/5 p-2.5 rounded border border-white/5">
                          <span className="text-primary mt-0.5">•</span> {ex}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
