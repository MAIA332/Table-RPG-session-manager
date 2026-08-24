"use client"

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"

import { apiFetch } from "@/lib/client"
import { ResourceBar } from "@/components/resource-bar"
import { Button } from "@/components/ui/button"
import { CharacterPortrait } from "@/components/character-portrait"
import { PortraitEditor } from "@/components/portrait-editor"
import { PORTRAIT_FRAMES, type PortraitCrop, type PortraitFrameId } from "@/lib/portrait-frames"

import {
  ATTRIBUTE_META,
  getEquipment,
  INVENTORY_ACTIONS,
  CLASSES,
  EQUIPMENT,
  ATTRIBUTE_PROFILES,
  STARTING_ZENIT
} from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import { formatSkillDescription, EssenceStep, ClassesStep, EquipmentStep } from "@/components/creator-steps"
import { AttributesStep } from "@/components/attributes-step"
import type { AttributeKey, Character, CharacterResources, Role, DieSize, ClassLevel } from "@/lib/types"

import {
  Heart, Zap, Backpack, Sparkles, Minus, Plus, Dices, Package, TrendingUp,
  X, Store, Coins, Info, Loader2, BookOpenText, UserPlus, Shield, Skull,
  ScrollText, ImageIcon, Film, Lock, Trash2, Search, Activity, Save,
  ArrowLeft, ArrowRight, Check, Swords, ChevronDown,
  Sword, Gem, Eye, SearchX, ShoppingCart, PackageOpen, BookOpen, PenTool,
  AlertTriangle, Archive, Flame, Droplets, ShieldOff, Brain, Ghost, SwatchBook,
  WandSparkles,
  TrendingDown,
  Pencil
} from "lucide-react"

// ==========================================
// TIPAGENS EXPORTADAS PARA A ROOM
// ==========================================

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

export interface Member {
  userId: string;
  role: Role;
  name: string;
}

export interface NPCDraft {
  id: string;
  name: string;
  avatarUrl: string;
  origin: string;
  identity: string;
  theme: string;
  classes: ClassLevel[];
  skills: Record<string, number>;
  attributes: Record<AttributeKey, DieSize>;
  equipment: string[];
}

const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const NPC_STEPS = ["Essência", "Classes", "Atributos", "Equipamento"] as const

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
export const PRESET_CHECKS = [
  // --- PERCEPÇÃO E INVESTIGAÇÃO ---
  { id: "c1", name: "Percepção", attrs: ["ins", "dex"], desc: "Notar detalhes, movimentos sutis, armadilhas, emboscadas ou objetos escondidos." },
  { id: "c2", name: "Investigação", attrs: ["ins", "wlp"], desc: "Reconstruir acontecimentos em uma cena, interpretar pistas e ligar informações." },
  { id: "c3", name: "Empatia", attrs: ["ins", "wlp"], desc: "Ler emoções, identificar blefes, nervosismo e compreender as reais intenções de alguém." },
  { id: "c4", name: "Avaliação", attrs: ["ins", "ins"], desc: "Estimar o valor financeiro de mercadorias, reconhecer antiguidades e identificar falsificações." },
  { id: "c5", name: "Interrogatório", attrs: ["wlp", "ins"], desc: "Extrair informações de prisioneiros ou suspeitos através de pressão psicológica ou blefe tático." },

  // --- SOBREVIVÊNCIA E EXPLORAÇÃO ---
  { id: "c6", name: "Sobrevivência Selvagem", attrs: ["ins", "mig"], desc: "Encontrar alimento, preparar abrigos rudimentares e prever tempestades ou perigos naturais." },
  { id: "c7", name: "Rastreamento", attrs: ["ins", "dex"], desc: "Identificar e seguir pegadas, rastros de sangue e sinais de passagem de animais ou pessoas." },
  { id: "c8", name: "Orientação", attrs: ["ins", "ins"], desc: "Ler mapas terrestres ou astrais, guiar o grupo e evitar que se percam durante viagens." },
  { id: "c9", name: "Sobrevivência Urbana", attrs: ["ins", "wlp"], desc: "Encontrar rotas seguras em becos, localizar o mercado negro e entender as regras não ditas das ruas." },
  { id: "c10", name: "Vigília", attrs: ["ins", "mig"], desc: "Manter-se alerta durante o turno de guarda, lutando contra o sono para proteger o grupo." },

  // --- INTELECTO E CIÊNCIA MUNDANA ---
  { id: "c11", name: "Medicina", attrs: ["ins", "dex"], desc: "Realizar cirurgias de emergência, suturar feridas, estabilizar aliados e aplicar primeiros socorros." },
  { id: "c12", name: "Botânica e Venenos", attrs: ["ins", "ins"], desc: "Identificar plantas seguras, extrair toxinas, fabricar antídotos naturais e unguentos." },
  { id: "c13", name: "História e Cultura", attrs: ["ins", "ins"], desc: "Lembrar fatos antigos, reconhecer brasões de nobreza, leis locais e costumes regionais." },
  { id: "c14", name: "Engenharia e Mecânica", attrs: ["ins", "dex"], desc: "Desarmar armadilhas complexas, compreender maquinários, relógios e construir engenhocas." },
  { id: "c15", name: "Criptografia", attrs: ["ins", "wlp"], desc: "Decodificar mensagens secretas, traduzir dialetos mortos e resolver enigmas lógicos." },
  { id: "c16", name: "Estratégia", attrs: ["wlp", "ins"], desc: "Planejar táticas de batalha, prever a movimentação inimiga e vencer jogos de tabuleiro." },

  // --- FURTIVIDADE E CRIME ---
  { id: "c17", name: "Furtividade", attrs: ["dex", "ins"], desc: "Esconder-se nas sombras, mover-se sem fazer ruído e infiltrar-se em áreas vigiadas." },
  { id: "c18", name: "Prestidigitação", attrs: ["dex", "ins"], desc: "Bater carteiras, esconder itens pequenos nas mangas ou realizar truques de mãos rápidos." },
  { id: "c19", name: "Arrombamento", attrs: ["dex", "ins"], desc: "Usar gazuas para abrir fechaduras de portas, baús ou destrancar algemas silenciosamente." },
  { id: "c20", name: "Enganação", attrs: ["wlp", "dex"], desc: "Mentir de forma convincente, usar disfarces, forjar sotaques e improvisar histórias." },
  { id: "c21", name: "Falsificação", attrs: ["dex", "ins"], desc: "Criar cópias exatas de documentos, assinaturas, selos oficiais e passaportes." },

  // --- MOBILIDADE E REFLEXOS ---
  { id: "c22", name: "Acrobacia", attrs: ["dex", "mig"], desc: "Saltar entre telhados, amortecer quedas, equilibrar-se em cordas e rolar durante o combate." },
  { id: "c23", name: "Reflexos", attrs: ["dex", "ins"], desc: "Reagir a ataques surpresa, segurar objetos caindo ou acionar alavancas sob pressão extrema." },
  { id: "c24", name: "Precisão", attrs: ["dex", "ins"], desc: "Fazer arremessos difíceis, atirar facas em alvos pequenos ou acertar pontos fracos." },
  { id: "c25", name: "Condução", attrs: ["dex", "ins"], desc: "Manobrar carroças em alta velocidade, pilotar barcos ou montar a cavalo em terrenos difíceis." },
  { id: "c26", name: "Contorcionismo", attrs: ["dex", "dex"], desc: "Escapar de amarras de corda, espremer-se em tubulações e passar por grades estreitas." },

  // --- FÍSICO E COMBATE CORPORAL ---
  { id: "c27", name: "Atletismo", attrs: ["mig", "dex"], desc: "Escalar paredões, nadar contra a correnteza, correr em disparada e empurrar pedras pesadas." },
  { id: "c28", name: "Força Bruta", attrs: ["mig", "mig"], desc: "Quebrar portas de madeira, erguer pesos descomunais, dobrar barras de ferro e intimidar fisicamente." },
  { id: "c29", name: "Resistência", attrs: ["mig", "wlp"], desc: "Suportar marchas forçadas, ignorar a dor crônica, resistir ao frio/calor e aguentar tortura." },
  { id: "c30", name: "Fôlego", attrs: ["mig", "mig"], desc: "Prender a respiração por longos minutos debaixo d'água ou em ambientes com gás tóxico." },
  { id: "c31", name: "Briga", attrs: ["mig", "dex"], desc: "Entrar em combate corpo a corpo desarmado, imobilizar adversários e aplicar chaves de braço." },

  // --- SOCIAL E RELAÇÕES ---
  { id: "c32", name: "Diplomacia", attrs: ["wlp", "ins"], desc: "Convencer, apaziguar ânimos, negociar pagamentos justos e resolver conflitos sem violência." },
  { id: "c33", name: "Intimidação", attrs: ["wlp", "mig"], desc: "Amedrontar usando tom de voz agressivo, ameaças verbais e postura corporal hostil." },
  { id: "c34", name: "Liderança", attrs: ["wlp", "ins"], desc: "Inspirar coragem nos aliados, coordenar pessoas em pânico e dar ordens claras sob fogo inimigo." },
  { id: "c35", name: "Etiqueta", attrs: ["wlp", "ins"], desc: "Portar-se em eventos da alta nobreza, usar os talheres certos e falar com a realeza sem ofender." },
  { id: "c36", name: "Atuação", attrs: ["wlp", "dex"], desc: "Chamar a atenção de uma multidão, dançar, cantar ou atuar para criar uma distração perfeita." },
  { id: "c37", name: "Trato com Animais", attrs: ["ins", "wlp"], desc: "Acalmar cães de guarda, adestrar montarias e entender o comportamento de feras selvagens." },
  { id: "c38", name: "Foco e Vontade", attrs: ["wlp", "wlp"], desc: "Manter a mente fria diante do horror, resistir a provocações e focar em uma tarefa durante o caos." },

  // --- TRABALHO MANUAL E ACAMPAMENTO ---
  { id: "c39", name: "Ofícios e Forja", attrs: ["dex", "ins"], desc: "Consertar armaduras rachadas, afiar lâminas, costurar couro e criar ferramentas improvisadas." },
  { id: "c40", name: "Culinária", attrs: ["ins", "dex"], desc: "Limpar e preparar carne de caça, racionar mantimentos e cozinhar refeições que recuperam o ânimo." }
];

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

