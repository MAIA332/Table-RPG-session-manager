"use client"

import { useCallback, useEffect, useMemo, useState, useRef } from "react"
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
  getEquipment,
  ATTRIBUTE_PROFILES,
  STARTING_ZENIT
} from "@/lib/game-data"

import { computeMaxResources } from "@/lib/character"
import { formatSkillDescription } from "@/components/creator-steps"

import type { Character, Role, Creature, ActiveCreature, AttributeKey, ActivePoll, DieSize, ClassLevel } from "@/lib/types"

import { ArrowLeft, ArrowRight, Crown, Plus, Radio, Shield, Users, DoorOpen, Dices, Gift, X, Send, Skull, Target, Heart, Zap, Package, Info, Loader2, BookOpenText, Store, Coins, TrendingUp, Backpack, Sparkles, Minus, Search, BarChart2, Clock, Trash2, CheckCircle2, Save, UserPlus, Check, Swords, Inbox, Sun, CloudRain, CloudSnow, CloudFog, Cloud, SunMedium, Grid3X3, ScrollText, ImageIcon, Film, Mic, Activity, RefreshCw, Clapperboard, Lock } from "lucide-react"

import { EssenceStep, ClassesStep, EquipmentStep } from "./creator-steps"
import { AttributesStep } from "./attributes-step"
import { GameMap, TileData } from "@/lib/map-types"
import { MapImporter } from "./map-importer"
import { BattlemapEngine } from "./battlemap-engine"

import { Soundpad, ActiveSound } from "./soundpad"
import { CutsceneManager } from "./cutscene-manager"
import { CutscenePlayer } from "./cutscene-player"
import type { Cutscene } from "./cutscene-types"

// ==========================================
// TIPAGENS & CONSTANTES GLOBAIS
// ==========================================

export interface Member {
  userId: string;
  role: Role;
  name: string;
}

interface CampaignData {
  campaign: { id: string; name: string; code: string; ownerId: string };
  role: Role;
  members: Member[];
  characters: Character[];
  me: { id: string; name: string }
}

interface HistoryRecord { id: string; type: "roll" | "poll"; title: string; subtitle: string; detail: string; result: string | number; time: string }
interface DraftPoll { id: string; question: string; options: string[]; duration: number; }
export interface NPCDraft { id: string; name: string; avatarUrl: string; origin: string; identity: string; theme: string; classes: ClassLevel[]; skills: Record<string, number>; attributes: Record<AttributeKey, DieSize>; equipment: string[]; }
interface DroppedLoot { uid: string; itemId: string; sourceName: string; }

export interface CustomItem {
  id: string;
  name: string;
  type: "text" | "image" | "video" | "app-blueprints";
  content: string;
}

export interface Modifier {
  id: string;
  name: string;
  value: number;
  target: string;
}

type WeatherType = "clear" | "sunny" | "cloudy" | "fog" | "rain" | "blizzard"
const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const NPC_STEPS = ["Essência", "Classes", "Atributos", "Equipamento"] as const

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

export const PRESET_CHECKS = [
  { id: "c1", name: "Percepção", attrs: ["ins", "dex"], desc: "Notar detalhes, movimentos sutis, armadilhas, emboscadas ou objetos escondidos." },
  { id: "c2", name: "Investigação", attrs: ["ins", "wlp"], desc: "Reconstruir acontecimentos, interpretar pistas e ligar informações complexas." },
  { id: "c3", name: "Sobrevivência", attrs: ["ins", "mig"], desc: "Encontrar alimento, rastrear criaturas, orientar-se na natureza e prever perigos naturais." },
  { id: "c4", name: "Sentir Éter", attrs: ["ins", "wlp"], desc: "Detectar magia, perturbações espirituais, maldições ou presenças sobrenaturais." },
  { id: "c5", name: "Furtividade", attrs: ["dex", "ins"], desc: "Esconder-se, mover-se sem fazer ruído e infiltrar-se." },
  { id: "c6", name: "Prestidigitação", attrs: ["dex", "ins"], desc: "Roubar bolsos, manipular pequenos objetos, abrir fechaduras delicadas ou truques rápidos." },
  { id: "c7", name: "Acrobacia", attrs: ["dex", "mig"], desc: "Saltar, escalar, equilibrar-se, correr por superfícies difíceis e realizar manobras físicas." },
  { id: "c8", name: "Reflexos", attrs: ["dex", "ins"], desc: "Reagir rapidamente a ataques, armadilhas ou mudanças repentinas no ambiente." },
  { id: "c9", name: "Precisão", attrs: ["dex", "ins"], desc: "Realizar disparos difíceis, lançar objetos ou acertar pontos específicos." },
  { id: "c10", name: "Atletismo", attrs: ["mig", "dex"], desc: "Escalar, nadar, correr longas distâncias, empurrar ou puxar objetos em movimento." },
  { id: "c11", name: "Força Bruta", attrs: ["mig", "mig"], desc: "Quebrar portas, erguer peso, arrombar obstáculos e dominar fisicamente um alvo." },
  { id: "c12", name: "Resistência Física", attrs: ["mig", "wlp"], desc: "Resistir à fadiga, dor, clima extremo, privação de sono e longas jornadas." },
  { id: "c13", name: "Tenacidade", attrs: ["mig", "wlp"], desc: "Permanecer lutando mesmo gravemente ferido ou ignorar penalidades temporárias." },
  { id: "c14", name: "Diplomacia", attrs: ["wlp", "ins"], desc: "Convencer, negociar e resolver conflitos através do diálogo." },
  { id: "c15", name: "Intimidação", attrs: ["wlp", "mig"], desc: "Coagir utilizando presença física, postura e determinação." },
  { id: "c16", name: "Liderança", attrs: ["wlp", "ins"], desc: "Coordenar aliados, organizar estratégias e manter a moral do grupo." },
  { id: "c17", name: "Determinação", attrs: ["wlp", "wlp"], desc: "Resistir ao medo, desespero, manipulação ou desistência." },
  { id: "c18", name: "Concentração", attrs: ["wlp", "ins"], desc: "Manter foco durante rituais, estudos ou sob pressão." },
  { id: "c19", name: "Empatia", attrs: ["wlp", "ins"], desc: "Compreender emoções, intenções e estado mental de outras pessoas." },
  { id: "c20", name: "Enganação", attrs: ["wlp", "dex"], desc: "Mentir de forma convincente utilizando linguagem corporal e improvisação." },
  { id: "c21", name: "Atuação", attrs: ["wlp", "dex"], desc: "Interpretar papéis, disfarces e performances sociais." },
  { id: "c22", name: "Medicina", attrs: ["ins", "dex"], desc: "Tratar ferimentos, realizar cirurgias, aplicar remédios e primeiros socorros." },
  { id: "c23", name: "Artesanato", attrs: ["ins", "dex"], desc: "Criar ou reparar equipamentos, mechanisms e ferramentas." },
  { id: "c24", name: "Alquimia", attrs: ["ins", "dex"], desc: "Produzir poções, explosivos, venenos ou reagentes mágicos." },
  { id: "c25", name: "Ocultismo", attrs: ["ins", "wlp"], desc: "Conhecimento sobre entidades, rituais, maldições e magia antiga." },
  { id: "c26", name: "Domínio Arcano", attrs: ["ins", "wlp"], desc: "Controlar efeitos mágicos complexos, improvisar feitiços e manipular o Éter." },
  { id: "c27", name: "Caça", attrs: ["ins", "dex", "mig"], desc: "Rastrear, aproximar-se da presa e abatê-la (3 Atributos)." },
  { id: "c28", name: "Perseguição", attrs: ["dex", "mig", "ins"], desc: "Fugir ou perseguir alguém em terrenos variados (3 Atributos)." },
  { id: "c29", name: "Navegação", attrs: ["ins", "wlp"], desc: "Orientação terrestre, marítima ou astral." },
  { id: "c30", name: "Resistência Mágica", attrs: ["wlp", "mig"], desc: "Resistir aos efeitos físicos e mentais de magia hostil." },
  { id: "c31", name: "Ritual", attrs: ["ins", "wlp", "dex"], desc: "Executar rituais longos e precisos sem cometer erros (3 Atributos)." },
  { id: "c32", name: "Sobrecarga Arcana", attrs: ["ins", "mig"], desc: "Canalizar grandes quantidades de Éter sem sofrer danos." },
  { id: "c33", name: "Inspiração", attrs: ["wlp", "ins"], desc: "Motivar aliados antes ou durante um combate." },
  { id: "c34", name: "Duelo Mental", attrs: ["wlp", "ins"], desc: "Conflitos psíquicos, debates mágicos ou confrontos de vontade." }
]

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

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
  while (xpLeft >= xpRequired) { xpLeft -= xpRequired; level++; xpRequired = Math.floor(xpRequired * 1.5); }
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
// COMPONENTES SECUNDÁRIOS & SISTEMAS NOVOS
// ==========================================

