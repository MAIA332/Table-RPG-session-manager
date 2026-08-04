"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { apiFetch } from "@/lib/client"
import { ResourceBar } from "@/components/resource-bar"
import { 
  ATTRIBUTE_META, 
  getClass, 
  getEquipment, 
  INVENTORY_ACTIONS, 
  GameSkill, 
  CLASSES, 
  EQUIPMENT,
} from "@/lib/game-data"
import { formatSkillDescription } from "./creator-steps"
import type { AttributeKey, Character, Role } from "@/lib/types"
import { Heart, Zap, Backpack, Sparkles, Minus, Plus, Dices, Package, TrendingUp, X, Store, Coins, Info, Loader2, BookOpenText, UserPlus, Shield, Skull, ScrollText, ImageIcon, Film, Lock, Trash2 } from "lucide-react"
import { Button } from "./ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { computeMaxResources } from "@/lib/character"

export interface Member {
  userId: string;
  role: Role;
  name: string;
}

interface Props {
  character: Character
  editable: boolean
  isGm?: boolean 
  campaignMembers?: Member[]
  onOptimistic: (c: Character) => void
  onRoll?: (attrName: string, result: number) => void
  onKill?: (character: Character) => void
}

const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]

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

// COMPONENTE VISUAL PARA DESTACAR MODIFICADORES
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

function getLevelInfo(totalXp: number) {
  let level = 5;
  let xpRequired = 10;
  let xpLeft = totalXp;

  while (xpLeft >= xpRequired) {
    xpLeft -= xpRequired;
    level++;
    xpRequired = Math.floor(xpRequired * 1.5);
  }

  return { charLevel: level, currentLevelXp: Math.floor(xpLeft), xpRequired };
}

function getEmbedUrl(url: string) {
  if (!url) return "";
  let embedUrl = url;
  if (url.includes("youtube.com/watch?v=")) {
    embedUrl = url.replace("watch?v=", "embed/");
    const ampersandPos = embedUrl.indexOf("&");
    if (ampersandPos !== -1) embedUrl = embedUrl.substring(0, ampersandPos);
  } else if (url.includes("youtu.be/")) {
    embedUrl = url.replace("youtu.be/", "youtube.com/embed/");
    const questionPos = embedUrl.indexOf("?");
    if (questionPos !== -1) embedUrl = embedUrl.substring(0, questionPos);
  }
  return embedUrl;
}

// ==========================================
// APP DE INVENTOR (BLUEPRINT APP)
// ==========================================
function BlueprintApp({ character, editable, onSpendMp }: any) {
  const skillLvl = character.skills["ti-gadgets"] || 0;
  const currentMp = character.resources.mp;

  // Trava de Segurança
  if (skillLvl === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-destructive/10 border border-destructive/30 rounded-xl text-center">
        <Lock className="size-10 text-destructive mb-3" />
        <h3 className="font-bold text-destructive text-lg">Acesso Negado</h3>
        <p className="text-sm text-destructive/80 mt-2 max-w-sm">
          Este Almanaque possui travas de segurança intrincadas. Apenas um Inventor treinado com a perícia <strong>"Aparelhos"</strong> pode decifrar e construir estes projetos Magitech.
        </p>
      </div>
    );
  }

  const blueprints = [
    { level: 1, name: "Magiesfera Luminosa", cost: 5, desc: "Cria uma esfera de luz flutuante que segue o inventor." },
    { level: 2, name: "Gancho Pneumático", cost: 10, desc: "Dispara um gancho trator permitindo escalar superfícies instantaneamente." },
    { level: 3, name: "Bomba de Fumaça", cost: 15, desc: "Cobre a área em fumaça espessa, garantindo fuga ou furtividade." },
    { level: 4, name: "Drone Escoteiro", cost: 20, desc: "Pequeno robô voador que transmite imagens temporárias do local para seu HUD." },
    { level: 5, name: "Canhão Magitech", cost: 30, desc: "Dispara uma rajada concentrada de energia pura (Dano massivo)." },
  ];

  return (
    <div className="flex flex-col gap-3">
       <div className="bg-primary/10 border border-primary/30 p-4 rounded-xl mb-2 shadow-inner">
          <p className="text-sm text-primary font-bold">Nível da Perícia 'Aparelhos': {skillLvl}</p>
          <p className="text-xs text-muted-foreground mt-1">Projetos de nível superior ao seu nível de perícia ficam bloqueados na interface.</p>
       </div>
       {blueprints.map(bp => {
         const unlocked = skillLvl >= bp.level;
         const canAfford = currentMp >= bp.cost;
         
         return (
           <div key={bp.level} className={`p-4 rounded-xl border transition-all ${unlocked ? 'border-border/50 bg-card/50' : 'border-destructive/20 bg-destructive/5 opacity-60 grayscale'}`}>
             <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h4 className={`font-bold ${unlocked ? "text-foreground" : "text-destructive"}`}>
                    {bp.name} <span className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded text-muted-foreground ml-2 uppercase tracking-widest">Req: Nv. {bp.level}</span>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{bp.desc}</p>
                </div>
                {unlocked ? (
                  <Button size="sm" disabled={!canAfford || !editable} onClick={() => onSpendMp(bp.cost)} className="gap-2 shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
                    <Zap className="size-3.5" /> Criar (-{bp.cost} MP)
                  </Button>
                ) : (
                  <span className="text-[10px] uppercase font-bold text-destructive flex items-center gap-1.5 shrink-0 bg-background/50 px-2 py-1 rounded"><Lock className="size-3"/> Bloqueado</span>
                )}
             </div>
           </div>
         )
       })}
    </div>
  )
}

