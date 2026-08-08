"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

import { apiFetch } from "@/lib/client"
import { useRealtime } from "@/lib/use-realtime"
import { CharacterCreator } from "@/components/character-creator"
import { Button } from "@/components/ui/button"

// IMPORTAÇÕES DO COMPONENTE DE FICHAS (Tudo consolidado!)
import {
  CharacterSheet,
  CreatureSheet,
  NPCCreator,
  type NPCDraft // Interface importada para não dar conflito
} from "@/components/character-sheet"

import {
  EQUIPMENT,
  BESTIARY,
  getEquipment,
} from "@/lib/game-data"

import type { Character, Role, Creature, ActiveCreature, AttributeKey, ActivePoll, DieSize, ClassLevel } from "@/lib/types"

import {
  ArrowLeft, Crown, Plus, Radio, Shield, Users, DoorOpen, Dices, Gift, X,
  Send, Skull, Target, Heart, Zap, Package, Info, Loader2, Store, Coins,
  Inbox, Sun, CloudRain, CloudSnow, CloudFog, Cloud, SunMedium, Grid3X3,
  BarChart2, Clock, Trash2, CheckCircle2, Save, UserPlus, Mic, RefreshCw,
  Clapperboard, Search, Pencil
} from "lucide-react"

import { GameMap, TileData } from "@/lib/map-types"
import { MapImporter } from "./map-importer"
import { BattlemapEngine } from "./battlemap-engine"

import { Soundpad, ActiveSound } from "./soundpad"
import { CutsceneManager } from "./cutscene-manager"
import { CutscenePlayer } from "./cutscene-player"
import type { Cutscene } from "./cutscene-types"

// ==========================================
// TIPAGENS & CONSTANTES GLOBAIS DA SALA
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
interface DroppedLoot { uid: string; itemId: string; sourceName: string; }

export interface CustomItem {
  id: string;
  name: string;
  type: "text" | "image" | "video" | "app-blueprints";
  content: string;
}

type WeatherType = "clear" | "sunny" | "cloudy" | "fog" | "rain" | "blizzard"

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

// ==========================================
// COMPONENTE DE CLIMA
// ==========================================
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

// ==========================================
// CAMPAIGN ROOM PRINCIPAL
// ==========================================
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
  const [hoveredCreature, setHoveredCreature] = useState<any | null>(null)
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
        const uniqueMaps = Array.from(new Map((res.maps || []).map(m => [m.id, m])).values());
        setSavedMaps(uniqueMaps);
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(uniqueMaps));
      })
      .catch(() => { })
  }, [data.campaign.id])

  // Sincroniza savedMaps localmente se houver edição
  const syncMapsToStorage = useCallback((maps: GameMap[]) => {
    const uniqueMaps = Array.from(new Map(maps.map(m => [m.id, m])).values());
    setSavedMaps(uniqueMaps);
    localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(uniqueMaps));
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
        if (prev.some(m => m.id === event.map.id)) return prev;
        const next = [...prev, event.map];
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(next));
        return next;
      });
      return;
    }

    // Mapa Renomeado
    // Mapa Renomeado
    if (event.type === "map:renamed") {
      setSavedMaps(prev => {
        const next = prev.map(m => m.id === event.mapId ? { ...m, name: event.name } : m);
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(next));
        return next;
      });

      // Correção do TypeScript: Garantindo que prev não é nulo antes do spread
      setActiveMap(prev => {
        if (prev && prev.id === event.mapId) {
          return { ...prev, name: event.name };
        }
        return prev;
      });
      return;
    }

    // Mapa Apagado
    if (event.type === "map:deleted") {
      setSavedMaps(prev => {
        const next = prev.filter(m => m.id !== event.mapId);
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(next));
        return next;
      });
      setActiveMap(prev => prev?.id === event.mapId ? null : prev);
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
        return;
      }

      if (attr.startsWith("SYNC_ITEM_GIVEN")) {
        try {
          const payload = JSON.parse(String(event.result));
          setCharacters((prev) => prev.map(c => c.id === payload.charId ? payload.character : c));

          if (payload.character.ownerId === data.me.id) {
            setItemNotification(payload.itemName);
            setInventoryToOpen(payload.charId);
            setTimeout(() => setItemNotification(null), 8000);
          }
        } catch (e) {
          console.error("Falha ao sincronizar item", e);
        }
        return;
      }

      if (attr.startsWith("SYNC_CUTSCENE:")) {
        const action = attr.split(":")[1];

        if (action === "PLAY") {
          try {
            const c = JSON.parse(String(event.result));
            setActiveCutscene(c);
            setActiveSceneIndex(0);
          } catch (e) {
            console.error("Falha ao abrir cutscene", e);
          }
        } else if (action === "STOP") {
          setActiveCutscene(null);
        } else if (action === "SCENE") {
          setActiveSceneIndex(Number(event.result));
        }
        return;
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

    syncMapsToStorage([...savedMaps, newMap]);

    await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
      method: "POST", body: JSON.stringify({ action: "create", map: newMap })
    })
  }

  async function handleRenameMap(mapId: string, currentName: string) {
    const newName = window.prompt("Digite o novo nome para o mapa:", currentName);
    if (!newName || newName.trim() === "" || newName === currentName) return;

    const trimmedName = newName.trim();

    // Atualiza localmente
    const updatedMaps = savedMaps.map(m => m.id === mapId ? { ...m, name: trimmedName } : m);
    syncMapsToStorage(updatedMaps);

    // Correção do TypeScript: Se o mapa ativo for este, atualiza o nome dele também
    setActiveMap(prev => {
      if (prev && prev.id === mapId) {
        return { ...prev, name: trimmedName };
      }
      return prev;
    });

    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
        method: "POST", body: JSON.stringify({ action: "rename", mapId, name: trimmedName })
      });
    } catch (err) {
      console.error("Erro ao renomear mapa", err);
      // Se der erro reverte (opcional, ou apenas exibe alerta)
      alert("Falha ao renomear mapa.");
    }
  }

  async function handleDeleteMap(mapId: string) {
    if (!confirm("Tem certeza que deseja deletar este mapa? Ele será removido para todos.")) return;

    if (activeMap?.id === mapId) {
      setActiveMap(null);
    }

    const nextMaps = savedMaps.filter(m => m.id !== mapId);
    syncMapsToStorage(nextMaps);

    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
        method: "POST", body: JSON.stringify({ action: "delete", mapId })
      });
    } catch (err) {
      console.error("Erro ao deletar mapa", err);
    }
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

          applyOptimistic({ ...updated, customItems: updatedCustomItems } as any);
          setCustomItemName("")
          setCustomItemContent("")

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
                            {["dex", "ins", "mig", "wlp"].map((k: any) => (
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
                    {Array.from(new Map(savedMaps.map(m => [m.id, m])).values()).map(m => (
                      <div key={m.id} className="flex gap-2 w-full">
                        <Button size="sm" variant="outline" className="flex-1 justify-start text-xs border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300 overflow-hidden text-left" onClick={() => setActiveMap(m)}>
                          <Grid3X3 className="size-3 mr-2 shrink-0" /> <span className="truncate">{m.name}</span>
                        </Button>
                        <Button size="sm" variant="outline" className="w-9 px-0 shrink-0 border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={() => handleRenameMap(m.id, m.name)} title="Renomear mapa">
                          <Pencil className="size-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="w-9 px-0 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteMap(m.id)} title="Deletar mapa">
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
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