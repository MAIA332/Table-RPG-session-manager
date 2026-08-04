"use client"

import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Info, Coins, BookOpenText, ChevronDown, Search, X, Sparkles } from "lucide-react"
import { CLASSES, EQUIPMENT, ORIGIN_SUGGESTIONS, IDENTITY_SUGGESTIONS, THEME_SUGGESTIONS, getEquipment, STARTING_ZENIT, GameClass } from "@/lib/game-data"

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

// FUNÇÃO UTILITÁRIA PARA FORMATAR DESCRIÇÕES
export function formatSkillDescription(desc: string, level: number) {
  const lvl = Math.max(1, level); // Se for 0, usamos 1 para visualizar como será ao comprar
  
  return desc.split(/(\[[^\]]+\])/).map((part, index) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      let inner = part.slice(1, -1);
      
      // Multiplicações automáticas
      inner = inner.replace(/Nível da Perícia x 2/gi, `${lvl * 2}`);
      inner = inner.replace(/Nível x 10/gi, `${lvl * 10}`);
      inner = inner.replace(/Nível x 5/gi, `${lvl * 5}`);
      inner = inner.replace(/Nível da Perícia x 5/gi, `${lvl * 5}`);
      inner = inner.replace(/Nível x 2/gi, `${lvl * 2}`);
      
      // Textos dinâmicos baseados no Nível
      inner = inner.replace(/Nível da Perícia/gi, `${lvl}`);
      inner = inner.replace(/Nível/gi, `${lvl}`);
      
      return <span key={index} className="font-black text-accent">[{inner}]</span>;
    }
    return <span key={index}>{part}</span>;
  });
}

export function EssenceStep(props: any) {
  return (
    <div className="flex flex-col gap-5">
      <h3 className="font-serif text-xl font-bold text-foreground">Sua Essência</h3>
      <TextField label="Nome do Herói" value={props.name} onChange={props.setName} placeholder="Ex: Aria Ventoluz" />
      <TextField label="Foto (URL do Avatar)" value={props.avatarUrl} onChange={props.setAvatarUrl} placeholder="https://imgur.com/foto.png" />
      <SuggestField label="Origem" hint="De onde você vem" value={props.origin} onChange={props.setOrigin} suggestions={ORIGIN_SUGGESTIONS} />
      <SuggestField label="Identidade" hint="O que você é hoje" value={props.identity} onChange={props.setIdentity} suggestions={IDENTITY_SUGGESTIONS} />
      <SuggestField label="Tema" hint="A emoção que te move" value={props.theme} onChange={props.setTheme} suggestions={THEME_SUGGESTIONS} />
    </div>
  )
}