// ==========================================
// FICHA DO PERSONAGEM (JOGADORES E NPCS DO MESTRE)
// ==========================================
export function CharacterSheet({ character, editable, isGm, campaignMembers = [], onOptimistic, onRoll, onKill }: any) {
  const [mounted, setMounted] = useState(false)
  const [pending, setPending] = useState(false)
  const [rollingAttr, setRollingAttr] = useState<AttributeKey | null>(null)
  const [rollResult, setRollResult] = useState<{ attr: string; value: number } | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showStore, setShowStore] = useState(false)
  
  // Handouts & Itens Úteis
  const [viewingItem, setViewingItem] = useState<any | null>(null)

  // Modais de Transferência
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferUserId, setTransferUserId] = useState<string>("")

  useEffect(() => setMounted(true), [])

  const totalXp = character.resources?.xp || 0
  const { charLevel, currentLevelXp, xpRequired } = getLevelInfo(totalXp)

  const currentZenit = character.zenit || 0
  const skillsObj = character.skills || {}
  const customItems = character.customItems || []

  let totalSkillPointsSpent = Object.values(skillsObj).reduce((a: any, b: any) => a + b, 0) as number
  if (totalSkillPointsSpent === 0 && character.classes?.length > 0) {
    const baseClassLevels = character.classes.reduce((acc: number, c: any) => acc + c.level, 0);
    totalSkillPointsSpent = baseClassLevels;
  }
  const unspentPoints = charLevel - totalSkillPointsSpent

  const currentAttrPoints = Object.values(character.attributes).reduce((acc: number, die: any) => {
    if (die === "d6") return acc + 1;
    if (die === "d8") return acc + 2;
    if (die === "d10") return acc + 3;
    if (die === "d12") return acc + 4;
    return acc;
  }, 0) as number;

  const spentAttrPoints = currentAttrPoints - 8;
  const earnedAttrPoints = Math.floor((charLevel - 5) / 10);
  const unspentAttrPoints = earnedAttrPoints - spentAttrPoints;

  async function handleUpgradeAttribute(attrKey: AttributeKey) {
    if (!editable || unspentAttrPoints <= 0) return;
    const currentDie = character.attributes[attrKey];
    const nextDie = currentDie === "d6" ? "d8" : currentDie === "d8" ? "d10" : currentDie === "d10" ? "d12" : null;
    if (!nextDie) return;

    const newAttributes = { ...character.attributes, [attrKey]: nextDie };
    const maxes = computeMaxResources(character.classes, newAttributes);
    const newResources = {
      ...character.resources,
      maxHp: maxes.maxHp,
      maxMp: maxes.maxMp,
      maxIp: maxes.maxIp
    };

    onOptimistic({ ...character, attributes: newAttributes, resources: newResources });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ attributes: newAttributes, resources: newResources })
      });
      onOptimistic(updated);
    } finally {
      setPending(false);
    }
  }

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

    let newClasses = JSON.parse(JSON.stringify(character.classes || []));
    const classMatch = CLASSES.find(c => c.skills.some(s => s.id === skillId));

    if (classMatch) {
      const existingClass = newClasses.find((c: any) => c.classId === classMatch.id || c.id === classMatch.id);
      if (existingClass) {
        existingClass.level += 1;
      } else {
        newClasses.push({ classId: classMatch.id, level: 1 });
      }
    }

    const maxes = computeMaxResources(newClasses, character.attributes);
    const newResources = {
      ...character.resources,
      maxHp: maxes.maxHp,
      maxMp: maxes.maxMp,
      maxIp: maxes.maxIp
    };

    onOptimistic({ ...character, skills: newSkills, classes: newClasses, resources: newResources })
    setShowLevelUp(false)
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ skills: newSkills, classes: newClasses, resources: newResources })
      })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function buyItem(itemId: string) {
    if (!editable) return;
    const item = getEquipment(itemId)
    if (!item) return
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
    if (!item) return
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
    if (!act) return
    if (character.resources.ip < act.cost) { alert("Pontos de Inventário insuficientes!"); return }
    patchResource("ip", -act.cost)
    if (act.effectResource && act.effectValue) patchResource(act.effectResource, act.effectValue)
    setShowInventory(false)
  }

  async function deleteCustomItem(id: string) {
    if (!confirm("Destruir este item para sempre?")) return;
    const newItems = customItems.filter((i: any) => i.id !== id);
    onOptimistic({ ...character, customItems: newItems } as any);
    setViewingItem(null);
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH", body: JSON.stringify({ customItems: newItems })
      });
      onOptimistic(updated);
    } finally { setPending(false); }
  }

  // Ação de Transferir Ficha
  async function handleTransferOwnership() {
    if (!transferUserId) return alert("Selecione um jogador na lista.");
    if (!confirm(`Deseja transferir o controle permanente desta ficha para este jogador?`)) return;
    
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ userId: transferUserId })
      });
      onOptimistic(updated);
      setShowTransferModal(false);
    } catch (err) {
      alert("Erro ao transferir personagem. Verifique se a rota API de transferência existe.");
    } finally {
      setPending(false);
    }
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
                      <p className="text-sm text-muted-foreground mt-1">Você tem {unspentPoints} ponto(s) para investir em Classes.</p>
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
                            if (!item) return null
                            const sellPrice = Math.floor(item.cost / 2)
                            return (
                              <div key={`${id}-${index}`} className="flex justify-between items-start p-3 rounded-lg bg-card border border-border/50 hover:border-accent/30 transition-colors">
                                <div>
                                  <p className="font-bold text-sm text-foreground">{item.name}</p>
                                  <div className="text-[11px] text-muted-foreground mt-1"><ItemModifiers text={item.detail} /></div>
                                </div>
                                <Button size="sm" variant="outline" disabled={!editable} className="text-accent border-accent/50 hover:bg-accent hover:text-accent-foreground shrink-0 ml-2" onClick={() => sellItem(item.id, index)}>
                                  Vender (+{sellPrice} z)
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
                            <div key={item.id} className={`flex flex-col justify-between p-4 rounded-xl border ${canAfford ? 'border-border/60 bg-card hover:border-accent/40' : 'border-destructive/20 bg-destructive/5 opacity-60'} transition-colors`}>
                              <div className="mb-4">
                                <p className="font-bold text-sm text-foreground">{item.name}</p>
                                <div className="text-xs text-muted-foreground mt-1.5"><ItemModifiers text={item.detail} /></div>
                              </div>
                              <Button size="sm" disabled={!canAfford || !editable} onClick={() => buyItem(item.id)} className={`w-full flex-col h-auto py-1.5 gap-0.5 ${canAfford ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-destructive/20 text-destructive'}`}>
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

                      {/* ITENS ÚTEIS / RELÍQUIAS NA MOCHILA (ALTERAÇÃO 2 APLICADA AQUI) */}
                      {customItems.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-white/10">
                          <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pb-3 flex items-center gap-2">
                            <Sparkles className="size-4" /> Relíquias e Pergaminhos
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {customItems.map((item: any) => {
                              const isAppBlueprint = item.type === 'app-blueprints';
                              const hasGadgetsSkill = (character.skills["ti-gadgets"] || 0) > 0;
                              const isLockedForThisChar = isAppBlueprint && !hasGadgetsSkill;

                              return (
                                <button
                                  key={item.id}
                                  onClick={() => !isLockedForThisChar && setViewingItem(item)}
                                  className={`flex items-center justify-between p-3 rounded-lg bg-card border transition-colors text-left ${
                                    isLockedForThisChar 
                                      ? 'border-destructive/30 opacity-50 cursor-not-allowed' 
                                      : 'border-border/50 hover:border-primary/50'
                                  }`}
                                  disabled={isLockedForThisChar}
                                >
                                  <div className="flex items-center gap-3">
                                    {item.type === 'text' && <ScrollText className="size-5 text-amber-500" />}
                                    {item.type === 'image' && <ImageIcon className="size-5 text-blue-400" />}
                                    {item.type === 'video' && <Film className="size-5 text-purple-400" />}
                                    {item.type === 'app-blueprints' && <Package className={`size-5 ${isLockedForThisChar ? 'text-destructive' : 'text-blue-500'}`} />}
                                    
                                    <div className="flex flex-col">
                                       <span className={`font-bold text-sm truncate ${isLockedForThisChar ? 'text-destructive' : 'text-foreground'}`}>
                                         {item.name}
                                       </span>
                                       {isLockedForThisChar && (
                                         <span className="text-[9px] uppercase tracking-widest text-destructive mt-0.5">Requer: Inventor</span>
                                       )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
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
                            <Button key={act.id} variant="secondary" className="h-auto py-3 px-4 justify-between items-center group border border-border/50 hover:border-primary/50" onClick={() => useInventoryItem(act.id)}>
                              <div className="text-left flex flex-col gap-0.5">
                                <span className="font-bold text-foreground group-hover:text-primary transition-colors">{act.name}</span>
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

          {/* MODAL VISUALIZADOR DE ITENS ÚTEIS / RELÍQUIAS / APPS */}
          <AnimatePresence>
            {viewingItem && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
                <motion.div variants={modalVariants} className={`relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl overflow-hidden shadow-2xl ${viewingItem.type === 'text' ? 'bg-[#f4e4bc] text-black border-2 border-[#d4af37]' : 'bg-zinc-950 border border-primary/50'}`}>
                  <div className={`flex justify-between items-center p-4 border-b shrink-0 ${viewingItem.type === 'text' ? 'border-[#d4af37]/30' : 'border-white/10 bg-black/40'}`}>
                    <h4 className={`font-serif text-xl font-bold flex items-center gap-2 ${viewingItem.type === 'text' ? 'text-amber-900' : 'text-primary'}`}>
                      {viewingItem.type === 'text' && <ScrollText className="size-5" />}
                      {viewingItem.type === 'image' && <ImageIcon className="size-5" />}
                      {viewingItem.type === 'video' && <Film className="size-5" />}
                      {viewingItem.type === 'app-blueprints' && <Package className="size-5" />}
                      {viewingItem.name}
                    </h4>
                    <button onClick={() => setViewingItem(null)} className="rounded-full p-2 hover:bg-black/10 transition-colors">
                      <X className={`size-5 ${viewingItem.type === 'text' ? 'text-amber-900' : 'text-white'}`} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar-sepia">
                    {viewingItem.type === 'text' && (
                      <div className="font-serif text-lg leading-relaxed whitespace-pre-wrap text-amber-950">
                        {viewingItem.content}
                      </div>
                    )}
                    {viewingItem.type === 'image' && (
                      <div className="flex justify-center items-center">
                        <img src={viewingItem.content} alt={viewingItem.name} className="max-w-full h-auto rounded-lg shadow-lg" />
                      </div>
                    )}
                    {viewingItem.type === 'video' && (
                      <div className="aspect-video w-full rounded-lg overflow-hidden shadow-lg bg-black">
                        <iframe
                          src={getEmbedUrl(viewingItem.content)}
                          className="w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}
                    {/* === O APLICATIVO INJETADO AQUI === */}
                    {viewingItem.type === 'app-blueprints' && (
                       <BlueprintApp 
                          character={character} 
                          editable={editable} 
                          onSpendMp={(cost: number) => patchResource("mp", -cost)} 
                       />
                    )}
                  </div>

                  {/* Botão para Deletar/Destruir a Relíquia (Apenas Dono/GM) */}
                  {editable && (
                    <div className={`p-4 border-t shrink-0 flex justify-end ${viewingItem.type === 'text' ? 'border-[#d4af37]/30' : 'border-white/10 bg-black/40'}`}>
                      <Button variant="outline" size="sm" onClick={() => deleteCustomItem(viewingItem.id)} className={`gap-2 ${viewingItem.type === 'text' ? 'border-red-500/50 text-red-700 hover:bg-red-500/10' : 'border-red-500/50 text-red-400 hover:bg-red-500/20'}`}>
                        <Trash2 className="size-4" /> Destruir Item
                      </Button>
                    </div>
                  )}
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

          {/* Modal de Transferência de Ficha */}
          <AnimatePresence>
            {showTransferModal && editable && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <motion.div variants={modalVariants} className="w-full max-w-md rounded-xl border border-primary/50 bg-zinc-950 p-6 shadow-2xl relative">
                  <button onClick={() => setShowTransferModal(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                  
                  <h4 className="font-serif text-xl font-bold text-primary mb-2 flex items-center gap-2">
                    <UserPlus className="size-5" /> Ceder Controle
                  </h4>
                  <p className="text-sm text-muted-foreground mb-6">Selecione para qual jogador você deseja transferir o controle permanente desta ficha.</p>
                  
                  <div className="space-y-2 mb-6">
                     <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Jogadores na Mesa</p>
                     <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar-sepia">
                        {campaignMembers.map((m:any) => (
                           <button 
                             key={m.userId} 
                             onClick={() => setTransferUserId(m.userId)} 
                             className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${transferUserId === m.userId ? "border-primary bg-primary/20 text-white font-bold" : "border-white/10 bg-white/5 hover:border-primary/50"}`}
                           >
                              <Shield className="size-4 text-primary" /> {m.name} {m.role === 'gm' && '(Mestre)'}
                           </button>
                        ))}
                        {campaignMembers.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum outro jogador conectado.</p>}
                     </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setShowTransferModal(false)}>Cancelar</Button>
                    <Button onClick={handleTransferOwnership} disabled={!transferUserId || pending} className="bg-primary hover:bg-primary/90">
                      {pending ? <Loader2 className="size-4 animate-spin" /> : "Transferir Personagem"}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </>,
        document.body
      )}

      {/* CABEÇALHO DA FICHA DO PERSONAGEM COMPLETO COM BOTÃO CEDER CONTROLE */}
      <div className="flex items-start justify-between gap-4 w-full">
        <div className="flex items-start gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-primary/40 shadow-md">
            <Image src={character.avatarUrl || "/mystic-adventurer-portrait.png"} alt="Retrato" fill className="object-cover" sizes="64px" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-foreground leading-tight">
              {character.name} <span className="text-primary text-base sm:text-lg whitespace-nowrap">(Nv. {charLevel})</span>
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug truncate">
              {[character.identity, character.origin].filter(Boolean).join(" · ") || "Aventureiro"}
            </p>
          </div>
        </div>
        
        {/* Painel do Topo a Direita (Ouro e Controle) */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-full border border-border/60 shadow-sm">
             <Coins className="size-3.5 text-accent"/>
             <span className="font-mono text-xs font-bold text-foreground">{currentZenit} z</span>
          </div>
          {/* Botão de Transferência Aparece para o Dono ou GM */}
          {editable && (
             <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-primary/40 text-primary hover:bg-primary/10 transition-colors" onClick={() => setShowTransferModal(true)}>
               <UserPlus className="size-3 mr-1.5" /> Ceder Controle
             </Button>
          )}
        </div>
      </div>

      {/* XP System */}
      <div className="mt-5 bg-black/40 rounded-lg p-3 sm:p-4 border border-border/40">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">Experiência (XP)</p>
          <p className="text-xs sm:text-sm text-primary font-mono font-bold">{currentLevelXp} / {xpRequired}</p>
        </div>
        <div className="w-full bg-zinc-800/80 rounded-full h-1.5 sm:h-2 mb-3 sm:mb-4 overflow-hidden">
          <div className="bg-primary h-1.5 sm:h-2 rounded-full transition-all duration-500 ease-out" style={{ width: `${(currentLevelXp / xpRequired) * 100}%` }}></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unspentPoints > 0 ? (
            <Button size="sm" variant="default" disabled={!editable} className="h-8 text-xs animate-pulse bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 shrink-0" onClick={() => setShowLevelUp(true)}>
              <TrendingUp className="size-3.5 mr-1.5" /> Classes ({unspentPoints})
            </Button>
          ) : <div />}
          {isGm && (
            <div className="flex gap-1.5 ml-auto shrink-0">
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50 hover:bg-card" onClick={() => patchResource("xp", -1)}>-1</Button>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50 hover:bg-card" onClick={() => patchResource("xp", 1)}>+1</Button>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50 hover:bg-card" onClick={() => patchResource("xp", 5)}>+5</Button>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50 hover:bg-card" onClick={() => patchResource("xp", 10)}>+10</Button>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-border/60 bg-background/50 hover:bg-card" onClick={() => patchResource("xp", 50)}>+50</Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {ATTR_KEYS.map((k) => {
          const isRolling = rollingAttr === k
          const canUpgradeAttribute = editable && unspentAttrPoints > 0 && character.attributes[k] !== "d12"

          return (
            <div key={k} className="relative">
              <button disabled={!editable || isRolling} onClick={() => rollDice(k, character.attributes[k])} className={`w-full rounded-lg border py-3 text-center transition-all duration-300 ${isRolling ? "animate-bounce border-primary bg-primary/20" : "border-border/60 bg-card/40 hover:-translate-y-1 hover:border-primary/50 hover:bg-card"}`}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{ATTRIBUTE_META[k].short}</p>
                <p className="font-serif text-xl sm:text-2xl font-black text-primary drop-shadow-sm">{character.attributes[k]}</p>
              </button>

              {canUpgradeAttribute && (
                <button onClick={(e) => { e.stopPropagation(); handleUpgradeAttribute(k); }} className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:scale-110 transition-transform z-10" title={`Evoluir Atributo (${unspentAttrPoints} sobrando)`}>
                  <TrendingUp className="size-3" />
                </button>
              )}
            </div>
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
            {editable && <button onClick={() => patchResource("fp", -1)} className="flex size-5 items-center justify-center rounded border border-border/60 bg-background hover:border-[color:var(--fp)] hover:bg-[color:var(--fp)]/10 transition-colors"><Minus className="size-3" /></button>}
            <span className="w-5 text-center font-mono text-sm font-bold text-[color:var(--fp)]">{character.resources.fp}</span>
            {editable && <button onClick={() => patchResource("fp", 1)} className="flex size-5 items-center justify-center rounded border border-border/60 bg-background hover:border-[color:var(--fp)] hover:bg-[color:var(--fp)]/10 transition-colors"><Plus className="size-3" /></button>}
          </div>
        </div>
        
        <div className="flex-1 min-w-[140px] flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 h-auto py-2.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/20 hover:border-primary/50 transition-colors" onClick={() => setShowInventory(true)}>
            <Package className="size-4 mr-2 shrink-0" /> Mochila
          </Button>

          <Button variant="outline" size="sm" className="flex-1 h-auto py-2.5 border-accent/30 bg-accent/5 text-accent hover:bg-accent/20 hover:border-accent/50 transition-colors" onClick={() => setShowStore(true)}>
            <Store className="size-4 mr-2 shrink-0" /> Loja
          </Button>
        </div>
      </div>

      <div className="mt-8 pt-5 border-t border-border/30">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Habilidades de Classe Ativas</p>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(skillsObj).map(([skillId, lvl]) => {
             const classMatch = CLASSES.find(c => c.skills.some(s => s.id === skillId))
             const skill = classMatch?.skills.find(s => s.id === skillId)
             if (!skill || lvl === 0) return null

             return (
               <button key={skill.id} onClick={() => setSelectedSkill(skill)} className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary hover:text-primary-foreground shadow-sm">
                 {skill.name} <span className="opacity-70 font-mono ml-1 text-[10px]">(Nv. {lvl as React.ReactNode})</span>
               </button>
             )
          })}
          {totalSkillPointsSpent === 0 && (
            <p className="text-xs text-muted-foreground italic mt-1">Nenhuma habilidade aprendida ainda.</p>
          )}
        </div>
      </div>

      {isGm && onKill && character.resources.hp <= 0 && (
         <div className="mt-6 pt-5 border-t border-destructive/50">
           <Button
             className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)] animate-pulse"
             onClick={() => onKill(character)}
           >
             <Skull className="size-5" /> Confirmar Morte e Recolher Loots
           </Button>
         </div>
      )}

      {pending && <div className="absolute top-2 right-2 flex items-center gap-2 px-2 py-1 rounded bg-background/80 border border-border/50 backdrop-blur-sm"><Loader2 className="size-3 text-muted-foreground animate-spin" /><span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Sincronizando</span></div>}
    </div>
  )
}