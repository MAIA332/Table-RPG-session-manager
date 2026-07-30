"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { apiFetch } from "@/lib/client"
import { useRealtime } from "@/lib/use-realtime"
import { CharacterCreator } from "@/components/character-creator"
import { ResourceBar } from "@/components/resource-bar"
import { Button } from "@/components/ui/button"
import { 
  EQUIPMENT, 
  BESTIARY, 
  ATTRIBUTE_META, 
  INVENTORY_ACTIONS, 
  CLASSES,
  getEquipment
} from "@/lib/game-data" 
import { formatSkillDescription } from "@/components/creator-steps"
import type { Character, RealtimeEvent, Role, Creature, ActiveCreature, AttributeKey } from "@/lib/types" 
import { ArrowLeft, Crown, Plus, Radio, Shield, Users, DoorOpen, Dices, Gift, X, Send, Skull, Target, Heart, Zap, Crosshair, Package, Info, Loader2, BookOpenText, Store, Coins, TrendingUp, Backpack, Sparkles, Minus } from "lucide-react"

interface Member { userId: string; role: Role; name: string }
interface CampaignData { campaign: { id: string; name: string; code: string; ownerId: string }; role: Role; members: Member[]; characters: Character[]; me: { id: string; name: string } }
interface RollRecord { id: string; characterName: string; playerName: string; attribute: string; result: number; time: string }

const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

// --- COMPONENTES AUXILIARES ---

export function ItemModifiers({ text }: { text: string }) {
  if (!text.includes("[MODIFICADOR:")) return <span>{text}</span>;
  const [desc, modPart] = text.split("[MODIFICADOR:");
  return (
    <span className="flex flex-col gap-1.5 items-start mt-1">
      <span className="opacity-80">{desc.trim()}</span>
      <span className="inline-flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(var(--accent),0.1)]">
        <Zap className="size-3" /> {modPart.replace("]", "").trim()}
      </span>
    </span>
  );
}

