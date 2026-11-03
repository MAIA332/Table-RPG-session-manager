"use client"
import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Info, Coins, BookOpenText, ChevronDown, Search, X, Sparkles, GitBranch } from "lucide-react"
import { CreatorStoryBookFields } from "./creator-story-book"
import { hasEvolutionBonuses, type EvolutionSkill } from "./skill-evolution-tree"
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
    <div className={`flex flex-col gap-5 ${props.immersive ? "[&_input]:rounded-none [&_textarea]:rounded-none" : ""}`}>
      <h3 className="font-serif text-xl font-bold text-foreground">{props.immersive ? "Dados do Viajante" : "Sua Essência"}</h3>
      <TextField label="Nome do Herói" value={props.name} onChange={props.setName} placeholder="Ex: Aria Ventoluz" />
      <TextField label="Foto (URL do Avatar)" value={props.avatarUrl} onChange={props.setAvatarUrl} placeholder="https://imgur.com/foto.png" />
      {props.immersive ? <CreatorStoryBookFields
        origin={props.origin} setOrigin={props.setOrigin}
        identity={props.identity} setIdentity={props.setIdentity}
        theme={props.theme} setTheme={props.setTheme}
      /> : <>
        <SuggestField label="Origem" hint="De onde você vem" value={props.origin} onChange={props.setOrigin} suggestions={ORIGIN_SUGGESTIONS} />
        <SuggestField label="Identidade" hint="O que você é hoje" value={props.identity} onChange={props.setIdentity} suggestions={IDENTITY_SUGGESTIONS} />
        <SuggestField label="Tema" hint="A emoção que te move" value={props.theme} onChange={props.setTheme} suggestions={THEME_SUGGESTIONS} />
      </>}
    </div>
  )
}
export function ClassesStep({ skillLevels, setSkillLvl, classLevels, totalLevels, chosenCount, isNpc = false, classes = CLASSES, subclasses = [], chosenSubclassIds = {}, onChooseSubclass, immersive = false, onPreviewSkill, maxLevels = 5 }: any) {
  const [mounted, setMounted] = useState(false)
  const remaining = isNpc ? Number.POSITIVE_INFINITY : maxLevels - totalLevels
  const valid = isNpc ? totalLevels > 0 : chosenCount >= 1 && totalLevels > 0 && totalLevels <= maxLevels
  const [viewClass, setViewClass] = useState<GameClass | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  useEffect(() => setMounted(true), [])
  // Deep Search: Pesquisa em nome, arquétipo, descrições e habilidades internas
  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) return classes;
    const lowerQ = searchQuery.toLowerCase();
    return classes.filter((c: GameClass) => 
      c.name.toLowerCase().includes(lowerQ) ||
      c.archetype.toLowerCase().includes(lowerQ) ||
      c.description.toLowerCase().includes(lowerQ) ||
      c.skills.some(s => s.name.toLowerCase().includes(lowerQ) || s.description.toLowerCase().includes(lowerQ))
    );
  }, [searchQuery, classes]);
  return (
    <div className={immersive ? "flex flex-col gap-5" : "flex flex-col gap-4 h-full max-h-[65vh] sm:max-h-[75vh]"}>
      <div className="shrink-0 space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-foreground">{immersive ? "Suas Disciplinas" : "Invista em Habilidades"}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${valid ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            {isNpc ? `${totalLevels} níveis gastos` : `${totalLevels}/${maxLevels} níveis gastos`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{isNpc ? "Adicione quantos níveis e classes forem necessários para esta criatura." : `Invista até ${maxLevels} níveis no total, em quantas classes desejar (mínimo 1 nível).`}</p>
      </div>
      {/* BARRA DE PESQUISA INTELIGENTE */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Pesquisar classe, arquétipo, habilidade ou efeito..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-sm border border-primary/20 bg-background/75 py-3 pl-9 pr-10 text-sm text-foreground outline-none transition-all focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        )}
      </div>
      {/* LISTA SANFONA COM SCROLL */}
      <div className={immersive ? "space-y-3 pb-4" : "flex-1 overflow-y-auto custom-scrollbar-sepia pr-2 pb-4 space-y-3 min-h-0"}>
        {filteredClasses.length === 0 ? (
          <div className="rpg-empty flex flex-col items-center justify-center border border-dashed border-border/40 bg-card/20 py-10 text-muted-foreground">
            <Search className="size-8 mb-2 opacity-50" />
            <p className="text-sm italic">Nenhuma classe ou habilidade encontrada para "{searchQuery}".</p>
          </div>
        ) : (
          filteredClasses.map((c: GameClass) => {
            const cLevel = classLevels[c.id] || 0
            const isExpanded = expandedRow === c.id
            const canAddHere = isNpc || (remaining > 0)
            return (
              <div key={c.id} className={`rounded-sm border-l-2 transition-all duration-200 ${cLevel > 0 ? "border-primary bg-primary/10 shadow-inner" : "border-border/60 bg-card/35 hover:border-primary/50 hover:bg-card/65"}`}>
                <div className="w-full flex items-center justify-between gap-2 p-4">
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
                      <div className="space-y-3 bg-background/45 p-3 sm:p-4">
                        {c.skills.map((s: any) => {
                          const sLvl = skillLevels[s.id] || 0
                          return (
                            <div key={s.id} className="flex flex-col justify-between gap-3 border border-border/50 bg-card/65 p-3.5 transition-colors hover:border-primary/35">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-primary flex items-center gap-2">
                                  {s.name} 
                                  {s.action && <span className="text-[9px] uppercase bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.5 rounded tracking-widest">{s.action.cost} {s.action.resource}</span>}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                  {formatSkillDescription(s.description, sLvl)}
                                </p>
                              </div>
                              {onPreviewSkill && hasEvolutionBonuses(s.bonuses) && <button type="button"
                                onClick={() => onPreviewSkill(s as EvolutionSkill, c.name, sLvl)}
                                className="inline-flex w-fit items-center gap-1.5 border border-primary/30 bg-primary/[.07] px-2.5 py-1.5 text-[10px] font-bold text-primary transition hover:border-primary/65"
                              ><GitBranch className="size-3.5" /> Árvore de evolução</button>}
                              <div className="flex items-center gap-2.5 shrink-0 self-end border border-primary/20 bg-background/80 p-1">
                                <StepButton disabled={sLvl === 0} onClick={() => setSkillLvl(s.id, sLvl - 1, s.maxLevel)}>−</StepButton>
                                <span className="w-6 text-center font-mono font-bold text-sm">{sLvl}/{s.maxLevel}</span>
                                <StepButton disabled={sLvl >= s.maxLevel || !canAddHere} onClick={() => setSkillLvl(s.id, sLvl + 1, s.maxLevel)}>+</StepButton>
                              </div>
                            </div>
                          )
                        })}
                        {!isNpc && onChooseSubclass && subclasses.some((sub: GameClass) => sub.parentClassId === c.id) && (
                          <div className="border border-primary/20 bg-primary/5 p-3">
                            <label className="block text-xs font-semibold text-primary">
                              Especialização opcional {cLevel <= 0 && "(escolha após investir pontos nesta classe)"}
                              <select
                                className="mt-2 w-full rounded-sm border border-primary/30 bg-background p-2.5 text-xs text-foreground"
                                value={chosenSubclassIds[c.id] || ""}
                                disabled={cLevel <= 0}
                                onChange={event => onChooseSubclass(c.id, event.target.value)}
                              >
                                <option value="">Sem subclasse</option>
                                {subclasses.filter((sub: GameClass) => sub.parentClassId === c.id).map((sub: GameClass) => (
                                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                                ))}
                              </select>
                            </label>
                            <p className="mt-2 text-[11px] text-muted-foreground">Especializações desbloqueiam Grimórios e Blueprints da subclasse. A escolha não consome níveis adicionais.</p>
                          </div>
                        )}
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
            <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[12000] flex items-center justify-center bg-background/90 backdrop-blur-md p-4" onClick={() => setViewClass(null)}>
              <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden border border-primary/40 bg-background text-foreground shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-border/50 bg-card/60 shrink-0">
                  <div>
                    <h2 className="font-serif text-3xl font-black text-primary flex items-center gap-3">
                      <BookOpenText className="size-7" /> {viewClass.name}
                    </h2>
                    <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mt-2">{viewClass.archetype}</p>
                  </div>
                  <button onClick={() => setViewClass(null)} className="rounded-full p-2 bg-card/60 hover:bg-primary/10 transition-colors">
                    <X className="size-6 text-muted-foreground hover:text-primary" />
                  </button>
                </div>
                <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar-sepia flex-1">
                  <p className="rounded-sm border border-border/50 bg-card/50 p-4 text-sm italic leading-relaxed text-foreground/90">
                    "{viewClass.description}"
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                     <div className="rounded-sm border border-border/50 bg-card/30 p-3 text-center">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Base de HP</span>
                        <p className="text-lg font-mono font-black text-[color:var(--hp)] mt-1">+{viewClass.hpPerLevel} <span className="text-[10px] text-muted-foreground font-sans">/nível</span></p>
                     </div>
                     <div className="rounded-sm border border-border/50 bg-card/30 p-3 text-center">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Base de MP</span>
                        <p className="text-lg font-mono font-black text-[color:var(--mp)] mt-1">+{viewClass.mpPerLevel} <span className="text-[10px] text-muted-foreground font-sans">/nível</span></p>
                     </div>
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary pt-4 pb-2 border-b border-border/50 flex items-center gap-2">
                     <Sparkles className="size-4" /> Todas as Habilidades
                  </h3>
                  <div className="flex flex-col gap-3">
                    {viewClass.skills.map(skill => (
                      <div key={skill.id} className="group relative overflow-hidden rounded-sm border-l-2 border-primary/30 bg-card/30 p-4 transition-colors hover:border-primary/60">
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
                        {onPreviewSkill && hasEvolutionBonuses(skill.bonuses) && <button type="button"
                          onClick={() => onPreviewSkill(skill as EvolutionSkill, viewClass.name, skillLevels[skill.id] || 0)}
                          className="mt-3 inline-flex items-center gap-1.5 border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold text-primary hover:border-primary/65"
                        ><GitBranch className="size-3.5" /> Ver árvore de evolução</button>}
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
export function EquipmentStep({ equipment, toggle, remaining, spent, isNpc = false, immersive = false, budget = STARTING_ZENIT, extraEquipment = [], freeItemIds = [] }: any) {
  const catalog = [...EQUIPMENT, ...(Array.isArray(extraEquipment) ? extraEquipment : []).filter((item: any) =>
    !EQUIPMENT.some(original => original.id === item.id))]
  const availableEquipment = isNpc ? catalog : catalog.filter((item: any) => item.purchasable !== false && !freeItemIds.includes(item.id))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-bold text-foreground">{immersive ? "Arsenal inicial" : "Equipamento inicial"}</h3>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${remaining < 0 && !isNpc ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent"}`}>
          <Coins className="size-3.5" /> {isNpc ? "Orçamento ilimitado" : `${remaining} / ${budget} zenit`}
        </span>
      </div>
      {freeItemIds.length > 0 && <div className="border border-primary/25 bg-primary/[.055] p-3 text-xs"><p className="font-bold text-primary">Presentes do token de morte</p><p className="mt-1 leading-relaxed text-muted-foreground">{freeItemIds.map((id: string) => catalog.find((item: any) => item.id === id)?.name || id).join(" · ")}</p><p className="mt-1 text-[10px] text-muted-foreground">São concedidos gratuitamente quando a ficha for criada.</p></div>}
      {remaining < 0 && !isNpc && <p className="text-sm text-destructive">Você ultrapassou o orçamento. Remova algum item.</p>}
      <div className={immersive ? "grid grid-cols-1 gap-2" : "grid gap-2 sm:grid-cols-2"}>
        {availableEquipment.map((item) => {
          const selected = equipment.includes(item.id)
          const affordable = isNpc || selected || spent + item.cost <= budget
          return (
            <button key={item.id} onClick={() => toggle(item.id)} disabled={!affordable} className={`flex items-center justify-between gap-2 rounded-sm border p-4 text-left transition-colors disabled:opacity-40 ${selected ? "border-primary bg-primary/10" : "border-border/60 bg-card/35 hover:border-primary/45 hover:bg-card/65"}`}>
              <div>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {item.name}
                  {item.purchasable === false && <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">Exclusivo</span>}
                </p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <span className="font-mono text-sm text-accent">{item.cost}z</span>
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
      <span className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground/70">{hint}</span>
      </span>
      {/* Transformado em textarea para textos longos */}
      <textarea 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[80px] resize-y custom-scrollbar-sepia" 
      />
      <div className="flex flex-wrap gap-1.5 mt-1">
        {suggestions.map((s: string) => (
          <button key={s} type="button" onClick={() => onChange(s)} className="rounded-sm border border-border/60 bg-card/40 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
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