export function ItemModifiers({ text }: { text: string }) {
  if (!text) return null;

  const descMatch = text.split(/\[(?:BÔNUS|BONUS|MODIFICADOR|LORE|PENALIDADE|UTILIDADE)\s*:/i)[0];
  const desc = descMatch ? descMatch.trim() : text;

  const extractTag = (tagPattern: string) => {
    const regex = new RegExp(`\\[(?:${tagPattern})\\s*:\\s*([^\\]]+)\\]`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  };

  const bonus = extractTag("BÔNUS|BONUS");
  const modificador = extractTag("MODIFICADOR");
  const lore = extractTag("LORE");
  const penalidade = extractTag("PENALIDADE");
  const utilidade = extractTag("UTILIDADE");

  return (
    <div className="flex flex-col gap-2 items-start mt-1">
      <div className="opacity-80 whitespace-pre-wrap leading-relaxed">{desc}</div>

      {(bonus || modificador || penalidade || lore || utilidade) && (
        <div className="flex flex-col gap-1.5 mt-2 w-full">
          {bonus && bonus.toLowerCase() !== "nenhum" && (
            <div className="inline-flex items-center gap-1.5 bg-green-500/15 text-green-400 border border-green-500/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(34,197,94,0.1)] w-fit">
              <Plus className="size-3" /> {bonus}
            </div>
          )}
          {modificador && modificador.toLowerCase() !== "nenhum" && (
            <div className="inline-flex items-center gap-1.5 bg-accent/15 text-accent border border-accent/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(var(--accent),0.1)] w-fit">
              <Zap className="size-3" /> {modificador}
            </div>
          )}
          {penalidade && penalidade.toLowerCase() !== "nenhum" && (
            <div className="inline-flex items-center gap-1.5 bg-red-500/15 text-red-400 border border-red-500/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(239,68,68,0.1)] w-fit">
              <AlertTriangle className="size-3" /> {penalidade}
            </div>
          )}
          {lore && lore.toLowerCase() !== "nenhum" && (
            <div className="inline-flex items-center gap-1.5 bg-purple-500/15 text-purple-400 border border-purple-500/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(168,85,247,0.1)] w-fit">
              <BookOpen className="size-3 shrink-0" /> <div className="text-left">{lore}</div>
            </div>
          )}
          {utilidade && utilidade.toLowerCase() !== "nenhum" && (
            <div className="inline-flex items-center gap-1.5 bg-blue-500/15 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(59,130,246,0.1)] w-fit">
              <PenTool className="size-3 shrink-0" /> <div className="text-left">{utilidade}</div>
            </div>
          )}
        </div>
      )}
    </div>
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
                  {check.attrs.map((attr: any, i: number) => (
                    <span key={i} className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      {attr} <span className="opacity-50">({character.attributes[attr]})</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-xs font-normal opacity-60 text-left whitespace-normal leading-snug">{check.desc}</div>
            </div>
          </Button>
        ))}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground italic text-center col-span-2 py-8">Nenhum teste encontrado com esse nome.</div>}
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
          <div className="text-sm text-muted-foreground italic text-center py-4 border border-dashed border-border/30 rounded-lg">Personagem saudável. Nenhuma condição afeta seus testes.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {mods.map(mod => (
              <div key={mod.id} className={`condition-entry flex items-center justify-between p-3 rounded-lg border ${mod.value > 0 ? 'is-positive' : 'is-negative'}`}>
                <div className="flex flex-col">
                  <span className="condition-name text-sm font-bold">
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

function BlueprintApp({ character, editable, onSpendMp }: any) {
  const skillLvl = character.skills["ti-gadgets"] || 0;
  const currentMp = character.resources.mp;
  const currentIp = character.resources.ip;

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
    { level: 1, name: "Magiesfera Luminosa", mpCost: 5, ipCost: 1, reqItem: null, desc: "Cria uma esfera de luz. Requer 1 IP como peça." },
    { level: 2, name: "Gancho Pneumático", mpCost: 10, ipCost: 0, reqItem: "sucata", reqItemName: "Sucata de Ferro", desc: "Permite escalar superfícies. Consome uma [Sucata de Ferro]." },
    { level: 3, name: "Bomba de Fumaça", mpCost: 15, ipCost: 2, reqItem: null, desc: "Cobre a área em fumaça. Requer 2 IP de reagentes." },
    { level: 4, name: "Drone Escoteiro", mpCost: 20, ipCost: 0, reqItem: "lente-magica", reqItemName: "Lente Mágica", desc: "Pequeno robô voador. Consome uma [Lente Mágica]." },
    { level: 5, name: "Canhão Magitech", mpCost: 30, ipCost: 0, reqItem: "nucleo-energia", reqItemName: "Núcleo de Energia", desc: "Dispara uma rajada concentrada. Consome um [Núcleo de Energia]." },
  ];

  function handleCraft(bp: any) {
    if (!editable) return;

    if (currentMp < bp.mpCost) return alert(`Sua Mente (MP) é insuficiente. Necessário: ${bp.mpCost}.`);

    if (bp.ipCost > 0) {
      if (currentIp < bp.ipCost) return alert(`Pontos de Inventário insuficientes. Necessário: ${bp.ipCost} IP.`);
      onSpendMp(bp.mpCost);
      alert(`[${bp.name}] criado com sucesso usando ${bp.mpCost} MP e ${bp.ipCost} IP!`);
    }
    else if (bp.reqItem) {
      const itemIndex = character.equipment.findIndex((itemId: string) => itemId.includes(bp.reqItem));
      if (itemIndex === -1) return alert(`Falta material: Você precisa ter o item [${bp.reqItemName}] no equipamento para construir isto.`);
      onSpendMp(bp.mpCost);
      alert(`[${bp.name}] criado com sucesso consumindo [${bp.reqItemName}]!`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-primary/10 border border-primary/30 p-4 rounded-xl mb-2 shadow-inner">
        <p className="text-sm text-primary font-bold">Nível da Perícia 'Aparelhos': {skillLvl}</p>
        <p className="text-xs text-muted-foreground mt-1">Sua mochila possui: <span className="font-bold text-white">{currentIp} IP</span>.</p>
      </div>

      {blueprints.map(bp => {
        const unlocked = skillLvl >= bp.level;
        let hasItem = false;
        if (bp.reqItem) {
          hasItem = character.equipment.some((itemId: string) => itemId.includes(bp.reqItem!));
        }

        const canAfford = currentMp >= bp.mpCost && (bp.ipCost > 0 ? currentIp >= bp.ipCost : hasItem);

        return (
          <div key={bp.level} className={`p-4 rounded-xl border transition-all ${unlocked ? 'border-border/50 bg-card/50' : 'border-destructive/20 bg-destructive/5 opacity-60 grayscale'}`}>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div className="flex-1 pr-4">
                <h4 className={`font-bold ${unlocked ? "text-foreground" : "text-destructive"} flex items-center gap-2 flex-wrap`}>
                  {bp.name}
                  <span className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded text-muted-foreground uppercase tracking-widest">Req: Nv. {bp.level}</span>
                </h4>
                <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{bp.desc}</p>

                {unlocked && (
                  <div className="mt-2 text-[10px] font-mono flex gap-2">
                    <span className={currentMp >= bp.mpCost ? 'text-blue-400' : 'text-red-400'}>-{bp.mpCost} MP</span>
                    {bp.ipCost > 0 && <span className={currentIp >= bp.ipCost ? 'text-green-400' : 'text-red-400'}>-{bp.ipCost} IP</span>}
                    {bp.reqItem && <span className={hasItem ? 'text-green-400' : 'text-red-400'}>Req: {bp.reqItemName} {hasItem ? '(Na Mochila)' : '(Falta)'}</span>}
                  </div>
                )}
              </div>

              {unlocked ? (
                <Button size="sm" disabled={!canAfford || !editable} onClick={() => handleCraft(bp)} className={`gap-2 shrink-0 font-bold h-9 ${canAfford ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                  <Zap className="size-3.5" /> {canAfford ? 'Construir' : 'Materiais Insuf.'}
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

// ==========================================
// CRIADOR DE NPC
// ==========================================
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
        {step === 1 && <ClassesStep skillLevels={skillLevels} setSkillLvl={setSkillLvl} classLevels={classLevels} totalLevels={totalLevels} chosenCount={chosenClassCount} isNpc />}
        {step === 2 && <AttributesStep profileId={profileId} setProfileId={setProfileId} attributes={attributes} customAttributes={customAttributes} setCustomAttributes={setCustomAttributes} />}
        {step === 3 && <EquipmentStep equipment={equipment} toggle={toggleEquipment} remaining={remaining} spent={spent} isNpc />}
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

// ==========================================
// FICHA DA CRIATURA
// ==========================================
export function CreatureSheet({ creature, isGm, customEquipment = [], onUpdate, onRoll, onKill }: { creature: any, isGm: boolean, customEquipment?: any[], onUpdate: (id: string, updates: any) => void, onRoll: (attr: string, res: number) => void, onKill?: () => void }) {
  const [showInventory, setShowInventory] = useState(false)
  const [rollingAttr, setRollingAttr] = useState<string | null>(null)

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
    setTimeout(() => {
      const sides = parseInt(dieString.replace("d", ""))
      const result = Math.floor(Math.random() * sides) + 1
      const attrLabel = ATTRIBUTE_META[attr].label
      onRoll(`${attrLabel} [${dieString}]`, result)
      setRollingAttr(null)
    }, 800)
  }

  function useInventoryItem(actionId: string) {
    if (!isGm) return;
    const act = (INVENTORY_ACTIONS as any[]).find((a: any) => a.id === actionId);
    if (!act) return;

    if (currentIp < act.cost) {
      alert("Pontos de Inventário (IP) insuficientes na mochila da criatura!");
      return;
    }
    const updates: any = { currentIp: currentIp - act.cost };
    if (act.effectResource === "hp") updates.currentHp = Math.min(creature.maxHp, currentHp + (act.effectValue || 0));
    if (act.effectResource === "mp") updates.currentMp = Math.min(creature.maxMp, currentMp + (act.effectValue || 0));

    onUpdate(creature.instanceId, updates);
    setShowInventory(false);
  }

  const affinitiesEntries = Object.entries(creature.affinities || {}) as [string, string][];

  return (
    <div className="panel border-glow relative rounded-xl border border-destructive/50 p-5 flex flex-col w-full h-full bg-zinc-950 shadow-[0_0_30px_rgba(255,0,0,0.1)]">
      <AnimatePresence>
        {showInventory && (
          <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden" onClick={() => setShowInventory(false)}>
            <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-destructive/50 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                <h4 className="font-serif text-2xl font-black text-destructive flex items-center gap-3"><Package className="size-6" /> Saque da Criatura</h4>
                <button onClick={() => setShowInventory(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-10 custom-scrollbar-sepia">
                <section className="flex-1 space-y-4">
                  <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Equipamento da Criatura</h5>
                  {equipment.length === 0 ? (
                    <p className="p-6 text-center rounded-lg border border-dashed border-border/40 text-sm text-muted-foreground italic">Nenhum equipamento.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {equipment.map((id: string, idx: number) => {
                        const item = customEquipment.find((e: any) => e.id === id) || getEquipment(id)
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
                      {INVENTORY_ACTIONS.map((act: any) => (
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

      <div className="flex items-start justify-between gap-4 w-full">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-destructive/40 shadow-md">
            <Image src={creature.imageUrl} alt="Retrato" fill className="object-cover" sizes="64px" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col items-start">
            <h3 className="font-serif text-xl md:text-2xl font-bold text-destructive leading-tight truncate w-full">
              {creature.name} <span className="text-muted-foreground text-sm whitespace-nowrap">(Lv. {creature.level})</span>
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">
              {creature.species}
            </p>
          </div>
        </div>
        {isGm && (
          <div className="flex flex-col items-end shrink-0">
            <Button variant="outline" size="sm" className="h-auto py-2 border-destructive/30 text-destructive hover:bg-destructive/20 shrink-0" onClick={() => setShowInventory(true)}>
              <Package className="size-4 mr-2" /> Mochila
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        {ATTR_KEYS.map((k: AttributeKey) => {
          const isRolling = rollingAttr === k
          return (
            <button key={k} disabled={!isGm || isRolling} onClick={() => rollDice(k, creature.attributes[k])} className={`attribute-roll-button rounded-lg border py-3 text-center ${isRolling ? "is-rolling border-destructive bg-destructive/20" : "border-border/60 bg-card/40 hover:border-destructive/50 hover:bg-card"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{k}</p>
              <p className="font-serif text-xl font-black text-destructive drop-shadow-sm">{creature.attributes[k]}</p>
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
          <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)] animate-pulse" onClick={onKill}>
            <Skull className="size-5" /> Confirmar Abate e Distribuir XP
          </Button>
        </div>
      )}
    </div>
  )
}

// ==========================================
// FICHA DO PERSONAGEM (JOGADORES)
// ==========================================
function CharacterStatusBadges({ modifiers }: { modifiers: Modifier[] }) {
  if (modifiers.length === 0) return null

  const getVisual = (modifier: Modifier) => {
    const name = modifier.name.toLocaleLowerCase("pt-BR")
    if (name.includes("queim") || name.includes("fogo")) return { Icon: Flame, tone: "burn" }
    if (name.includes("sangr")) return { Icon: Droplets, tone: "bleed" }
    if (name.includes("fraq") || name.includes("vulner")) return { Icon: ShieldOff, tone: "weak" }
    if (name.includes("atordo") || name.includes("confus")) return { Icon: Brain, tone: "stun" }
    if (name.includes("medo") || name.includes("maldi")) return { Icon: Ghost, tone: "curse" }
    if (name.includes("venen") || name.includes("tox")) return { Icon: Skull, tone: "poison" }
    return { Icon: Activity, tone: modifier.value < 0 ? "negative" : "positive" }
  }

  return (
    <div className="character-status-list" aria-label="Condições ativas">
      {modifiers.slice(0, 3).map((modifier) => {
        const { Icon, tone } = getVisual(modifier)
        const detail = `${modifier.name}${modifier.value ? ` (${modifier.value > 0 ? "+" : ""}${modifier.value})` : ""}`
        return (
          <span key={modifier.id} data-tone={tone} className="character-status-icon" title={detail} aria-label={detail}>
            <Icon className="size-3" />
          </span>
        )
      })}
      {modifiers.length > 3 && <span className="character-status-more" title={modifiers.slice(3).map((modifier) => modifier.name).join(", ")}>+{modifiers.length - 3}</span>}
    </div>
  )
}

export function CharacterSheet({ character, editable, isGm, isOwned = false, campaignMembers = [], customClasses = [],customEquipment = [],onOptimistic, onRoll, onKill, shouldOpenInventory, onClearInventoryRequest, onArchive, defaultExpanded = false, expanded, onExpandedChange }: any) {
  const [mounted, setMounted] = useState(false)
  const [pending, setPending] = useState(false)
  const [displayResources, setDisplayResources] = useState<CharacterResources>(character.resources)
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = typeof expanded === "boolean" ? expanded : internalExpanded
  
  const [rollingAttr, setRollingAttr] = useState<string | null>(null)
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showLore, setShowLore] = useState(false)
  const [showFrameGallery, setShowFrameGallery] = useState(false)
  const [showPortraitEditor, setShowPortraitEditor] = useState(false)
  const [editingZenit, setEditingZenit] = useState(false)
  const [zenitDraft, setZenitDraft] = useState("")
  const zenitInputRef = useRef<HTMLInputElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const previousExpandedRef = useRef(isExpanded)
  const resourceDraftRef = useRef<CharacterResources>(character.resources)
  const resourceConfirmedRef = useRef<CharacterResources>(character.resources)
  const resourceCharacterRef = useRef<Character>(character)
  const resourceWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const resourceWriteCountRef = useRef(0)
  const [expandedContentMounted, setExpandedContentMounted] = useState(defaultExpanded)
  const [expansionVisible, setExpansionVisible] = useState(defaultExpanded)

  const [sheetTab, setSheetTab] = useState<"main" | "checks" | "modifiers">("main")
  const [viewingItem, setViewingItem] = useState<any | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferUserId, setTransferUserId] = useState<string>("")
  const [storeSearch, setStoreSearch] = useState("")
  const [storeCategory, setStoreCategory] = useState("all")
  const [selectedStoreItem, setSelectedStoreItem] = useState<any>(null)

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

  // Estado do Editor Inline de Modificadores / Condições
  const [editingModId, setEditingModId] = useState<string | null>(null)
  const [modDraft, setModDraft] = useState<any>({})

  function changeExpanded(next: boolean) {
    if (typeof expanded !== "boolean") setInternalExpanded(next)
    onExpandedChange?.(next)
  }

  useLayoutEffect(() => {
    const wasExpanded = previousExpandedRef.current
    previousExpandedRef.current = isExpanded
    if (!wasExpanded || isExpanded || !sheetRef.current) return

    const scroller = sheetRef.current.closest(".rpg-character-scroll") as HTMLElement | null
    if (!scroller || scroller.scrollTop <= 0) return

    const compactReference = Array.from(scroller.querySelectorAll<HTMLElement>(".rpg-character-sheet[data-expanded='false']"))
      .find((element) => element !== sheetRef.current)
    const compactHeight = compactReference?.getBoundingClientRect().height ?? 108
    const collapseDistance = Math.max(0, sheetRef.current.getBoundingClientRect().height - compactHeight)
    const target = Math.min(scroller.scrollTop, Math.max(0, scroller.scrollHeight - scroller.clientHeight - collapseDistance))
    const start = scroller.scrollTop
    if (Math.abs(start - target) < 1) return

    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
    const startedAt = performance.now()
    const duration = 360
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      scroller.scrollTop = start + (target - start) * progress
      if (progress < 1) scrollFrameRef.current = requestAnimationFrame(step)
      else scrollFrameRef.current = null
    }
    scrollFrameRef.current = requestAnimationFrame(step)
  }, [isExpanded])

  useEffect(() => {
    if (isExpanded) {
      setExpandedContentMounted(true)
      let secondFrame: number | null = null
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setExpansionVisible(true))
      })
      return () => {
        cancelAnimationFrame(firstFrame)
        if (secondFrame !== null) cancelAnimationFrame(secondFrame)
      }
    }
    setExpansionVisible(false)
    const timeout = window.setTimeout(() => setExpandedContentMounted(false), 540)
    return () => window.clearTimeout(timeout)
  }, [isExpanded])

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  useEffect(() => {
    setMounted(true);
    if (defaultExpanded) changeExpanded(true);
  }, [defaultExpanded])

  useEffect(() => {
    if (resourceWriteCountRef.current > 0) {
      resourceCharacterRef.current = { ...character, resources: resourceDraftRef.current }
      return
    }
    resourceDraftRef.current = character.resources
    resourceConfirmedRef.current = character.resources
    resourceCharacterRef.current = character
    setDisplayResources(character.resources)
  }, [character])

  useEffect(() => {
    if (shouldOpenInventory) {
      setShowInventory(true);
      changeExpanded(true);
      if (onClearInventoryRequest) onClearInventoryRequest();
    }
  }, [shouldOpenInventory, onClearInventoryRequest])

  const totalXp = displayResources?.xp || 0
  const { charLevel, currentLevelXp, xpRequired } = getLevelInfo(totalXp)
  const currentZenit = character.zenit || 0
  const skillsObj = character.skills || {}
  const customItems = character.customItems || []

  useEffect(() => {
    if (!editingZenit) return
    zenitInputRef.current?.focus()
    zenitInputRef.current?.select()
  }, [editingZenit])

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

  const allStoreItems = [...customEquipment, ...EQUIPMENT]
  const filteredStoreItems = allStoreItems.filter((item: any) => {
    if (item.purchasable === false) return false
    const search = storeSearch.toLowerCase().trim()
    const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.detail.toLowerCase().includes(search)
    const matchesCategory = storeCategory === "all" || item.category === storeCategory
    return matchesSearch && matchesCategory
  })

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "weapon": return "Arma"
      case "armor": return "Armadura"
      case "shield": return "Escudo"
      case "accessory": return "Acessório"
      default: return "Item"
    }
  }

  const spentAttrPoints = currentAttrPoints - 8;
  const earnedAttrPoints = Math.floor((charLevel - 5) / 10);
  const unspentAttrPoints = earnedAttrPoints - spentAttrPoints;

  async function handleUpgradeAttribute(attrKey: AttributeKey) {
    if (!editable || unspentAttrPoints <= 0) return;
    const currentDie = character.attributes[attrKey];
    const nextDie = currentDie === "d6" ? "d8" : currentDie === "d8" ? "d10" : currentDie === "d10" ? "d12" : null;
    if (!nextDie) return;

    const newAttributes = { ...character.attributes, [attrKey]: nextDie };
    
    const oldMaxes = computeMaxResources(character.classes || [], character.attributes);
    const newMaxes = computeMaxResources(character.classes || [], newAttributes);

    // Salva a diferença para preservar alterações manuais feitas pelo Mestre
    const hpDiff = newMaxes.maxHp - oldMaxes.maxHp;
    const mpDiff = newMaxes.maxMp - oldMaxes.maxMp;
    const ipDiff = newMaxes.maxIp - oldMaxes.maxIp;

    const newResources = { 
      ...character.resources, 
      maxHp: (character.resources.maxHp || oldMaxes.maxHp) + hpDiff, 
      maxMp: (character.resources.maxMp || oldMaxes.maxMp) + mpDiff, 
      maxIp: (character.resources.maxIp || oldMaxes.maxIp) + ipDiff 
    };

    onOptimistic({ ...character, attributes: newAttributes, resources: newResources });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ attributes: newAttributes, resources: newResources })
      });
      onOptimistic(updated);
    } finally { setPending(false); }
  }

  function patchResource(key: string, delta: number) {
    const res = resourceDraftRef.current as any;
    const next = { ...res }

    if (key === "xp" || key === "fp" || key === "lp" || key.startsWith("max")) {
      next[key] = Math.max(0, (res[key] || 0) + delta)
    } else {
      const maxKey = key === "hp" ? "maxHp" : key === "mp" ? "maxMp" : key === "ip" ? "maxIp" : null;
      const max = maxKey ? res[maxKey] : Infinity
      next[key] = Math.max(0, Math.min(max, res[key] + delta))
    }

    if (next[key] === res[key]) return
    resourceDraftRef.current = next
    setDisplayResources(next)
    const optimistic = { ...resourceCharacterRef.current, resources: next }
    resourceCharacterRef.current = optimistic
    onOptimistic(optimistic)
    resourceWriteCountRef.current += 1
    setPending(true)
    const request = resourceWriteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ resources: { [key]: next[key] } }) })
          resourceConfirmedRef.current = updated.resources
          resourceWriteCountRef.current -= 1
          if (resourceWriteCountRef.current === 0) {
            resourceDraftRef.current = updated.resources
            resourceCharacterRef.current = updated
            setDisplayResources(updated.resources)
            onOptimistic(updated)
            setPending(false)
          } else {
            const current = { ...updated, resources: resourceDraftRef.current }
            resourceCharacterRef.current = current
            onOptimistic(current)
          }
        } catch (error) {
          resourceWriteCountRef.current -= 1
          if (resourceWriteCountRef.current === 0) {
            const resources = resourceConfirmedRef.current
            const rollback = { ...resourceCharacterRef.current, resources }
            resourceDraftRef.current = resources
            resourceCharacterRef.current = rollback
            setDisplayResources(resources)
            onOptimistic(rollback)
            setPending(false)
          }
          throw error
        }
      })
    resourceWriteQueueRef.current = request.catch(console.error)
  }

  async function saveZenit(value: number) {
    if (!editable || pending) return
    const nextZenit = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)))
    if (!Number.isFinite(nextZenit) || nextZenit === currentZenit) return
    onOptimistic({ ...character, zenit: nextZenit })
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ zenit: nextZenit }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function patchZenit(delta: number) {
    await saveZenit(currentZenit + delta)
  }

  function beginZenitEdit() {
    if (!editable || pending) return
    setZenitDraft(String(currentZenit))
    setEditingZenit(true)
  }

  function commitZenitEdit() {
    if (!editingZenit) return
    const trimmed = zenitDraft.trim()
    setEditingZenit(false)
    if (!trimmed) return
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0) return
    void saveZenit(value)
  }

  function cancelZenitEdit() {
    setZenitDraft(String(currentZenit))
    setEditingZenit(false)
  }

  async function savePortraitFrame(frame: PortraitFrameId) {
    if (!editable || pending || frame === (character.portraitFrame || "bronze")) {
      setShowFrameGallery(false)
      return
    }
    onOptimistic({ ...character, portraitFrame: frame })
    setShowFrameGallery(false)
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ portraitFrame: frame }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function savePortraitImage(avatarUrl: string, portraitCrop: PortraitCrop) {
    if (!isOwned) throw new Error("Apenas o dono pode alterar o retrato.")
    const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
      method: "PATCH",
      body: JSON.stringify({ avatarUrl, portraitCrop })
    })
    onOptimistic(updated)
  }

  async function saveNewSkillPoint(skillId: string) {
    if (!editable && !isGm) return;
    const newSkills = { ...skillsObj, [skillId]: (skillsObj[skillId] || 0) + 1 }
    let newClasses = JSON.parse(JSON.stringify(character.classes || []));
    const classMatch = CLASSES.find((c: any) => c.skills.some((s: any) => s.id === skillId));

    if (classMatch) {
      const existingClass = newClasses.find((c: any) => c.classId === classMatch.id || c.id === classMatch.id);
      if (existingClass) existingClass.level += 1;
      else newClasses.push({ classId: classMatch.id, level: 1 });
    }

    const oldMaxes = computeMaxResources(character.classes || [], character.attributes);
    const newMaxes = computeMaxResources(newClasses, character.attributes);

    // Salva a diferença para preservar alterações manuais feitas pelo Mestre
    const hpDiff = newMaxes.maxHp - oldMaxes.maxHp;
    const mpDiff = newMaxes.maxMp - oldMaxes.maxMp;
    const ipDiff = newMaxes.maxIp - oldMaxes.maxIp;

    const newResources = { 
      ...character.resources, 
      maxHp: (character.resources.maxHp || oldMaxes.maxHp) + hpDiff, 
      maxMp: (character.resources.maxMp || oldMaxes.maxMp) + mpDiff, 
      maxIp: (character.resources.maxIp || oldMaxes.maxIp) + ipDiff 
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
    const item = customEquipment.find((e: any) => e.id === itemId) || getEquipment(itemId)
    if (!item) return
    if (currentZenit < item.cost) { alert("Zênit insuficiente!"); return }

    // CORREÇÃO AQUI
    const currentEquip = Array.isArray(character.equipment) ? character.equipment : []
    const newEquipment = [...currentEquip, item.id]
    
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
    const item = customEquipment.find((e: any) => e.id === itemId) || getEquipment(itemId)
    if (!item) return
    const sellValue = Math.floor(item.cost / 2)
    
    // CORREÇÃO AQUI
    const currentEquip = Array.isArray(character.equipment) ? character.equipment : []
    const newEquipment = [...currentEquip]
    newEquipment.splice(index, 1)
    
    const newZenit = currentZenit + sellValue
    onOptimistic({ ...character, equipment: newEquipment, zenit: newZenit })
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment, zenit: newZenit }) })
      onOptimistic(updated)
    } finally { setPending(false) }
  }

  async function removeEquipmentItem(index: number) {
    if (!isGm) return;
    if (!confirm("Tem certeza que deseja remover este item da mochila do jogador?")) return;

    const currentEquip = Array.isArray(character.equipment) ? character.equipment : []
    const newEquipment = [...currentEquip];
    newEquipment.splice(index, 1);

    onOptimistic({ ...character, equipment: newEquipment });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ equipment: newEquipment })
      });
      onOptimistic(updated);
    } finally {
      setPending(false);
    }
  }

  function rollDice(attr: AttributeKey, dieString: string) {
    if (rollingAttr || !editable) return;
    setRollingAttr(attr);
    setTimeout(() => {
      const sides = parseInt(dieString.replace("d", ""));
      const result = Math.floor(Math.random() * sides) + 1;
      const attrLabel = ATTRIBUTE_META[attr].label;

      let modTotal = 0;
      const mods = (character as any).customModifiers || [];
      mods.forEach((m: any) => {
        if (m.target === 'all' || m.target === attr) {
          modTotal += m.value;
        }
      });

      const finalResult = result + modTotal;
      const detailStr = `[${attrLabel} ${dieString}]`;

      if (onRoll) onRoll(detailStr, finalResult, modTotal !== 0 ? { modifier: modTotal } : undefined);

      window.setTimeout(() => setRollingAttr((current) => current === attr ? null : current), 4300);
    }, 800);
  }

  function handleCombinedRoll(check: any) {
    if (rollingAttr || !editable) return;
    setRollingAttr(check.id);

    setTimeout(() => {
      let totalDice = 0;
      let details: number[] = [];
      let diceLabels: string[] = [];
      check.attrs.forEach((a: string) => {
        const dieLabel = character.attributes[a as AttributeKey] || "d6";
        const dieSize = parseInt(dieLabel.replace("d", ""));
        const roll = Math.floor(Math.random() * dieSize) + 1;
        totalDice += roll;
        details.push(roll);
        diceLabels.push(dieLabel);
      });

      let modTotal = 0;
      const mods = (character as any).customModifiers || [];
      mods.forEach((m: any) => {
        if (m.target === 'all' || check.attrs.includes(m.target) || m.target === check.name) {
          modTotal += m.value;
        }
      });

      const finalResult = totalDice + modTotal;
      const logDetail = `${check.name} [${check.attrs.join('+').toUpperCase()} ${diceLabels.join(' + ')}]`;

      if (onRoll) onRoll(logDetail, finalResult, { breakdown: details.join(' + '), modifier: modTotal || undefined });

      setRollingAttr(null);
    }, 800);
  }

  async function updateModifiers(newMods: any[]) {
    onOptimistic({ ...character, customModifiers: newMods });
    setPending(true);
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${character.id}`, {
        method: "PATCH", body: JSON.stringify({ customModifiers: newMods })
      });
      onOptimistic({ ...updated, customModifiers: newMods });
    } finally {
      setPending(false);
    }
  }

  function useSkill(skill: any) {
    if (!skill.action || !editable) return
    if (character.resources[skill.action.resource] < skill.action.cost) { alert(`Você não tem ${skill.action.resource.toUpperCase()} suficiente!`); return }
    patchResource(skill.action.resource, -skill.action.cost)
    setExpandedSkillId(null)
  }

  function useInventoryItem(actionId: string) {
    if (!editable) return;
    const act = (INVENTORY_ACTIONS as any[]).find((a: any) => a.id === actionId);
    if (!act) return;
    if (resourceDraftRef.current.ip < act.cost) { alert("Pontos de Inventário insuficientes!"); return; }
    patchResource("ip", -act.cost);
    if (act.effectResource && act.effectValue) patchResource(act.effectResource, act.effectValue);
    setShowInventory(false);
  }

  async function deleteCustomItem(id: string) {
    if (!editable && !isGm) return;
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
        method: "POST", body: JSON.stringify({ userId: transferUserId })
      });
      onOptimistic(updated);
      setShowTransferModal(false);
    } catch (err) {
      alert("Erro ao transferir personagem. Verifique se a rota API de transferência existe.");
    } finally { setPending(false); }
  }

  return (
    <div ref={sheetRef} data-expanded={isExpanded} className={`panel rpg-character-sheet border-glow relative flex w-full flex-col border bg-zinc-950/40 transition-[padding,border-color,box-shadow,background-color] duration-[480ms] ease-[cubic-bezier(.4,0,.2,1)] ${isOwned && !isGm ? 'is-player-owned' : ''} ${isExpanded ? 'p-5 sm:p-6 border-primary/50' : 'p-2.5 sm:p-3 border-border/40 hover:border-primary/30'}`}>
      {mounted && createPortal(
        <>
          <AnimatePresence>
            {showPortraitEditor && (
              <PortraitEditor
                name={character.name}
                avatarUrl={character.avatarUrl}
                frame={character.portraitFrame}
                crop={character.portraitCrop}
                onClose={() => setShowPortraitEditor(false)}
                onSave={savePortraitImage}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showLevelUp && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden" onClick={() => setShowLevelUp(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-2xl flex-col border border-primary/50 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
                                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{formatSkillDescription(s.description, lvl + 1)}</div>
                                  </div>
                                  <Button size="sm" className="shrink-0 self-end sm:self-auto" disabled={unspentPoints <= 0 && !isGm} onClick={() => saveNewSkillPoint(s.id)}>Aprender</Button>
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

          {/* ... Outros modais da Loja, Inventário, Vizualização permanecem intocados ... */}

          <AnimatePresence>
            {showStore && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-6 overflow-hidden" onClick={() => setShowStore(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden border border-accent/30 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 p-5 md:p-6 border-b border-white/10 bg-black/50 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-accent/10 border border-accent/20"><Store className="size-6 md:size-7 text-accent" /></div>
                      <div>
                        <h4 className="font-serif text-xl md:text-2xl font-black text-[#eee3cf]">Mercado & Forja</h4>
                        <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-muted-foreground">Equipamentos • Relíquias • Suprimentos</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-3">
                      <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-full border border-accent/20 shadow-inner">
                        <Coins className="size-4 text-accent" />
                        <span className="font-mono font-bold text-sm md:text-base text-foreground">{currentZenit} z</span>
                      </div>
                      <button onClick={() => setShowStore(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
                    <aside className="lg:w-[260px] xl:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20 flex flex-col">
                      <div className="p-4 border-b border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sua Mochila</h5>
                            <p className="text-[10px] text-muted-foreground mt-1">Venda seus equipamentos</p>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">{character.equipment.length} itens</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar-sepia">
                        {character.equipment.length === 0 ? (
                          <div className="h-full min-h-[120px] flex items-center justify-center">
                            <div className="text-center p-6"><PackageOpen className="size-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground italic">Mochila vazia.</p></div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {character.equipment.map((id: string, index: number) => {
                              const item = customEquipment.find((e: any) => e.id === id) || getEquipment(id)
                              if (!item) return null
                              const sellPrice = Math.floor(item.cost / 2)
                              return (
                                <div key={`${id}-${index}`} className="group flex items-center gap-3 p-3 rounded-lg bg-card/60 border border-border/50 hover:border-accent/40 hover:bg-card transition-all">
                                  <div className="size-9 shrink-0 rounded-md bg-black/40 border border-white/10 flex items-center justify-center"><Package className="size-4 text-accent/70" /></div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-xs text-foreground truncate">{item.name}</p>
                                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{item.category}</p>
                                  </div>
                                  <Button size="sm" variant="ghost" disabled={!editable} className="text-accent hover:bg-accent/10 shrink-0 px-2" onClick={() => sellItem(item.id, index)}>+{sellPrice}z</Button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </aside>
                    <main className="flex-1 min-w-0 flex flex-col">
                      <div className="p-4 md:p-5 border-b border-white/10 bg-black/20">
                        <div className="flex flex-col md:flex-row gap-3">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <input type="text" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} placeholder="Pesquisar equipamentos..." className="w-full h-10 pl-10 pr-4 rounded-lg bg-background border border-border focus:border-accent/60 focus:outline-none text-sm" />
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar-sepia">
                            {[["all", "Todos"], ["weapon", "Armas"], ["armor", "Armaduras"], ["shield", "Escudos"], ["accessory", "Acessórios"]].map(([id, label]) => (
                              <button key={id} onClick={() => setStoreCategory(id)} className={`px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider font-bold whitespace-nowrap border transition-all ${storeCategory === id ? "bg-accent text-accent-foreground border-accent" : "bg-white/5 text-muted-foreground border-white/10 hover:border-accent/30 hover:text-foreground"}`}>{label}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 custom-scrollbar-sepia">
                        <div className="mb-4 flex items-end justify-between">
                          <div>
                            <h5 className="font-serif text-lg font-bold text-foreground">Vitrine</h5>
                            <p className="text-xs text-muted-foreground">Selecione um item para examinar seus detalhes.</p>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">{filteredStoreItems.length} resultados</span>
                        </div>
                        {filteredStoreItems.length === 0 ? (
                          <div className="h-48 flex flex-col items-center justify-center text-center"><SearchX className="size-8 text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Nenhum item encontrado.</p><button onClick={() => { setStoreSearch(""); setStoreCategory("all") }} className="mt-2 text-xs text-accent hover:underline">Limpar filtros</button></div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {filteredStoreItems.map((item: any) => {
                              const canAfford = currentZenit >= item.cost
                              const selected = selectedStoreItem?.id === item.id
                              return (
                                <motion.button layout key={item.id} onClick={() => setSelectedStoreItem(item)} className={`text-left group relative p-4 rounded-xl border transition-all duration-200 ${selected ? "border-accent bg-accent/10 shadow-lg shadow-accent/5" : canAfford ? "border-border/60 bg-card/50 hover:border-accent/40 hover:bg-card" : "border-destructive/20 bg-destructive/5 opacity-60"}`}>
                                  <div className="absolute top-3 right-3"><div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold ${canAfford ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}><Coins className="size-3" /> {item.cost}z</div></div>
                                  <div className="size-14 mb-4 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center group-hover:border-accent/30 transition-colors">
                                    {item.category === "weapon" && <Sword className="size-7 text-accent/70" />}
                                    {item.category === "armor" && <Shield className="size-7 text-accent/70" />}
                                    {item.category === "shield" && <Shield className="size-7 text-accent/70" />}
                                    {item.category === "accessory" && <Gem className="size-7 text-accent/70" />}
                                  </div>
                                  <div className="pr-16"><p className="font-bold text-sm text-foreground">{item.name}</p><p className="mt-1 text-[9px] uppercase tracking-widest text-accent/70">{getCategoryLabel(item.category)}</p></div>
                                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">Clique para examinar</span><Eye className="size-3.5 text-muted-foreground group-hover:text-accent transition-colors" /></div>
                                </motion.button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </main>
                    <AnimatePresence mode="wait">
                      {selectedStoreItem && (
                        <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full lg:w-[340px] xl:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/40 flex flex-col">
                          <div className="p-5 border-b border-white/10">
                            <div className="flex justify-between items-start gap-3">
                              <div><p className="text-[9px] uppercase tracking-[0.2em] text-accent mb-1">Inspecionando</p><h5 className="font-serif text-xl font-bold text-foreground">{selectedStoreItem.name}</h5></div>
                              <button onClick={() => setSelectedStoreItem(null)} className="p-1.5 rounded-md hover:bg-white/10"><X className="size-4 text-muted-foreground" /></button>
                            </div>
                          </div>
                          <div className="p-6">
                            <div className="aspect-square max-h-[180px] rounded-xl bg-gradient-to-br from-accent/10 via-black/30 to-black/60 border border-accent/20 flex items-center justify-center">
                              {selectedStoreItem.category === "weapon" && <Sword className="size-24 text-accent/40" />}
                              {selectedStoreItem.category === "armor" && <Shield className="size-24 text-accent/40" />}
                              {selectedStoreItem.category === "shield" && <Shield className="size-24 text-accent/40" />}
                              {selectedStoreItem.category === "accessory" && <Gem className="size-24 text-accent/40" />}
                            </div>
                          </div>
                          <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar-sepia">
                            <div className="space-y-5">
                              <div><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Descrição</p><div className="text-sm leading-relaxed text-muted-foreground"><ItemModifiers text={selectedStoreItem.detail} /></div></div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg bg-card border border-border/50"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Categoria</p><p className="mt-1 text-xs font-bold text-foreground">{getCategoryLabel(selectedStoreItem.category)}</p></div>
                                <div className="p-3 rounded-lg bg-card border border-border/50"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Valor</p><p className="mt-1 text-xs font-bold text-accent font-mono">{selectedStoreItem.cost} z</p></div>
                              </div>
                            </div>
                          </div>
                          <div className="p-5 border-t border-white/10 bg-black/30">
                            {currentZenit >= selectedStoreItem.cost ? (
                              <Button disabled={!editable} onClick={() => { buyItem(selectedStoreItem.id); setSelectedStoreItem(null) }} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold"><ShoppingCart className="size-4 mr-2" /> Comprar por {selectedStoreItem.cost} z</Button>
                            ) : (
                              <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20"><p className="text-xs font-bold text-destructive">Zenit insuficiente</p><p className="text-[10px] text-muted-foreground mt-1">Faltam {selectedStoreItem.cost - currentZenit} z</p></div>
                            )}
                          </div>
                        </motion.aside>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Demais modais seguem em ordem: Inventory, ViewingItem, Transfer, Archive, Gallery, Lore... */}
          <AnimatePresence>
            {showInventory && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden" onClick={() => setShowInventory(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-primary/30 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/40 shrink-0">
                    <h4 className="font-serif text-2xl md:text-3xl font-black text-[#eee3cf] flex items-center gap-3"><Package className="size-6 text-primary md:size-8" /> Mochila do Herói</h4>
                    <button onClick={() => setShowInventory(false)} className="rounded-full p-2 bg-white/5 hover:bg-white/10"><X className="size-5 md:size-6 text-muted-foreground hover:text-white" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col md:flex-row gap-10 custom-scrollbar-sepia">
                    <section className="flex-1 space-y-4">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-white/10 pb-2">Equipamento Atual</h5>
                      {!character.equipment || character.equipment.length === 0 ? ( // <-- ADICIONE A VALIDAÇÃO AQUI
                        <div className="p-6 text-center rounded-lg border border-dashed border-border/40 bg-card/20"><p className="text-sm text-muted-foreground italic">Nenhum equipamento.</p></div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {character.equipment.map((id: string, idx: number) => {
                            const item = customEquipment.find((e: any) => e.id === id) || getEquipment(id)
                            return item ? (
                              <div key={`${id}-${idx}`} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-card border border-border/50">
                                <div className="flex items-start gap-3">
                                  <Info className="size-4 text-primary shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold text-sm text-foreground">{item.name}{(item as any).purchasable === false && <span className="ml-2 text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.5 rounded">LOOT RARO</span>}</p>
                                    <div className="text-xs text-muted-foreground mt-1"><ItemModifiers text={item.detail} /></div>
                                  </div>
                                </div>
                                {isGm && (
                                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-8 w-8 p-0" onClick={() => removeEquipmentItem(idx)} title="O Mestre pode remover este item da mochila do jogador">
                                    <Trash2 className="size-4" />
                                  </Button>
                                )}
                              </div>
                            ) : null
                          })}
                        </div>
                      )}

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
                                  className={`flex items-center justify-between p-3 rounded-lg bg-card border transition-colors text-left ${isLockedForThisChar ? 'border-destructive/30 opacity-50 cursor-not-allowed' : 'border-border/50 hover:border-primary/50'}`}
                                  disabled={isLockedForThisChar}
                                >
                                  <div className="flex items-center gap-3">
                                    {item.type === 'text' && <ScrollText className="size-5 text-amber-500" />}
                                    {item.type === 'image' && <ImageIcon className="size-5 text-blue-400" />}
                                    {item.type === 'video' && <Film className="size-5 text-purple-400" />}
                                    {item.type === 'app-blueprints' && <Package className={`size-5 ${isLockedForThisChar ? 'text-destructive' : 'text-blue-500'}`} />}
                                    <div className="flex flex-col">
                                      <span className={`font-bold text-sm truncate ${isLockedForThisChar ? 'text-destructive' : 'text-foreground'}`}>{item.name}</span>
                                      {isLockedForThisChar && <span className="text-[9px] uppercase tracking-widest text-destructive mt-0.5">Requer: Inventor</span>}
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
                        <span className="text-sm font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">IP Atual: {displayResources.ip}/{displayResources.maxIp}</span>
                      </div>
                      {editable ? (
                        <div className="flex flex-col gap-3">
                          {INVENTORY_ACTIONS.map((act: any) => (
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

          <AnimatePresence>
            {viewingItem && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden" onClick={() => setViewingItem(null)}>
                <motion.div variants={modalVariants} className={`relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl ${viewingItem.type === 'text' ? 'rpg-paper text-black border-2 border-[#d4af37]' : 'rpg-modal bg-zinc-950 border border-primary/50'}`} onClick={(event) => event.stopPropagation()}>
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
                      <div className="font-serif text-lg leading-relaxed whitespace-pre-wrap text-amber-950">{viewingItem.content}</div>
                    )}
                    {viewingItem.type === 'image' && (
                      <div className="flex justify-center items-center">
                        <img src={viewingItem.content} alt={viewingItem.name} className="max-w-full h-auto rounded-lg shadow-lg" />
                      </div>
                    )}
                    {viewingItem.type === 'video' && (
                      <div className="aspect-video w-full rounded-lg overflow-hidden shadow-lg bg-black">
                        <iframe src={getEmbedUrl(viewingItem.content)} className="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      </div>
                    )}
                    {viewingItem.type === 'app-blueprints' && (
                      <BlueprintApp character={character} editable={editable} onSpendMp={(cost: number) => patchResource("mp", -cost)} />
                    )}
                  </div>

                  {(editable || isGm) && (
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
            {showTransferModal && editable && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowTransferModal(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative min-h-[440px] w-full max-w-md border border-primary/50 bg-zinc-950 p-6 py-8 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => setShowTransferModal(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                  <h4 className="mb-2 flex items-center gap-2 font-serif text-xl font-bold text-[#eee3cf]">
                    <UserPlus className="size-5 text-primary" /> Ceder
                  </h4>
                  <p className="text-sm text-muted-foreground mb-6">Selecione para qual jogador você deseja transferir o controle permanente desta ficha.</p>
                  <div className="space-y-2 mb-6">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Jogadores na Mesa</p>
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar-sepia">
                      {campaignMembers.map((m: any) => (
                        <button key={m.userId} onClick={() => setTransferUserId(m.userId)} className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${transferUserId === m.userId ? "border-primary bg-primary/20 text-white font-bold" : "border-white/10 bg-white/5 hover:border-primary/50"}`}>
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

          <AnimatePresence>
            {showArchiveConfirm && isGm && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowArchiveConfirm(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative w-full max-w-md border border-destructive/50 bg-zinc-950 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => setShowArchiveConfirm(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                  <h4 className="font-serif text-xl font-bold text-destructive mb-2 flex items-center gap-2">
                    <Archive className="size-5" /> Arquivar Personagem
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">Você está prestes a arquivar <strong>{character.name}</strong>.</p>
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive mb-6 leading-relaxed">
                    <strong>O que acontece agora?</strong><br />
                    - O jogador perderá o acesso a esta ficha permanentemente.<br />
                    - O personagem se transformará em um <strong>NPC</strong> e será guardado no seu <strong>Berçário</strong>.<br />
                    - Você poderá invocá-lo na mesa para combater ou interagir a qualquer momento.
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setShowArchiveConfirm(false)}>Cancelar</Button>
                    <Button onClick={() => { setArchiving(true); onArchive(character); }} disabled={archiving} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      {archiving ? <Loader2 className="size-4 animate-spin" /> : "Confirmar e Arquivar"}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showFrameGallery && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[320] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6" onClick={() => setShowFrameGallery(false)}>
                <motion.div variants={modalVariants} className="rpg-modal max-h-[92vh] w-full max-w-3xl overflow-y-auto border p-6 custom-scrollbar-sepia sm:p-8" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-6 flex items-start justify-between gap-5">
                    <h4 className="rpg-title text-2xl font-bold text-foreground sm:text-3xl">Galeria de Molduras</h4>
                    <button type="button" onClick={() => setShowFrameGallery(false)} className="rounded-sm p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Fechar galeria"><X className="size-6" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {PORTRAIT_FRAMES.map((frame) => {
                      const selected = (character.portraitFrame || "bronze") === frame.id
                      return (
                        <button key={frame.id} type="button" disabled={pending} onClick={() => void savePortraitFrame(frame.id)} className={`portrait-frame-option ${selected ? "is-selected" : ""}`} aria-pressed={selected}>
                          <CharacterPortrait src={character.avatarUrl} alt="" frame={frame.id} crop={character.portraitCrop} className="size-20 sm:size-24" sizes="96px" />
                          <span className="min-w-0 text-left">
                            <strong>{frame.name}</strong>
                            <small>{frame.detail}</small>
                          </span>
                          {selected && <Check className="portrait-frame-check size-5" />}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showLore && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden" onClick={() => setShowLore(false)}>
                <motion.div variants={modalVariants} className="rpg-paper relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden border-2 border-[#d4af37] text-[#3e2723]" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-between items-center p-5 border-b border-[#d4af37]/40 shrink-0 bg-black/5">
                    <h4 className="font-serif text-2xl font-bold flex items-center gap-3 text-[#5d4037]">
                      <ScrollText className="size-6" /> História do personagem
                    </h4>
                    <button onClick={() => setShowLore(false)} className="rounded-full p-2 hover:bg-black/10 transition-colors">
                      <X className="size-5 text-[#5d4037]" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar-sepia space-y-6">
                    <div>
                      <div className="text-sm font-sans font-bold uppercase tracking-widest text-[#8d6e63] mb-2 flex items-center gap-2"><BookOpenText className="size-4" /> Origem</div>
                      <div className="font-serif text-base leading-loose whitespace-pre-wrap">{character.origin || "Desconhecida"}</div>
                    </div>
                    <div className="w-full h-px bg-[#d4af37]/30" />
                    <div>
                      <div className="text-sm font-sans font-bold uppercase tracking-widest text-[#8d6e63] mb-2 flex items-center gap-2"><Shield className="size-4" /> Identidade</div>
                      <div className="font-serif text-base leading-loose whitespace-pre-wrap">{character.identity || "Nenhuma"}</div>
                    </div>
                    <div className="w-full h-px bg-[#d4af37]/30" />
                    <div>
                      <div className="text-sm font-sans font-bold uppercase tracking-widest text-[#8d6e63] mb-2 flex items-center gap-2"><Sparkles className="size-4" /> Tema</div>
                      <div className="font-serif text-lg leading-relaxed italic text-[#4e342e]">"{character.theme || "Nenhum"}"</div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </>,
        document.body
      )}

      {/* HEADER COMPACTO/EXPANDIDO DA FICHA */}
      <div className="relative z-50 flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="relative shrink-0">
            <CharacterPortrait
              src={character.avatarUrl}
              alt={`Retrato de ${character.name}`}
              frame={character.portraitFrame}
              crop={character.portraitCrop}
              className={`${isExpanded ? "size-[88px] sm:size-[104px]" : "size-[72px] sm:size-[80px]"} cursor-pointer transition-[width,height] duration-[480ms] ease-[cubic-bezier(.4,0,.2,1)]`}
              sizes="104px"
              role={isOwned ? "button" : undefined}
              tabIndex={isOwned ? 0 : undefined}
              title={isOwned ? "Editar retrato" : undefined}
              onClick={(event) => {
                event.stopPropagation()
                if (isOwned) setShowPortraitEditor(true)
                else changeExpanded(!isExpanded)
              }}
              onKeyDown={(event) => {
                if (isOwned && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault()
                  setShowPortraitEditor(true)
                }
              }}
            />
            {!isExpanded && editable && (
              <button type="button" onClick={(event) => { event.stopPropagation(); setShowFrameGallery(true) }} className="portrait-frame-trigger" title="Escolher moldura" aria-label="Escolher moldura do retrato">
                <SwatchBook className="size-4" />
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col items-start cursor-pointer" onClick={() => changeExpanded(!isExpanded)}>
            <div className="flex justify-between items-start w-full">
              <h3 className={`font-serif font-bold text-foreground leading-tight truncate transition-[font-size,line-height] duration-[480ms] ease-[cubic-bezier(.4,0,.2,1)] ${isExpanded ? "text-2xl sm:text-[26px] md:text-[28px]" : "text-[20px] sm:text-[22px] md:text-2xl"}`}>
                {character.name} <span className={`${isExpanded ? "text-primary text-sm sm:text-base md:text-lg" : "text-zinc-400 text-[12px] sm:text-[13px] md:text-sm"} whitespace-nowrap`}>(Nv. {charLevel})</span>
              </h3>
            </div>

            {!isExpanded ? (
              // VIEW COMPACTA
              <div className="flex flex-col gap-1 mt-1 w-full">
                <div className="font-sans w-full truncate text-[14px] leading-snug text-muted-foreground">
                  {[character.identity, character.origin].filter(Boolean).join(" · ") || "Aventureiro"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px] font-semibold tabular-nums">
                  <span><b className="text-[color:var(--hp)]">HP:</b> <strong className="text-foreground">{displayResources.hp}/{displayResources.maxHp}</strong></span>
                  <span><b className="text-[color:var(--mp)]">MP:</b> <strong className="text-foreground">{displayResources.mp}/{displayResources.maxMp}</strong></span>
                  <CharacterStatusBadges modifiers={(character.customModifiers || []) as Modifier[]} />
                </div>
              </div>
            ) : (
              // VIEW EXPANDIDA
              <>
                <div className="font-sans mt-0.5 line-clamp-2 w-full break-words text-sm leading-snug text-muted-foreground">
                  {[character.identity, character.origin].filter(Boolean).join(" · ") || "Aventureiro"}
                </div>
                <Button size="sm" variant="ghost" className="mt-1.5 h-8 shrink-0 px-3 text-xs uppercase tracking-widest text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={(e) => { e.stopPropagation(); setShowLore(true); }}>
                  <ScrollText className="mr-1.5 size-4 shrink-0" /> Ler História Completa
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <div className="flex items-center gap-1.5 bg-card px-2 py-1 rounded-full border border-border/60 shadow-sm">
              {editable && (
                <button type="button" disabled={pending} onClick={(e) => { e.stopPropagation(); patchZenit(-1); }} className="flex size-5 items-center justify-center rounded-full border border-border/60 bg-background hover:border-accent hover:bg-accent/10 hover:text-accent transition-colors disabled:opacity-40" aria-label="Diminuir Zenits">
                  <Minus className="size-3" />
                </button>
              )}
              <Coins className="size-3.5 text-accent" />
              {editingZenit ? (
                <input
                  ref={zenitInputRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={zenitDraft}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setZenitDraft(event.target.value)}
                  onBlur={commitZenitEdit}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === "Enter") event.currentTarget.blur()
                    if (event.key === "Escape") cancelZenitEdit()
                  }}
                  className="zenit-direct-input"
                  aria-label="Valor de Zenith"
                />
              ) : (
                <button key={currentZenit} type="button" disabled={!editable || pending} onClick={(event) => { event.stopPropagation(); beginZenitEdit() }} className="zenit-direct-value" title={editable ? "Clique para editar" : undefined}>
                  {currentZenit} <span>z</span>
                </button>
              )}
              {editable && (
                <button type="button" disabled={pending} onClick={(e) => { e.stopPropagation(); patchZenit(1); }} className="flex size-5 items-center justify-center rounded-full border border-border/60 bg-background hover:border-accent hover:bg-accent/10 hover:text-accent transition-colors disabled:opacity-40" aria-label="Aumentar Zenits">
                  <Plus className="size-3" />
                </button>
              )}
            </div>
            <button onClick={() => changeExpanded(!isExpanded)} className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground">
              <ChevronDown className={`size-5 transition-transform duration-300 ${isExpanded ? "rotate-180 text-primary" : ""}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            {editable && (
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm font-semibold border-primary/40 text-primary hover:bg-primary/10 transition-colors" onClick={() => setShowTransferModal(true)}>
                <UserPlus className="mr-1.5 size-4" /> Ceder
              </Button>
            )}
            {isGm && onArchive && (
              <Button size="sm" variant="outline" className="rpg-archive-button h-9 px-4 text-sm font-semibold transition-colors" onClick={() => setShowArchiveConfirm(true)}>
                <Archive className="mr-1.5 size-4" /> Arquivar
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rpg-character-expansion" data-open={expansionVisible} aria-hidden={!expansionVisible}>
        <div className="rpg-character-expansion-clip">
          {(expandedContentMounted || isExpanded) && <div className="relative z-40">
            <div className="pt-4 mt-2 border-t border-white/10">
              
              {/* ABAS */}
              <div className="rpg-tabs relative z-50 mb-5 grid h-11 w-full grid-cols-3 p-1">
                <button onClick={() => setSheetTab('main')} className={`rpg-tab-button flex h-9 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs leading-none whitespace-nowrap transition-colors ${sheetTab === 'main' ? 'is-active font-bold' : 'text-muted-foreground'}`}>Principal</button>
                <button onClick={() => setSheetTab('checks')} className={`rpg-tab-button flex h-9 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs leading-none whitespace-nowrap transition-colors ${sheetTab === 'checks' ? 'is-active font-bold' : 'text-muted-foreground'}`}><span className="truncate">Testes e Perícias</span></button>
                <button onClick={() => setSheetTab('modifiers')} className={`rpg-tab-button relative flex h-9 min-w-0 items-center justify-center rounded-md px-7 text-xs leading-none whitespace-nowrap transition-colors ${sheetTab === 'modifiers' ? 'is-active font-bold' : 'text-muted-foreground'}`}>
                  <span className="truncate">Condições</span>{sheetTab !== 'modifiers' && (character as any).customModifiers?.length > 0 && <span className="condition-count absolute right-2 flex size-5 items-center justify-center rounded-full text-[10px] font-bold leading-none">{(character as any).customModifiers.length}</span>}
                </button>
              </div>

              {/* CONTEÚDO DAS ABAS */}
              {sheetTab === 'main' && (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <div className="rounded-sm border border-border/40 bg-black/35 p-3 shadow-inner sm:p-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">Experiência (XP)</p>
                      <p className="text-xs sm:text-sm text-primary font-mono font-bold">{currentLevelXp} / {xpRequired}</p>
                    </div>
                    <div className="rpg-resource-track mb-3 h-1.5 w-full overflow-hidden bg-zinc-800/80 sm:mb-4 sm:h-2">
                      <div className="rpg-resource-fill h-1.5 bg-primary transition-all duration-500 ease-out sm:h-2" style={{ width: `${(currentLevelXp / xpRequired) * 100}%` }}></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(unspentPoints > 0 || isGm) ? (
                        <Button size="sm" variant="default" disabled={!editable && !isGm} className="h-8 text-xs animate-pulse bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 shrink-0" onClick={() => setShowLevelUp(true)}>
                          <TrendingUp className="size-3.5 mr-1.5" /> Classes {unspentPoints > 0 ? `(${unspentPoints})` : "(Mestre)"}
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
                    {ATTR_KEYS.map((k: AttributeKey) => {
                      const isRolling = rollingAttr === k
                      const canUpgradeAttribute = editable && unspentAttrPoints > 0 && character.attributes[k] !== "d12"

                      return (
                        <div key={k} className="relative">
                          <button disabled={!editable || isRolling} onClick={() => rollDice(k, character.attributes[k])} className={`attribute-roll-button h-20 w-full rounded-sm border text-center shadow-inner ${isRolling ? "is-rolling border-primary bg-primary/20" : editable ? "border-border/60 bg-card/40 hover:border-primary/60 hover:bg-card" : "cursor-default border-border/60 bg-card/40"}`}>
                            {isRolling ? (
                              <Dices className="attribute-rolling-die mx-auto size-7 text-primary" />
                            ) : (
                              <>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{ATTRIBUTE_META[k].short}</p>
                                <p className="font-serif text-xl font-black text-primary drop-shadow-sm sm:text-2xl">{character.attributes[k]}</p>
                              </>
                            )}
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

                  {/* BARRAS DE RECURSOS E CONTROLE MANUAL DO MESTRE */}
                  <div className="mt-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <ResourceBar label="Vida" short="HP" icon={<Heart className="size-4" />} current={displayResources.hp} max={displayResources.maxHp} colorVar="--hp" editable={editable} onChange={(d) => patchResource("hp", d)} />
                      </div>
                      {isGm && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => patchResource("maxHp", 1)} className="flex items-center justify-center size-5 bg-background border border-border/60 rounded hover:border-[color:var(--hp)] hover:text-[color:var(--hp)] transition-colors" title="Aumentar Vida Máxima Manualmente">+</button>
                          <button onClick={() => patchResource("maxHp", -1)} className="flex items-center justify-center size-5 bg-background border border-border/60 rounded hover:border-[color:var(--hp)] hover:text-[color:var(--hp)] transition-colors" title="Diminuir Vida Máxima Manualmente">-</button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <ResourceBar label="Mente" short="MP" icon={<WandSparkles className="size-4" />} current={displayResources.mp} max={displayResources.maxMp} colorVar="--mp" editable={editable} onChange={(d) => patchResource("mp", d)} />
                      </div>
                      {isGm && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => patchResource("maxMp", 1)} className="flex items-center justify-center size-5 bg-background border border-border/60 rounded hover:border-[color:var(--mp)] hover:text-[color:var(--mp)] transition-colors" title="Aumentar Mana Máxima Manualmente">+</button>
                          <button onClick={() => patchResource("maxMp", -1)} className="flex items-center justify-center size-5 bg-background border border-border/60 rounded hover:border-[color:var(--mp)] hover:text-[color:var(--mp)] transition-colors" title="Diminuir Mana Máxima Manualmente">-</button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <ResourceBar label="Inventario" short="IP" icon={<Backpack className="size-4" />} current={displayResources.ip} max={displayResources.maxIp} colorVar="--ip" editable={editable} onChange={(d) => patchResource("ip", d)} />
                      </div>
                      {isGm && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => patchResource("maxIp", 1)} className="flex items-center justify-center size-5 bg-background border border-border/60 rounded hover:border-[color:var(--ip)] hover:text-[color:var(--ip)] transition-colors" title="Aumentar IP Máximo Manualmente">+</button>
                          <button onClick={() => patchResource("maxIp", -1)} className="flex items-center justify-center size-5 bg-background border border-border/60 rounded hover:border-[color:var(--ip)] hover:text-[color:var(--ip)] transition-colors" title="Diminuir IP Máximo Manualmente">-</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-5">
                    {/* FABULA */}
                    <div className="flex-1 min-w-[140px] flex items-center justify-between rounded-lg border border-[color:var(--fp)]/30 bg-[color:var(--fp)]/5 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--fp)]"><Sparkles className="size-3.5" /> Fabula</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {editable && <button onClick={() => patchResource("fp", -1)} className="flex size-5 items-center justify-center rounded border border-border/60 bg-background hover:border-[color:var(--fp)] hover:bg-[color:var(--fp)]/10 transition-colors"><Minus className="size-3" /></button>}
                        <span className="w-5 text-center font-mono text-sm font-bold text-[color:var(--fp)]">{displayResources.fp}</span>
                        {editable && <button onClick={() => patchResource("fp", 1)} className="flex size-5 items-center justify-center rounded border border-border/60 bg-background hover:border-[color:var(--fp)] hover:bg-[color:var(--fp)]/10 transition-colors"><Plus className="size-3" /></button>}
                      </div>
                    </div>
                    
                    {/* PONTOS DE LORE */}
                    <div className="flex-1 min-w-[140px] flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-purple-400"><BookOpen className="size-3.5" /> Lore</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isGm && <button onClick={() => patchResource("lp", -1)} className="flex size-5 items-center justify-center rounded border border-border/60 bg-background hover:border-purple-400 hover:bg-purple-400/10 transition-colors"><Minus className="size-3 text-purple-400" /></button>}
                        <span className="w-5 text-center font-mono text-sm font-bold text-purple-400">{(displayResources as any).lp || 0}</span>
                        {isGm && <button onClick={() => patchResource("lp", 1)} className="flex size-5 items-center justify-center rounded border border-border/60 bg-background hover:border-purple-400 hover:bg-purple-400/10 transition-colors"><Plus className="size-3 text-purple-400" /></button>}
                      </div>
                    </div>

                    <div className="flex-1 min-w-[140px] flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-auto py-2.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/20 hover:border-primary/50 transition-colors" onClick={() => setShowInventory(true)}>
                        <Package className="size-4 mr-2 shrink-0" /> <span className="text-[#eee3cf]">Mochila</span>
                      </Button>

                      <Button variant="outline" size="sm" className="flex-1 h-auto py-2.5 border-accent/30 bg-accent/5 text-accent hover:bg-accent/20 hover:border-accent/50 transition-colors" onClick={() => setShowStore(true)}>
                        <Store className="size-4 mr-2 shrink-0" /> <span className="text-[#eee3cf]">Loja</span>
                      </Button>
                    </div>
                  </div>

                  <div className="mt-8 pt-5 border-t border-border/30">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Habilidades de Classe Ativas</p>
                    <div className="flex flex-col gap-2">
                      {Object.entries(skillsObj).map(([skillId, lvl]) => {
                        const classMatch = CLASSES.find(c => c.skills.some(s => s.id === skillId))
                        const skill = classMatch?.skills.find(s => s.id === skillId)
                        if (!skill || lvl === 0) return null

                        const isExpanded = expandedSkillId === skill.id;

                        return (
                          <div key={skill.id} className={`overflow-hidden rounded-sm border-l-2 transition-colors shadow-sm ${isExpanded ? 'border-primary bg-primary/10' : 'border-primary/40 bg-primary/5 hover:border-primary/70'}`}>
                            <button
                              onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                              className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold transition-colors ${isExpanded ? 'text-primary' : 'text-foreground'}`}>{skill.name}</span>
                                <span className="opacity-70 font-mono ml-1 text-[10px] text-muted-foreground bg-black/40 px-1.5 py-0.5 rounded">Nv. {lvl as React.ReactNode}</span>
                              </div>
                              <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-300 ${isExpanded ? "rotate-180 text-primary" : ""}`} />
                            </button>

                            <div className="rpg-skill-expansion" data-open={isExpanded} aria-hidden={!isExpanded}>
                              <div className="rpg-skill-expansion-clip">
                                  <div className="px-3 pb-3 pt-1 border-t border-primary/10 mt-1">
                                    <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                      {formatSkillDescription(skill.description, lvl as number)}
                                    </div>
                                    {skill.action && editable && (
                                      <div className="mt-3 flex justify-end">
                                        <Button size="sm" onClick={() => useSkill(skill)} className="gap-1.5 text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                                          <Zap className="size-3" /> Usar (-{skill.action.cost} {skill.action.resource.toUpperCase()})
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                              </div>
                            </div>
                          </div>
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
                <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/10 shadow-inner">
                    <div>
                      <h3 className="text-sm font-bold text-primary flex items-center gap-2">Condições e Modificadores</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Efeitos, buffs e debuffs ativos.</p>
                    </div>
                    {isGm && (
                      <Button size="sm" onClick={() => {
                        setEditingModId("new");
                        setModDraft({ id: Math.random().toString(36).substring(7), name: "", target: "all", value: 1 });
                      }}>
                        <Plus className="size-4 mr-1" /> Nova Condição
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {(character as any).customModifiers?.map((mod: any) => (
                      <div key={mod.id} className="p-3 bg-card/40 border border-border/50 rounded-lg">
                        {editingModId === mod.id && isGm ? (
                          <div className="flex flex-col gap-2">
                            <input className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50" value={modDraft.name} onChange={e => setModDraft({...modDraft, name: e.target.value})} placeholder="Nome da condição" />
                            <div className="flex gap-2">
                              {/* SELECT RESTAURADO PARA EDIÇÃO */}
                              <select className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-foreground w-1/2 focus:outline-none focus:border-primary/50" value={modDraft.target} onChange={e => setModDraft({...modDraft, target: e.target.value})}>
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
                              <input type="number" className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-foreground w-1/2 focus:outline-none focus:border-primary/50" value={modDraft.value} onChange={e => setModDraft({...modDraft, value: Number(e.target.value)})} placeholder="Valor (+ ou -)" />
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditingModId(null)}>Cancelar</Button>
                              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                                const newMods = (character as any).customModifiers.map((m: any) => m.id === mod.id ? modDraft : m);
                                updateModifiers(newMods);
                                setEditingModId(null);
                              }}>Salvar Edição</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center gap-2">
                            <div>
                              <p className="font-bold text-foreground text-sm flex items-center gap-2">
                                {mod.value > 0 ? <TrendingUp className="size-3 text-green-400" /> : <TrendingDown className="size-3 text-red-400" />} {mod.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Alvo: {mod.target} <span className="mx-1">•</span> Bônus: {mod.value > 0 ? `+${mod.value}` : mod.value}</p>
                            </div>
                            <div className="flex gap-2 items-center shrink-0">
                              {!isGm && ((displayResources as any).lp || 0) > 0 && editable && (
                                <Button size="sm" variant="outline" className="h-8 border-purple-500/50 text-purple-400 hover:bg-purple-500/20" onClick={() => {
                                  if (confirm(`Gastar 1 Ponto de Lore (LP) para melhorar a condição "${mod.name}" em +1?`)) {
                                    patchResource("lp", -1);
                                    const newMods = (character as any).customModifiers.map((m: any) => m.id === mod.id ? { ...m, value: m.value + 1 } : m);
                                    updateModifiers(newMods);
                                  }
                                }}>
                                  <BookOpen className="size-3 mr-1.5" /> Melhorar (+1)
                                </Button>
                              )}
                              {isGm && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-white" onClick={() => { setEditingModId(mod.id); setModDraft(mod); }}><Pencil className="size-4" /></Button>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/20 hover:text-destructive" onClick={() => {
                                    if (confirm("Remover condição?")) {
                                      updateModifiers((character as any).customModifiers.filter((m: any) => m.id !== mod.id));
                                    }
                                  }}><Trash2 className="size-4" /></Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {editingModId === "new" && isGm && (
                      <div className="p-3 bg-card/40 border border-primary/50 rounded-lg mt-2 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                        <div className="flex flex-col gap-2">
                          <input className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50" value={modDraft.name} onChange={e => setModDraft({...modDraft, name: e.target.value})} placeholder="Nome da condição" />
                          <div className="flex gap-2">
                              {/* SELECT RESTAURADO PARA CRIAÇÃO */}
                              <select className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-foreground w-1/2 focus:outline-none focus:border-primary/50" value={modDraft.target} onChange={e => setModDraft({...modDraft, target: e.target.value})}>
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
                            <input type="number" className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-foreground w-1/2 focus:outline-none focus:border-primary/50" value={modDraft.value} onChange={e => setModDraft({...modDraft, value: Number(e.target.value)})} placeholder="Valor (+ ou -)" />
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditingModId(null)}>Cancelar</Button>
                            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                              const newMods = [...((character as any).customModifiers || []), modDraft];
                              updateModifiers(newMods);
                              setEditingModId(null);
                            }}>Adicionar Condição</Button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {!(character as any).customModifiers?.length && editingModId !== "new" && (
                      <p className="text-xs text-muted-foreground text-center italic py-4">Nenhuma condição ativa no momento.</p>
                    )}
                  </div>
                </div>
              )}

              {isGm && onKill && displayResources.hp <= 0 && (
                <div className="mt-6 pt-5 border-t border-destructive/50">
                  <Button
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2 h-12 text-lg font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)] animate-pulse"
                    onClick={() => onKill(character)}
                  >
                    <Skull className="size-5" /> Confirmar Morte e Recolher Loots
                  </Button>
                </div>
              )}

            </div>
          </div>}
        </div>
      </div>

    </div>
  )
}