// ==========================================
// FICHA DA CRIATURA (Exclusivo para Monstros)
// ==========================================
export function CreatureSheet({ creature, isGm, onUpdate, onRoll }: { creature: any, isGm: boolean, onUpdate: (id: string, updates: any) => void, onRoll: (attr: string, res: number) => void }) {
  const [showInventory, setShowInventory] = useState(false)
  const [rollingAttr, setRollingAttr] = useState<string | null>(null)
  const [rollResult, setRollResult] = useState<{ attr: string; value: number } | null>(null)

  const currentHp = creature.currentHp ?? creature.maxHp;
  const currentMp = creature.currentMp ?? creature.maxMp;
  const currentIp = creature.currentIp ?? 6;
  const equipment = creature.equipment ?? [];

  function patchVital(key: string, val: number) {
    if (!isGm) return;
    onUpdate(creature.instanceId, { [key]: val })
  }

  function rollDice(attr: AttributeKey, dieString: string) {
    if (rollingAttr || !isGm) return; 
    setRollingAttr(attr)
    setRollResult(null)
    setTimeout(() => {
      const sides = parseInt(dieString.replace("d", ""))
      const result = Math.floor(Math.random() * sides) + 1
      const attrLabel = ATTRIBUTE_META[attr].label
      setRollResult({ attr: attrLabel, value: result })
      onRoll(attrLabel, result)
      setRollingAttr(null)
      setTimeout(() => setRollResult(null), 3000)
    }, 800)
  }

  function useInventoryItem(actionId: string) {
    if (!isGm) return;
    const act = INVENTORY_ACTIONS.find(a => a.id === actionId)
    if(!act) return
    if (currentIp < act.cost) {
      alert("Pontos de Inventário (IP) insuficientes na mochila da criatura!")
      return
    }
    const updates: any = { currentIp: currentIp - act.cost };
    if (act.effectResource === "hp") updates.currentHp = Math.min(creature.maxHp, currentHp + (act.effectValue || 0));
    if (act.effectResource === "mp") updates.currentMp = Math.min(creature.maxMp, currentMp + (act.effectValue || 0));
    onUpdate(creature.instanceId, updates);
    setShowInventory(false);
  }

  const affinitiesEntries = Object.entries(creature.affinities || {}) as [string, string][];

  return (
    <div className="panel border-glow relative rounded-xl border border-destructive/50 p-5 sm:p-6 flex flex-col w-full h-full bg-zinc-950 shadow-[0_0_30px_rgba(255,0,0,0.1)]">
      
      <AnimatePresence>
        {showInventory && (
          <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
            <motion.div variants={modalVariants} className="relative w-full max-w-4xl h-full max-h-[85vh] bg-zinc-950 border border-destructive/50 rounded-xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                <h4 className="font-serif text-2xl md:text-3xl font-black text-destructive flex items-center gap-3"><Package className="size-6 md:size-8" /> Saque da Criatura</h4>
                <button onClick={() => setShowInventory(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 md:size-6 text-muted-foreground hover:text-white" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-10 custom-scrollbar-sepia">
                <section className="flex-1 space-y-4">
                  <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Equipamento da Criatura</h5>
                  {equipment.length === 0 ? (
                    <p className="p-6 text-center rounded-lg border border-dashed border-border/40 text-sm text-muted-foreground italic">Nenhum equipamento.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {equipment.map((id: string, idx: number) => {
                        const item = getEquipment(id)
                        return item ? (
                          <div key={`${id}-${idx}`} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-destructive/20">
                            <Info className="size-4 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-sm text-foreground">{item.name}</p>
                              <div className="text-xs text-muted-foreground mt-0.5"><ItemModifiers text={item.detail} /></div>
                            </div>
                          </div>
                        ) : null
                      })}
                    </div>
                  )}
                </section>
                <section className="flex-1 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Consumíveis</h5>
                    <span className="text-sm font-mono font-bold text-destructive bg-destructive/10 px-2 py-1 rounded">IP: {currentIp}/6</span>
                  </div>
                  {isGm ? (
                    <div className="flex flex-col gap-3">
                      {INVENTORY_ACTIONS.map(act => (
                        <Button key={act.id} variant="secondary" className="h-auto py-3 px-4 justify-between items-center group border border-border/50 hover:border-destructive/50" onClick={() => useInventoryItem(act.id)}>
                          <div className="text-left flex flex-col gap-0.5">
                            <span className="font-bold text-foreground group-hover:text-destructive transition-colors">{act.name}</span>
                            <span className="text-xs font-normal text-muted-foreground">{act.description}</span>
                          </div>
                          <span className="font-mono text-sm font-bold text-destructive shrink-0 ml-4 bg-background px-2 py-1 rounded">-{act.cost} IP</span>
                        </Button>
                      ))}
                    </div>
                  ) : <p className="p-6 text-center text-sm text-muted-foreground">Apenas o mestre manipula inventário de monstros.</p>}
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rollResult && (
          <motion.div initial={{ opacity: 0, y: -20, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -20, x: "-50%" }} className="fixed top-8 left-1/2 z-[300] rounded-full border border-destructive/50 bg-destructive/90 px-6 py-2 text-base font-bold text-destructive-foreground shadow-2xl backdrop-blur-md flex items-center">
            <Dices className="size-5 mr-3 animate-spin" /> {creature.name} ({rollResult.attr}): {rollResult.value}!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-start gap-4 w-full">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-destructive/40 shadow-md">
          <Image src={creature.imageUrl} alt="Retrato" fill className="object-cover" sizes="64px" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-foreground leading-tight text-destructive">
            {creature.name} <span className="text-muted-foreground text-base sm:text-lg whitespace-nowrap">(Lv. {creature.level})</span>
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug truncate uppercase tracking-widest">{creature.species}</p>
        </div>
        {isGm && (
           <Button variant="outline" size="sm" className="h-auto py-2 border-destructive/30 text-destructive hover:bg-destructive/20 shrink-0" onClick={() => setShowInventory(true)}>
             <Package className="size-4 mr-2" /> Mochila
           </Button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        {ATTR_KEYS.map((k) => {
          const isRolling = rollingAttr === k
          return (
            <button key={k} disabled={!isGm || isRolling} onClick={() => rollDice(k, creature.attributes[k])} className={`rounded-lg border py-3 text-center transition-all duration-300 ${isRolling ? "animate-bounce border-destructive bg-destructive/20" : "border-border/60 bg-card/40 hover:-translate-y-1 hover:border-destructive/50 hover:bg-card"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{k}</p>
              <p className="font-serif text-xl sm:text-2xl font-black text-destructive drop-shadow-sm">{creature.attributes[k]}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <div className="flex-1 bg-black/40 border border-white/5 rounded-lg p-2 text-center">
          <span className="text-[10px] uppercase text-muted-foreground font-bold">Defesa</span>
          <p className="font-mono text-lg font-black text-foreground">{creature.def}</p>
        </div>
        <div className="flex-1 bg-black/40 border border-white/5 rounded-lg p-2 text-center">
          <span className="text-[10px] uppercase text-muted-foreground font-bold">Def. Mágica</span>
          <p className="font-mono text-lg font-black text-foreground">{creature.mdef}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 sm:grid-cols-8 gap-1">
         {affinitiesEntries.map(([element, affinity]) => (
            <div key={element} className={`flex flex-col items-center justify-center p-1 rounded text-[9px] font-bold border ${affinity === 'VU' ? 'border-red-500/50 text-red-400 bg-red-500/10' : affinity === 'RS' ? 'border-blue-500/50 text-blue-400 bg-blue-500/10' : affinity === 'IM' || affinity === 'AB' ? 'border-green-500/50 text-green-400 bg-green-500/10' : 'border-border/30 text-muted-foreground bg-black/20'}`}>
               <span className="uppercase">{element.slice(0,3)}</span>
               <span className="font-mono">{String(affinity)}</span>
            </div>
         ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <ResourceBar label="Pontos de Vida" short="HP" icon={<Heart className="size-4" />} current={currentHp} max={creature.maxHp} colorVar="--hp" editable={isGm} onChange={(d) => patchVital("currentHp", Math.max(0, Math.min(creature.maxHp, currentHp + d)))} />
        <ResourceBar label="Pontos de Mana" short="MP" icon={<Zap className="size-4" />} current={currentMp} max={creature.maxMp} colorVar="--mp" editable={isGm} onChange={(d) => patchVital("currentMp", Math.max(0, Math.min(creature.maxMp, currentMp + d)))} />
      </div>

      <div className="mt-6 pt-5 border-t border-destructive/20 flex flex-col gap-4">
         {creature.basicAttacks && creature.basicAttacks.length > 0 && (
           <div>
             <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ataques Básicos</p>
             <div className="flex flex-col gap-2">
                {creature.basicAttacks.map((atk: any, i: number) => (
                  <div key={i} className="bg-card/40 border border-border/30 p-2 rounded text-sm">
                    <p className="font-bold text-destructive">{atk.name} <span className="font-mono text-xs text-muted-foreground ml-2">[{atk.attributes.join(' + ').toUpperCase()}]</span></p>
                    <p className="text-xs text-muted-foreground mt-1">Dano: <span className="font-bold text-foreground">{atk.damage}</span> ({atk.type}) {atk.description && `- ${atk.description}`}</p>
                  </div>
                ))}
             </div>
           </div>
         )}
         {creature.spells && creature.spells.length > 0 && (
           <div>
             <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Poderes & Magias</p>
             <div className="flex flex-col gap-2">
                {creature.spells.map((spell: string, i: number) => (
                  <div key={i} className="bg-purple-900/10 border border-purple-500/20 p-2 rounded text-sm">
                    <p className="text-xs text-purple-200 leading-relaxed">{spell}</p>
                  </div>
                ))}
             </div>
           </div>
         )}
      </div>
    </div>
  )
}

// ==========================================
// FICHA DO PERSONAGEM (Original Expandida)
// ==========================================
export function CharacterSheet({ character, editable, isGm, onOptimistic, onRoll }: any) {
  const [mounted, setMounted] = useState(false)
  const [pending, setPending] = useState(false)
  const [rollingAttr, setRollingAttr] = useState<AttributeKey | null>(null)
  const [rollResult, setRollResult] = useState<{ attr: string; value: number } | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showStore, setShowStore] = useState(false)

  useEffect(() => setMounted(true), [])

  const currentXp = character.resources?.xp || 0
  const charLevel = 5 + Math.floor(currentXp / 10)
  const currentZenit = character.zenit || 0
  const skillsObj = character.skills || {}
  
  let totalSkillPointsSpent = Object.values(skillsObj).reduce((a: any, b: any) => a + b, 0) as number
  if (totalSkillPointsSpent === 0 && character.classes?.length > 0) {
    const baseClassLevels = character.classes.reduce((acc: number, c: any) => acc + c.level, 0);
    totalSkillPointsSpent = baseClassLevels;
  }
  const unspentPoints = charLevel - totalSkillPointsSpent

  async function patchResource(key: string, delta: number) {
    const res = character.resources
    const next = { ...res }
    if (key === "xp") next[key] = Math.max(0, (res[key] || 0) + delta)
    else {
      const max = key === "hp" ? res.maxHp : key === "mp" ? res.maxMp : key === "ip" ? res.maxIp : Infinity
      next[key] = Math.max(0, Math.min(max, res[key] + delta))
    }
    onOptimistic({ ...character, resources: next })
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ resources: { [key]: next[key] } }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function saveNewSkillPoint(skillId: string) {
    if (!editable) return;
    const newSkills = { ...skillsObj, [skillId]: (skillsObj[skillId] || 0) + 1 }
    onOptimistic({ ...character, skills: newSkills })
    setShowLevelUp(false)
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ skills: newSkills }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function buyItem(itemId: string) {
    if (!editable) return; 
    const item = getEquipment(itemId)
    if(!item) return
    if (currentZenit < item.cost) { alert("Zênit insuficiente!"); return }
    const newEquipment = [...character.equipment, item.id]
    const newZenit = currentZenit - item.cost
    onOptimistic({ ...character, equipment: newEquipment, zenit: newZenit })
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment, zenit: newZenit }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function sellItem(itemId: string, index: number) {
    if (!editable) return;
    const item = getEquipment(itemId)
    if(!item) return
    const sellValue = Math.floor(item.cost / 2)
    const newEquipment = [...character.equipment]
    newEquipment.splice(index, 1) 
    const newZenit = currentZenit + sellValue
    onOptimistic({ ...character, equipment: newEquipment, zenit: newZenit })
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment, zenit: newZenit }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  function rollDice(attr: AttributeKey, dieString: string) {
    if (rollingAttr) return
    setRollingAttr(attr)
    setRollResult(null)
    setTimeout(() => {
      const sides = parseInt(dieString.replace("d", ""))
      const result = Math.floor(Math.random() * sides) + 1
      const attrLabel = ATTRIBUTE_META[attr].label
      setRollResult({ attr: attrLabel, value: result })
      if (onRoll) onRoll(attrLabel, result)
      setRollingAttr(null)
      setTimeout(() => setRollResult(null), 3000)
    }, 800)
  }

  function useSkill(skill: any) {
    if (!skill.action || !editable) return
    if (character.resources[skill.action.resource] < skill.action.cost) { alert(`Você não tem ${skill.action.resource.toUpperCase()} suficiente!`); return }
    patchResource(skill.action.resource, -skill.action.cost)
    setSelectedSkill(null)
  }

  function useInventoryItem(actionId: string) {
    if (!editable) return;
    const act = INVENTORY_ACTIONS.find(a => a.id === actionId)
    if(!act) return
    if (character.resources.ip < act.cost) { alert("Pontos de Inventário insuficientes!"); return }
    patchResource("ip", -act.cost)
    if (act.effectResource && act.effectValue) patchResource(act.effectResource, act.effectValue)
    setShowInventory(false)
  }

  return (
    <div className="panel border-glow relative rounded-xl border p-5 sm:p-6 flex flex-col w-full h-full bg-zinc-950/40">
      {mounted && createPortal(
        <>
          <AnimatePresence>
            {showLevelUp && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-2xl h-full max-h-[85vh] rounded-xl border border-primary/50 bg-zinc-950 shadow-2xl flex flex-col">
                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black text-primary flex items-center gap-2"><TrendingUp className="size-6" /> Evolução</h4>
                      <p className="text-sm text-muted-foreground mt-1">Você tem {unspentPoints} ponto(s) para investir.</p>
                    </div>
                    <button onClick={() => setShowLevelUp(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1">
                    {CLASSES.map(c => {
                      const hasClass = c.skills.some((s: any) => skillsObj[s.id] > 0)
                      const numClasses = new Set(Object.keys(skillsObj).map(id => id.split('-')[0])).size
                      if (!hasClass && numClasses >= 3) return null 
                      return (
                        <div key={c.id} className="mb-6">
                            <h5 className="font-bold text-foreground bg-primary/10 border border-primary/20 px-3 py-2 rounded mb-3 flex items-center gap-2"><BookOpenText className="size-4 text-primary" /> {c.name}</h5>
                            <div className="space-y-2 pl-2">
                              {c.skills.map((s: any) => {
                                const lvl = skillsObj[s.id] || 0
                                if (lvl >= s.maxLevel) return null
                                return (
                                  <div key={s.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3 rounded-lg bg-card/40 border border-border/40 hover:border-primary/30 transition-colors">
                                    <div className="pr-4">
                                      <p className="text-sm text-primary font-bold">{s.name} <span className="text-xs text-muted-foreground ml-1">Nv.{lvl}</span></p>
                                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{formatSkillDescription(s.description, lvl + 1)}</p>
                                    </div>
                                    <Button size="sm" className="shrink-0 self-end sm:self-auto" onClick={() => saveNewSkillPoint(s.id)}>Aprender</Button>
                                  </div>
                                )
                              })}
                            </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showStore && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-5xl h-full bg-zinc-950 border border-accent/30 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                    <h4 className="font-serif text-2xl md:text-3xl font-black text-accent flex items-center gap-3"><Store className="size-6 md:size-8" /> Mercado & Forja</h4>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-background px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-border shadow-inner"><Coins className="size-4 md:size-5 text-accent" /><span className="font-mono font-bold text-sm md:text-lg text-foreground">{currentZenit} z</span></div>
                      <button onClick={() => setShowStore(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 md:size-6 text-muted-foreground hover:text-white" /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col lg:flex-row gap-10 custom-scrollbar-sepia">
                    <section className="flex-1 space-y-4">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Seu Equipamento (Vender)</h5>
                      {character.equipment.length === 0 ? (
                        <div className="p-8 text-center rounded-lg border border-dashed border-border/40 bg-card/20"><p className="text-sm text-muted-foreground italic">Mochila vazia.</p></div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {character.equipment.map((id: string, index: number) => {
                            const item = getEquipment(id)
                            if(!item) return null
                            return (
                              <div key={`${id}-${index}`} className="flex justify-between items-start p-3 rounded-lg bg-card border border-border/50 hover:border-accent/30 transition-colors">
                                <div>
                                  <p className="font-bold text-sm text-foreground">{item.name}</p>
                                  <div className="text-[11px] text-muted-foreground mt-1"><ItemModifiers text={item.detail} /></div>
                                </div>
                                <Button size="sm" variant="outline" disabled={!editable} className="text-accent border-accent/50 hover:bg-accent shrink-0 ml-2" onClick={() => sellItem(item.id, index)}>
                                  Vender (+{Math.floor(item.cost / 2)} z)
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </section>
                    <section className="flex-[1.5] space-y-4">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Catálogo (Comprar)</h5>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {EQUIPMENT.filter((i: any) => i.purchasable !== false).map((item: any) => {
                           const canAfford = currentZenit >= item.cost
                           return (
                              <div key={item.id} className={`flex flex-col justify-between p-4 rounded-xl border ${canAfford ? 'border-border/60 bg-card' : 'border-destructive/20 bg-destructive/5 opacity-60'} transition-colors`}>
                                <div className="mb-4">
                                  <p className="font-bold text-sm text-foreground">{item.name}</p>
                                  <div className="text-xs text-muted-foreground mt-1.5"><ItemModifiers text={item.detail} /></div>
                                </div>
                                <Button size="sm" disabled={!canAfford || !editable} onClick={() => buyItem(item.id)} className={`w-full flex-col h-auto py-1.5 gap-0.5 ${canAfford ? 'bg-accent' : 'bg-destructive/20'}`}>
                                  <span className="font-bold">{canAfford ? "Comprar" : "Sem Zenit"}</span>
                                  <span className="text-[10px] font-mono opacity-80">{item.cost} z</span>
                                </Button>
                              </div>
                           )
                        })}
                      </div>
                    </section>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showInventory && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-4xl h-full max-h-[85vh] bg-zinc-950 border border-primary/30 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                    <h4 className="font-serif text-2xl md:text-3xl font-black text-primary flex items-center gap-3"><Package className="size-6 md:size-8" /> Mochila do Herói</h4>
                    <button onClick={() => setShowInventory(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10"><X className="size-5 md:size-6 text-muted-foreground hover:text-white" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col md:flex-row gap-10 custom-scrollbar-sepia">
                    <section className="flex-1 space-y-4">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Equipamento Atual</h5>
                      {character.equipment.length === 0 ? (
                        <div className="p-6 text-center rounded-lg border border-dashed border-border/40 bg-card/20"><p className="text-sm text-muted-foreground italic">Nenhum equipamento.</p></div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {character.equipment.map((id: string, idx: number) => {
                            const item = getEquipment(id)
                            return item ? (
                              <div key={`${id}-${idx}`} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border/50">
                                  <Info className="size-4 text-primary shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold text-sm text-foreground">{item.name}{(item as any).purchasable === false && <span className="ml-2 text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.5 rounded">LOOT RARO</span>}</p>
                                    <div className="text-xs text-muted-foreground mt-1"><ItemModifiers text={item.detail} /></div>
                                  </div>
                              </div>
                            ) : null
                          })}
                        </div>
                      )}
                    </section>
                    <section className="flex-1 space-y-4">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Consumíveis</h5>
                        <span className="text-sm font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">IP Atual: {character.resources.ip}/{character.resources.maxIp}</span>
                      </div>
                      {editable ? (
                        <div className="flex flex-col gap-3">
                          {INVENTORY_ACTIONS.map(act => (
                            <Button key={act.id} variant="secondary" className="h-auto py-3 px-4 justify-between items-center group border border-border/50" onClick={() => useInventoryItem(act.id)}>
                              <div className="text-left flex flex-col gap-0.5">
                                <span className="font-bold text-foreground group-hover:text-primary">{act.name}</span>
                                <span className="text-xs font-normal text-muted-foreground">{act.description}</span>
                              </div>
                              <span className="font-mono text-sm font-bold text-accent shrink-0 ml-4 bg-background px-2 py-1 rounded">-{act.cost} IP</span>
                            </Button>
                          ))}
                        </div>
                      ) : <div className="p-6 text-center rounded-lg border border-dashed border-border/40 bg-card/20"><p className="text-sm text-muted-foreground">Apenas o jogador acessa.</p></div>}
                    </section>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {rollResult && (
              <motion.div initial={{ opacity: 0, y: -20, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -20, x: "-50%" }} className="fixed top-8 left-1/2 z-[200] rounded-full border border-primary/50 bg-primary/90 px-6 py-2 text-base font-bold text-primary-foreground shadow-2xl backdrop-blur-md flex items-center">
                <Dices className="size-5 mr-3 animate-spin" /> {rollResult.attr}: Tirou {rollResult.value}!
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedSkill && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <motion.div variants={modalVariants} className="w-full max-w-md rounded-xl border border-primary/50 bg-zinc-950 p-6 shadow-2xl relative">
                  <button onClick={() => setSelectedSkill(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                  <h4 className="font-serif text-xl font-bold text-primary mb-3 pr-6">{selectedSkill.name}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{formatSkillDescription(selectedSkill.description, skillsObj[selectedSkill.id] || 1)}</p>
                  <div className="mt-6 flex justify-end">
                    {selectedSkill.action && editable ? (
                      <Button onClick={() => useSkill(selectedSkill)} className="w-full gap-2 font-bold h-10">Usar Habilidade (-{selectedSkill.action.cost} {selectedSkill.action.resource.toUpperCase()})</Button>
                    ) : <Button variant="secondary" className="w-full" onClick={() => setSelectedSkill(null)}>Fechar</Button>}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}

      {/* Cabecalho Expandido e Flexível */}
      <div className="flex items-start gap-4 w-full">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-primary/40 shadow-md">
          <Image src={character.avatarUrl || "/mystic-adventurer-portrait.png"} alt="Retrato" fill className="object-cover" sizes="64px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div className="min-w-0 pr-2 flex-1">
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-foreground leading-tight">
                {character.name} <span className="text-primary text-base sm:text-lg whitespace-nowrap">(Nv. {charLevel})</span>
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug truncate">
                {[character.identity, character.origin].filter(Boolean).join(" · ") || "Aventureiro"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 bg-card px-2.5 py-1 rounded-full border border-border/60 shadow-sm">
               <Coins className="size-3.5 text-accent"/><span className="font-mono text-xs font-bold text-foreground">{currentZenit} z</span>
            </div>
          </div>
        </div>
      </div>

      {/* XP System */}
      <div className="mt-5 bg-black/40 rounded-lg p-3 sm:p-4 border border-border/40">
         <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">Experiência (XP)</p>
            <p className="text-xs sm:text-sm text-primary font-mono font-bold">{currentXp % 10} / 10</p>
         </div>
         <div className="w-full bg-zinc-800/80 rounded-full h-1.5 sm:h-2 mb-3 sm:mb-4 overflow-hidden">
            <div className="bg-primary h-1.5 sm:h-2 rounded-full transition-all duration-500 ease-out" style={{ width: `${(currentXp % 10) * 10}%` }}></div>
         </div>
         <div className="flex flex-wrap items-center gap-2">
           {unspentPoints > 0 ? (
             <Button size="sm" variant="default" disabled={!editable} className="h-8 text-xs animate-pulse bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 shrink-0" onClick={() => setShowLevelUp(true)}>
               <TrendingUp className="size-3.5 mr-1.5"/> Distribuir {unspentPoints} Pt.
             </Button>
           ) : <div/>}
           {isGm && (
              <div className="flex gap-1.5 ml-auto shrink-0">
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50" onClick={() => patchResource("xp", -1)}>-1</Button>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50" onClick={() => patchResource("xp", 1)}>+1</Button>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50" onClick={() => patchResource("xp", 5)}>+5</Button>
              </div>
           )}
         </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {ATTR_KEYS.map((k) => {
          const isRolling = rollingAttr === k
          return (
            <button key={k} disabled={!editable || isRolling} onClick={() => rollDice(k, character.attributes[k])} className={`rounded-lg border py-3 text-center transition-all duration-300 ${isRolling ? "animate-bounce border-primary bg-primary/20" : "border-border/60 bg-card/40 hover:-translate-y-1"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{ATTRIBUTE_META[k].short}</p>
              <p className="font-serif text-xl sm:text-2xl font-black text-primary drop-shadow-sm">{character.attributes[k]}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <ResourceBar label="Vida" short="HP" icon={<Heart className="size-4" />} current={character.resources.hp} max={character.resources.maxHp} colorVar="--hp" editable={editable} onChange={(d) => patchResource("hp", d)} />
        <ResourceBar label="Mente" short="MP" icon={<Zap className="size-4" />} current={character.resources.mp} max={character.resources.maxMp} colorVar="--mp" editable={editable} onChange={(d) => patchResource("mp", d)} />
        <ResourceBar label="Inventario" short="IP" icon={<Backpack className="size-4" />} current={character.resources.ip} max={character.resources.maxIp} colorVar="--ip" editable={editable} onChange={(d) => patchResource("ip", d)} />
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        <div className="flex-1 min-w-[140px] flex items-center justify-between rounded-lg border border-[color:var(--fp)]/30 bg-[color:var(--fp)]/5 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--fp)]"><Sparkles className="size-3.5" /> Fabula</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {editable && <button onClick={() => patchResource("fp", -1)} className="flex size-5 items-center justify-center rounded border border-border/60"><Minus className="size-3" /></button>}
            <span className="w-5 text-center font-mono text-sm font-bold text-[color:var(--fp)]">{character.resources.fp}</span>
            {editable && <button onClick={() => patchResource("fp", 1)} className="flex size-5 items-center justify-center rounded border border-border/60"><Plus className="size-3" /></button>}
          </div>
        </div>
        <div className="flex-1 min-w-[140px] flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 h-auto py-2.5 border-primary/30 text-primary" onClick={() => setShowInventory(true)}><Package className="size-4 mr-2" /> Mochila</Button>
          <Button variant="outline" size="sm" className="flex-1 h-auto py-2.5 border-accent/30 text-accent" onClick={() => setShowStore(true)}><Store className="size-4 mr-2" /> Loja</Button>
        </div>
      </div>

      <div className="mt-8 pt-5 border-t border-border/30">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Habilidades de Classe</p>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(skillsObj).map(([skillId, lvl]) => {
             const skill = CLASSES.find(c => c.skills.some((s: any) => s.id === skillId))?.skills.find((s: any) => s.id === skillId)
             if (!skill || lvl === 0) return null
             return (
               <button key={skill.id} onClick={() => setSelectedSkill(skill)} className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground shadow-sm">
                 {skill.name} <span className="opacity-70 font-mono ml-1 text-[10px]">(Nv. {lvl as React.ReactNode})</span>
               </button>
             )
          })}
          {totalSkillPointsSpent === 0 && <p className="text-xs text-muted-foreground italic mt-1">Nenhuma aprendida.</p>}
        </div>
      </div>
      {pending && <div className="absolute top-2 right-2 flex items-center gap-2 px-2 py-1 rounded bg-background/80 border border-border/50"><Loader2 className="size-3 text-muted-foreground animate-spin" /><span className="text-[10px] uppercase">Salvando</span></div>}
    </div>
  )
}

// ==========================================
// SALA PRINCIPAL DA CAMPANHA
// ==========================================
export function CampaignRoom({ initial }: { initial: CampaignData }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState(initial)
  const [characters, setCharacters] = useState<Character[]>(initial.characters)
  const [creating, setCreating] = useState(false)
  const [live, setLive] = useState(false)
  const [leaving, setLeaving] = useState(false)
  
  // Painel de Loot / GM
  const [showGmPanel, setShowGmPanel] = useState(false)
  const [selectedLoot, setSelectedLoot] = useState<string | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<string | null>(null)
  const [sendingLoot, setSendingLoot] = useState(false)

  // Hover Modal (Visualizador de Imagem Grande)
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)

  // Combate & Bestiário
  const [showBestiary, setShowBestiary] = useState(false)
  const [hoveredCreature, setHoveredCreature] = useState<Creature | null>(null)
  const [activeCreatures, setActiveCreatures] = useState<ActiveCreature[]>([])
  const [selectedCombatCharId, setSelectedCombatCharId] = useState<string | null>(null) 
  const [selectedCombatCreatureId, setSelectedCombatCreatureId] = useState<string | null>(null) 

  const [rollHistory, setRollHistory] = useState<RollRecord[]>([])
  const isGm = data.role === "gm"

  useEffect(() => setMounted(true), [])

  const handleEvent = useCallback((event: any) => {
    setLive(true)
    if (event.type === "creature:spawn") { setActiveCreatures(prev => [...prev, event.creature]); return; }
    if (event.type === "creature:update") { setActiveCreatures(prev => prev.map(c => c.instanceId === event.instanceId ? { ...c, ...event.updates } : c)); return; }
    if (event.type === "creature:remove") { setActiveCreatures(prev => prev.filter(c => c.instanceId !== event.instanceId)); return; }
    if (event.type === "dice:roll") {
      setRollHistory((prev) => [{ id: Math.random().toString(36).substring(7), characterName: event.characterName, playerName: event.playerName, attribute: event.attribute, result: event.result, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 50)); 
      return;
    }
    setCharacters((prev) => {
      switch (event.type) {
        case "character:created": return prev.some((c) => c.id === event.character.id) ? prev : [...prev, event.character]
        case "character:updated": return prev.map((c) => (c.id === event.character.id ? event.character : c))
        case "character:deleted": return prev.filter((c) => c.id !== event.characterId)
        default: return prev
      }
    })
  }, [])

  useRealtime(data.campaign.id, handleEvent)

  const applyOptimistic = useCallback((c: Character) => setCharacters((prev) => prev.map((x) => (x.id === c.id ? c : x))), [])

  function handleBroadcastRoll(characterOrCreatureName: string, attrName: string, result: number) {
    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
       method: "POST", body: JSON.stringify({ characterId: 'sys', characterName: characterOrCreatureName, playerName: data.me.name, attribute: attrName, result })
    }).catch(console.error)
  }

  // --- API DAS CRIATURAS ---
  async function spawnCreature(creature: Creature) {
    const instance: ActiveCreature = { 
      ...creature, 
      instanceId: Math.random().toString(36).substring(7), 
      currentHp: creature.maxHp, 
      currentMp: creature.maxMp,
      // Forçamos initialização de IP e Equipamento para o modal de Loot funcionar perfeitamente
      currentIp: 6,
      equipment: [] 
    } as any;
    
    await apiFetch(`/api/campaigns/${data.campaign.id}/creatures`, { method: "POST", body: JSON.stringify({ action: "spawn", creature: instance }) })
    setShowBestiary(false)
  }

  async function updateCreatureVital(instanceId: string, updates: Partial<ActiveCreature>) {
    setActiveCreatures(prev => prev.map(c => c.instanceId === instanceId ? { ...c, ...updates } : c))
    await apiFetch(`/api/campaigns/${data.campaign.id}/creatures`, { method: "POST", body: JSON.stringify({ action: "update", instanceId, updates }) }).catch(console.error)
  }

  async function removeCreature(instanceId: string) {
    await apiFetch(`/api/campaigns/${data.campaign.id}/creatures`, { method: "POST", body: JSON.stringify({ action: "remove", instanceId }) })
  }
  // -------------------------

  async function handleGiveLoot() {
    if (!selectedLoot || !selectedTargetCharId) return alert("Selecione um item e um alvo.")
    
    const targetCharacter = characters.find(c => c.id === selectedTargetCharId)
    const targetCreature = activeCreatures.find(c => c.instanceId === selectedTargetCharId)

    setSendingLoot(true)
    try {
      if (targetCharacter) {
        const newEquipment = [...targetCharacter.equipment, selectedLoot]
        const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) })
        applyOptimistic(updated)
      } else if (targetCreature) {
        const newEquipment = [...((targetCreature as any).equipment || []), selectedLoot]
        updateCreatureVital(targetCreature.instanceId, { equipment: newEquipment } as any)
      }
      setSelectedLoot(null)
      alert("Loot enviado com sucesso!")
    } catch (err) {
      alert("Erro ao enviar Loot.")
    } finally { setSendingLoot(false) }
  }

  async function handleLeaveCampaign() {
    if (!confirm(isGm ? "Tem certeza que deseja encerrar e deletar esta campanha para todos?" : "Tem certeza que deseja abandonar esta mesa?")) return
    setLeaving(true)
    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/leave`, { method: "POST" })
      router.push("/campaigns"); router.refresh()
    } catch (err) { setLeaving(false) }
  }

  const myCharacters = characters.filter((c) => c.ownerId === data.me.id)
  const otherCharacters = characters.filter((c) => c.ownerId !== data.me.id)
  const isCombatActive = activeCreatures.length > 0;

  if (creating) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 font-serif text-2xl font-black text-foreground">Forjar seu Heroi</h1>
        <CharacterCreator campaignId={data.campaign.id} onCancel={() => setCreating(false)} onCreated={(c) => { setCharacters((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c]); setCreating(false) }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 md:px-6 py-8 h-screen flex flex-col">
      {mounted && createPortal(
        <>
          {/* HOVER MODAL (Imagem Expandida) */}
          <AnimatePresence>
            {hoveredImage && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none bg-black/80 backdrop-blur-sm">
                <div className="relative w-[80vw] max-w-[500px] aspect-square rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/10">
                   <Image src={hoveredImage} alt="Zoom" fill className="object-contain" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MODAL: BAÚ DO MESTRE */}
          <AnimatePresence>
            {showGmPanel && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-3xl h-full max-h-[85vh] rounded-xl border border-accent/50 bg-zinc-950 shadow-2xl flex flex-col">
                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black text-accent flex items-center gap-2"><Gift className="size-6" /> Baú do Mestre</h4>
                      <p className="text-sm text-muted-foreground mt-1">Conceda itens e equipamentos aos jogadores ou criaturas ativas.</p>
                    </div>
                    <button onClick={() => setShowGmPanel(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-6">
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">1. Escolha o Item (Catálogo)</h5>
                      <div className="grid gap-3 sm:grid-cols-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar-sepia border border-border/30 rounded-lg p-2 bg-black/20">
                        {EQUIPMENT.map((item) => (
                          <button key={item.id} onClick={() => setSelectedLoot(item.id)} className={`flex flex-col text-left p-3 rounded-lg border transition-colors ${selectedLoot === item.id ? 'border-accent bg-accent/20' : 'border-border/60 bg-card/40 hover:border-accent/40'}`}>
                            <div className="flex justify-between items-start w-full gap-2">
                              <p className="font-bold text-sm text-foreground">{item.name}{item.purchasable === false && <span className="block w-fit mt-1 text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.5 rounded uppercase tracking-wider">Loot Exclusivo</span>}</p>
                              <span className="text-[10px] font-mono text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded bg-background/50 shrink-0">Valor: {item.cost}z</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-2 leading-snug"><ItemModifiers text={item.detail} /></div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">2. Destinatário (Inventário)</h5>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {characters.map((c) => {
                          const owner = data.members.find(m => m.userId === c.ownerId)
                          return (
                            <button key={c.id} onClick={() => setSelectedTargetCharId(c.id)} className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-colors ${selectedTargetCharId === c.id ? 'border-primary bg-primary/20' : 'border-border/60 bg-card/40 hover:border-primary/40'}`}>
                              <p className="font-serif font-bold text-foreground text-center">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Jogador: {owner?.name || "Desconhecido"}</p>
                            </button>
                          )
                        })}
                        {activeCreatures.map((c) => (
                          <button key={c.instanceId} onClick={() => setSelectedTargetCharId(c.instanceId)} className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-colors ${selectedTargetCharId === c.instanceId ? 'border-destructive bg-destructive/20' : 'border-destructive/30 bg-destructive/5 hover:border-destructive/50'}`}>
                            <p className="font-serif font-bold text-destructive text-center">{c.name}</p>
                            <p className="text-[10px] text-destructive/70 uppercase tracking-widest mt-1">Criatura na Mesa</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-t border-border/50 bg-black/40 flex justify-end gap-3 shrink-0">
                    <Button variant="ghost" onClick={() => setShowGmPanel(false)}>Cancelar</Button>
                    <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" disabled={!selectedLoot || !selectedTargetCharId || sendingLoot} onClick={handleGiveLoot}>
                      {sendingLoot ? <span className="animate-pulse">Enviando...</span> : <><Send className="size-4" /> Enviar para Inventário</>}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MODAL: BESTIÁRIO DO MESTRE */}
          <AnimatePresence>
            {showBestiary && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-6xl h-full bg-zinc-950 border border-destructive/50 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                    <h4 className="font-serif text-2xl md:text-3xl font-black text-destructive flex items-center gap-3"><Skull className="size-6 md:size-8" /> Bestiário do Mestre</h4>
                    <button onClick={() => setShowBestiary(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 md:size-6 text-muted-foreground hover:text-white" /></button>
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    <div className="lg:w-1/3 border-r border-border/40 p-4 overflow-y-auto custom-scrollbar-sepia flex flex-col gap-2">
                      {BESTIARY.map((c) => (
                        <button key={c.id} onMouseEnter={() => setHoveredCreature(c)} className={`text-left p-3 rounded-lg border transition-colors ${hoveredCreature?.id === c.id ? "bg-destructive/10 border-destructive/50" : "bg-card/40 border-border/30 hover:border-destructive/30"}`}>
                          <p className="font-bold text-foreground text-sm">{c.name}</p>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Lv. {c.level} · {c.species}</p>
                        </button>
                      ))}
                    </div>
                    <div className="lg:w-2/3 p-6 overflow-y-auto custom-scrollbar-sepia bg-black/20">
                      {hoveredCreature ? (
                        <div className="flex flex-col gap-6 animate-in fade-in">
                          <div className="flex gap-6">
                            <div className="relative w-32 h-32 rounded-xl border border-destructive/30 overflow-hidden shrink-0 shadow-[0_0_15px_rgba(255,0,0,0.1)]">
                              <Image src={hoveredCreature.imageUrl} alt={hoveredCreature.name} fill className="object-cover" />
                            </div>
                            <div className="flex flex-col justify-center">
                              <h2 className="font-serif text-3xl font-black text-foreground">{hoveredCreature.name}</h2>
                              <p className="text-sm font-bold tracking-widest uppercase text-destructive mt-1">Lv. {hoveredCreature.level} · {hoveredCreature.species}</p>
                              <div className="flex gap-4 mt-4">
                                <span className="flex items-center gap-1.5 text-sm text-[color:var(--hp)]"><Heart className="size-4"/> {hoveredCreature.maxHp} HP</span>
                                <span className="flex items-center gap-1.5 text-sm text-[color:var(--mp)]"><Zap className="size-4"/> {hoveredCreature.maxMp} MP</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {ATTR_KEYS.map(k => (
                              <div key={k} className="p-2 border border-border/40 bg-card/30 rounded text-center">
                                <span className="text-[10px] uppercase text-muted-foreground font-bold">{k}</span>
                                <p className="font-mono text-lg font-black text-primary">{hoveredCreature.attributes[k]}</p>
                              </div>
                            ))}
                            <div className="p-2 border border-border/40 bg-card/30 rounded text-center col-span-2"><span className="text-[10px] uppercase text-muted-foreground font-bold">Defesa</span><p className="font-mono text-lg font-black text-foreground">{hoveredCreature.def}</p></div>
                            <div className="p-2 border border-border/40 bg-card/30 rounded text-center col-span-2"><span className="text-[10px] uppercase text-muted-foreground font-bold">Defesa Mágica</span><p className="font-mono text-lg font-black text-foreground">{hoveredCreature.mdef}</p></div>
                          </div>
                          <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)]" onClick={() => spawnCreature(hoveredCreature)}>
                            <Target className="size-5" /> Invocar para a Mesa
                          </Button>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground italic text-sm">Passe o mouse sobre uma criatura para analisar seus atributos.</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MODAL: FICHA DA CRIATURA NO COMBATE */}
          <AnimatePresence>
            {selectedCombatCreatureId && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
                <div className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10">
                  <button onClick={() => setSelectedCombatCreatureId(null)} className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"><X className="size-6 text-white"/></button>
                  {activeCreatures.filter(c => c.instanceId === selectedCombatCreatureId).map(c => (
                     <CreatureSheet key={c.instanceId} creature={c} isGm={isGm} onUpdate={updateCreatureVital} onRoll={(attr, res) => handleBroadcastRoll(c.name, attr, res)} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MODAL: FICHA DO JOGADOR DURANTE O COMBATE */}
          <AnimatePresence>
            {selectedCombatCharId && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
                <div className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10">
                  <button onClick={() => setSelectedCombatCharId(null)} className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"><X className="size-6 text-white"/></button>
                  {characters.filter(c => c.id === selectedCombatCharId).map(c => (
                     <CharacterSheet key={c.id} character={c} editable={isGm || c.ownerId === data.me.id} isGm={isGm} onOptimistic={applyOptimistic} onRoll={(attr: string, res: number) => handleBroadcastRoll(c.name, attr, res)} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}

      {/* HEADER DA SALA */}
      <header className="mb-6 shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/campaigns")} aria-label="Voltar" className="text-muted-foreground"><ArrowLeft className="size-5" /></Button>
          <div>
            <h1 className="font-serif text-xl md:text-2xl font-black text-foreground">{data.campaign.name}</h1>
            <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
              <span className="font-mono">#{data.campaign.code}</span>
              <span className={`inline-flex items-center gap-1 ${live ? "text-primary" : "text-muted-foreground"}`}><Radio className={`size-3.5 ${live ? "animate-pulse" : ""}`} />{live ? "Ao vivo" : "Conectando..."}</span>
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs md:text-sm font-medium ${isGm ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
          {isGm ? <Crown className="size-4" /> : <Shield className="size-4" />} {isGm ? "Mestre de Jogo" : "Jogador"}
        </span>
      </header>

      {/* ÁREA PRINCIPAL DA SALA */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="grid gap-6 xl:grid-cols-[1fr_320px] h-full min-h-0">
          
          {/* COLUNA ESQUERDA: LAYOUT DINÂMICO (EXPLORAÇÃO VS COMBATE) */}
          <div className="flex flex-col min-h-0 h-full overflow-hidden">
            {isCombatActive ? (
              // --- MODO COMBATE (BOARD) ---
              <div className="flex flex-col h-full gap-4">
                {/* TOPO: CRIATURAS */}
                <div className="flex-[3] bg-black/40 border border-destructive/30 rounded-xl p-6 overflow-y-auto custom-scrollbar-sepia relative shadow-[0_0_40px_rgba(255,0,0,0.05)]">
                  <h2 className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-destructive flex items-center gap-2"><Skull className="size-3"/> Inimigos em Combate</h2>
                  <div className="flex flex-wrap gap-4 mt-6">
                    {activeCreatures.map(creature => (
                      <div key={creature.instanceId} className="w-[300px] border border-destructive/40 bg-zinc-950/80 rounded-xl p-4 relative shadow-lg group hover:border-destructive transition-colors">
                        
                        {/* Botão Invisivel para Abrir a Ficha inteira da Criatura */}
                        <button onClick={() => setSelectedCombatCreatureId(creature.instanceId)} className="absolute inset-0 z-0 rounded-xl"></button>

                        {isGm && <button onClick={(e) => { e.stopPropagation(); removeCreature(creature.instanceId); }} className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-destructive transition-colors z-10"><X className="size-4"/></button>}
                        
                        <div className="flex gap-3 mb-4 relative z-10 pointer-events-none">
                          {/* Avatar - Dispara o modal de Hover Imagem quando passar o mouse */}
                          <div 
                            className="relative size-12 rounded border border-destructive/30 overflow-hidden shrink-0 pointer-events-auto cursor-zoom-in"
                            onMouseEnter={() => setHoveredImage(creature.imageUrl)}
                            onMouseLeave={() => setHoveredImage(null)}
                          >
                            <Image src={creature.imageUrl} alt={creature.name} fill className="object-cover"/>
                          </div>
                          <div>
                            <h3 className="font-serif font-bold text-foreground text-sm leading-tight">{creature.name}</h3>
                            <p className="text-[9px] text-destructive uppercase tracking-widest mt-0.5">Lv.{creature.level} {creature.species}</p>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 relative z-10 pointer-events-none">
                           <div className="flex items-center justify-between bg-black/30 px-2 py-1.5 rounded border border-white/5 pointer-events-auto">
                             <span className="text-[10px] font-bold text-[color:var(--hp)]">HP</span>
                             {isGm ? (
                               <div className="flex items-center gap-2">
                                 <button onClick={() => updateCreatureVital(creature.instanceId, { currentHp: creature.currentHp - 5 })} className="text-muted-foreground hover:text-white">-</button>
                                 <span className="font-mono text-sm text-[color:var(--hp)] font-bold">{creature.currentHp}/{creature.maxHp}</span>
                                 <button onClick={() => updateCreatureVital(creature.instanceId, { currentHp: creature.currentHp + 5 })} className="text-muted-foreground hover:text-white">+</button>
                               </div>
                             ) : <span className="font-mono text-sm text-[color:var(--hp)] font-bold">{creature.currentHp}/{creature.maxHp}</span>}
                           </div>
                           <div className="flex items-center justify-between bg-black/30 px-2 py-1.5 rounded border border-white/5 pointer-events-auto">
                             <span className="text-[10px] font-bold text-[color:var(--mp)]">MP</span>
                             {isGm ? (
                               <div className="flex items-center gap-2">
                                 <button onClick={() => updateCreatureVital(creature.instanceId, { currentMp: creature.currentMp - 5 })} className="text-muted-foreground hover:text-white">-</button>
                                 <span className="font-mono text-sm text-[color:var(--mp)] font-bold">{creature.currentMp}/{creature.maxMp}</span>
                                 <button onClick={() => updateCreatureVital(creature.instanceId, { currentMp: creature.currentMp + 5 })} className="text-muted-foreground hover:text-white">+</button>
                               </div>
                             ) : <span className="font-mono text-sm text-[color:var(--mp)] font-bold">{creature.currentMp}/{creature.maxMp}</span>}
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BAIXO: JOGADORES MINIFICADOS */}
                <div className="flex-[2] bg-card/20 border border-primary/20 rounded-xl p-6 overflow-y-auto custom-scrollbar-sepia relative">
                  <h2 className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2"><Users className="size-3"/> Grupo</h2>
                  <div className="flex flex-wrap gap-4 mt-6">
                    {characters.map(char => (
                      <button key={char.id} onClick={() => setSelectedCombatCharId(char.id)} className="flex items-center gap-3 bg-zinc-950 border border-border/50 rounded-lg p-3 w-[240px] hover:border-primary/50 transition-colors text-left group">
                        <div 
                           className="relative size-10 rounded border border-primary/30 overflow-hidden shrink-0 group-hover:shadow-[0_0_10px_rgba(var(--primary),0.3)] transition-shadow pointer-events-auto cursor-zoom-in"
                           onMouseEnter={() => setHoveredImage(char.avatarUrl || "/mystic-adventurer-portrait.png")}
                           onMouseLeave={() => setHoveredImage(null)}
                        >
                          <Image src={char.avatarUrl || "/mystic-adventurer-portrait.png"} alt="Retrato" fill className="object-cover"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-sm font-bold text-foreground truncate">{char.name}</p>
                          <div className="flex gap-2 mt-1">
                             <span className="text-[9px] font-mono text-[color:var(--hp)]">{char.resources.hp} HP</span>
                             <span className="text-[9px] font-mono text-[color:var(--mp)]">{char.resources.mp} MP</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // --- MODO EXPLORAÇÃO (LISTA NORMAL) ---
              <div className="overflow-y-auto custom-scrollbar-sepia h-full pr-2">
                <section className="mb-8">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{isGm ? "Personagens do Mestre" : "Meus herois"}</h2>
                    <Button size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5"><Plus className="size-4" /> Novo heroi</Button>
                  </div>
                  {myCharacters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Voce ainda nao forjou um heroi.</div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {myCharacters.map((c) => <CharacterSheet key={c.id} character={c} editable={true} isGm={isGm} onOptimistic={applyOptimistic} onRoll={(attr: string, res: number) => handleBroadcastRoll(c.name, attr, res)} />)}
                    </div>
                  )}
                </section>

                {otherCharacters.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{isGm ? "Herois dos jogadores" : "Companheiros de jornada"}</h2>
                    <div className="flex flex-col gap-6">
                      {otherCharacters.map((c) => <CharacterSheet key={c.id} character={c} editable={isGm} isGm={isGm} onOptimistic={applyOptimistic} onRoll={(attr: string, res: number) => handleBroadcastRoll(c.name, attr, res)} />)}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: PAINEL DO MESTRE & HISTÓRICO DE DADOS */}
          <aside className="flex flex-col gap-4 min-h-0 h-full overflow-y-auto custom-scrollbar-sepia pr-1">
            
            {isGm && (
              <div className="panel rounded-xl border border-accent/40 p-4 bg-accent/5 shrink-0">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent"><Crown className="size-4" /> Ferramentas do Mestre</h2>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" className="w-full gap-2 border-accent/50 text-accent hover:bg-accent hover:text-accent-foreground" onClick={() => setShowGmPanel(true)}>
                    <Gift className="size-4" /> Distribuir Loot
                  </Button>
                  <Button variant="outline" className="w-full gap-2 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setShowBestiary(true)}>
                    <Crosshair className="size-4" /> Bestiário
                  </Button>
                </div>
              </div>
            )}

            <div className="panel flex flex-col flex-1 rounded-xl border border-border/60 overflow-hidden bg-card/10 shadow-lg min-h-[300px]">
              <div className="p-4 border-b border-border/60 bg-black/40 shrink-0">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Dices className="size-4" /> Histórico de Rolagens</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar-sepia">
                {rollHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center italic mt-4">A mesa está silenciosa. Role os dados!</p>
                ) : (
                  rollHistory.map((roll) => (
                    <div key={roll.id} className="p-3 rounded-lg border border-border/40 bg-background/60 shadow-sm flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-bold text-foreground">{roll.characterName} <span className="text-[10px] text-muted-foreground font-normal ml-1">({roll.playerName})</span></span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">{roll.time}</span>
                      </div>
                      <div className="flex justify-between items-center bg-black/30 px-3 py-2 rounded border border-white/5">
                        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{roll.attribute}</span>
                        <span className="text-xl font-black text-primary font-mono">{roll.result}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel mt-auto rounded-xl border border-destructive/30 bg-destructive/5 p-4 shrink-0">
              <Button variant="destructive" className="w-full gap-2 font-semibold" disabled={leaving} onClick={handleLeaveCampaign}>
                <DoorOpen className="size-4" />
                {leaving ? "Saindo..." : (isGm ? "Encerrar Campanha" : "Abandonar Sessão")}
              </Button>
            </div>
          </aside>

        </div>
      </div>
    </div>
  )
}