// APP DE INVENTOR
function BlueprintApp({ character, editable, onSpendMp }: any) {
  const skillLvl = character.skills["ti-gadgets"] || 0;
  const currentMp = character.resources.mp;

  // --- NOVO TRATAMENTO DE ERRO / AVISO ---
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
                <span className="text-[10px] uppercase font-bold text-destructive flex items-center gap-1.5 shrink-0 bg-background/50 px-2 py-1 rounded"><Lock className="size-3" /> Bloqueado</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const WeatherOverlay = ({ weather }: { weather: WeatherType }) => {
  useEffect(() => {
    if (weather === "clear") return;

    const audioUrls: Record<string, string> = {
      rain: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/rain.mp3",
      blizzard: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/wind.mp3",
      sunny: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/ambiences/outdoor.mp3",
      cloudy: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/wind.mp3",
      fog: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/ambiences/cave.mp3"
    };

    const url = audioUrls[weather];
    if (!url) return;

    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = (weather === "fog" || weather === "sunny") ? 0.3 : 0.15;
    audio.play().catch(() => console.log("Interação necessária para áudio de clima tocar."));

    return () => {
      audio.pause();
    };
  }, [weather]);

  if (weather === "clear") return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[5] overflow-hidden">
      <div className={`absolute inset-0 transition-colors duration-1000 ${weather === "blizzard" ? "bg-slate-200/10" :
        weather === "fog" ? "bg-zinc-500/30" :
          weather === "sunny" ? "bg-orange-500/10 mix-blend-overlay" :
            weather === "cloudy" ? "bg-blue-900/10" :
              weather === "rain" ? "bg-blue-950/20" : "bg-transparent"
        }`} />

      {weather === "sunny" && (
        <motion.div
          className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] rounded-full bg-yellow-300/10 blur-[100px]"
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.05, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {weather === "cloudy" && (
        <>
          {Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={`cloud-${i}`}
              className="absolute w-[400px] h-[120px] bg-white/10 rounded-full blur-[40px]"
              style={{ top: `${15 + (i * 20)}%` }}
              initial={{ x: "-100vw" }}
              animate={{ x: "100vw" }}
              transition={{ duration: 60 + Math.random() * 40, repeat: Infinity, ease: "linear", delay: i * 5 }}
            />
          ))}
        </>
      )}

      {weather === "fog" && (
        <>
          <motion.div
            className="absolute bottom-0 left-0 w-full h-[60%] bg-zinc-300/10 blur-[60px]"
            animate={{ x: ["-10%", "10%", "-10%"] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-0 right-0 w-full h-[50%] bg-zinc-400/10 blur-[50px]"
            animate={{ x: ["10%", "-10%", "10%"] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      {weather === "rain" && (
        <>
          {Array.from({ length: 60 }).map((_, i) => (
            <motion.div
              key={`drop-${i}`}
              className="absolute bg-blue-300/40 w-[2px] h-12 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `-10%` }}
              animate={{ top: "110%" }}
              transition={{ duration: 0.3 + Math.random() * 0.3, repeat: Infinity, ease: "linear", delay: Math.random() }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0, 0, 0.8, 0, 0, 0] }}
            transition={{ repeat: Infinity, duration: 15, times: [0, 0.9, 0.92, 0.95, 0.98, 1] }}
            className="absolute inset-0 bg-white/40 mix-blend-overlay"
          />
        </>
      )}

      {weather === "blizzard" && (
        <>
          {Array.from({ length: 100 }).map((_, i) => (
            <motion.div
              key={`snow-${i}`}
              className="absolute bg-white/90 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `-10%`, width: Math.random() * 4 + 2, height: Math.random() * 4 + 2 }}
              animate={{ top: "110%", left: `+=${Math.random() * 40 - 20}vw` }}
              transition={{ duration: 1.5 + Math.random() * 2, repeat: Infinity, ease: "linear", delay: Math.random() * 2 }}
            />
          ))}
        </>
      )}
    </div>
  )
}

function CombinedChecksPanel({ character, onRoll, rollingAttr, disabled }: any) {
  const [search, setSearch] = useState("");
  const filtered = PRESET_CHECKS.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.desc.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col gap-4 mt-2 animate-in fade-in zoom-in-95 duration-200">
      <div className="relative border border-primary/20 bg-black/40 rounded-lg overflow-hidden shadow-inner">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-primary" />
        <input
          type="text"
          placeholder="Procurar teste de perícia..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-transparent border-none py-2.5 pl-10 pr-4 text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar-sepia pr-2">
        {filtered.map(check => (
          <Button
            key={check.id}
            disabled={disabled || rollingAttr === check.id}
            variant="outline"
            className="h-auto p-3 justify-start border-border/40 hover:border-primary/50 hover:bg-primary/5 transition-all group"
            onClick={() => onRoll(check)}
          >
            <div className="flex flex-col items-start w-full gap-1">
              <div className="flex justify-between items-center w-full">
                <span className="font-bold text-foreground group-hover:text-primary transition-colors">{check.name}</span>
                <div className="flex gap-1.5">
                  {check.attrs.map((attr, i) => (
                    <span key={i} className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      {attr} <span className="opacity-50">({character.attributes[attr]})</span>
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-xs font-normal opacity-60 text-left whitespace-normal leading-snug">{check.desc}</span>
            </div>
          </Button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground italic text-center col-span-2 py-8">Nenhum teste encontrado com esse nome.</p>}
      </div>
    </div>
  )
}

function ModifiersPanel({ character, isGm, onUpdate }: any) {
  const mods: Modifier[] = character.customModifiers || [];
  const [name, setName] = useState("");
  const [value, setValue] = useState(0);
  const [target, setTarget] = useState("all");

  const handleAdd = () => {
    if (!name.trim() || value === 0) return alert("Preencha um nome e um valor diferente de 0.");
    const newMod: Modifier = { id: Math.random().toString(36).substring(7), name, value, target };
    onUpdate([...mods, newMod]);
    setName("");
    setValue(0);
  }

  const handleRemove = (id: string) => {
    onUpdate(mods.filter(m => m.id !== id));
  }

  const getTargetName = (tgt: string) => {
    if (tgt === 'all') return "Todos os Testes";
    if (tgt === 'mig') return "Apenas Vigor (MIG)";
    if (tgt === 'dex') return "Apenas Destreza (DEX)";
    if (tgt === 'ins') return "Apenas Intuição (INS)";
    if (tgt === 'wlp') return "Apenas Vontade (WLP)";
    return `Teste Específico: ${tgt}`;
  }

  return (
    <div className="flex flex-col gap-6 mt-2 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-black/20 border border-border/40 rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
          <Activity className="size-4" /> Condições Ativas
        </h3>
        {mods.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4 border border-dashed border-border/30 rounded-lg">Personagem saudável. Nenhuma condição afeta seus testes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mods.map(mod => (
              <div key={mod.id} className={`flex items-center justify-between p-3 rounded-lg border ${mod.value > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex flex-col">
                  <span className={`font-bold text-sm ${mod.value > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {mod.name} ({mod.value > 0 ? '+' + mod.value : mod.value})
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Alvo: {getTargetName(mod.target)}</span>
                </div>
                {(isGm || character.ownerId) && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemove(mod.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isGm && (
        <div className="bg-primary/5 border border-primary/30 rounded-xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Plus className="size-4" /> Atribuir Modificador (GM)
          </h3>
          <div className="flex flex-col gap-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome (Ex: Cansado, Veneno, Aura Abençoada)" className="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50" />

            <div className="flex gap-3">
              <div className="w-1/3 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground font-bold">Valor (+ ou -)</span>
                <input type="number" value={value} onChange={e => setValue(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-sm text-foreground focus:outline-none focus:border-primary/50 text-center font-mono font-bold" />
              </div>
              <div className="w-2/3 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground font-bold">Afeta Qual Teste?</span>
                <select value={target} onChange={e => setTarget(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  <option value="all">Todos os Testes Gerais</option>
                  <optgroup label="Por Atributo Envolvido">
                    <option value="mig">Qualquer rolagem usando Vigor (MIG)</option>
                    <option value="dex">Qualquer rolagem usando Destreza (DEX)</option>
                    <option value="ins">Qualquer rolagem usando Intuição (INS)</option>
                    <option value="wlp">Qualquer rolagem usando Vontade (WLP)</option>
                  </optgroup>
                  <optgroup label="Testes Específicos">
                    {PRESET_CHECKS.map(c => <option key={c.id} value={c.name}>Apenas: {c.name}</option>)}
                  </optgroup>
                </select>
              </div>
            </div>

            <Button className="w-full mt-2 gap-2 bg-primary text-primary-foreground font-bold hover:bg-primary/90" onClick={handleAdd}>
              <Save className="size-4" /> Aplicar Condição ao Jogador
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function NPCCreator({ onCreated, onCancel }: { onCreated: (npc: NPCDraft) => void, onCancel: () => void }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [origin, setOrigin] = useState("")
  const [identity, setIdentity] = useState("")
  const [theme, setTheme] = useState("")
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [profileId, setProfileId] = useState<string>(ATTRIBUTE_PROFILES[0].id)
  const [customAttributes, setCustomAttributes] = useState<Record<AttributeKey, DieSize>>({ dex: "d8", ins: "d8", mig: "d8", wlp: "d8" })
  const [equipment, setEquipment] = useState<string[]>([])

  const totalLevels = useMemo(() => Object.values(skillLevels).reduce((s, n) => s + n, 0), [skillLevels])
  const classLevels = useMemo(() => {
    const cl: Record<string, number> = {}
    CLASSES.forEach(c => {
      let classLvl = 0
      c.skills.forEach(s => { classLvl += (skillLevels[s.id] || 0) })
      if (classLvl > 0) cl[c.id] = classLvl
    })
    return cl
  }, [skillLevels])
  const chosenClassCount = Object.keys(classLevels).length

  const attributes = useMemo<Record<AttributeKey, DieSize>>(() => {
    if (profileId === "custom") return customAttributes;
    return ATTRIBUTE_PROFILES.find((p) => p.id === profileId)?.dice || customAttributes;
  }, [profileId, customAttributes])

  const customPoints = useMemo(() => Object.values(customAttributes).reduce((acc, die) => {
    return acc + (die === "d6" ? 1 : die === "d8" ? 2 : die === "d10" ? 3 : 4);
  }, 0), [customAttributes])

  const spent = useMemo(() => equipment.reduce((s, id) => s + (getEquipment(id)?.cost ?? 0), 0), [equipment])
  const remaining = STARTING_ZENIT - spent
  const classesPayload: ClassLevel[] = useMemo(() => Object.entries(classLevels).map(([classId, level]) => ({ classId, level })), [classLevels])
  const preview = useMemo(() => computeMaxResources(classesPayload, attributes), [classesPayload, attributes])

  function setSkillLvl(skillId: string, level: number, max: number) {
    if (level < 0 || level > max) return
    setSkillLevels((prev) => {
      const next = { ...prev, [skillId]: level }
      if (level === 0) delete next[skillId]
      return next
    })
  }

  function toggleEquipment(id: string) {
    setEquipment((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const canNext = (step === 0 && name.trim().length > 0) || (step === 1 && totalLevels > 0) || (step === 2 && (profileId !== "custom" || customPoints === 8)) || step === 3

  async function submit() {
    setSaving(true)
    const draft: NPCDraft = {
      id: "npc-" + Math.random().toString(36).substring(2, 9),
      name, avatarUrl, origin, identity, theme, classes: classesPayload, skills: skillLevels, attributes, equipment
    }
    setTimeout(() => {
      onCreated(draft)
      setSaving(false)
      setStep(0); setName(""); setAvatarUrl(""); setOrigin(""); setIdentity(""); setTheme(""); setSkillLevels({}); setEquipment([]);
    }, 500)
  }

  return (
    <div className="mx-auto max-w-3xl w-full">
      <div className="mb-8 flex items-center justify-between">
        {NPC_STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${i < step ? "border-destructive bg-destructive text-destructive-foreground" : i === step ? "border-destructive bg-destructive/15 text-destructive" : "border-border text-muted-foreground"}`}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={`ml-2 hidden text-sm sm:inline ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {i < NPC_STEPS.length - 1 && <div className={`mx-2 h-px flex-1 ${i < step ? "bg-destructive" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <div className="panel border-glow min-h-[360px] rounded-xl border border-destructive/30 p-6 relative">
        {step === 0 && <EssenceStep name={name} setName={setName} avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} origin={origin} setOrigin={setOrigin} identity={identity} setIdentity={setIdentity} theme={theme} setTheme={setTheme} />}
        {step === 1 && <ClassesStep skillLevels={skillLevels} setSkillLvl={setSkillLvl} classLevels={classLevels} totalLevels={totalLevels} chosenCount={chosenClassCount} />}
        {step === 2 && <AttributesStep profileId={profileId} setProfileId={setProfileId} attributes={attributes} customAttributes={customAttributes} setCustomAttributes={setCustomAttributes} />}
        {step === 3 && <EquipmentStep equipment={equipment} toggle={toggleEquipment} remaining={remaining} spent={spent} />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
        <span className="text-xs font-semibold uppercase tracking-widest text-destructive">Ficha do NPC</span>
        <span className="flex items-center gap-1.5 text-[color:var(--hp)]"><Heart className="size-4" /> {preview.maxHp} HP</span>
        <span className="flex items-center gap-1.5 text-[color:var(--mp)]"><Zap className="size-4" /> {preview.maxMp} MP</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><Swords className="size-4" /> Lv. {Math.max(1, totalLevels)}</span>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" /> {step === 0 ? "Cancelar" : "Voltar"}
        </Button>
        {step < NPC_STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Próximo <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={saving || !canNext} className="gap-1.5 font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar no Berçário
          </Button>
        )}
      </div>
    </div>
  )
}

export function CreatureSheet({ creature, isGm, onUpdate, onRoll, onKill }: { creature: any, isGm: boolean, onUpdate: (id: string, updates: any) => void, onRoll: (attr: string, res: number) => void, onKill?: () => void }) {
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
    if (!act) return
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
            <span className="uppercase">{element.slice(0, 3)}</span>
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

      {isGm && currentHp <= 0 && onKill && (
        <div className="mt-6 pt-5 border-t border-destructive/50">
          <Button
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)] animate-pulse"
            onClick={onKill}
          >
            <Skull className="size-5" /> Confirmar Abate e Distribuir XP
          </Button>
        </div>
      )}
    </div>
  )
}

export function CharacterSheet({ character, editable, isGm, campaignMembers = [], onOptimistic, onRoll, onKill, shouldOpenInventory, onClearInventoryRequest }: any) {
  const [mounted, setMounted] = useState(false)
  const [pending, setPending] = useState(false)
  const [rollingAttr, setRollingAttr] = useState<string | null>(null)
  const [rollResult, setRollResult] = useState<{ attr: string; value: number | string } | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [sheetTab, setSheetTab] = useState<"main" | "checks" | "modifiers">("main")

  // Handouts & Itens Úteis
  const [viewingItem, setViewingItem] = useState<CustomItem | null>(null)

  // Modais de Transferência
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferUserId, setTransferUserId] = useState<string>("")

  useEffect(() => setMounted(true), [])

  // NOVA SOLUÇÃO: Se a Room pedir pra abrir essa mochila específica, ela abre e avisa o pai para limpar o pedido.
  useEffect(() => {
    if (shouldOpenInventory) {
      setShowInventory(true);
      if (onClearInventoryRequest) onClearInventoryRequest();
    }
  }, [shouldOpenInventory, onClearInventoryRequest])

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

    onOptimistic({ ...character, skills: newSkills, classes: newClasses, resources: newResources });
    setShowLevelUp(false);
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ skills: newSkills, classes: newClasses, resources: newResources })
      });
      onOptimistic(updated);
    } finally { setPending(false); }
  }

  async function buyItem(itemId: string) {
    if (!editable) return;
    const item = getEquipment(itemId);
    if (!item) return;
    if (currentZenit < item.cost) { alert("Zênit insuficiente!"); return; }
    const newEquipment = [...character.equipment, item.id];
    const newZenit = currentZenit - item.cost;
    onOptimistic({ ...character, equipment: newEquipment, zenit: newZenit });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment, zenit: newZenit }) });
      onOptimistic(updated);
    } finally { setPending(false); }
  }

  async function sellItem(itemId: string, index: number) {
    if (!editable) return;
    const item = getEquipment(itemId);
    if (!item) return;
    const sellValue = Math.floor(item.cost / 2);
    const newEquipment = [...character.equipment];
    newEquipment.splice(index, 1);
    const newZenit = currentZenit + sellValue;
    onOptimistic({ ...character, equipment: newEquipment, zenit: newZenit });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment, zenit: newZenit }) });
      onOptimistic(updated);
    } finally { setPending(false); }
  }

  function rollDice(attr: AttributeKey, dieString: string) {
    if (rollingAttr || !editable) return;
    setRollingAttr(attr);
    setRollResult(null);
    setTimeout(() => {
      const sides = parseInt(dieString.replace("d", ""));
      const result = Math.floor(Math.random() * sides) + 1;
      const attrLabel = ATTRIBUTE_META[attr].label;

      let modTotal = 0;
      const activeMods: string[] = [];
      const mods = (character as any).customModifiers || [];
      mods.forEach((m: any) => {
        if (m.target === 'all' || m.target === attr) {
          modTotal += m.value;
          activeMods.push(`${m.name}(${m.value > 0 ? '+' + m.value : m.value})`);
        }
      });

      const finalResult = result + modTotal;
      const detailStr = `[${attrLabel}] 🎲 ${result}` + (modTotal !== 0 ? ` ⚡ Mod: ${activeMods.join(', ')}` : '');

      setRollResult({ attr: attrLabel, value: finalResult });
      if (onRoll) {
        apiFetch(`/api/campaigns/${character.campaignId}/roll`, {
          method: "POST",
          body: JSON.stringify({
            characterId: 'sys',
            characterName: character.name,
            playerName: campaignMembers.find((m: any) => m.userId === character.ownerId)?.name || 'Jogador',
            attribute: attrLabel,
            result: `${finalResult} (${result}${modTotal !== 0 ? (modTotal > 0 ? '+' + modTotal : modTotal) : ''})`
          })
        }).catch(console.error);
      }
      setRollingAttr(null);
      setTimeout(() => setRollResult(null), 3000);
    }, 800);
  }

  function handleCombinedRoll(check: any) {
    if (rollingAttr || !editable) return;
    setRollingAttr(check.id);

    setTimeout(() => {
      let totalDice = 0;
      let details: number[] = [];
      check.attrs.forEach((a: string) => {
        const dieSize = parseInt((character.attributes[a as AttributeKey] || "d6").replace("d", ""));
        const roll = Math.floor(Math.random() * dieSize) + 1;
        totalDice += roll;
        details.push(roll);
      });

      let modTotal = 0;
      let activeMods: string[] = [];
      const mods = (character as any).customModifiers || [];
      mods.forEach((m: any) => {
        if (m.target === 'all' || check.attrs.includes(m.target) || m.target === check.name) {
          modTotal += m.value;
          activeMods.push(`${m.name} (${m.value > 0 ? '+' + m.value : m.value})`);
        }
      });

      const finalResult = totalDice + modTotal;
      const diceStr = `[${check.attrs.join('+').toUpperCase()}] 🎲 ${details.join(' + ')}`;
      const modStr = modTotal !== 0 ? ` ⚡ Mod: ${modTotal > 0 ? '+' + modTotal : modTotal}` : '';

      const logDetail = `${check.name} ${diceStr}${modStr}`;

      if (onRoll) {
        apiFetch(`/api/campaigns/${character.campaignId}/roll`, {
          method: "POST",
          body: JSON.stringify({
            characterId: 'sys',
            characterName: character.name,
            playerName: campaignMembers.find((m: any) => m.userId === character.ownerId)?.name || 'Jogador',
            attribute: logDetail,
            result: finalResult
          })
        }).catch(console.error);
      }

      setRollResult({ attr: check.name, value: finalResult });
      setRollingAttr(null);
      setTimeout(() => setRollResult(null), 4000);
    }, 800);
  }

  async function updateModifiers(newMods: Modifier[]) {
    onOptimistic({ ...character, customModifiers: newMods });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customModifiers: newMods })
      });
      onOptimistic(updated);
    } finally {
      setPending(false);
    }
  }

  function useSkill(skill: any) {
    if (!skill.action || !editable) return;
    if (character.resources[skill.action.resource] < skill.action.cost) { alert(`Você não tem ${skill.action.resource.toUpperCase()} suficiente!`); return; }
    patchResource(skill.action.resource, -skill.action.cost);
    setSelectedSkill(null);
  }

  function useInventoryItem(actionId: string) {
    if (!editable) return;
    const act = INVENTORY_ACTIONS.find(a => a.id === actionId);
    if (!act) return;
    if (character.resources.ip < act.cost) { alert("Pontos de Inventário insuficientes!"); return; }
    patchResource("ip", -act.cost);
    if (act.effectResource && act.effectValue) patchResource(act.effectResource, act.effectValue);
    setShowInventory(false);
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
                      const hasClass = c.skills.some((s: any) => skillsObj[s.id] > 0);
                      const numClasses = new Set(Object.keys(skillsObj).map(id => id.split('-')[0])).size;
                      if (!hasClass && numClasses >= 3) return null;
                      return (
                        <div key={c.id} className="mb-6">
                          <h5 className="font-bold text-foreground bg-primary/10 border border-primary/20 px-3 py-2 rounded mb-3 flex items-center gap-2"><BookOpenText className="size-4 text-primary" /> {c.name}</h5>
                          <div className="space-y-2 pl-2">
                            {c.skills.map((s: any) => {
                              const lvl = skillsObj[s.id] || 0;
                              if (lvl >= s.maxLevel) return null;
                              return (
                                <div key={s.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3 rounded-lg bg-card/40 border border-border/40 hover:border-primary/30 transition-colors">
                                  <div className="pr-4">
                                    <p className="text-sm text-primary font-bold">{s.name} <span className="text-xs text-muted-foreground ml-1">Nv.{lvl}</span></p>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{formatSkillDescription(s.description, lvl + 1)}</p>
                                  </div>
                                  <Button size="sm" className="shrink-0 self-end sm:self-auto" onClick={() => saveNewSkillPoint(s.id)}>Aprender</Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
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
                            const item = getEquipment(id);
                            if (!item) return null;
                            const sellPrice = Math.floor(item.cost / 2);
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
                            );
                          })}
                        </div>
                      )}
                    </section>
                    <section className="flex-[1.5] space-y-4">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Catálogo (Comprar)</h5>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {EQUIPMENT.filter((i: any) => i.purchasable !== false).map((item: any) => {
                          const canAfford = currentZenit >= item.cost;
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
                          );
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
                            const item = getEquipment(id);
                            return item ? (
                              <div key={`${id}-${idx}`} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border/50">
                                <Info className="size-4 text-primary shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold text-sm text-foreground">{item.name}{(item as any).purchasable === false && <span className="ml-2 text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.5 rounded">LOOT RARO</span>}</p>
                                  <div className="text-xs text-muted-foreground mt-1"><ItemModifiers text={item.detail} /></div>
                                </div>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}

                      {/* --- NOVO: ITENS ÚTEIS / RELÍQUIAS NA MOCHILA --- */}
                      {customItems.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-white/10">
                          <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pb-3 flex items-center gap-2">
                            <Sparkles className="size-4" /> Relíquias e Pergaminhos
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {customItems.map((item: any) => (
                              <button
                                key={item.id}
                                onClick={() => setViewingItem(item)}
                                className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-colors text-left"
                              >
                                <div className="flex items-center gap-3">
                                  {item.type === 'text' && <ScrollText className="size-5 text-amber-500" />}
                                  {item.type === 'image' && <ImageIcon className="size-5 text-blue-400" />}
                                  {item.type === 'video' && <Film className="size-5 text-purple-400" />}
                                  {item.type === 'app-blueprints' && <Package className="size-5 text-blue-500" />}
                                  <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                                </div>
                              </button>
                            ))}
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

          {/* NOVO: MODAL VISUALIZADOR DE ITENS ÚTEIS / RELÍQUIAS / APPS */}
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
                      {campaignMembers.map((m: any) => (
                        <button
                          key={m.userId}
                          onClick={() => setTransferUserId(m.userId)}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${transferUserId === m.userId ? "border-primary bg-primary/20 text-white font-bold" : "border-white/5 bg-white/5 hover:border-primary/50"}`}
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
      <div className="flex items-start justify-between gap-4 w-full mb-4 relative z-50">
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
            <Coins className="size-3.5 text-accent" />
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

      {/* BARRA DE NAVEGAÇÃO DE ABAS */}
      <div className="flex bg-black/40 rounded-lg p-1 border border-border/40 w-full mb-5 relative z-50">
        <button onClick={() => setSheetTab('main')} className={`flex-1 text-xs py-2 rounded-md transition-colors ${sheetTab === 'main' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted-foreground hover:text-white'}`}>Principal</button>
        <button onClick={() => setSheetTab('checks')} className={`flex-1 text-xs py-2 rounded-md transition-colors ${sheetTab === 'checks' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted-foreground hover:text-white'}`}>Testes e Perícias</button>
        <button onClick={() => setSheetTab('modifiers')} className={`flex-1 text-xs py-2 rounded-md transition-colors ${sheetTab === 'modifiers' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted-foreground hover:text-white flex items-center justify-center gap-1'}`}>
          Condições {(character as any).customModifiers?.length > 0 && <span className="flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold">{(character as any).customModifiers.length}</span>}
        </button>
      </div>

      {/* CONTEÚDO DA ABA SELECIONADA */}
      {sheetTab === 'main' && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          {/* XP System */}
          <div className="bg-black/40 rounded-lg p-3 sm:p-4 border border-border/40">
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
        </div>
      )}

      {sheetTab === 'checks' && (
        <CombinedChecksPanel
          character={character}
          onRoll={handleCombinedRoll}
          rollingAttr={rollingAttr}
          disabled={!editable}
        />
      )}

      {sheetTab === 'modifiers' && (
        <ModifiersPanel
          character={character}
          isGm={isGm}
          onUpdate={updateModifiers}
        />
      )}

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

export function CampaignRoom({ initial }: { initial: CampaignData }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState(initial)
  const [characters, setCharacters] = useState<Character[]>(initial.characters)
  const [creating, setCreating] = useState(false)
  const [live, setLive] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [activeMap, setActiveMap] = useState<GameMap | null>(null)
  const [showMapImporter, setShowMapImporter] = useState(false)

  // Clima
  const [weather, setWeather] = useState<WeatherType>("clear")

  // Painel de Loot (Catálogo)
  const [showGmPanel, setShowGmPanel] = useState(false)
  const [gmPanelTab, setGmPanelTab] = useState<"catalog" | "custom">("catalog")
  const [selectedLoot, setSelectedLoot] = useState<string | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<string | null>(null)
  const [sendingLoot, setSendingLoot] = useState(false)
  const [lootSearchQuery, setLootSearchQuery] = useState("")

  // Criador de Itens Úteis (Handouts)
  const [customItemName, setCustomItemName] = useState("")
  const [customItemType, setCustomItemType] = useState<"text" | "image" | "video" | "app-blueprints">("text")
  const [customItemContent, setCustomItemContent] = useState("")
  const [itemNotification, setItemNotification] = useState<string | null>(null)
  const [inventoryToOpen, setInventoryToOpen] = useState<string | null>(null)

  // Criador de Enquetes e Rascunhos
  const [showPollModal, setShowPollModal] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pollDuration, setPollDuration] = useState(60)
  const [draftPolls, setDraftPolls] = useState<DraftPoll[]>([])

  // Enquete Ativa (Global da Sala)
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null)
  const [now, setNow] = useState(Date.now())

  // Berçário de NPCs Customizados
  const [showNursery, setShowNursery] = useState(false)
  const [customNPCs, setCustomNPCs] = useState<NPCDraft[]>([])

  // Loots Caídos de NPCs mortos
  const [showDroppedLoots, setShowDroppedLoots] = useState(false)
  const [npcLoots, setNpcLoots] = useState<DroppedLoot[]>([])
  const [selectedDroppedLoot, setSelectedDroppedLoot] = useState<DroppedLoot | null>(null)

  // Bestiário
  const [showBestiary, setShowBestiary] = useState(false)
  const [bestiarySearchQuery, setBestiarySearchQuery] = useState("")
  const [hoveredCreature, setHoveredCreature] = useState<Creature | null>(null)
  const [activeCreatures, setActiveCreatures] = useState<ActiveCreature[]>([])
  const [selectedCombatCharId, setSelectedCombatCharId] = useState<string | null>(null)
  const [selectedCombatCreatureId, setSelectedCombatCreatureId] = useState<string | null>(null)
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)
  const [savedMaps, setSavedMaps] = useState<GameMap[]>([])

  // Histórico Unificado
  const [history, setHistory] = useState<HistoryRecord[]>([])

  // SOUNDPAD STATES
  const [showSoundpad, setShowSoundpad] = useState(false)
  const [activeSounds, setActiveSounds] = useState<ActiveSound[]>([])

  // === CUTSCENES STATES ===
  const [showCutsceneManager, setShowCutsceneManager] = useState(false)
  const [cutscenes, setCutscenes] = useState<Cutscene[]>([])
  const [editingCutscene, setEditingCutscene] = useState<Cutscene | null>(null)
  const [activeCutscene, setActiveCutscene] = useState<Cutscene | null>(null)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)

  const isGm = data.role === "gm"

  // Montagem & Carregar Storage
  useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      const savedDrafts = localStorage.getItem(`drafts_${data.campaign.id}`)
      if (savedDrafts) { try { setDraftPolls(JSON.parse(savedDrafts)) } catch (e) { } }

      const savedNPCs = localStorage.getItem(`custom_npcs_${data.campaign.id}`)
      if (savedNPCs) { try { setCustomNPCs(JSON.parse(savedNPCs)) } catch (e) { } }

      const savedLoots = localStorage.getItem(`npc_loots_${data.campaign.id}`)
      if (savedLoots) { try { setNpcLoots(JSON.parse(savedLoots)) } catch (e) { } }

      const savedWeather = localStorage.getItem(`weather_${data.campaign.id}`)
      if (savedWeather) { setWeather(savedWeather as WeatherType) }

      const savedCutscenesStr = localStorage.getItem(`cutscenes_${data.campaign.id}`)
      if (savedCutscenesStr) { try { setCutscenes(JSON.parse(savedCutscenesStr)) } catch (e) { } }

      const localSavedMaps = localStorage.getItem(`maps_${data.campaign.id}`)
      if (localSavedMaps) { try { setSavedMaps(JSON.parse(localSavedMaps)) } catch (e) { } }
    }
  }, [data.campaign.id])

  // Timer da Enquete
  useEffect(() => {
    if (!activePoll) return;
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, [activePoll])

  // Baixa os mapas via API e sincroniza com o localstorage
  useEffect(() => {
    apiFetch<{ maps: GameMap[] }>(`/api/campaigns/${data.campaign.id}/maps`)
      .then(res => {
        setSavedMaps(res.maps || []);
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(res.maps || []));
      })
      .catch(() => { })
  }, [data.campaign.id])

  // Sincroniza savedMaps localmente se houver edição
  const syncMapsToStorage = useCallback((maps: GameMap[]) => {
    setSavedMaps(maps);
    localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(maps));
  }, [data.campaign.id]);

  // Verificador de Expiração da Enquete
  useEffect(() => {
    if (!activePoll) return;
    if (now >= activePoll.expiresAt) {
      const voteCounts = activePoll.options.map(() => 0);
      Object.values(activePoll.votes).forEach(optIdx => {
        if (voteCounts[optIdx] !== undefined) voteCounts[optIdx]++;
      });
      const maxVotes = Math.max(...voteCounts);
      const winners = activePoll.options.filter((_, idx) => voteCounts[idx] === maxVotes);
      const winnerText = winners.length > 1 ? "Empate: " + winners.join(", ") : winners[0];

      setHistory(prev => [
        {
          id: activePoll.id,
          type: "poll" as const,
          title: activePoll.question,
          subtitle: "Enquete Encerrada",
          detail: winnerText || "Nenhum voto",
          result: `${maxVotes} voto(s)`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...prev
      ].slice(0, 50));

      setActivePoll(null);
    }
  }, [now, activePoll])

  const handlePlaySound = useCallback((track: { id: string, url: string }, loop: boolean) => {
    const uid = `${track.id}_${Math.random().toString(36).substring(2, 8)}`;
    apiFetch(`/api/campaigns/${data.campaign.id}/sound`, {
      method: "POST", body: JSON.stringify({ action: "play", id: uid, trackId: track.id, url: track.url, loop })
    });
  }, [data.campaign.id]);

  const handleStopSound = useCallback((id: string) => {
    apiFetch(`/api/campaigns/${data.campaign.id}/sound`, { method: "POST", body: JSON.stringify({ action: "stop", id }) });
  }, [data.campaign.id]);

  const handleStopAllSounds = useCallback(() => {
    apiFetch(`/api/campaigns/${data.campaign.id}/sound`, { method: "POST", body: JSON.stringify({ action: "stop_all" }) });
  }, [data.campaign.id]);


  const handleEvent = useCallback((event: any) => {
    setLive(true)

    // Clima Persistente
    if (event.type === "weather:change" || event.eventType === "weather:change" || event.action === "weather:change") {
      const w = event.weather;
      if (w) {
        setWeather(w);
        localStorage.setItem(`weather_${data.campaign.id}`, w);
      }
      return;
    }

    // Monstros
    if (event.type === "creature:spawn") { setActiveCreatures(prev => [...prev, event.creature]); return; }
    if (event.type === "creature:update") { setActiveCreatures(prev => prev.map(c => c.instanceId === event.instanceId ? { ...c, ...event.updates } : c)); return; }
    if (event.type === "creature:remove") { setActiveCreatures(prev => prev.filter(c => c.instanceId !== event.instanceId)); return; }

    // Mapa
    if (event.type === "map:created") {
      setSavedMaps(prev => {
        const next = [...prev, event.map];
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(next));
        return next;
      });
      return;
    }

    // Soundpad Events
    if (event.type === "sound:play") {
      setActiveSounds(prev => [...prev, event.sound]);
      return;
    }
    if (event.type === "sound:stop") {
      setActiveSounds(prev => prev.filter(s => s.id !== event.soundId));
      return;
    }
    if (event.type === "sound:stop_all") {
      setActiveSounds([]);
      return;
    }

    if (event.type === "map:token_moved") {
      setActiveMap(prev => {
        if (!prev || prev.id !== event.mapId) return prev;
        const updatedMap = {
          ...prev,
          tokens: {
            ...(prev.tokens || {}),
            [event.tokenId]: { x: event.x, y: event.y, type: event.tokenType }
          }
        };
        // O mapa que você tá olhando deve refletir no storage global também pra não perder as configs!
        setSavedMaps(allMaps => {
          const nextAllMaps = allMaps.map(m => m.id === updatedMap.id ? updatedMap : m);
          localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(nextAllMaps));
          return nextAllMaps;
        });
        return updatedMap;
      });
      return;
    }

    if (event.type === "map:terrain_updated") {
      setActiveMap(prev => {
        if (!prev || prev.id !== event.mapId) return prev;
        const updatedMap = {
          ...prev,
          tiles: {
            ...prev.tiles,
            [`${event.tileData.x},${event.tileData.y}`]: event.tileData
          }
        };
        // O mapa que você tá olhando deve refletir no storage global também pra não perder as configs!
        setSavedMaps(allMaps => {
          const nextAllMaps = allMaps.map(m => m.id === updatedMap.id ? updatedMap : m);
          localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(nextAllMaps));
          return nextAllMaps;
        });
        return updatedMap;
      })
      return;
    }

    // Dados & Truques de Mestre Ocultos
    if (event.type === "dice:roll") {
      const attr = String(event.attribute || "");

      // INTERCEPTA CLIMA
      if (attr.startsWith("SYNC_WEATHER:")) {
        const newWeather = attr.split(":")[1] as WeatherType;
        setWeather(newWeather);
        localStorage.setItem(`weather_${data.campaign.id}`, newWeather);

        setHistory((prev) => [{
          id: Math.random().toString(36).substring(7),
          type: "roll" as const,
          title: "Mestre",
          subtitle: "Controle do Ambiente",
          detail: "CLIMA ALTERADO",
          result: event.result,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }, ...prev].slice(0, 50));
        return; // Pula histórico normal
      }

      // INTERCEPTA NOTIFICAÇÃO DE ITEM E SYNC DA FICHA
      if (attr.startsWith("SYNC_ITEM_GIVEN")) {
        try {
          const payload = JSON.parse(String(event.result));
          // Sincroniza a ficha para todos da mesa verem a alteração (evita F5)
          // Atualiza inclusive customItems que vieram do Payload
          setCharacters((prev) => prev.map(c => c.id === payload.charId ? payload.character : c));

          // Se o ID do dono for o ID de quem recebeu o websocket, lança o Toast verde!
          if (payload.character.ownerId === data.me.id) {
            setItemNotification(payload.itemName);
            setInventoryToOpen(payload.charId); // Armazena a ID para abrir a mochila caso clique
            setTimeout(() => setItemNotification(null), 8000);
          }
        } catch (e) {
          console.error("Falha ao sincronizar item", e);
        }
        return; // Pula o histórico de rolagem de dados
      }

      // INTERCEPTA CUTSCENE (Chega aqui stringificada para todos)
      if (attr.startsWith("SYNC_CUTSCENE:")) {
        const action = attr.split(":")[1];

        if (action === "PLAY") {
          try {
            const c = JSON.parse(String(event.result));
            setActiveCutscene(c);
            setActiveSceneIndex(0);
          } catch (e) {
            console.error("Falha ao abrir cutscene recebida", e);
          }
        } else if (action === "STOP") {
          setActiveCutscene(null);
        } else if (action === "SCENE") {
          setActiveSceneIndex(Number(event.result));
        }
        return; // Pula histórico
      }

      setHistory((prev) => [{
        id: Math.random().toString(36).substring(7),
        type: "roll" as const,
        title: event.characterName,
        subtitle: event.playerName,
        detail: event.attribute,
        result: event.result,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }, ...prev].slice(0, 50));
      return;
    }

    // Enquetes
    if (event.type === "poll:start") {
      setActivePoll(event.poll);
      return;
    }
    if (event.type === "poll:vote") {
      setActivePoll(prev => {
        if (!prev || prev.id !== event.pollId) return prev;
        return { ...prev, votes: { ...prev.votes, [event.userId]: event.optionIndex } };
      });
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
  }, [data.campaign.id, data.me.id])

  useRealtime(data.campaign.id, handleEvent)

  const applyOptimistic = useCallback((c: Character) => setCharacters((prev) => prev.map((x) => (x.id === c.id ? c : x))), [])

  async function handleCreateMap(newMap: GameMap) {
    newMap.campaignId = data.campaign.id;
    newMap.tokens = {};
    setActiveMap(newMap);
    setShowMapImporter(false);

    // Salva localmente de forma otimista
    syncMapsToStorage([...savedMaps, newMap]);

    await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
      method: "POST", body: JSON.stringify({ action: "create", map: newMap })
    })
  }

  function handleMoveToken(mapId: string, tokenId: string, x: number, y: number, type: "character" | "creature") {
    setActiveMap(prev => {
      if (!prev) return prev;
      const updatedMap = { ...prev, tokens: { ...(prev.tokens || {}), [tokenId]: { x, y, type } } };
      syncMapsToStorage(savedMaps.map(m => m.id === updatedMap.id ? updatedMap : m));
      return updatedMap;
    });

    apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
      method: "POST", body: JSON.stringify({ action: "update_tokens", mapId, tokenId, x, y, tokenType: type })
    })
  }

  function handlePaintTerrain(mapId: string, tile: TileData) {
    setActiveMap(prev => {
      if (!prev) return prev;
      const updatedMap = { ...prev, tiles: { ...prev.tiles, [`${tile.x},${tile.y}`]: tile } };
      syncMapsToStorage(savedMaps.map(m => m.id === updatedMap.id ? updatedMap : m));
      return updatedMap;
    });

    apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
      method: "POST", body: JSON.stringify({ action: "update_terrain", mapId, tileData: tile })
    })
  }

  function handleBroadcastRoll(characterOrCreatureName: string, attrName: string, result: number | string) {
    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST", body: JSON.stringify({ characterId: 'sys', characterName: characterOrCreatureName, playerName: data.me.name, attribute: attrName, result })
    }).catch(console.error)
  }

  function handleSetWeather(w: WeatherType) {
    // Atualização otimista (Mestre)
    setWeather(w);
    localStorage.setItem(`weather_${data.campaign.id}`, w);

    const weatherNames: Record<string, string> = {
      clear: "Céu Limpo", sunny: "Ensolarado", cloudy: "Nublado", fog: "Neblina", rain: "Chuva", blizzard: "Nevasca"
    };

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST", body: JSON.stringify({
        characterId: 'sys_weather',
        characterName: 'Mestre',
        playerName: data.me.name,
        attribute: `SYNC_WEATHER:${w}`,
        result: weatherNames[w] || w
      })
    }).catch(console.error);
  }

  // === SISTEMA DE CUTSCENES ===
  function saveCutscenes(newCutscenes: Cutscene[]) {
    setCutscenes(newCutscenes);
    localStorage.setItem(`cutscenes_${data.campaign.id}`, JSON.stringify(newCutscenes));
  }

  function syncCutscene(action: "PLAY" | "STOP" | "SCENE", payload?: any) {
    const attr = `SYNC_CUTSCENE:${action}`;
    const result = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '...';

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST", body: JSON.stringify({ characterId: 'sys_cutscene', characterName: 'Sistema', playerName: 'Mestre', attribute: attr, result })
    }).catch(console.error);
  }

  const saveCustomNPCsToStorage = (npcs: NPCDraft[]) => {
    setCustomNPCs(npcs);
    localStorage.setItem(`custom_npcs_${data.campaign.id}`, JSON.stringify(npcs));
  }

  function handleDeleteCustomNPC(id: string) {
    saveCustomNPCsToStorage(customNPCs.filter(c => c.id !== id))
  }

  async function spawnNPC(draft: NPCDraft) {
    try {
      await apiFetch(`/api/characters`, {
        method: "POST",
        body: JSON.stringify({
          campaignId: data.campaign.id,
          name: draft.name,
          avatarUrl: draft.avatarUrl,
          origin: draft.origin,
          identity: draft.identity,
          theme: draft.theme,
          classes: draft.classes,
          skills: draft.skills,
          attributes: draft.attributes,
          equipment: draft.equipment,
        })
      });
      setShowNursery(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao invocar NPC.");
    }
  }

  const saveNpcLoots = (loots: DroppedLoot[]) => {
    setNpcLoots(loots);
    localStorage.setItem(`npc_loots_${data.campaign.id}`, JSON.stringify(loots));
  }

  async function handleKillNPC(character: Character) {
    if (!confirm(`Tem certeza que deseja declarar a morte de ${character.name}? Seus equipamentos (se houver) serão enviados ao Baú de Loots Caídos.`)) return;

    const dropped: DroppedLoot[] = character.equipment.map(itemId => ({
      uid: Math.random().toString(36).substring(2, 9),
      itemId,
      sourceName: character.name
    }));

    if (dropped.length > 0) {
      saveNpcLoots([...dropped, ...npcLoots]);
      alert(`${dropped.length} item(ns) foram movidos para a caixa de Loots de NPC!`);
    }

    setCharacters(prev => prev.filter(c => c.id !== character.id));
    if (selectedCombatCharId === character.id) setSelectedCombatCharId(null);
    try {
      await apiFetch(`/api/characters/${character.id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Falha ao deletar o NPC.", err);
    }
  }

  async function handleGiveLoot() {
    if (!selectedTargetCharId) return alert("Selecione um alvo.");

    setSendingLoot(true)
    try {
      const targetCharacter = characters.find(c => c.id === selectedTargetCharId)

      if (gmPanelTab === 'custom') {
        if (!customItemName || (!customItemContent && customItemType !== 'app-blueprints')) {
          setSendingLoot(false);
          return alert("Preencha o nome e o conteúdo da Relíquia.");
        }
        if (customItemType === 'app-blueprints' && targetCharacter) {
          // Verifica se o personagem possui a perícia 'Aparelhos' (ti-gadgets)
          const gadgetsLevel = targetCharacter.skills["ti-gadgets"] || 0;

          if (gadgetsLevel === 0) {
            setSendingLoot(false);
            return alert(`O personagem ${targetCharacter.name} não possui a perícia 'Aparelhos' (Classe: Inventor). Não é possível equipar o Almanaque Magitech.`);
          }
        }
        if (targetCharacter) {
          const newItem: CustomItem = {
            id: Math.random().toString(36).substring(2, 9),
            name: customItemName,
            type: customItemType as any,
            content: customItemContent
          };
          const currentCustom = (targetCharacter as any).customItems || [];
          const updatedCustomItems = [...currentCustom, newItem];

          const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, {
            method: "PATCH", body: JSON.stringify({ customItems: updatedCustomItems })
          })

          // Otimismo imediato com a lista de itens correta
          applyOptimistic({ ...updated, customItems: updatedCustomItems } as any);
          setCustomItemName("")
          setCustomItemContent("")

          // ===============================
          // ENVIO DO SOCKET COM A NOTIFICAÇÃO 
          // ===============================
          apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
            method: "POST", body: JSON.stringify({ characterId: 'sys_item', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_ITEM_GIVEN`, result: JSON.stringify({ charId: targetCharacter.id, character: { ...updated, customItems: updatedCustomItems }, itemName: newItem.name }) })
          }).catch(console.error);

        }
      } else {
        if (!selectedLoot) {
          setSendingLoot(false);
          return alert("Selecione um item do catálogo.");
        }
        const targetCreature = activeCreatures.find(c => c.instanceId === selectedTargetCharId)
        if (targetCharacter) {
          const newEquipment = [...targetCharacter.equipment, selectedLoot]
          const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) })
          applyOptimistic(updated)

          // ===============================
          // ENVIO DO SOCKET COM A NOTIFICAÇÃO 
          // ===============================
          const itemObj = getEquipment(selectedLoot);
          apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
            method: "POST", body: JSON.stringify({ characterId: 'sys_item', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_ITEM_GIVEN`, result: JSON.stringify({ charId: targetCharacter.id, character: updated, itemName: itemObj?.name || 'Novo Equipamento' }) })
          }).catch(console.error);

        } else if (targetCreature) {
          const newEquipment = [...((targetCreature as any).equipment || []), selectedLoot]
          updateCreatureVital(targetCreature.instanceId, { equipment: newEquipment } as any)
        }
        setSelectedLoot(null)
      }
    } catch (err) { alert("Erro ao enviar.") } finally { setSendingLoot(false) }
  }

  async function handleGiveDroppedLoot() {
    if (!selectedDroppedLoot || !selectedTargetCharId) return;
    const targetCharacter = characters.find(c => c.id === selectedTargetCharId);
    if (!targetCharacter) return;

    setSendingLoot(true);
    try {
      const newEquipment = [...targetCharacter.equipment, selectedDroppedLoot.itemId];
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) });
      applyOptimistic(updated);

      saveNpcLoots(npcLoots.filter(l => l.uid !== selectedDroppedLoot.uid));

      // ===============================
      // ENVIO DO SOCKET COM A NOTIFICAÇÃO 
      // ===============================
      const itemObj = getEquipment(selectedDroppedLoot.itemId);
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST", body: JSON.stringify({ characterId: 'sys_item', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_ITEM_GIVEN`, result: JSON.stringify({ charId: targetCharacter.id, character: updated, itemName: itemObj?.name || 'Loot de Inimigo' }) })
      }).catch(console.error);

      setSelectedDroppedLoot(null);
      setSelectedTargetCharId(null);
    } catch (err) {
      alert("Erro ao enviar Loot.");
    } finally {
      setSendingLoot(false);
    }
  }

  async function handleKillCreature(creature: ActiveCreature) {
    if (!isGm) return;
    if (!confirm(`Confirmar a derrota de ${creature.name} e distribuir XP para o grupo?`)) return;

    const xpToGive = Math.max(1, Math.floor(creature.level / 5));

    await removeCreature(creature.instanceId);
    setSelectedCombatCreatureId(null);

    const updatedCharacters = characters.map(c => ({
      ...c,
      resources: { ...c.resources, xp: ((c.resources as any).xp || 0) + xpToGive }
    }));
    setCharacters(updatedCharacters);

    Promise.all(characters.map(c =>
      apiFetch(`/api/characters/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resources: { xp: ((c.resources as any).xp || 0) + xpToGive } })
      })
    )).catch(console.error);

    setHistory(prev => [{
      id: Math.random().toString(36).substring(7),
      type: "poll" as const,
      title: `Vitória! ${creature.name} foi derrotado.`,
      subtitle: "Recompensa do Grupo",
      detail: "Todos os heróis receberam",
      result: `+${xpToGive} XP`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...prev].slice(0, 50));
  }

  const saveDraftsToStorage = (drafts: DraftPoll[]) => {
    setDraftPolls(drafts);
    localStorage.setItem(`drafts_${data.campaign.id}`, JSON.stringify(drafts));
  }

  function handleSaveDraft() {
    const validOptions = pollOptions.filter(o => o.trim() !== "");
    if (validOptions.length < 2 || !pollQuestion.trim()) return alert("Preencha a pergunta e pelo menos 2 opções.");

    const newDraft: DraftPoll = {
      id: Math.random().toString(36).substring(7),
      question: pollQuestion,
      options: validOptions,
      duration: pollDuration
    };

    saveDraftsToStorage([newDraft, ...draftPolls]);
    setPollQuestion("");
    setPollOptions(["", ""]);
  }

  function handleDeleteDraft(id: string) {
    saveDraftsToStorage(draftPolls.filter(d => d.id !== id));
  }

  function handleLaunchDraft(draft: DraftPoll) {
    const poll: ActivePoll = {
      id: draft.id,
      question: draft.question,
      options: draft.options,
      votes: {},
      expiresAt: Date.now() + (draft.duration * 1000)
    };
    apiFetch(`/api/campaigns/${data.campaign.id}/poll`, {
      method: "POST", body: JSON.stringify({ action: "start", poll })
    }).catch(console.error);
    setShowPollModal(false);
  }

  function handleCreateAndLaunchPoll() {
    const validOptions = pollOptions.filter(o => o.trim() !== "");
    if (validOptions.length < 2 || !pollQuestion.trim()) return alert("Preencha a pergunta e pelo menos 2 opções.");

    const poll: ActivePoll = {
      id: Math.random().toString(36).substring(7),
      question: pollQuestion,
      options: validOptions,
      votes: {},
      expiresAt: Date.now() + (pollDuration * 1000)
    };

    apiFetch(`/api/campaigns/${data.campaign.id}/poll`, {
      method: "POST", body: JSON.stringify({ action: "start", poll })
    }).catch(console.error);

    setShowPollModal(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
  }

  function handleVote(optionIndex: number) {
    if (!activePoll) return;
    apiFetch(`/api/campaigns/${data.campaign.id}/poll`, {
      method: "POST", body: JSON.stringify({ action: "vote", pollId: activePoll.id, userId: data.me.id, optionIndex })
    }).catch(console.error);
  }

  async function spawnCreature(creature: Creature) {
    const instance: ActiveCreature = {
      ...creature, instanceId: Math.random().toString(36).substring(7), currentHp: creature.maxHp, currentMp: creature.maxMp, currentIp: 6, equipment: []
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

  const filteredLoot = EQUIPMENT.filter(item =>
    item.name.toLowerCase().includes(lootSearchQuery.toLowerCase()) ||
    item.detail.toLowerCase().includes(lootSearchQuery.toLowerCase())
  )

  const filteredBestiary = BESTIARY.filter(c =>
    c.name.toLowerCase().includes(bestiarySearchQuery.toLowerCase()) ||
    c.species.toLowerCase().includes(bestiarySearchQuery.toLowerCase())
  )

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
          {activeMap && (
            <BattlemapEngine
              mapData={activeMap}
              characters={characters}
              creatures={activeCreatures}
              isGm={isGm}
              onClose={() => setActiveMap(null)}
              onMoveToken={handleMoveToken}
              onPaintTerrain={handlePaintTerrain}
            />
          )}

          {/* Componente de Importação de Mapas */}
          <AnimatePresence>
            {showMapImporter && !activeMap && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
                <div className="relative w-full max-w-4xl">
                  <button onClick={() => setShowMapImporter(false)} className="absolute -top-10 right-0 text-muted-foreground hover:text-white"><X className="size-6" /></button>
                  <MapImporter onMapReady={handleCreateMap} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <WeatherOverlay weather={weather} />

          <AnimatePresence>
            {hoveredImage && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none bg-black/80 backdrop-blur-sm">
                <div className="relative w-[80vw] max-w-[500px] aspect-square rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/10">
                  <Image src={hoveredImage} alt="Zoom" fill className="object-contain" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showNursery && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-6xl h-full bg-zinc-950 border border-destructive/50 rounded-xl shadow-2xl flex flex-col overflow-hidden">

                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black text-destructive flex items-center gap-2"><UserPlus className="size-6" /> Berçário de NPCs</h4>
                      <p className="text-sm text-muted-foreground mt-1">Forje novas ameaças usando o sistema completo de classes e atributos.</p>
                    </div>
                    <button onClick={() => setShowNursery(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

                    <div className="lg:w-1/3 border-r border-border/40 p-6 flex flex-col gap-4 bg-black/20 overflow-y-auto custom-scrollbar-sepia">
                      <h5 className="text-xs font-bold uppercase tracking-widest text-destructive border-b border-white/10 pb-2 flex items-center gap-2"><Save className="size-3" /> Prontos para Invocação</h5>

                      <div className="flex flex-col gap-3">
                        {customNPCs.length === 0 && <p className="text-sm text-muted-foreground italic text-center mt-4">Nenhum NPC no berçário.</p>}
                        {customNPCs.map(npc => (
                          <div key={npc.id} className="flex flex-col gap-3 p-4 rounded-xl border border-border/40 bg-card/20 group">
                            <div className="flex items-center gap-3">
                              <div className="relative size-12 rounded border border-destructive/30 overflow-hidden shrink-0">
                                <Image src={npc.avatarUrl} alt={npc.name} fill className="object-cover" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-foreground truncate">{npc.name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">NPC • {npc.origin}</p>
                              </div>
                            </div>

                            <div className="flex gap-2 w-full mt-2">
                              <Button size="sm" className="flex-1 bg-destructive/10 border border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => spawnNPC(npc)}>
                                <Target className="size-3 mr-1.5" /> Invocar
                              </Button>
                              <Button size="sm" variant="outline" className="px-3 border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteCustomNPC(npc.id)}>
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="lg:w-2/3 p-6 overflow-y-auto custom-scrollbar-sepia flex justify-center">
                      <NPCCreator
                        onCreated={(newNpc) => {
                          saveCustomNPCsToStorage([newNpc, ...customNPCs]);
                          alert(`${newNpc.name} foi adicionado ao Berçário!`);
                        }}
                        onCancel={() => setShowNursery(false)}
                      />
                    </div>

                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MANAGER DE CUTSCENES (Mestre) */}
          <CutsceneManager
            isOpen={showCutsceneManager && isGm}
            onClose={() => setShowCutsceneManager(false)}
            cutscenes={cutscenes}
            onSave={saveCutscenes}
            onPlay={(id) => {
              const c = cutscenes.find(x => x.id === id);
              if (c) {
                syncCutscene("PLAY", c);
                setShowCutsceneManager(false);
              }
            }}
          />

          {/* OVERLAY GLOBAL DA CUTSCENE ATIVA (TODOS OS JOGADORES) */}
          <AnimatePresence>
            {activeCutscene && (
              <CutscenePlayer
                cutscene={activeCutscene}
                sceneIndex={activeSceneIndex}
                isGm={isGm}
                onSyncScene={(idx) => syncCutscene("SCENE", idx.toString())}
                onClose={() => syncCutscene("STOP")}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showPollModal && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-lg h-full max-h-[85vh] rounded-xl border border-primary/50 bg-zinc-950 shadow-2xl flex flex-col">

                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black text-primary flex items-center gap-2"><BarChart2 className="size-6" /> Gerenciar Enquetes</h4>
                      <p className="text-sm text-muted-foreground mt-1">Crie votações ou lance enquetes salvas para o grupo.</p>
                    </div>
                    <button onClick={() => setShowPollModal(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                  </div>

                  <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-8">

                    {draftPolls.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-primary border-b border-white/10 pb-2 flex items-center gap-2"><Save className="size-3" /> Enquetes Preparadas</h5>
                        <div className="flex flex-col gap-2">
                          {draftPolls.map(draft => (
                            <div key={draft.id} className="flex justify-between items-center p-3 rounded-lg border border-border/40 bg-card/20 group">
                              <div className="min-w-0 pr-4">
                                <p className="text-sm font-bold text-foreground truncate">{draft.question}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">{draft.options.length} opções • {draft.duration} Segundos</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button size="sm" variant="outline" className="border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground h-8" onClick={() => handleLaunchDraft(draft)}>
                                  <Send className="size-3 mr-1.5" /> Lançar
                                </Button>
                                <button onClick={() => handleDeleteDraft(draft.id)} className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-5">
                      <h5 className="text-xs font-bold uppercase tracking-widest text-primary border-b border-white/10 pb-2 flex items-center gap-2"><Plus className="size-3" /> Nova Enquete</h5>

                      <label className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pergunta</span>
                        <input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Ex: Qual caminho devemos seguir?" className="bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                      </label>

                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Opções</span>
                        {pollOptions.map((opt, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input type="text" value={opt} onChange={e => { const newOpts = [...pollOptions]; newOpts[idx] = e.target.value; setPollOptions(newOpts); }} placeholder={`Opção ${idx + 1}`} className="flex-1 bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                            {pollOptions.length > 2 && <Button variant="outline" className="border-destructive/50 text-destructive shrink-0 px-3" onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}><Trash2 className="size-4" /></Button>}
                          </div>
                        ))}
                        <Button variant="outline" className="w-fit border-dashed border-white/20 mt-1 h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => setPollOptions([...pollOptions, ""])}>
                          <Plus className="size-3 mr-1.5" /> Adicionar Opção
                        </Button>
                      </div>

                      <label className="flex flex-col gap-2 border-t border-border/40 pt-5 mt-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Duração (Cronômetro)</span>
                        <select value={pollDuration} onChange={e => setPollDuration(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                          <option value={30}>30 Segundos</option>
                          <option value={60}>1 Minuto</option>
                          <option value={120}>2 Minutos</option>
                          <option value={300}>5 Minutos</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="p-6 border-t border-border/50 bg-black/40 flex justify-between gap-3 shrink-0">
                    <Button variant="ghost" onClick={() => setShowPollModal(false)}>Fechar</Button>
                    <div className="flex gap-2">
                      <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10" onClick={handleSaveDraft}>Salvar Preparada</Button>
                      <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" onClick={handleCreateAndLaunchPoll}><Send className="size-4" /> Lançar Enquete</Button>
                    </div>
                  </div>

                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showGmPanel && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-3xl h-full max-h-[85vh] rounded-xl border border-accent/50 bg-zinc-950 shadow-2xl flex flex-col">
                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black text-accent flex items-center gap-2"><Gift className="size-6" /> Baú do Mestre</h4>
                      <p className="text-sm text-muted-foreground mt-1">Conceda itens e crie relíquias para jogadores.</p>
                    </div>
                    <button onClick={() => setShowGmPanel(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                  </div>

                  <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-6">
                    {/* TABS DO BAÚ */}
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/10 w-full mx-auto">
                      <button onClick={() => setGmPanelTab('catalog')} className={`flex-1 text-sm py-2 rounded-md transition-colors ${gmPanelTab === 'catalog' ? 'bg-accent text-accent-foreground font-bold' : 'text-muted-foreground hover:text-white'}`}>Itens de Sistema</button>
                      <button onClick={() => setGmPanelTab('custom')} className={`flex-1 text-sm py-2 rounded-md transition-colors ${gmPanelTab === 'custom' ? 'bg-accent text-accent-foreground font-bold' : 'text-muted-foreground hover:text-white'}`}>Criar Relíquias (Handouts)</button>
                    </div>

                    {gmPanelTab === 'catalog' ? (
                      <div>
                        <div className="flex items-center justify-between mb-3 gap-4">
                          <h5 className="text-xs font-bold uppercase tracking-widest text-primary shrink-0">1. Escolha o Item (Catálogo)</h5>
                          <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <input type="text" placeholder="Buscar item..." value={lootSearchQuery} onChange={(e) => setLootSearchQuery(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 transition-colors" />
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar-sepia border border-border/30 rounded-lg p-2 bg-black/20">
                          {filteredLoot.map((item) => (
                            <button key={item.id} onClick={() => setSelectedLoot(item.id)} className={`flex flex-col text-left p-3 rounded-lg border transition-colors ${selectedLoot === item.id ? 'border-accent bg-accent/20' : 'border-border/60 bg-card/40 hover:border-accent/40'}`}>
                              <div className="flex justify-between items-start w-full gap-2">
                                <p className="font-bold text-sm text-foreground">{item.name}{(item as any).purchasable === false && <span className="block w-fit mt-1 text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.5 rounded uppercase tracking-wider">Loot Exclusivo</span>}</p>
                                <span className="text-[10px] font-mono text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded bg-background/50 shrink-0">Valor: {item.cost}z</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-2 leading-snug"><ItemModifiers text={item.detail} /></div>
                            </button>
                          ))}
                          {filteredLoot.length === 0 && <p className="text-xs text-muted-foreground text-center mt-4 col-span-2">Nenhum item encontrado.</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 border border-border/30 rounded-lg p-4 bg-black/20">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-primary shrink-0 mb-1">1. Forjar Novo Item Útil</h5>

                        <input type="text" value={customItemName} onChange={e => setCustomItemName(e.target.value)} placeholder="Nome do Item (Ex: Carta do Rei)" className="w-full bg-black/40 border border-white/10 rounded-md py-2 px-3 text-sm text-foreground focus:outline-none focus:border-accent/50" />

                        <select value={customItemType} onChange={e => setCustomItemType(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-md py-2 px-3 text-sm text-foreground focus:outline-none focus:border-accent/50">
                          <option value="text">Pergaminho / Carta (Texto Escrito)</option>
                          <option value="image">Magia de Fótons (Imagem via URL)</option>
                          <option value="video">Orbe da Lembrança (Vídeo do YouTube via URL)</option>
                          <option value="app-blueprints">Interface: Almanaque Magitech (Inventor)</option>
                        </select>

                        {customItemType === 'text' ? (
                          <textarea value={customItemContent} onChange={e => setCustomItemContent(e.target.value)} placeholder="Escreva o conteúdo da carta aqui..." rows={5} className="w-full bg-black/40 border border-white/10 rounded-md py-2 px-3 text-sm text-foreground focus:outline-none focus:border-accent/50 custom-scrollbar-sepia" />
                        ) : customItemType === 'app-blueprints' ? (
                          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md text-xs text-blue-200">Este item instalará um mini-aplicativo interativo na mochila do jogador. O conteúdo não é necessário.</div>
                        ) : (
                          <input type="text" value={customItemContent} onChange={e => setCustomItemContent(e.target.value)} placeholder={`Cole a URL ${customItemType === 'video' ? 'do Youtube' : 'da Imagem'} aqui...`} className="w-full bg-black/40 border border-white/10 rounded-md py-2 px-3 text-sm text-foreground focus:outline-none focus:border-accent/50" />
                        )}
                      </div>
                    )}

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
                        {gmPanelTab === 'catalog' && activeCreatures.map((c) => (
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
                    <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" disabled={(!selectedLoot && gmPanelTab === 'catalog') || !selectedTargetCharId || sendingLoot} onClick={handleGiveLoot}>
                      {sendingLoot ? <span className="animate-pulse">Enviando...</span> : <><Send className="size-4" /> {gmPanelTab === 'custom' ? "Enviar Relíquia" : "Enviar para Inventário"}</>}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showDroppedLoots && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-3xl h-full max-h-[85vh] rounded-xl border border-accent/50 bg-zinc-950 shadow-2xl flex flex-col">
                  {/* Header */}
                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black text-accent flex items-center gap-2"><Inbox className="size-6" /> Loots Caídos (NPCs)</h4>
                      <p className="text-sm text-muted-foreground mt-1">Gerencie e distribua os itens que caíram de inimigos derrotados.</p>
                    </div>
                    <button onClick={() => setShowDroppedLoots(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                  </div>

                  {/* Content */}
                  <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-6">
                    {npcLoots.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center text-muted-foreground italic border border-dashed border-border/40 rounded-xl bg-card/10">Nenhum loot caiu ainda.</div>
                    ) : (
                      <>
                        <div>
                          <h5 className="text-xs font-bold uppercase tracking-widest text-primary shrink-0 mb-3">1. Escolha o Loot Extraído</h5>
                          <div className="grid gap-3 sm:grid-cols-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar-sepia border border-border/30 rounded-lg p-2 bg-black/20">
                            {npcLoots.map((loot) => {
                              const item = getEquipment(loot.itemId)
                              if (!item) return null;
                              return (
                                <div key={loot.uid} className={`flex flex-col text-left p-3 rounded-lg border transition-colors ${selectedDroppedLoot?.uid === loot.uid ? 'border-accent bg-accent/20' : 'border-border/60 bg-card/40 hover:border-accent/40'}`}>
                                  <button className="text-left w-full" onClick={() => setSelectedDroppedLoot(loot)}>
                                    <div className="flex justify-between items-start w-full gap-2">
                                      <p className="font-bold text-sm text-foreground">{item.name}</p>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">Caiu de: {loot.sourceName}</p>
                                    <div className="text-xs text-muted-foreground mt-2 leading-snug"><ItemModifiers text={item.detail} /></div>
                                  </button>

                                  <div className="mt-3 flex justify-end">
                                    <Button size="sm" variant="outline" className="h-7 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={(e) => {
                                      e.stopPropagation();
                                      saveNpcLoots(npcLoots.filter(l => l.uid !== loot.uid));
                                      if (selectedDroppedLoot?.uid === loot.uid) setSelectedDroppedLoot(null);
                                    }}>
                                      <Trash2 className="size-3 mr-1.5" /> Descartar
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {selectedDroppedLoot && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h5 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">2. Entregar para (Inventário)</h5>
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
                            </div>
                          </motion.div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-6 border-t border-border/50 bg-black/40 flex justify-end gap-3 shrink-0">
                    <Button variant="ghost" onClick={() => setShowDroppedLoots(false)}>Fechar</Button>
                    <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" disabled={!selectedDroppedLoot || !selectedTargetCharId || sendingLoot} onClick={handleGiveDroppedLoot}>
                      {sendingLoot ? <span className="animate-pulse">Enviando...</span> : <><Send className="size-4" /> Distribuir Loot</>}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showBestiary && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-6xl h-full bg-zinc-950 border border-destructive/50 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                    <h4 className="font-serif text-2xl md:text-3xl font-black text-destructive flex items-center gap-3"><Skull className="size-6 md:size-8" /> Bestiário do Mestre</h4>
                    <button onClick={() => setShowBestiary(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 md:size-6 text-muted-foreground hover:text-white" /></button>
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    <div className="lg:w-1/3 border-r border-border/40 p-4 flex flex-col gap-4 bg-black/20">
                      <div className="relative shrink-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <input type="text" placeholder="Pesquisar criatura..." value={bestiarySearchQuery} onChange={(e) => setBestiarySearchQuery(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive/50 transition-colors" />
                      </div>
                      <div className="overflow-y-auto custom-scrollbar-sepia flex flex-col gap-2 flex-1 pr-1">
                        {filteredBestiary.map((c) => (
                          <button key={c.id} onMouseEnter={() => setHoveredCreature(c)} className={`text-left p-3 rounded-lg border transition-colors ${hoveredCreature?.id === c.id ? "bg-destructive/10 border-destructive/50" : "bg-card/40 border-border/30 hover:border-destructive/30"}`}>
                            <p className="font-bold text-foreground text-sm">{c.name}</p>
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Lv. {c.level} · {c.species}</p>
                          </button>
                        ))}
                        {filteredBestiary.length === 0 && <p className="text-xs text-muted-foreground text-center mt-4">Nenhuma criatura encontrada.</p>}
                      </div>
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
                                <span className="flex items-center gap-1.5 text-sm text-[color:var(--hp)]"><Heart className="size-4" /> {hoveredCreature.maxHp} HP</span>
                                <span className="flex items-center gap-1.5 text-sm text-[color:var(--mp)]"><Zap className="size-4" /> {hoveredCreature.maxMp} MP</span>
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

          <AnimatePresence>
            {selectedCombatCreatureId && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
                <div className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10">
                  <button onClick={() => setSelectedCombatCreatureId(null)} className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"><X className="size-6 text-white" /></button>
                  {activeCreatures.filter(c => c.instanceId === selectedCombatCreatureId).map(c => (
                    <CreatureSheet key={c.instanceId} creature={c} isGm={isGm} onUpdate={updateCreatureVital} onRoll={(attr: string, res: number) => handleBroadcastRoll(c.name, attr, res)} onKill={() => handleKillCreature(c)} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FICHAS ABERTAS EM COMBATE/POR CLICK */}
          <AnimatePresence>
            {selectedCombatCharId && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
                <div className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10">
                  <button onClick={() => setSelectedCombatCharId(null)} className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"><X className="size-6 text-white" /></button>
                  {characters.filter(c => c.id === selectedCombatCharId).map(c => (
                    <CharacterSheet
                      key={c.id}
                      character={c}
                      editable={isGm || c.ownerId === data.me.id}
                      isGm={isGm}
                      campaignMembers={data.members}
                      onOptimistic={applyOptimistic}
                      onRoll={(attr: string, res: number | string) => handleBroadcastRoll(c.name, attr, res)}
                      onKill={isGm ? handleKillNPC : undefined}
                      shouldOpenInventory={inventoryToOpen === c.id}
                      onClearInventoryRequest={() => setInventoryToOpen(null)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SOUNDPAD MODAL / ENGINE */}
          <AnimatePresence>
            {showSoundpad && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-8 overflow-hidden">
                <motion.div variants={modalVariants} className="relative w-full max-w-6xl h-[85vh] min-h-[600px] flex flex-col bg-transparent">
                  {/* Botão de Fechar por Fora */}
                  <button onClick={() => setShowSoundpad(false)} className="absolute -top-4 -right-4 md:-right-8 md:-top-8 text-zinc-500 hover:text-white bg-black/50 hover:bg-black rounded-full p-2 transition-colors z-[300] border border-white/10">
                    <X className="size-6" />
                  </button>

                  {/* Instancia do Engine Local de Audio Ocupando Todo o Espaço */}
                  <div className="flex-1 w-full h-full rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                    <Soundpad
                      isGm={isGm}
                      campaignId={data.campaign.id}
                      activeSounds={activeSounds}
                      onPlaySound={handlePlaySound}
                      onStopSound={handleStopSound}
                      onStopAll={handleStopAllSounds}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* NOTA IMPORTANTE: Para os jogadores escutarem mesmo com o Modal Fechado, 
              injetamos a engine "invisível" caso não seja GM e o modal não estiver aberto */}
          {!showSoundpad && (
            <div className="hidden">
              <Soundpad isGm={false} campaignId={data.campaign.id} activeSounds={activeSounds} />
            </div>
          )}

        </>,
        document.body
      )}

      {/* TOAST DE NOTIFICAÇÃO DE ITEM RECEBIDO */}
      {mounted && createPortal(
        <AnimatePresence>
          {itemNotification && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9, x: "-50%" }}
              animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
              exit={{ opacity: 0, y: 20, scale: 0.9, x: "-50%" }}
              className="fixed bottom-10 left-1/2 z-[400] flex items-center gap-4 bg-green-600/95 border-2 border-green-400 text-white px-6 py-4 rounded-2xl shadow-[0_0_40px_rgba(34,197,94,0.6)] backdrop-blur-md cursor-pointer"
              onClick={() => {
                // Ao clicar no Toast, abrimos a ficha principal e marcamos para abrir a mochila
                if (inventoryToOpen) {
                  setSelectedCombatCharId(inventoryToOpen);
                  setItemNotification(null);
                }
              }}
            >
              <Gift className="size-8 animate-bounce text-green-100" />
              <div className="flex flex-col pr-6">
                <span className="font-black text-base uppercase tracking-widest text-green-100">Item Recebido!</span>
                <span className="text-sm font-medium">O mestre enviou: <strong>{itemNotification}</strong></span>
                <span className="text-[10px] opacity-80 mt-0.5">Clique aqui para abrir sua mochila.</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setItemNotification(null); }}
                className="absolute top-2 right-2 hover:bg-white/20 p-1 rounded-full transition-colors"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* HEADER DA SALA */}
      <header className="mb-6 shrink-0 flex flex-wrap items-center justify-between gap-4 relative z-50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/campaigns")} aria-label="Voltar" className="text-muted-foreground"><ArrowLeft className="size-5" /></Button>
          <div>
            <h1 className="font-serif text-xl md:text-2xl font-black text-foreground">{data.campaign.name}</h1>
            <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
              <span className="font-mono">#{data.campaign.code}</span>
              <span className={`inline-flex items-center gap-1 ${live ? "text-primary" : "text-muted-foreground"}`}><Radio className={`size-3.5 ${live ? "animate-pulse" : ""}`} />{live ? "Ao vivo" : "Conectando..."}</span>

              {/* WIDGET DO CLIMA ATUAL */}
              <span className="inline-flex items-center gap-1.5 ml-2 border-l border-border/50 pl-3 transition-colors">
                {weather === "clear" && <><Sun className="size-4 text-yellow-500 animate-[spin_15s_linear_infinite]" /> Limpo</>}
                {weather === "sunny" && <><SunMedium className="size-4 text-orange-400 animate-pulse" /> Ensolarado</>}
                {weather === "cloudy" && <><Cloud className="size-4 text-gray-400" /> Nublado</>}
                {weather === "fog" && <><CloudFog className="size-4 text-zinc-400" /> Neblina</>}
                {weather === "rain" && <><CloudRain className="size-4 text-blue-400" /> Chovendo</>}
                {weather === "blizzard" && <><CloudSnow className="size-4 text-white animate-pulse" /> Nevasca</>}
              </span>
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs md:text-sm font-medium ${isGm ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
          {isGm ? <Crown className="size-4" /> : <Shield className="size-4" />} {isGm ? "Mestre de Jogo" : "Jogador"}
        </span>
      </header>

      {/* ÁREA PRINCIPAL DA SALA */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        <div className="grid gap-6 xl:grid-cols-[1fr_320px] h-full min-h-0">

          <div className="flex flex-col min-h-0 h-full overflow-hidden">
            {isCombatActive ? (
              <div className="flex flex-col h-full gap-4">
                <div className="flex-[3] bg-black/40 border border-destructive/30 rounded-xl p-6 overflow-y-auto custom-scrollbar-sepia relative shadow-[0_0_40px_rgba(255,0,0,0.05)] backdrop-blur-sm">
                  <h2 className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-destructive flex items-center gap-2"><Skull className="size-3" /> Inimigos em Combate</h2>
                  <div className="flex flex-wrap gap-4 mt-6">
                    {activeCreatures.map(creature => (
                      <div key={creature.instanceId} className="w-[300px] border border-destructive/40 bg-zinc-950/80 rounded-xl p-4 relative shadow-lg group hover:border-destructive transition-colors backdrop-blur-md">
                        <button onClick={() => setSelectedCombatCreatureId(creature.instanceId)} className="absolute inset-0 z-0 rounded-xl"></button>
                        {isGm && <button onClick={(e) => { e.stopPropagation(); removeCreature(creature.instanceId); }} className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-destructive transition-colors z-10"><X className="size-4" /></button>}

                        <div className="flex gap-3 mb-4 relative z-10 pointer-events-none">
                          <div className="relative size-12 rounded border border-destructive/30 overflow-hidden shrink-0 pointer-events-auto cursor-zoom-in" onMouseEnter={() => setHoveredImage(creature.imageUrl)} onMouseLeave={() => setHoveredImage(null)}>
                            <Image src={creature.imageUrl} alt={creature.name} fill className="object-cover" />
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

                        {isGm && creature.currentHp <= 0 && (
                          <div className="mt-4 relative z-20 pointer-events-auto">
                            <Button size="sm" className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.5)]" onClick={(e) => { e.stopPropagation(); handleKillCreature(creature); }}>
                              <Skull className="size-3" /> Finalizar (+{Math.max(1, Math.floor(creature.level / 5))} XP)
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-[2] bg-card/20 border border-primary/20 rounded-xl p-6 overflow-y-auto custom-scrollbar-sepia relative backdrop-blur-sm">
                  <h2 className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2"><Users className="size-3" /> Grupo</h2>
                  <div className="flex flex-wrap gap-4 mt-6">
                    {characters.map(char => (
                      <button key={char.id} onClick={() => setSelectedCombatCharId(char.id)} className="flex items-center gap-3 bg-zinc-950 border border-border/50 rounded-lg p-3 w-[240px] hover:border-primary/50 transition-colors text-left group">
                        <div className="relative size-10 rounded border border-primary/30 overflow-hidden shrink-0 group-hover:shadow-[0_0_10px_rgba(var(--primary),0.3)] transition-shadow pointer-events-auto cursor-zoom-in" onMouseEnter={() => setHoveredImage(char.avatarUrl || "/mystic-adventurer-portrait.png")} onMouseLeave={() => setHoveredImage(null)}>
                          <Image src={char.avatarUrl || "/mystic-adventurer-portrait.png"} alt="Retrato" fill className="object-cover" />
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
              <div className="overflow-y-auto custom-scrollbar-sepia h-full pr-2">
                <section className="mb-8">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{isGm ? "Personagens do Mestre" : "Meus herois"}</h2>

                    <div className="flex gap-2">
                      {isGm && (
                        <Button size="sm" variant="outline" onClick={() => setShowNursery(true)} className="h-8 gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 backdrop-blur-sm">
                          <UserPlus className="size-4" /> Berçário
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5 backdrop-blur-sm"><Plus className="size-4" /> Novo heroi</Button>
                    </div>

                  </div>
                  {myCharacters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground backdrop-blur-sm bg-black/20">Voce ainda nao forjou um heroi.</div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {myCharacters.map((c) => (
                        <CharacterSheet
                          key={c.id}
                          character={c}
                          editable={true}
                          isGm={isGm}
                          campaignMembers={data.members}
                          onOptimistic={applyOptimistic}
                          onRoll={(attr: string, res: number | string) => handleBroadcastRoll(c.name, attr, res)}
                          onKill={isGm ? handleKillNPC : undefined}
                          shouldOpenInventory={inventoryToOpen === c.id}
                          onClearInventoryRequest={() => setInventoryToOpen(null)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {otherCharacters.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{isGm ? "Herois dos jogadores" : "Companheiros de jornada"}</h2>
                    <div className="flex flex-col gap-6">
                      {otherCharacters.map((c) => (
                        <CharacterSheet
                          key={c.id}
                          character={c}
                          editable={isGm}
                          isGm={isGm}
                          campaignMembers={data.members}
                          onOptimistic={applyOptimistic}
                          onRoll={(attr: string, res: number | string) => handleBroadcastRoll(c.name, attr, res)}
                          onKill={isGm ? handleKillNPC : undefined}
                          shouldOpenInventory={inventoryToOpen === c.id}
                          onClearInventoryRequest={() => setInventoryToOpen(null)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: PAINEL DO MESTRE & HISTÓRICO */}
          <aside className="flex flex-col gap-4 min-h-0 h-full overflow-y-auto custom-scrollbar-sepia pr-1 pb-4">

            {isGm && (
              <div className="panel rounded-xl border border-accent/40 p-4 bg-accent/5 shrink-0 backdrop-blur-sm">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent"><Crown className="size-4" /> Ferramentas do Mestre</h2>

                <div className="flex flex-col gap-2">
                  <Button variant="outline" className="w-full justify-start gap-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowCutsceneManager(true)}>
                    <Clapperboard className="size-4" /> Cenas e Cutscenes
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowSoundpad(true)}>
                    <Mic className="size-4" /> Efeitos Sonoros (Soundpad)
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowPollModal(true)}>
                    <BarChart2 className="size-4" /> Criar Enquete
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2 border-accent/50 text-accent hover:bg-accent hover:text-accent-foreground" onClick={() => setShowGmPanel(true)}>
                    <Gift className="size-4" /> Distribuir Loot / Relíquias
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2 border-accent/50 text-accent hover:bg-accent hover:text-accent-foreground relative" onClick={() => setShowDroppedLoots(true)}>
                    <Inbox className="size-4" /> Loots de NPC
                    {npcLoots.length > 0 && <span className="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">{npcLoots.length}</span>}
                  </Button>
                </div>

                {/* Grid de Batalha (VTT) */}
                <div className="mt-4 pt-4 border-t border-accent/20">
                  <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Grid de Batalha (VTT)</p>
                  <div className="flex flex-col gap-2">
                    {savedMaps.map(m => (
                      <Button key={m.id} size="sm" variant="outline" className="w-full justify-start text-xs border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300" onClick={() => setActiveMap(m)}>
                        <Grid3X3 className="size-3 mr-2" /> Abrir: {m.name}
                      </Button>
                    ))}
                    <Button size="sm" variant="outline" className="w-full justify-start text-xs border-white/20 text-muted-foreground hover:text-white hover:bg-white/10" onClick={() => setShowMapImporter(true)}>
                      <Plus className="size-3 mr-2" /> Importar Novo Mapa
                    </Button>
                  </div>
                </div>

                {/* Clima Dinâmico */}
                <div className="mt-4 pt-4 border-t border-accent/20">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Clima Dinâmico</p>
                    <button onClick={() => handleSetWeather(weather)} className="text-[10px] text-primary hover:text-primary/80 uppercase font-bold flex items-center gap-1" title="Forçar clima para quem acabou de entrar"><RefreshCw className="size-3" /> Sincronizar</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button size="sm" onClick={() => handleSetWeather("clear")} className={`h-8 w-full p-0 flex items-center justify-center ${weather === 'clear' ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-transparent text-muted-foreground border border-border hover:bg-white/5 hover:text-white'}`} title="Céu Limpo"><Sun className="size-3.5" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("sunny")} className={`h-8 w-full p-0 flex items-center justify-center ${weather === 'sunny' ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_0_10px_rgba(249,115,22,0.5)]' : 'bg-transparent text-muted-foreground border border-border hover:bg-white/5 hover:text-white'}`} title="Ensolarado"><SunMedium className="size-3.5" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("cloudy")} className={`h-8 w-full p-0 flex items-center justify-center ${weather === 'cloudy' ? 'bg-blue-300 hover:bg-blue-400 text-black shadow-[0_0_10px_rgba(147,197,253,0.5)]' : 'bg-transparent text-muted-foreground border border-border hover:bg-white/5 hover:text-white'}`} title="Nublado"><Cloud className="size-3.5" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("fog")} className={`h-8 w-full p-0 flex items-center justify-center ${weather === 'fog' ? 'bg-zinc-400 hover:bg-zinc-500 text-black shadow-[0_0_10px_rgba(161,161,170,0.5)]' : 'bg-transparent text-muted-foreground border border-border hover:bg-white/5 hover:text-white'}`} title="Neblina"><CloudFog className="size-3.5" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("rain")} className={`h-8 w-full p-0 flex items-center justify-center ${weather === 'rain' ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-transparent text-muted-foreground border border-border hover:bg-white/5 hover:text-white'}`} title="Chuvoso"><CloudRain className="size-3.5" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("blizzard")} className={`h-8 w-full p-0 flex items-center justify-center ${weather === 'blizzard' ? 'bg-white hover:bg-gray-200 text-black shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'bg-transparent text-muted-foreground border border-border hover:bg-white/5 hover:text-white'}`} title="Nevasca"><CloudSnow className="size-3.5" /></Button>
                  </div>
                </div>

                {/* Bestiário */}
                <div className="mt-4 pt-4 border-t border-accent/20">
                  <Button variant="outline" className="w-full justify-start gap-2 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setShowBestiary(true)}>
                    <Skull className="size-4" /> Bestiário
                  </Button>
                </div>

              </div>
            )}

            {/* WIDGET DA ENQUETE ATIVA FICA AQUI TAMBÉM */}
            <AnimatePresence>
              {activePoll && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="panel flex flex-col rounded-xl border border-primary/50 overflow-hidden bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.2)] shrink-0 backdrop-blur-sm">
                  <div className="p-4 border-b border-primary/20 bg-black/40">
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary"><BarChart2 className="size-4" /> Enquete em Andamento</h2>
                      <span className="flex items-center gap-1.5 text-[10px] font-mono bg-background border border-border px-2 py-0.5 rounded text-muted-foreground"><Clock className="size-3" /> {Math.max(0, Math.ceil((activePoll.expiresAt - now) / 1000))}s</span>
                    </div>
                    <p className="font-serif text-lg font-bold text-foreground leading-tight">{activePoll.question}</p>
                  </div>
                  <div className="p-4 space-y-2">
                    {activePoll.options.map((opt, idx) => {
                      const totalVotes = Object.values(activePoll.votes).length;
                      const myVotes = Object.values(activePoll.votes).filter(v => v === idx).length;
                      const percentage = totalVotes > 0 ? (myVotes / totalVotes) * 100 : 0;
                      const userVotedForThis = activePoll.votes[data.me.id] === idx;

                      return (
                        <button key={idx} onClick={() => handleVote(idx)} className="relative w-full text-left overflow-hidden rounded border border-border/50 bg-black/30 hover:border-primary/50 transition-colors group">
                          <div className="absolute top-0 left-0 bottom-0 bg-primary/20 transition-all duration-500" style={{ width: `${percentage}%` }}></div>
                          <div className="relative z-10 flex justify-between items-center p-2.5">
                            <span className={`text-sm font-medium flex items-center gap-2 ${userVotedForThis ? "text-primary font-bold" : "text-foreground"}`}>
                              {userVotedForThis && <CheckCircle2 className="size-4" />} {opt}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">{myVotes}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="panel flex flex-col flex-1 rounded-xl border border-border/60 overflow-hidden bg-card/10 shadow-lg min-h-[300px] backdrop-blur-sm">
              <div className="p-4 border-b border-border/60 bg-black/40 shrink-0">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><Dices className="size-4" /> Histórico</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar-sepia">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center italic mt-4">Nenhum evento registrado ainda.</p>
                ) : (
                  history.map((record) => (
                    <div key={record.id} className={`p-3 rounded-lg border shadow-sm flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 ${record.type === 'poll' ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-background/60'}`}>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-bold text-foreground">{record.title} <span className="text-[10px] text-muted-foreground font-normal ml-1">({record.subtitle})</span></span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">{record.time}</span>
                      </div>
                      <div className="flex justify-between items-center bg-black/30 px-3 py-2 rounded border border-white/5">
                        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{record.detail}</span>
                        <span className={`text-xl font-black font-mono ${record.type === 'poll' ? 'text-foreground' : 'text-primary'}`}>{record.result}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel mt-auto rounded-xl border border-destructive/30 bg-destructive/5 p-4 shrink-0 backdrop-blur-sm">
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