export function ClassesStep({ skillLevels, setSkillLvl, classLevels, totalLevels, chosenCount }: any) {
  const [mounted, setMounted] = useState(false)
  const remaining = 5 - totalLevels
  const valid = chosenCount >= 2 && chosenCount <= 3 && totalLevels === 5
  
  const [viewClass, setViewClass] = useState<GameClass | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => setMounted(true), [])

  // Deep Search: Pesquisa em nome, arquétipo, descrições e habilidades internas
  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) return CLASSES;
    const lowerQ = searchQuery.toLowerCase();
    
    return CLASSES.filter(c => 
      c.name.toLowerCase().includes(lowerQ) ||
      c.archetype.toLowerCase().includes(lowerQ) ||
      c.description.toLowerCase().includes(lowerQ) ||
      c.skills.some(s => s.name.toLowerCase().includes(lowerQ) || s.description.toLowerCase().includes(lowerQ))
    );
  }, [searchQuery]);

  return (
    <div className="flex flex-col gap-4 h-full max-h-[65vh] sm:max-h-[75vh]">
      <div className="shrink-0 space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-foreground">Invista em Habilidades</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${valid ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            {totalLevels}/5 níveis gastos
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Distribua exatamente 5 níveis (máx 3 classes diferentes).</p>
      </div>

      {/* BARRA DE PESQUISA INTELIGENTE */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Pesquisar classe, arquétipo, habilidade ou efeito..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border/50 bg-black/40 py-2.5 pl-9 pr-10 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/50 shadow-inner"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* LISTA SANFONA COM SCROLL */}
      <div className="flex-1 overflow-y-auto custom-scrollbar-sepia pr-2 pb-4 space-y-3 min-h-0">
        {filteredClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-dashed border-border/40 rounded-xl bg-card/20">
            <Search className="size-8 mb-2 opacity-50" />
            <p className="text-sm italic">Nenhuma classe ou habilidade encontrada para "{searchQuery}".</p>
          </div>
        ) : (
          filteredClasses.map((c) => {
            const cLevel = classLevels[c.id] || 0
            const isExpanded = expandedRow === c.id
            const canAddHere = remaining > 0 && (cLevel > 0 || chosenCount < 3)

            return (
              <div key={c.id} className={`rounded-xl border transition-all duration-200 ${cLevel > 0 ? "border-primary/50 bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.05)]" : "border-border/60 bg-card/40 hover:border-primary/30"}`}>
                <div className="w-full flex items-center justify-between p-4">
                  <button type="button" onClick={() => setViewClass(c as any)} className="text-left group flex-1 pr-4">
                    <p className="font-serif font-bold text-lg text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                      {c.name} {cLevel > 0 && <span className="text-primary text-sm tracking-widest uppercase ml-1">(Nv. {cLevel})</span>}
                      <Info className="size-4 opacity-40 group-hover:opacity-100 transition-opacity" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">{c.archetype}</p>
                  </button>
                  <button onClick={() => setExpandedRow(isExpanded ? null : c.id)} className={`p-2 rounded-lg border transition-all ${isExpanded ? "bg-background border-border/80 text-foreground" : "bg-background/50 border-border/30 text-muted-foreground hover:bg-background hover:text-foreground"}`}>
                    <ChevronDown className={`size-5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/40">
                      <div className="p-4 space-y-3 bg-black/30">
                        {c.skills.map((s) => {
                          const sLvl = skillLevels[s.id] || 0
                          return (
                            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-lg bg-card/60 border border-border/30 hover:border-border/60 transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-primary flex items-center gap-2">
                                  {s.name} 
                                  {s.action && <span className="text-[9px] uppercase bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.5 rounded tracking-widest">{s.action.cost} {s.action.resource}</span>}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                  {formatSkillDescription(s.description, sLvl)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto bg-background/80 p-1 rounded-lg border border-border/50">
                                <StepButton disabled={sLvl === 0} onClick={() => setSkillLvl(s.id, sLvl - 1, s.maxLevel)}>−</StepButton>
                                <span className="w-6 text-center font-mono font-bold text-sm">{sLvl}/{s.maxLevel}</span>
                                <StepButton disabled={sLvl >= s.maxLevel || !canAddHere} onClick={() => setSkillLvl(s.id, sLvl + 1, s.maxLevel)}>+</StepButton>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })
        )}
      </div>

      {mounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {viewClass && (
            <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
              <motion.div variants={modalVariants} className="relative w-full max-w-2xl h-full max-h-[85vh] rounded-2xl border border-primary/40 bg-zinc-950 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-white/5 bg-black/60 shrink-0">
                  <div>
                    <h2 className="font-serif text-3xl font-black text-primary flex items-center gap-3">
                      <BookOpenText className="size-7" /> {viewClass.name}
                    </h2>
                    <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mt-2">{viewClass.archetype}</p>
                  </div>
                  <button onClick={() => setViewClass(null)} className="rounded-full p-2 bg-white/5 hover:bg-white/20 transition-colors">
                    <X className="size-6 text-muted-foreground hover:text-white" />
                  </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar-sepia flex-1">
                  <p className="text-sm text-foreground/90 bg-white/5 p-4 rounded-xl border border-white/10 leading-relaxed italic">
                    "{viewClass.description}"
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3 mt-2">
                     <div className="bg-black/30 border border-white/5 p-3 rounded-xl text-center">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Base de HP</span>
                        <p className="text-lg font-mono font-black text-[color:var(--hp)] mt-1">+{viewClass.hpPerLevel} <span className="text-[10px] text-muted-foreground font-sans">/nível</span></p>
                     </div>
                     <div className="bg-black/30 border border-white/5 p-3 rounded-xl text-center">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Base de MP</span>
                        <p className="text-lg font-mono font-black text-[color:var(--mp)] mt-1">+{viewClass.mpPerLevel} <span className="text-[10px] text-muted-foreground font-sans">/nível</span></p>
                     </div>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary pt-4 pb-2 border-b border-white/5 flex items-center gap-2">
                     <Sparkles className="size-4" /> Todas as Habilidades
                  </h3>
                  <div className="flex flex-col gap-3">
                    {viewClass.skills.map(skill => (
                      <div key={skill.id} className="rounded-xl border border-border/40 bg-card/30 p-4 relative overflow-hidden group hover:border-primary/30 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                          <h4 className="font-serif font-bold text-foreground text-lg">{skill.name}</h4>
                          <div className="flex items-center gap-2 shrink-0">
                             <span className="text-[10px] font-mono font-bold border border-border/80 px-2 py-0.5 rounded text-muted-foreground">Máx Nv. {skill.maxLevel}</span>
                             {skill.action && (
                               <span className="text-[10px] font-mono font-bold bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded uppercase tracking-widest">
                                 {skill.action.cost} {skill.action.resource}
                               </span>
                             )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {formatSkillDescription(skill.description, skillLevels[skill.id] || 0)}
                        </p>
                      </div>
                    ))}
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

export function EquipmentStep(props: any) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-bold text-foreground">Equipamento inicial</h3>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${props.remaining < 0 ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent"}`}>
          <Coins className="size-3.5" /> {props.remaining} / {STARTING_ZENIT} zenit
        </span>
      </div>
      {props.remaining < 0 && <p className="text-sm text-destructive">Você ultrapassou o orcamento. Remova algum item.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {EQUIPMENT.map((item) => {
          const selected = props.equipment.includes(item.id)
          const affordable = selected || props.spent + item.cost <= STARTING_ZENIT
          return (
            <button key={item.id} onClick={() => props.toggle(item.id)} disabled={!affordable} className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors disabled:opacity-40 ${selected ? "border-primary bg-primary/10" : "border-border/60 bg-card/40"}`}>
              <div>
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="ml-3 flex items-center gap-2">
                <span className="font-mono text-sm text-accent">{item.cost}</span>
                {selected ? <Check className="size-4 text-primary" /> : <span className="size-4" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder }: any) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
    </label>
  )
}

function SuggestField({ label, hint, value, onChange, suggestions }: any) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span><span className="text-[11px] text-muted-foreground/70">{hint}</span></span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
      <div className="flex flex-wrap gap-1.5 mt-1">
        {suggestions.map((s: string) => (
          <button key={s} type="button" onClick={() => onChange(s)} className="rounded-full border border-border/60 bg-card/40 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
            {s}
          </button>
        ))}
      </div>
    </label>
  )
}

function StepButton({ children, onClick, disabled }: any) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-lg leading-none text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30">
      {children}
    </button>
  )
}