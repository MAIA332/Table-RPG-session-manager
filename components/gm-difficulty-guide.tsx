"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Target, ChevronDown, Dices } from "lucide-react"

export interface DiceRollResult {
  id: string;
  diceCount: number;
  result: number;
}

interface GmDifficultyGuideProps {
  latestRoll?: DiceRollResult | null;
}

export function GmDifficultyGuide({ latestRoll }: GmDifficultyGuideProps) {
  const [open, setOpen] = useState(true);

  // Mantemos a aba sempre aberta se uma rolagem nova chegar para o Mestre ver o resultado
  useEffect(() => {
    if (latestRoll) setOpen(true);
  }, [latestRoll]);

  const difficulties = [
    {
      id: "1-2-dice",
      diceMatch: (c: number) => c <= 2,
      label: "Ação Comum (1 ou 2 Dados)",
      desc: "Ações do dia a dia e combate padrão.",
      tiers: [
        { name: "F. Crítica", val: "≤3", numVal: 3, isCrit: true, color: "text-red-500", ring: "ring-red-500", bg: "bg-red-500/10 border-red-500/20" },
        { name: "Fácil", val: "5", numVal: 5, color: "text-green-400", ring: "ring-green-400", bg: "bg-black/50 border-white/5" },
        { name: "Médio", val: "8", numVal: 8, color: "text-blue-400", ring: "ring-blue-400", bg: "bg-black/50 border-white/5" },
        { name: "Difícil", val: "11", numVal: 11, color: "text-amber-400", ring: "ring-amber-400", bg: "bg-black/50 border-white/5" },
        { name: "Extremo", val: "14+", numVal: 14, color: "text-purple-400", ring: "ring-purple-400", bg: "bg-purple-500/10 border-purple-500/20" }
      ]
    },
    {
      id: "3-dice",
      diceMatch: (c: number) => c === 3,
      label: "Alta Tensão (3 Dados)",
      desc: "Ações complexas e rituais arcanos.",
      tiers: [
        { name: "Fácil", val: "7", numVal: 10, color: "text-green-400", ring: "ring-green-400", bg: "bg-black/50 border-white/5" },
        { name: "Médio", val: "11", numVal: 15, color: "text-blue-400", ring: "ring-blue-400", bg: "bg-black/50 border-white/5" },
        { name: "Difícil", val: "14", numVal: 20, color: "text-amber-400", ring: "ring-amber-400", bg: "bg-black/50 border-white/5" },
        { name: "Extremo", val: "16+", numVal: 25, color: "text-purple-400", ring: "ring-purple-400", bg: "bg-purple-500/10 border-purple-500/20" }
      ]
    },
    {
      id: "4-dice",
      diceMatch: (c: number) => c >= 4,
      label: "Lendário (4 Dados)",
      desc: "Milagres, Omnigolpes e Feitos Épicos.",
      tiers: [
        { name: "Fácil", val: "13", numVal: 14, color: "text-green-400", ring: "ring-green-400", bg: "bg-black/50 border-white/5" },
        { name: "Médio", val: "15", numVal: 20, color: "text-blue-400", ring: "ring-blue-400", bg: "bg-black/50 border-white/5" },
        { name: "Difícil", val: "20", numVal: 26, color: "text-amber-400", ring: "ring-amber-400", bg: "bg-black/50 border-white/5" },
        { name: "Extremo", val: "25+", numVal: 32, color: "text-purple-400", ring: "ring-purple-400", bg: "bg-purple-500/10 border-purple-500/20" }
      ]
    }
  ];

  return (
    <div className="panel border border-accent/40 bg-black/40 overflow-hidden shrink-0 mt-4 rounded-xl shadow-lg">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <h2 className="flex items-center gap-2 font-serif text-sm font-bold text-accent">
          <Target className="size-4" /> Guia de Dificuldade
        </h2>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: "auto", opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Banner Dinâmico Indicando o Resultado que está sendo lido */}
            {latestRoll && (
              <motion.div 
                key={latestRoll.id}
                initial={{ backgroundColor: "rgba(212, 175, 55, 0.3)" }}
                animate={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
                transition={{ duration: 1 }}
                className="flex justify-between items-center px-4 py-2 border-y border-white/5"
              >
                <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Dices className="size-3" /> Monitorando
                </span>
                <span className="font-mono font-bold text-accent text-[11px] bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                  {latestRoll.diceCount} Dados ➔ Resultado: {latestRoll.result}
                </span>
              </motion.div>
            )}

            <div className="flex flex-col gap-5 p-4">
              {difficulties.map((cat) => {
                const isCatActive = latestRoll ? cat.diceMatch(latestRoll.diceCount) : false;
                const catOpacity = latestRoll && !isCatActive ? "opacity-30 grayscale" : "opacity-100";

                return (
                  <div key={cat.id} className={`flex flex-col gap-2 transition-all duration-500 ${catOpacity}`}>
                    <div className="flex items-center justify-between border-b border-white/10 pb-1">
                      <span className={`text-xs font-bold ${isCatActive ? "text-accent" : "text-foreground"}`}>{cat.label}</span>
                      <span className="text-[8px] text-muted-foreground uppercase tracking-widest">{cat.desc}</span>
                    </div>
                    
                    <div className="flex w-full gap-1">
                      {cat.tiers.map(tier => {
                        let isActivated = false;
                        let opacityClass = "opacity-100";
                        let ringClass = "";

                        if (latestRoll && isCatActive) {
                          // Se for falha crítica (<=3) valida o limite inferior. Senão, valida o limite superior (>= numVal)
                          isActivated = tier.isCrit ? latestRoll.result <= tier.numVal : latestRoll.result >= tier.numVal;

                          if (isActivated) {
                            ringClass = `ring-1 ring-offset-2 ring-offset-[#111] ${tier.ring} shadow-[0_0_15px_rgba(255,255,255,0.05)] scale-105 z-10`;
                            opacityClass = "opacity-100";
                          } else {
                            opacityClass = "opacity-20 grayscale scale-95";
                          }
                        }

                        return (
                          <div key={tier.name} className={`flex-1 flex flex-col items-center border p-1.5 rounded transition-all duration-500 ease-out ${tier.bg} ${opacityClass} ${ringClass}`}>
                            <span className={`font-mono text-sm font-black ${tier.color}`}>{tier.val}</span>
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground mt-0.5 whitespace-nowrap">{tier.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}