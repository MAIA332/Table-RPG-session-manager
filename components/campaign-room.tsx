"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

import { apiFetch } from "@/lib/client"
import { useRealtime } from "@/lib/use-realtime"
import { CharacterCreator } from "@/components/character-creator"
import { Button } from "@/components/ui/button"
import { CharacterPortrait } from "@/components/character-portrait"
import { DiceRollPresentation, HandRaisePresentation, formatRollLabel, getDiceFromLabel, type DicePresentation, type DiceRollDetails, type HandPresentation } from "@/components/session-effects"

// COMPONENTES ISOLADOS DO MESTRE
import { GmBestiary } from "./gm-bestiary"
import { GmPanel } from "./gm-panel"

// IMPORTAÇÕES DO COMPONENTE DE FICHAS
import {
  CharacterSheet,
  CreatureSheet,
  NPCCreator,
  type NPCDraft
} from "@/components/character-sheet"

import { NpcNursery } from "./npc-nursery"

import {
  EQUIPMENT,
  BESTIARY,
  getEquipment,
} from "@/lib/game-data"

import type { Character, Role, Creature, ActiveCreature, AttributeKey, ActivePoll, DieSize, ClassLevel } from "@/lib/types"

import {
  ArrowLeft, Crown, Plus, Radio, Shield, Users, DoorOpen, Dices, Gift, X,
  Send, Skull, Target, Heart, Zap, Package, Info, Loader2, Store, Coins,
  Inbox, Sun, CloudSun, CloudRainWind, CloudSnow, Cloudy, CloudFog, Sparkles, Grid3X3,
  BarChart2, Clock, Trash2, CheckCircle2, Save, UserPlus, Mic, RefreshCw,
  Clapperboard, Search, Pencil, Eye, Image as ImageIcon, ChevronDown,
  Hand, Volume2, Speaker, BookOpen
} from "lucide-react"

import { GameMap, TileData } from "@/lib/map-types"
import { MapImporter } from "./map-importer"
import { BattlemapEngine } from "./battlemap-engine"

import { Soundpad, ActiveSound, type Track } from "./soundpad"
import { CutsceneManager } from "./cutscene-manager"
import { CutscenePlayer } from "./cutscene-player"
import type { Cutscene } from "./cutscene-types"

import { Imagepad, SharedImage } from "./imagepad"
import { Lorebook, type LoreEntry } from "./lorebook"
import { ThemeSwitcher } from "./theme-switcher"
import { PersonalNotes } from "./personal-notes"

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
let handRaiseAudioContext: AudioContext | null = null

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function storeJsonWhenIdle(key: string, value: unknown) {
  if (typeof window === "undefined") return
  const write = () => localStorage.setItem(key, JSON.stringify(value))
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(write, { timeout: 800 })
  else window.setTimeout(write, 0)
}

function getHandRaiseAudioContext() {
  if (typeof window === "undefined") return null
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextClass) return null
  if (!handRaiseAudioContext) handRaiseAudioContext = new AudioContextClass()
  return handRaiseAudioContext
}

function playHandRaiseSound(volume = 1) {
  const ctx = getHandRaiseAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
  const safeVolume = clampVolume(volume)
  if (safeVolume <= 0) return
  const now = ctx.currentTime

  const playNote = (start: number, frequency: number, duration: number, peak: number) => {
    const osc = ctx.createOscillator()
    const harmonic = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    osc.type = "triangle"
    harmonic.type = "sine"
    filter.type = "lowpass"
    filter.frequency.setValueAtTime(3600, start)
    osc.frequency.setValueAtTime(frequency, start)
    harmonic.frequency.setValueAtTime(frequency * 2, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak * safeVolume, start + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(filter)
    harmonic.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    harmonic.start(start)
    osc.stop(start + duration + 0.02)
    harmonic.stop(start + duration + 0.02)
  }

  playNote(now, 880, 0.16, 0.18)
  playNote(now + 0.14, 1174.66, 0.22, 0.15)
}

function playDiceRollSound(volume = 1) {
  const ctx = getHandRaiseAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
  const safeVolume = clampVolume(volume)
  if (safeVolume <= 0) return
  const now = ctx.currentTime
  const duration = 0.9
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
  const data = buffer.getChannelData(0)

  for (let index = 0; index < data.length; index += 1) {
    const progress = index / data.length
    const tumble = 0.3 + Math.abs(Math.sin(progress * 42)) * 0.7
    data[index] = (Math.random() * 2 - 1) * tumble * Math.pow(1 - progress, 0.7)
  }

  const source = ctx.createBufferSource()
  const highpass = ctx.createBiquadFilter()
  const lowpass = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  highpass.type = "highpass"
  highpass.frequency.setValueAtTime(180, now)
  lowpass.type = "lowpass"
  lowpass.frequency.setValueAtTime(2600, now)
  lowpass.frequency.exponentialRampToValueAtTime(850, now + duration)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.15 * safeVolume, now + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  source.buffer = buffer
  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(ctx.destination)
  source.start(now)

    ;[0.08, 0.2, 0.34, 0.51, 0.67, 0.8].forEach((offset, index) => {
      const click = ctx.createOscillator()
      const clickGain = ctx.createGain()
      click.type = "triangle"
      click.frequency.setValueAtTime(230 - index * 18, now + offset)
      clickGain.gain.setValueAtTime(0.0001, now + offset)
      clickGain.gain.exponentialRampToValueAtTime((0.075 - index * 0.007) * safeVolume, now + offset + 0.006)
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.055)
      click.connect(clickGain)
      clickGain.connect(ctx.destination)
      click.start(now + offset)
      click.stop(now + offset + 0.06)
    })
}

// ==========================================
// COMPONENTE DE CLIMA
// ==========================================
const rainParticles = Array.from({ length: 96 }, (_, index) => ({
  left: (index * 37 + 11) % 101,
  delay: -((index * 19) % 90) / 18,
  duration: 0.48 + ((index * 7) % 24) / 100,
  opacity: 0.28 + ((index * 13) % 50) / 100,
}))

const snowParticles = Array.from({ length: 136 }, (_, index) => ({
  left: (index * 43 + 7) % 101,
  delay: -((index * 23) % 140) / 20,
  duration: 3.2 + ((index * 11) % 28) / 10,
  size: 3 + ((index * 5) % 7),
  drift: -18 + ((index * 17) % 37),
}))

const WeatherOverlay = ({ weather, effectsVolume }: { weather: WeatherType; effectsVolume: number }) => {
  useEffect(() => {
    if (weather === "clear") return

    const audioUrls: Record<string, string> = {
      rain: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/rain.mp3",
      blizzard: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/wind.mp3",
      sunny: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/ambiences/outdoor.mp3",
      cloudy: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/wind.mp3",
      fog: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/ambiences/cave.mp3"
    }

    const url = audioUrls[weather]
    if (!url) return

    const audio = new Audio(url)
    audio.loop = true
    audio.preload = "auto"
    const weatherLevel = weather === "rain" || weather === "blizzard" ? 0.22 : 0.14
    audio.volume = clampVolume(effectsVolume) * weatherLevel
    void audio.play().catch(() => undefined)

    return () => {
      audio.pause()
      audio.src = ""
    }
  }, [effectsVolume, weather])

  return (
    <div className="weather-screen" data-weather={weather} aria-hidden="true">
      <div className="weather-color-grade" />

      {weather === "sunny" && (
        <>
          <div className="weather-sunlight">
            {Array.from({ length: 5 }, (_, index) => <span key={index} style={{ animationDelay: `${index * -1.3}s` }} />)}
          </div>
          <div className="weather-dust-field">
            {Array.from({ length: 18 }, (_, index) => <span key={index} style={{ left: `${(index * 31 + 9) % 100}%`, top: `${(index * 47 + 13) % 92}%`, animationDelay: `${index * -0.7}s`, animationDuration: `${7 + (index % 6)}s` }} />)}
          </div>
        </>
      )}

      {weather === "cloudy" && (
        <div className="weather-cloud-field">
          {Array.from({ length: 5 }, (_, index) => <span key={index} style={{ top: `${8 + index * 18}%`, animationDelay: `${index * -7}s`, animationDuration: `${34 + index * 4}s` }} />)}
        </div>
      )}

      {weather === "fog" && (
        <div className="weather-fog-field">
          {Array.from({ length: 7 }, (_, index) => <span key={index} style={{ top: `${index * 15 - 8}%`, animationDelay: `${index * -2.1}s`, animationDuration: `${11 + index * 1.4}s` }} />)}
        </div>
      )}

      {weather === "rain" && (
        <>
          <div className="weather-cloud-field is-storm">
            {Array.from({ length: 4 }, (_, index) => <span key={index} style={{ top: `${-2 + index * 11}%`, animationDelay: `${index * -11}s`, animationDuration: `${38 + index * 5}s` }} />)}
          </div>
          <div className="weather-rain-field">
            {rainParticles.map((particle, index) => <span key={index} style={{ left: `${particle.left}%`, opacity: particle.opacity, animationDelay: `${particle.delay}s`, animationDuration: `${particle.duration}s` }} />)}
            <i className="weather-lightning" />
          </div>
        </>
      )}

      {weather === "blizzard" && (
        <>
          <div className="weather-wind-field">
            {Array.from({ length: 10 }, (_, index) => <span key={index} style={{ top: `${5 + index * 10}%`, animationDelay: `${index * -0.9}s`, animationDuration: `${2.7 + (index % 4) * 0.5}s` }} />)}
          </div>
          <div className="weather-snow-field">
            {snowParticles.map((particle, index) => <span key={index} style={{ left: `${particle.left}%`, width: particle.size, height: particle.size, animationDelay: `${particle.delay}s`, animationDuration: `${particle.duration}s`, "--weather-drift": `${particle.drift}vw` } as any} />)}
          </div>
        </>
      )}
      <div className="weather-vignette" />
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
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [activeMap, setActiveMap] = useState<GameMap | null>(null)
  const [showMapImporter, setShowMapImporter] = useState(false)
  const [showBattleGrid, setShowBattleGrid] = useState(false)
  const [showPlayerMaps, setShowPlayerMaps] = useState(false)

  // Clima
  const [weather, setWeather] = useState<WeatherType>("clear")

  // Painel de Loot (GmPanel)
  const [showGmPanel, setShowGmPanel] = useState(false)

  // Criador de Itens Úteis (Handouts)
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
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<string | null>(null)

  // Bestiário
  const [showBestiary, setShowBestiary] = useState(false)
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
  const [customSounds, setCustomSounds] = useState<Track[]>([])
  const [showVolumeMixer, setShowVolumeMixer] = useState(false)
  const [effectsVolume, setEffectsVolume] = useState(0.75)
  const [handRaiseCooldown, setHandRaiseCooldown] = useState(false)
  const [dicePresentations, setDicePresentations] = useState<DicePresentation[]>([])
  const [handPresentation, setHandPresentation] = useState<HandPresentation | null>(null)
  const volumeMixerRef = useRef<HTMLDivElement | null>(null)
  const mapsLoadedFromApiRef = useRef(false)
  const campaignStateLoadedFromApiRef = useRef(false)
  const campaignStateSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const lastActiveMapIdRef = useRef<string | null>(null)

  // === CUTSCENES STATES ===
  const [showCutsceneManager, setShowCutsceneManager] = useState(false)
  const [cutscenes, setCutscenes] = useState<Cutscene[]>([])
  const [activeCutscene, setActiveCutscene] = useState<Cutscene | null>(null)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)

  // === GALERIA ARCANA ===
  const [showImagepad, setShowImagepad] = useState(false)
  const [activeFullscreenImage, setActiveFullscreenImage] = useState<string | null>(null)
  const [galleryImages, setGalleryImages] = useState<SharedImage[]>([])

  // === LOREBOOK ===
  const [showLorebook, setShowLorebook] = useState(false)
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([])

  // === CUSTOM DATA ===
  const [customCreatures, setCustomCreatures] = useState<Creature[]>([])
  const [customEquipment, setCustomEquipment] = useState<any[]>([])
  const [customClasses, setCustomClasses] = useState<any[]>([])

  const isGm = data.role === "gm"
  const effectsVolumeRef = useRef(effectsVolume)
  const isGmRef = useRef(isGm)

  useEffect(() => {
    effectsVolumeRef.current = effectsVolume
  }, [effectsVolume])

  useEffect(() => {
    isGmRef.current = isGm
  }, [isGm])

  const persistCampaignState = useCallback((state: Record<string, unknown>) => {
    if (!isGm) return Promise.resolve()
    const request = campaignStateSaveQueueRef.current
      .catch(() => undefined)
      .then(() => apiFetch(`/api/campaigns/${data.campaign.id}/state`, {
        method: "POST",
        body: JSON.stringify({ state })
      }))
    campaignStateSaveQueueRef.current = request
    request.catch(console.error)
    return request
  }, [data.campaign.id, isGm])

  // Montagem & Carregar Storage
  useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      lastActiveMapIdRef.current = localStorage.getItem(`last_active_map_${data.campaign.id}`)
      const loadStoredState = () => {
        if (!campaignStateLoadedFromApiRef.current) {
          const savedCustomCreatures = localStorage.getItem(`custom_creatures_${data.campaign.id}`)
          if (savedCustomCreatures) { try { setCustomCreatures(JSON.parse(savedCustomCreatures)) } catch (e) { } }

          const savedCustomClasses = localStorage.getItem(`custom_classes_${data.campaign.id}`)
          if (savedCustomClasses) { try { setCustomClasses(JSON.parse(savedCustomClasses)) } catch (e) { } }

          const savedCustomEquipment = localStorage.getItem(`custom_equipment_${data.campaign.id}`)
          if (savedCustomEquipment) { try { setCustomEquipment(JSON.parse(savedCustomEquipment)) } catch (e) { } }

          const savedDrafts = localStorage.getItem(`drafts_${data.campaign.id}`)
          if (savedDrafts) { try { setDraftPolls(JSON.parse(savedDrafts)) } catch (e) { } }

          const savedGallery = localStorage.getItem(`images_${data.campaign.id}`)
          if (savedGallery) { try { setGalleryImages(JSON.parse(savedGallery)) } catch (e) { } }

          const savedLore = localStorage.getItem(`lore_${data.campaign.id}`)
          if (savedLore) { try { setLoreEntries(JSON.parse(savedLore)) } catch (e) { } }

          const savedNPCs = localStorage.getItem(`custom_npcs_${data.campaign.id}`)
          if (savedNPCs) { try { setCustomNPCs(JSON.parse(savedNPCs)) } catch (e) { } }

          const savedLoots = localStorage.getItem(`npc_loots_${data.campaign.id}`)
          if (savedLoots) { try { setNpcLoots(JSON.parse(savedLoots)) } catch (e) { } }

          const savedWeather = localStorage.getItem(`weather_${data.campaign.id}`)
          if (savedWeather) { setWeather(savedWeather as WeatherType) }

          const savedCutscenesStr = localStorage.getItem(`cutscenes_${data.campaign.id}`)
          if (savedCutscenesStr) { try { setCutscenes(JSON.parse(savedCutscenesStr)) } catch (e) { } }

          const savedCustomSounds = localStorage.getItem(`custom_sounds_${data.campaign.id}`)
          if (savedCustomSounds) { try { setCustomSounds(JSON.parse(savedCustomSounds)) } catch (e) { } }
        }

        const savedMixerStr = localStorage.getItem(`audio_mixer_${data.campaign.id}`)
        if (savedMixerStr) {
          try {
            const savedMixer = JSON.parse(savedMixerStr)
            if (typeof savedMixer.effects === "number") setEffectsVolume(clampVolume(savedMixer.effects))
            else if (typeof savedMixer.music === "number") setEffectsVolume(clampVolume(savedMixer.music))
          } catch (e) { }
        }

        const localSavedMaps = localStorage.getItem(`maps_${data.campaign.id}`)

        if (localSavedMaps && !mapsLoadedFromApiRef.current) {
          try {
            const parsedMaps = JSON.parse(localSavedMaps);
            setSavedMaps(parsedMaps);

            if (lastActiveMapIdRef.current) {
              const mapToRestore = parsedMaps.find((m: GameMap) => m.id === lastActiveMapIdRef.current);
              if (mapToRestore) setActiveMap(mapToRestore);
            }
          } catch (e) { }
        }
      }

      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(loadStoredState, { timeout: 350 })
        return () => window.cancelIdleCallback(idleId)
      }

      const timeoutId = window.setTimeout(loadStoredState, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [data.campaign.id])

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return
    localStorage.setItem(`audio_mixer_${data.campaign.id}`, JSON.stringify({ music: effectsVolume, effects: effectsVolume }))
  }, [mounted, data.campaign.id, effectsVolume])

  useEffect(() => {
    if (typeof window === "undefined") return
    const unlockAudio = () => {
      const ctx = getHandRaiseAudioContext()
      if (ctx && ctx.state === "suspended") void ctx.resume()
    }
    window.addEventListener("pointerdown", unlockAudio, { once: true })
    window.addEventListener("keydown", unlockAudio, { once: true })
    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
    }
  }, [])

  useEffect(() => {
    if (!showVolumeMixer) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && volumeMixerRef.current?.contains(target)) return
      setShowVolumeMixer(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowVolumeMixer(false)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showVolumeMixer])

  // ==========================================
  // PROTEÇÃO ANTI-CHEAT (Bloqueia F12 e Inspecionar para jogadores)
  // ==========================================
  useEffect(() => {
    // Se for o mestre, não bloqueia nada
    if (isGm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Bloqueia F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
      }
      // Bloqueia Ctrl+Shift+I / Cmd+Option+I (Inspecionar)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
      }
      // Bloqueia Ctrl+Shift+J / Cmd+Option+J (Console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
      }
      // Bloqueia Ctrl+Shift+C / Cmd+Option+C (Seletor de Elemento)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
      }
      // Bloqueia Ctrl+U / Cmd+U (Ver código-fonte)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Bloqueia o botão direito do mouse (evita "Inspecionar Elemento" pelo menu)
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isGm]);

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
        if (res && res.maps) {
          mapsLoadedFromApiRef.current = true
          if (res.maps.length > 0) {
            // Se veio mapas do servidor, usamos eles para sincronizar
            const uniqueMaps = Array.from(new Map(res.maps.map(m => [m.id, m])).values());
            setSavedMaps(uniqueMaps);
            storeJsonWhenIdle(`maps_${data.campaign.id}`, uniqueMaps);

            // Atualiza os detalhes do mapa ativo se a API trouxe uma versão mais recente
            setActiveMap(prev => {
              if (prev) {
                const updated = uniqueMaps.find(m => m.id === prev.id);
                return updated ? updated : prev;
              }
              return lastActiveMapIdRef.current ? uniqueMaps.find(m => m.id === lastActiveMapIdRef.current) ?? null : null;
            });
          } else if (isGm) {
            // Se for o mestre e veio vazio, então a campanha não tem nenhum mapa criado ainda.
            setSavedMaps([]);
            localStorage.setItem(`maps_${data.campaign.id}`, "[]");
          }
          // ATENÇÃO: Se for jogador e a API retornar [], não fazemos nada! 
          // Isso preserva os mapas cacheados recebidos por WebSocket.
        }
      })
      .catch(() => { })

    apiFetch<{ state: Record<string, any>; persistedFields: string[] }>(`/api/campaigns/${data.campaign.id}/state`)
      .then(res => {
        if (!res?.state) return
        campaignStateLoadedFromApiRef.current = true
        const persisted = new Set(res.persistedFields || [])
        const readArray = (key: string) => {
          try {
            const value = JSON.parse(localStorage.getItem(key) || "[]")
            return Array.isArray(value) ? value : []
          } catch {
            return []
          }
        }


        if (!isGm) {
          const gallery = Array.isArray(res.state.gallery) ? res.state.gallery : []
          const lore = Array.isArray(res.state.lore) ? res.state.lore : []
          const customEq = Array.isArray(res.state.customEquipment) ? res.state.customEquipment : []
          const customCls = Array.isArray(res.state.customClasses) ? res.state.customClasses : []
          setGalleryImages(gallery)
          setLoreEntries(lore)
          setCustomEquipment(customEq)
          setCustomClasses(customCls)
          setWeather((res.state.weather || "clear") as WeatherType)
          storeJsonWhenIdle(`images_${data.campaign.id}`, gallery)
          storeJsonWhenIdle(`lore_${data.campaign.id}`, lore)
          storeJsonWhenIdle(`custom_classes_${data.campaign.id}`, customCls)
          storeJsonWhenIdle(`custom_equipment_${data.campaign.id}`, customEq)

          localStorage.setItem(`weather_${data.campaign.id}`, res.state.weather || "clear")
          return
        }

        const migration: Record<string, unknown> = {}
        const pickArray = (field: string, storageKey: string) => {
          if (persisted.has(field)) return Array.isArray(res.state[field]) ? res.state[field] : []
          const hasCachedValue = localStorage.getItem(storageKey) !== null
          const cached = readArray(storageKey)
          if (hasCachedValue) migration[field] = cached
          return cached
        }
        const savedCustomCreatures = pickArray("customCreatures", `custom_creatures_${data.campaign.id}`) as Creature[]
        const savedCustomEquipment = pickArray("customEquipment", `custom_equipment_${data.campaign.id}`) as any[]
        const savedCustomClasses = pickArray("customClasses", `custom_classes_${data.campaign.id}`) as any[]
        const gallery = pickArray("gallery", `images_${data.campaign.id}`) as SharedImage[]
        const lore = pickArray("lore", `lore_${data.campaign.id}`) as LoreEntry[]
        const savedCutscenes = pickArray("cutscenes", `cutscenes_${data.campaign.id}`) as Cutscene[]
        const savedNPCs = pickArray("customNPCs", `custom_npcs_${data.campaign.id}`) as NPCDraft[]
        const savedLoots = pickArray("npcLoots", `npc_loots_${data.campaign.id}`) as DroppedLoot[]
        const savedDrafts = pickArray("draftPolls", `drafts_${data.campaign.id}`) as DraftPoll[]
        const savedSounds = pickArray("customSounds", `custom_sounds_${data.campaign.id}`) as Track[]
        const cachedWeather = localStorage.getItem(`weather_${data.campaign.id}`)

        const savedWeather = persisted.has("weather")
          ? String(res.state.weather || "clear")
          : cachedWeather || "clear"

        if (!persisted.has("weather") && cachedWeather !== null) migration.weather = savedWeather
        setGalleryImages(gallery)
        setLoreEntries(lore)
        setCutscenes(savedCutscenes)
        setCustomNPCs(savedNPCs)
        setNpcLoots(savedLoots)
        setCustomCreatures(savedCustomCreatures)
        setCustomEquipment(savedCustomEquipment)
        setCustomClasses(savedCustomClasses)
        setDraftPolls(savedDrafts)
        setCustomSounds(savedSounds)
        setWeather(savedWeather as WeatherType)
        storeJsonWhenIdle(`images_${data.campaign.id}`, gallery)
        storeJsonWhenIdle(`custom_classes_${data.campaign.id}`, savedCustomClasses)
        storeJsonWhenIdle(`lore_${data.campaign.id}`, lore)
        storeJsonWhenIdle(`cutscenes_${data.campaign.id}`, savedCutscenes)
        storeJsonWhenIdle(`custom_npcs_${data.campaign.id}`, savedNPCs)
        storeJsonWhenIdle(`npc_loots_${data.campaign.id}`, savedLoots)
        storeJsonWhenIdle(`drafts_${data.campaign.id}`, savedDrafts)
        storeJsonWhenIdle(`custom_sounds_${data.campaign.id}`, savedSounds)
        storeJsonWhenIdle(`custom_creatures_${data.campaign.id}`, savedCustomCreatures)
        storeJsonWhenIdle(`custom_equipment_${data.campaign.id}`, savedCustomEquipment)
        localStorage.setItem(`weather_${data.campaign.id}`, savedWeather)
        if (Object.keys(migration).length > 0) void persistCampaignState(migration)
      })
      .catch(() => { })
  }, [data.campaign.id, isGm, persistCampaignState])

  // Persiste no LocalStorage qual mapa está aberto para reabrir em caso de reload
  useEffect(() => {
    if (activeMap) {
      localStorage.setItem(`last_active_map_${data.campaign.id}`, activeMap.id);
    } else {
      localStorage.removeItem(`last_active_map_${data.campaign.id}`);
    }
  }, [activeMap?.id, data.campaign.id]);

  // Sincroniza savedMaps localmente se houver edição
  const syncMapsToStorage = useCallback((maps: GameMap[]) => {
    const uniqueMaps = Array.from(new Map(maps.map(m => [m.id, m])).values());
    setSavedMaps(uniqueMaps);
    localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(uniqueMaps));
  }, [data.campaign.id]);

  function handleImageClick(url: string) {
    if (isGm) {
      // Se for o mestre, força a imagem tela cheia na cara de todo mundo
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST", body: JSON.stringify({ characterId: 'sys_image', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_IMAGE:SHOW`, result: url })
      }).catch(console.error);
      setShowImagepad(false);
    } else {
      // Se for jogador, apenas abre a imagem localmente para ele ver melhor
      setActiveFullscreenImage(url);
    }
  }

  const saveCustomCreaturesToStorage = (creatures: Creature[]) => {
    setCustomCreatures(creatures);
    localStorage.setItem(`custom_creatures_${data.campaign.id}`, JSON.stringify(creatures));
    void persistCampaignState({ customCreatures: creatures });
  }

  const saveCustomClassesToStorage = (clsArray: any[]) => {
    setCustomClasses(clsArray);
    localStorage.setItem(`custom_classes_${data.campaign.id}`, JSON.stringify(clsArray));
    void persistCampaignState({ customClasses: clsArray });

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({ characterId: 'sys_classes', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_CLASSES:UPDATE`, result: JSON.stringify(clsArray) })
    }).catch(console.error);
  }

  const saveCustomEquipmentToStorage = (eqs: any[]) => {
    setCustomEquipment(eqs);
    localStorage.setItem(`custom_equipment_${data.campaign.id}`, JSON.stringify(eqs));
    void persistCampaignState({ customEquipment: eqs });

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({ characterId: 'sys_equip', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_EQUIPMENT:UPDATE`, result: JSON.stringify(eqs) })
    }).catch(console.error);
  }

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
    const sound = { id: uid, trackId: track.id, url: track.url, loop }
    setActiveSounds(prev => [...prev.filter(item => item.id !== uid), sound])
    apiFetch<{ sounds: ActiveSound[] }>(`/api/campaigns/${data.campaign.id}/sound`, {
      method: "POST", body: JSON.stringify({ action: "play", id: uid, trackId: track.id, url: track.url, loop })
    }).then(res => setActiveSounds(res.sounds || [])).catch(() => {
      setActiveSounds(prev => prev.filter(item => item.id !== uid))
    });
  }, [data.campaign.id]);

  const handleStopSound = useCallback((id: string) => {
    setActiveSounds(prev => prev.filter(sound => sound.id !== id))
    apiFetch<{ sounds: ActiveSound[] }>(`/api/campaigns/${data.campaign.id}/sound`, { method: "POST", body: JSON.stringify({ action: "stop", id }) })
      .then(res => setActiveSounds(res.sounds || []))
      .catch(console.error);
  }, [data.campaign.id]);

  const handleStopAllSounds = useCallback(() => {
    setActiveSounds([])
    apiFetch<{ sounds: ActiveSound[] }>(`/api/campaigns/${data.campaign.id}/sound`, { method: "POST", body: JSON.stringify({ action: "stop_all" }) })
      .then(res => setActiveSounds(res.sounds || []))
      .catch(console.error);
  }, [data.campaign.id]);

  const handleEvent = useCallback((event: any) => {
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
    if (event.type === "map:renamed") {
      setSavedMaps(prev => {
        const next = prev.map(m => m.id === event.mapId ? { ...m, name: event.name } : m);
        localStorage.setItem(`maps_${data.campaign.id}`, JSON.stringify(next));
        return next;
      });

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
      setActiveSounds(prev => [...prev.filter(sound => sound.id !== event.sound.id), event.sound]);
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

      if (attr === "PLAYER_HAND_RAISED") {
        const playerName = event.playerName || event.characterName || "Jogador";
        const characterName = event.characterName || playerName;
        const noticeId = String(event.result || `${event.playerName}-${Date.now()}`);
        setHandPresentation({ id: noticeId, characterName, playerName });
        window.setTimeout(() => {
          setHandPresentation(current => current?.id === noticeId ? null : current);
        }, 3600);
        if (isGmRef.current) playHandRaiseSound(effectsVolumeRef.current);
        return;
      }

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
          
          // CORREÇÃO: Força o override completo da ficha no state do React
          setCharacters((prev) => prev.map(c => {
            if (c.id === payload.charId) {
              return {
                 ...c,
                 ...payload.character,
                 equipment: payload.character.equipment || [],
                 customItems: payload.character.customItems || [],
                 customModifiers: payload.character.customModifiers || []
              }
            }
            return c
          }));

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

      if (attr.startsWith("SYNC_IMAGE:")) {
        const action = attr.split(":")[1];
        if (action === "SHOW") {
          setActiveFullscreenImage(String(event.result));
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

      if (attr.startsWith("SYNC_MAP:")) {
        const action = attr.split(":")[1];
        if (action === "SHOW") {
          const mapId = String(event.result);
          // CORREÇÃO: Lendo diretamente do LocalStorage para evitar conflito de State no React
          const localMaps = localStorage.getItem(`maps_${data.campaign.id}`);
          if (localMaps) {
            try {
              const parsed = JSON.parse(localMaps);
              const mapToShow = parsed.find((m: any) => m.id === mapId);
              if (mapToShow) setActiveMap(mapToShow);
            } catch (e) { }
          }
        }
        return;
      }

      if (attr === "SYNC_GALLERY:UPDATE") {
        try {
          const synced = JSON.parse(String(event.result));
          setGalleryImages(synced);
          localStorage.setItem(`images_${data.campaign.id}`, JSON.stringify(synced));
        } catch (e) { }
        return;
      }

      if (attr === "SYNC_LORE:UPDATE") {
        try {
          const synced = JSON.parse(String(event.result));
          setLoreEntries(synced);
          localStorage.setItem(`lore_${data.campaign.id}`, JSON.stringify(synced));
        } catch (e) { }
        return;
      }

      if (attr.includes("SYNC_GALLERY:UPDATE")) {
        try {
          const synced = JSON.parse(String(event.result));
          setGalleryImages(synced);
          localStorage.setItem(`images_${data.campaign.id}`, JSON.stringify(synced));
        } catch (e) { }
        return;
      }

      if (attr === "SYNC_EQUIPMENT:UPDATE") {
        try {
          const synced = JSON.parse(String(event.result));
          setCustomEquipment(synced);
          localStorage.setItem(`custom_equipment_${data.campaign.id}`, JSON.stringify(synced));
        } catch (e) { }
        return;
      }

      if (attr === "SYNC_CLASSES:UPDATE") {
        try {
          const synced = JSON.parse(String(event.result));
          setCustomClasses(synced);
          localStorage.setItem(`custom_classes_${data.campaign.id}`, JSON.stringify(synced));
        } catch (e) { }
        return;
      }

      if (attr.includes("SYNC_LORE:UPDATE")) {
        try {
          const synced = JSON.parse(String(event.result));
          setLoreEntries(synced);
          localStorage.setItem(`lore_${data.campaign.id}`, JSON.stringify(synced));
        } catch (e) { }
        return;
      }

      const effectId = `${event.characterId || "roll"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      playDiceRollSound(effectsVolumeRef.current);
      const presentation: DicePresentation = {
        id: effectId,
        characterName: event.characterName || "Rolagem",
        playerName: event.playerName || "Jogador",
        attribute: attr,
        result: event.result,
        dice: getDiceFromLabel(attr),
        breakdown: event.breakdown,
        modifier: event.modifier
      };
      setDicePresentations((prev) => [...prev, presentation].slice(-2));
      window.setTimeout(() => {
        setDicePresentations((prev) => prev.filter((effect) => effect.id !== effectId));
      }, 4300);

      setHistory((prev) => [{
        id: effectId,
        type: "roll" as const,
        title: event.characterName,
        subtitle: event.playerName,
        detail: `${event.attribute}${event.breakdown ? ` ${event.breakdown}` : ""}${event.modifier ? ` · Mod: ${event.modifier > 0 ? "+" : ""}${event.modifier}` : ""}`,
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
        case "character:updated":
          return prev.map((c) => {
            if (c.id === event.character.id) {
              if (Number(event.character.updatedAt || 0) < Number(c.updatedAt || 0)) return c
              // CORREÇÃO: Defesa extra. Se a API devolver a ficha sem os itens, mantemos os locais!
              return {
                ...event.character,
                customItems: (event.character as any).customItems || (c as any).customItems || [],
                customModifiers: (event.character as any).customModifiers || (c as any).customModifiers || []
              };
            }
            return c;
          });
        case "character:deleted": return prev.filter((c) => c.id !== event.characterId)
        default: return prev
      }
    })
  }, [data.campaign.id, data.me.id])

  const realtimeStatus = useRealtime(data.campaign.id, handleEvent)
  const live = realtimeStatus === "live"

  useEffect(() => {
    if (realtimeStatus !== "live") return
    apiFetch<{ sounds: ActiveSound[] }>(`/api/campaigns/${data.campaign.id}/sound`)
      .then(res => setActiveSounds(res.sounds || []))
      .catch(console.error)
  }, [data.campaign.id, realtimeStatus])

  const applyOptimistic = useCallback((c: Character) => setCharacters((prev) => prev.map((x) => {
    if (x.id === c.id) {
      // CORREÇÃO: Defesa na atualização otimista (quando gasta MP/HP)
      return {
        ...c,
        customItems: (c as any).customItems || (x as any).customItems || [],
        customModifiers: (c as any).customModifiers || (x as any).customModifiers || []
      };
    }
    return x;
  })), [])

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

  function handleBroadcastRoll(characterOrCreatureName: string, attrName: string, result: number | string, details?: DiceRollDetails) {
    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST", body: JSON.stringify({ characterId: 'sys', characterName: characterOrCreatureName, playerName: data.me.name, attribute: attrName, result, breakdown: details?.breakdown, modifier: details?.modifier })
    }).catch(console.error)
  }

  function handleRaiseHand() {
    if (isGm || handRaiseCooldown) return
    const noticeId = `${data.me.id}-${Date.now()}`
    const characterName = characters.find((character) => character.ownerId === data.me.id)?.name || data.me.name
    playHandRaiseSound(effectsVolume)
    setHandPresentation({ id: noticeId, characterName, playerName: data.me.name })
    setHandRaiseCooldown(true)
    window.setTimeout(() => setHandPresentation(current => current?.id === noticeId ? null : current), 3600)
    window.setTimeout(() => setHandRaiseCooldown(false), 5000)
    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: data.me.id,
        characterName,
        playerName: data.me.name,
        attribute: "PLAYER_HAND_RAISED",
        result: noticeId
      })
    }).catch(console.error)
  }

  async function handleArchiveCharacter(character: Character) {
    if (!character || !character.id) return;

    // Confirmação para evitar cliques acidentais se você não tem o Modal
    if (!confirm(`Deseja realmente arquivar ${character.name} no Berçário e removê-lo do jogo?`)) return;

    // 1. Converte o personagem em um rascunho de NPC (NPCDraft)
    const draft: NPCDraft = {
      id: "npc-" + Math.random().toString(36).substring(2, 9),
      name: character.name,
      avatarUrl: character.avatarUrl || "",
      origin: character.origin || "Herói Caído/Aposentado",
      identity: character.identity || "",
      theme: character.theme || "",
      classes: character.classes || [],
      skills: character.skills || {},
      attributes: character.attributes,
      equipment: character.equipment || []
    };

    try {
      // 2. Deleta da base de dados PRIMEIRO. 
      // Se falhar aqui, não removemos da tela nem salvamos no Berçário para evitar inconsistências.
      await apiFetch(`/api/characters/${character.id}`, { method: "DELETE" });

      // 3. Se a exclusão no banco for um sucesso, salva o NPC no Berçário local
      const updatedNPCs = [draft, ...customNPCs];
      saveCustomNPCsToStorage(updatedNPCs);

      // 4. Remove da tela atual otimisticamente
      setCharacters(prev => prev.filter(c => c.id !== character.id));
      if (selectedCombatCharId === character.id) setSelectedCombatCharId(null);

      alert(`O personagem ${character.name} foi arquivado e agora está disponível no Berçário!`);

    } catch (err: any) {
      console.error("Falha ao arquivar o personagem.", err);
      // Se o erro for de que o personagem não existe, a gente força a limpeza da tela 
      // para resolver a dessincronização fantasma.
      if (err.message && err.message.includes("nao encontrado")) {
        setCharacters(prev => prev.filter(c => c.id !== character.id));
        alert(`Este personagem já não existia mais no banco de dados. Ele foi removido da tela.`);
      } else {
        alert(`Erro ao tentar arquivar o personagem: ${err.message || "Erro desconhecido"}`);
      }
    }
  }

  function handleSetWeather(w: WeatherType) {
    setWeather(w);
    localStorage.setItem(`weather_${data.campaign.id}`, w);
    void persistCampaignState({ weather: w })

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
    void persistCampaignState({ cutscenes: newCutscenes })
  }

  function saveCustomSounds(newSounds: Track[]) {
    setCustomSounds(newSounds)
    localStorage.setItem(`custom_sounds_${data.campaign.id}`, JSON.stringify(newSounds))
    void persistCampaignState({ customSounds: newSounds })
  }

  function syncCutscene(action: "PLAY" | "STOP" | "SCENE", payload?: any) {
    const attr = `SYNC_CUTSCENE:${action}`;
    const result = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '...';

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST", body: JSON.stringify({ characterId: 'sys_cutscene', characterName: 'Sistema', playerName: 'Mestre', attribute: attr, result })
    }).catch(console.error);
  }

  function handleForceSyncMap(mapId: string) {
    const mapToShow = savedMaps.find(m => m.id === mapId);
    if (mapToShow) setActiveMap(mapToShow);

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST", body: JSON.stringify({ characterId: 'sys_map', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_MAP:SHOW`, result: mapId })
    }).catch(console.error);
  }

  const saveCustomNPCsToStorage = (npcs: NPCDraft[]) => {
    setCustomNPCs(npcs);
    localStorage.setItem(`custom_npcs_${data.campaign.id}`, JSON.stringify(npcs));
    void persistCampaignState({ customNPCs: npcs })
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
    void persistCampaignState({ npcLoots: loots })
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

  async function handleGiveDroppedLoot() {
    if (!selectedDroppedLoot || !selectedTargetCharId) return;
    const targetCharacter = characters.find(c => c.id === selectedTargetCharId);
    if (!targetCharacter) return;

    try {
      const newEquipment = [...targetCharacter.equipment, selectedDroppedLoot.itemId];
      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) });
      applyOptimistic(updated);

      saveNpcLoots(npcLoots.filter(l => l.uid !== selectedDroppedLoot.uid));

      // CORREÇÃO: Procurar o item também nos itens customizados criados pelo mestre
      const itemObj = customEquipment.find(e => e.id === selectedDroppedLoot.itemId) || getEquipment(selectedDroppedLoot.itemId);
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST", body: JSON.stringify({ characterId: 'sys_item', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_ITEM_GIVEN`, result: JSON.stringify({ charId: targetCharacter.id, character: updated, itemName: itemObj?.name || 'Loot de Inimigo' }) })
      }).catch(console.error);

      setSelectedDroppedLoot(null);
      setSelectedTargetCharId(null);
    } catch (err) {
      alert("Erro ao enviar Loot.");
    }
  }

  // --- Handlers do novo GmPanel ---
  const handleGiveZenits = async (targetId: string, amount: number) => {
    const targetCharacter = characters.find(c => c.id === targetId);
    if (targetCharacter) {
      const currentZenit = targetCharacter.zenit || 0;
      const newZenit = currentZenit + amount;

      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, {
        method: "PATCH", body: JSON.stringify({ zenit: newZenit })
      });

      applyOptimistic(updated);

      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST", body: JSON.stringify({
          characterId: 'sys_zenits',
          characterName: targetCharacter.name,
          playerName: 'Mestre',
          attribute: `RECEBEU ZENITS`,
          result: `+${amount}z`
        })
      }).catch(console.error);
    }
  }

  const handleGiveCustomItem = async (targetId: string, name: string, type: string, content: string) => {
    const targetCharacter = characters.find(c => c.id === targetId)
    if (targetCharacter) {
      const newItem: CustomItem = {
        id: Math.random().toString(36).substring(2, 9),
        name: name,
        type: type as any,
        content: content
      };
      const currentCustom = (targetCharacter as any).customItems || [];
      const updatedCustomItems = [...currentCustom, newItem];

      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, {
        method: "PATCH", body: JSON.stringify({ customItems: updatedCustomItems })
      })

      applyOptimistic({ ...updated, customItems: updatedCustomItems } as any);

      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST", body: JSON.stringify({ characterId: 'sys_item', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_ITEM_GIVEN`, result: JSON.stringify({ charId: targetCharacter.id, character: { ...updated, customItems: updatedCustomItems }, itemName: newItem.name }) })
      }).catch(console.error);
    }
  }

  const handleGiveSystemItem = async (targetId: string, itemId: string) => {
    const targetCharacter = characters.find(c => c.id === targetId)
    const targetCreature = activeCreatures.find(c => c.instanceId === targetId)

    if (targetCharacter) {
      // CORREÇÃO: Garante que equipment é um array para evitar bugs
      const currentEquip = Array.isArray(targetCharacter.equipment) ? targetCharacter.equipment : []
      const newEquipment = [...currentEquip, itemId]

      const { character: updated } = await apiFetch<{ character: Character }>(`/api/characters/${targetCharacter.id}`, { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) })
      applyOptimistic(updated)

      const itemObj = customEquipment.find(e => e.id === itemId) || getEquipment(itemId);
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST", body: JSON.stringify({ characterId: 'sys_item', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_ITEM_GIVEN`, result: JSON.stringify({ charId: targetCharacter.id, character: updated, itemName: itemObj?.name || 'Novo Equipamento' }) })
      }).catch(console.error);

    } else if (targetCreature) {
      const currentEquip = Array.isArray((targetCreature as any).equipment) ? (targetCreature as any).equipment : []
      const newEquipment = [...currentEquip, itemId]
      updateCreatureVital(targetCreature.instanceId, { equipment: newEquipment } as any)
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
    void persistCampaignState({ draftPolls: drafts })
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

  const handleSaveLoreEntries = useCallback(async (newEntries: LoreEntry[]) => {
    // 1. Atualiza estado e LocalStorage para resposta imediata
    setLoreEntries(newEntries);
    localStorage.setItem(`lore_${data.campaign.id}`, JSON.stringify(newEntries));

    if (isGm) {
      // 2. Avisa os jogadores online via WebSocket (o que você já tinha)
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST",
        body: JSON.stringify({
          characterId: 'sys_lore',
          characterName: 'Sistema',
          playerName: 'Mestre',
          attribute: `SYNC_LORE:UPDATE`,
          result: JSON.stringify(newEntries)
        })
      }).catch(console.error);

      // 3. NOVO: Salva definitivamente no banco de dados!
      await persistCampaignState({ lore: newEntries })
    }
  }, [data.campaign.id, isGm, persistCampaignState]);

  const myCharacters = characters.filter((c) => c.ownerId === data.me.id)
  const otherCharacters = characters.filter((c) => c.ownerId !== data.me.id)
  const isCombatActive = activeCreatures.length > 0;

  return (
    <div className="rpg-page mx-auto flex min-h-dvh max-w-[1680px] flex-col px-3 py-4 sm:px-4 md:h-screen md:px-6 md:py-6">
      {mounted && createPortal(
        <>
          <AnimatePresence initial={false}>
            {creating && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-[500] overflow-y-auto bg-background/95 backdrop-blur-sm">
                <div className="rpg-page mx-auto max-w-4xl px-5 py-8 sm:px-6">
                  <span className="rpg-kicker mb-3">Registro de viajante</span>
                  <h1 className="rpg-title mb-6 text-2xl font-black">Forjar viajante</h1>
                  <CharacterCreator campaignId={data.campaign.id} onCancel={() => setCreating(false)} onCreated={(c) => { setCharacters((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c]); setCreating(false) }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {activeMap && (
            <BattlemapEngine
              key={activeMap.id}
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
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setShowMapImporter(false)}>
                <div className="relative w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => setShowMapImporter(false)} className="absolute -top-10 right-0 text-muted-foreground hover:text-white"><X className="size-6" /></button>
                  <MapImporter onMapReady={handleCreateMap} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <WeatherOverlay weather={weather} effectsVolume={effectsVolume} />

          <AnimatePresence>
            {hoveredImage && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none bg-black/80 backdrop-blur-sm">
                <div className="relative w-[80vw] max-w-[500px] aspect-square rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/10">
                  <Image src={hoveredImage} alt="Zoom" fill className="object-contain" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <NpcNursery
            isOpen={showNursery}
            onClose={() => setShowNursery(false)}
            customNPCs={customNPCs}
            onSpawn={spawnNPC}
            onDelete={handleDeleteCustomNPC}
            onCreated={(newNpc) => {
              saveCustomNPCsToStorage([newNpc, ...customNPCs]);
              alert(`${newNpc.name} foi adicionado ao Berçário!`);
            }}
          />

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
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden" onClick={() => setShowPollModal(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-lg flex-col border border-primary/50 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>

                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black flex items-center gap-2"><BarChart2 className="size-6 text-primary" /> <span className="text-foreground">Gerenciar enquetes</span></h4>
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

          <GmPanel
            isOpen={showGmPanel}
            onClose={() => setShowGmPanel(false)}
            characters={characters}
            activeCreatures={activeCreatures}
            members={data.members}
            customEquipment={customEquipment}
            customClasses={customClasses} // <-- AQUI
            onCreateEquipment={(eq) => saveCustomEquipmentToStorage([...customEquipment, eq])}
            onDeleteEquipment={(id) => saveCustomEquipmentToStorage(customEquipment.filter((e: any) => e.id !== id))}
            onCreateClass={(cls) => saveCustomClassesToStorage([...customClasses, cls])} // <-- AQUI
            onDeleteClass={(id) => saveCustomClassesToStorage(customClasses.filter((c: any) => c.id !== id))} // <-- AQUI
            onGiveZenits={handleGiveZenits}
            onGiveCustomItem={handleGiveCustomItem}
            onGiveSystemItem={handleGiveSystemItem}
          />

          <AnimatePresence>
            {showDroppedLoots && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden" onClick={() => setShowDroppedLoots(false)}>
                <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-3xl flex-col border border-accent/50 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  {/* Header */}
                  <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                    <div>
                      <h4 className="font-serif text-2xl font-black flex items-center gap-2"><Inbox className="size-6 text-accent" /> <span className="text-foreground">Loots (NPCs)</span></h4>
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
                              const item = customEquipment.find(e => e.id === loot.itemId) || getEquipment(loot.itemId)
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
                    <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" disabled={!selectedDroppedLoot || !selectedTargetCharId} onClick={handleGiveDroppedLoot}>
                      <Send className="size-4" /> Distribuir itens
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <GmBestiary
            isOpen={showBestiary}
            onClose={() => setShowBestiary(false)}
            onSpawn={spawnCreature}
            customCreatures={customCreatures}
            onCreate={(c) => saveCustomCreaturesToStorage([c, ...customCreatures])}
            onDelete={(id) => saveCustomCreaturesToStorage(customCreatures.filter(c => c.id !== id))}
          />

          <AnimatePresence>
            {selectedCombatCreatureId && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto" onClick={() => setSelectedCombatCreatureId(null)}>
                <div className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => setSelectedCombatCreatureId(null)} className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"><X className="size-6 text-white" /></button>
                  {activeCreatures.filter(c => c.instanceId === selectedCombatCreatureId).map(c => (
                    <CreatureSheet key={c.instanceId} creature={c} isGm={isGm} customEquipment={customEquipment} onUpdate={updateCreatureVital} onRoll={(attr: string, res: number) => handleBroadcastRoll(c.name, attr, res)} onKill={() => handleKillCreature(c)} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FICHAS ABERTAS EM COMBATE/POR CLICK */}
          <AnimatePresence>
            {selectedCombatCharId && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto" onClick={() => setSelectedCombatCharId(null)}>
                <div className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => setSelectedCombatCharId(null)} className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"><X className="size-6 text-white" /></button>
                  {characters.filter(c => c.id === selectedCombatCharId).map(c => (
                    <CharacterSheet
                      key={c.id}
                      character={c}
                      editable={isGm || c.ownerId === data.me.id}
                      isGm={isGm}
                      isOwned={c.ownerId === data.me.id}
                      campaignMembers={data.members}
                      onOptimistic={applyOptimistic}
                      customClasses={customClasses}
                      customEquipment={customEquipment}
                      onRoll={(attr: string, res: number | string, details?: DiceRollDetails) => handleBroadcastRoll(c.name, attr, res, details)}
                      onKill={isGm ? handleKillNPC : undefined}
                      shouldOpenInventory={inventoryToOpen === c.id}
                      onClearInventoryRequest={() => setInventoryToOpen(null)}
                      onArchive={isGm ? handleArchiveCharacter : undefined}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* LOREBOOK MODAL */}
          <AnimatePresence>
            {showLorebook && (
              <Lorebook
                isOpen={showLorebook}
                onClose={() => setShowLorebook(false)}
                isGm={isGm}
                myUserId={data.me.id}
                campaignMembers={data.members}
                entries={loreEntries}
                onSaveEntries={handleSaveLoreEntries}
              />
            )}
          </AnimatePresence>

          {/* SOUNDPAD MODAL / ENGINE */}
          <AnimatePresence>
            {showSoundpad && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-8 overflow-hidden" onClick={() => setShowSoundpad(false)}>
                <motion.div variants={modalVariants} className="rpg-modal rpg-media-modal relative w-full max-w-6xl h-[85vh] min-h-[600px] flex flex-col bg-transparent" onClick={(event) => event.stopPropagation()}>
                  {/* Botão de Fechar por Fora */}
                  <button onClick={() => setShowSoundpad(false)} className="absolute -top-4 -right-4 md:-right-8 md:-top-8 text-zinc-500 hover:text-white bg-black/50 hover:bg-black rounded-full p-2 transition-colors z-[300] border border-white/10">
                    <X className="size-6" />
                  </button>

                  {/* Instancia do Engine Local de Audio Ocupando Todo o Espaço */}
                  <div className="rpg-media-modal-frame flex-1 w-full h-full overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                    <Soundpad
                      isGm={isGm}
                      campaignId={data.campaign.id}
                      activeSounds={activeSounds}
                      customTracks={customSounds}
                      musicVolume={effectsVolume}
                      effectsVolume={effectsVolume}
                      onCustomTracksChange={saveCustomSounds}
                      onMusicVolumeChange={setEffectsVolume}
                      onEffectsVolumeChange={setEffectsVolume}
                      onPlaySound={handlePlaySound}
                      onStopSound={handleStopSound}
                      onStopAll={handleStopAllSounds}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* GALERIA ARCANA MODALS */}
          <AnimatePresence>
            {showImagepad && (
              <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-8 overflow-hidden" onClick={() => setShowImagepad(false)}>
                <motion.div variants={modalVariants} className="rpg-modal rpg-media-modal relative w-full max-w-6xl h-[85vh] min-h-[600px] flex flex-col bg-transparent" onClick={(event) => event.stopPropagation()}>
                  <div className="rpg-media-modal-frame flex-1 w-full h-full overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10">
                    <Imagepad
                      isGm={isGm}
                      images={galleryImages}
                      onUpdateImages={(newImages) => {
                        setGalleryImages(newImages);
                        localStorage.setItem(`images_${data.campaign.id}`, JSON.stringify(newImages));
                        if (isGm) {
                          void persistCampaignState({ gallery: newImages })
                          apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
                            method: "POST", body: JSON.stringify({ characterId: 'sys_gallery', characterName: 'Sistema', playerName: 'Mestre', attribute: `SYNC_GALLERY:UPDATE`, result: JSON.stringify(newImages) })
                          }).catch(console.error);
                        }
                      }}
                      onShowImage={handleImageClick}
                      onClose={() => setShowImagepad(false)}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {activeFullscreenImage && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[400] flex items-center justify-center bg-black/95 backdrop-blur-lg p-4 md:p-12" onClick={() => setActiveFullscreenImage(null)}>
                <div className="relative w-full h-full flex items-center justify-center">
                  <button onClick={(event) => { event.stopPropagation(); setActiveFullscreenImage(null) }} className="absolute top-4 right-4 md:top-8 md:right-8 p-3 bg-white/10 hover:bg-white/20 rounded-full z-10 transition-colors"><X className="size-8 text-white" /></button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeFullscreenImage} className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-xl border border-white/10" alt="Visualização Expandida" onClick={(event) => event.stopPropagation()} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* NOTA IMPORTANTE: Para os jogadores escutarem mesmo com o Modal Fechado, 
              injetamos a engine "invisível" caso não seja GM e o modal não estiver aberto */}
          {!showSoundpad && (
            <div className="hidden">
              <Soundpad isGm={false} campaignId={data.campaign.id} activeSounds={activeSounds} customTracks={customSounds} musicVolume={effectsVolume} effectsVolume={effectsVolume} />
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

      {mounted && createPortal(
        <>
          {dicePresentations.map((effect) => <DiceRollPresentation key={effect.id} effect={effect} />)}
          {handPresentation && <HandRaisePresentation key={handPresentation.id} effect={handPresentation} />}
        </>,
        document.body
      )}

      {/* HEADER DA SALA */}
      <header className="rpg-cartography campaign-cartography relative z-40 mb-5 flex shrink-0 flex-wrap items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <div className="flex min-h-16 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/campaigns")} aria-label="Voltar" className="rpg-cartography-action"><ArrowLeft className="size-5" /></Button>
          <div className="campaign-heading flex min-h-14 flex-col justify-center">
            <span className="rpg-cartography-kicker">Sessão</span>
            <h1 className="rpg-title rpg-cartography-title text-xl font-black md:text-2xl">{data.campaign.name}</h1>
            <div className="rpg-cartography-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm">
              <span className="font-mono">#{data.campaign.code}</span>
              <span className="campaign-connection inline-flex items-center gap-1" data-state={realtimeStatus}><Radio className={`size-3.5 ${live ? "animate-pulse" : ""}`} />{live ? "Ao vivo" : realtimeStatus === "reconnecting" ? "Reconectando..." : "Conectando..."}</span>

              {/* WIDGET DO CLIMA ATUAL */}
              <span className="campaign-current-weather inline-flex items-center gap-1.5 border-l border-border/50 pl-2 transition-colors">
                {weather === "clear" && <><CloudSun className="size-4 text-[#c8ae79]" /> Limpo</>}
                {weather === "sunny" && <><Sun className="size-4 text-[#c49a5f]" /> Ensolarado</>}
                {weather === "cloudy" && <><Cloudy className="size-4 text-[#a9b0ae]" /> Nublado</>}
                {weather === "fog" && <><CloudFog className="size-4 text-[#b8b2a6]" /> Neblina</>}
                {weather === "rain" && <><CloudRainWind className="size-4 text-[#94aeba]" /> Chovendo</>}
                {weather === "blizzard" && <><CloudSnow className="size-4 text-[#d9ddd9]" /> Nevasca</>}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PersonalNotes campaignId={data.campaign.id} />
          <ThemeSwitcher />
          <div className="relative" ref={volumeMixerRef}>
            <Button variant="outline" size="sm" className="rpg-cartography-action h-9 gap-2" onClick={() => setShowVolumeMixer(value => !value)} aria-expanded={showVolumeMixer}>
              <Volume2 className="size-4" /> Mixer
            </Button>
            <AnimatePresence>
              {showVolumeMixer && (
                <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} className="rpg-modal rpg-volume-mixer absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(90vw,280px)] rounded-md border border-primary/30 bg-background/95 p-4 text-foreground shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Áudio da Mesa</span>
                    <button type="button" onClick={() => setShowVolumeMixer(false)} className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Fechar mixer">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div>
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="rpg-mixer-label flex items-center gap-2 font-semibold"><Speaker className="size-4" /> Efeitos sonoros</span>
                        <span className="font-mono text-muted-foreground">{Math.round(effectsVolume * 100)}%</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={effectsVolume} onChange={(e) => setEffectsVolume(clampVolume(parseFloat(e.target.value)))} className="w-full h-1.5 cursor-pointer appearance-none rounded-lg bg-muted" style={{ accentColor: 'var(--accent)' }} />
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isGm && (
            <Button size="sm" className="h-9 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60" onClick={handleRaiseHand} disabled={handRaiseCooldown}>
              <Hand className="size-4" /> {handRaiseCooldown ? "Enviado" : "Levantar a mão"}
            </Button>
          )}

          <span className="rpg-cartography-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold md:text-sm">
            {isGm ? <Crown className="size-4" /> : <Shield className="size-4" />} {isGm ? "Mestre" : "Jogador"}
          </span>
        </div>
      </header>

      {/* ÁREA PRINCIPAL DA SALA */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">

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
                                <button onClick={() => updateCreatureVital(creature.instanceId, { currentHp: creature.currentHp - 1 })} className="text-muted-foreground hover:text-white">-</button>
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
                        <CharacterPortrait src={char.avatarUrl} alt={`Retrato de ${char.name}`} frame={char.portraitFrame} crop={char.portraitCrop} className="size-10 shrink-0 cursor-zoom-in pointer-events-auto" sizes="40px" onMouseEnter={() => setHoveredImage(char.avatarUrl || "/mystic-adventurer-portrait.png")} onMouseLeave={() => setHoveredImage(null)} />
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
              <div className="rpg-character-scroll h-full overflow-y-auto px-1 py-1 custom-scrollbar-sepia">
                <section className="mb-8">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="rpg-section-title">{isGm ? "Viajantes do Mestre" : "Meus viajantes"}</h2>

                    <div className="flex gap-2">
                      {isGm && (
                        <Button size="sm" variant="outline" className="rpg-bestiary-nursery h-8 gap-1.5" onClick={() => setShowNursery(true)}>
                          <UserPlus className="size-4" /> <span className="text-foreground">Berçário</span>
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5 backdrop-blur-sm"><Plus className="size-4" /> Novo viajante</Button>
                    </div>

                  </div>
                  {myCharacters.length === 0 ? (
                    <div className="rpg-empty rounded-md border border-dashed border-border/60 bg-black/20 p-8 text-center text-sm text-muted-foreground">Você ainda não criou um viajante.</div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {myCharacters.map((c) => (
                        <CharacterSheet
                          key={c.id}
                          character={c}
                          editable={true}
                          isGm={isGm}
                          isOwned={true}
                          campaignMembers={data.members}
                          customEquipment={customEquipment}
                          onOptimistic={applyOptimistic}
                          onRoll={(attr: string, res: number | string, details?: DiceRollDetails) => handleBroadcastRoll(c.name, attr, res, details)}
                          onKill={isGm ? handleKillNPC : undefined}
                          shouldOpenInventory={inventoryToOpen === c.id}
                          onClearInventoryRequest={() => setInventoryToOpen(null)}
                          onArchive={isGm ? handleArchiveCharacter : undefined}
                          expanded={expandedCharacterId === c.id}
                          onExpandedChange={(next: boolean) => setExpandedCharacterId(next ? c.id : null)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {otherCharacters.length > 0 && (
                  <section>
                    <h2 className="rpg-section-title mb-3">{isGm ? "Viajantes dos jogadores" : "Companheiros de jornada"}</h2>
                    <div className="flex flex-col gap-6">
                      {otherCharacters.map((c) => (
                        <CharacterSheet
                          key={c.id}
                          character={c}
                          editable={isGm}
                          isGm={isGm}
                          isOwned={false}
                          campaignMembers={data.members}
                          customEquipment={customEquipment}
                          onOptimistic={applyOptimistic}
                          onRoll={(attr: string, res: number | string, details?: DiceRollDetails) => handleBroadcastRoll(c.name, attr, res, details)}
                          onKill={isGm ? handleKillNPC : undefined}
                          shouldOpenInventory={inventoryToOpen === c.id}
                          onClearInventoryRequest={() => setInventoryToOpen(null)}
                          onArchive={isGm ? handleArchiveCharacter : undefined}
                          expanded={expandedCharacterId === c.id}
                          onExpandedChange={(next: boolean) => setExpandedCharacterId(next ? c.id : null)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: PAINEL DO MESTRE & HISTÓRICO */}
          <aside className="rpg-session-sidebar flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-4 pr-1 custom-scrollbar-sepia">

            {isGm && (
              <div className="panel rpg-gm-tools shrink-0 border border-accent/40 p-4">
                <div className="rpg-gm-heading mb-4 border-b pb-3">
                  <h2 className="flex items-center gap-2 font-serif text-base font-bold"><Crown className="size-4" /> Grimório do Mestre</h2>
                </div>

                <div className="flex flex-col gap-2">
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowCutsceneManager(true)}>
                    <Clapperboard className="size-4" /> Cenas
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowImagepad(true)}>
                    <ImageIcon className="size-4" /> Galeria arcana
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowSoundpad(true)}>
                    <Mic className="size-4" /> Efeitos sonoros
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowLorebook(true)}>
                    <BookOpen className="size-4" /> <span className="text-[#eee3cf]">Diário do mundo</span>
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowPollModal(true)}>
                    <BarChart2 className="size-4" /> Criar enquete
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowGmPanel(true)}>
                    <Gift className="size-4" /> Distribuir itens
                  </Button>
                  <Button variant="outline" className="rpg-tool-button relative w-full justify-start gap-2" onClick={() => setShowDroppedLoots(true)}>
                    <Inbox className="size-4" /> Gerenciar loots
                    {npcLoots.length > 0 && <span className="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">{npcLoots.length}</span>}
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowBestiary(true)}>
                    <Skull className="size-4" /> Bestiário
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowBattleGrid(value => !value)} aria-expanded={showBattleGrid}>
                    <Grid3X3 className="size-4" /> Grade de batalha
                    <ChevronDown className={`ml-auto size-4 transition-transform ${showBattleGrid ? "rotate-180" : ""}`} />
                  </Button>
                </div>

                <div className="rpg-battle-grid-collapse" data-open={showBattleGrid} aria-hidden={!showBattleGrid}>
                  <div className="rpg-battle-grid-clip">
                    <div className="rpg-map-index flex flex-col gap-2">
                      {Array.from(new Map(savedMaps.map(m => [m.id, m])).values()).map(m => (
                        <div key={m.id} className="flex gap-2 w-full">
                          <Button size="sm" variant="outline" className={`rpg-map-entry flex-1 justify-start overflow-hidden text-left text-xs ${activeMap?.id === m.id ? "is-active" : ""}`} onClick={() => setActiveMap(m)} title="Abrir para você (Preparação)">
                            <Grid3X3 className="size-3 mr-2 shrink-0" /> <span className="truncate">{m.name}</span>
                          </Button>

                          <Button size="sm" variant="outline" className="rpg-map-action rpg-map-action-share w-9 shrink-0 px-0" onClick={() => handleForceSyncMap(m.id)} title="Transmitir este mapa para todos os jogadores">
                            <Eye className="size-3" />
                          </Button>

                          <Button size="sm" variant="outline" className="rpg-map-action rpg-map-action-edit w-9 shrink-0 px-0" onClick={() => handleRenameMap(m.id, m.name)} title="Renomear mapa">
                            <Pencil className="size-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="rpg-map-action rpg-map-action-delete w-9 shrink-0 px-0" onClick={() => handleDeleteMap(m.id)} title="Deletar mapa">
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" className="rpg-map-entry w-full justify-start text-xs" onClick={() => setShowMapImporter(true)}>
                        <Plus className="size-3 mr-2" /> Importar Novo Mapa
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Clima Dinâmico */}
                <div className="rpg-gm-section mt-4 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="rpg-weather-heading whitespace-nowrap font-bold uppercase tracking-widest">Clima Dinâmico</p>
                    <button onClick={() => handleSetWeather(weather)} className="flex items-center gap-1.5 text-xs font-bold uppercase text-primary hover:text-primary/80" title="Forçar clima para quem acabou de entrar"><RefreshCw className="size-3.5" /> Sincronizar</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button size="sm" onClick={() => handleSetWeather("clear")} className={`rpg-weather-button h-8 w-full p-0 ${weather === 'clear' ? 'is-active' : ''}`} data-weather="clear" title="Céu Limpo"><CloudSun className="size-[18px]" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("sunny")} className={`rpg-weather-button h-8 w-full p-0 ${weather === 'sunny' ? 'is-active' : ''}`} data-weather="sunny" title="Ensolarado"><Sun className="size-[18px]" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("cloudy")} className={`rpg-weather-button h-8 w-full p-0 ${weather === 'cloudy' ? 'is-active' : ''}`} data-weather="cloudy" title="Nublado"><Cloudy className="size-[18px]" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("fog")} className={`rpg-weather-button h-8 w-full p-0 ${weather === 'fog' ? 'is-active' : ''}`} data-weather="fog" title="Neblina"><CloudFog className="size-[18px]" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("rain")} className={`rpg-weather-button h-8 w-full p-0 ${weather === 'rain' ? 'is-active' : ''}`} data-weather="rain" title="Chuvoso"><CloudRainWind className="size-[18px]" /></Button>
                    <Button size="sm" onClick={() => handleSetWeather("blizzard")} className={`rpg-weather-button h-8 w-full p-0 ${weather === 'blizzard' ? 'is-active' : ''}`} data-weather="blizzard" title="Nevasca"><CloudSnow className="size-[18px]" /></Button>
                  </div>
                </div>

              </div>
            )}

            {!isGm && (
              <div className="panel rpg-gm-tools shrink-0 border border-accent/40 p-4">
                <div className="flex flex-col gap-2">
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowImagepad(true)}>
                    <ImageIcon className="size-4" /> Acervo visual
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowLorebook(true)}>
                    <BookOpen className="size-4" /> Diário do mundo
                  </Button>
                  <Button variant="outline" className="rpg-tool-button w-full justify-start gap-2" onClick={() => setShowPlayerMaps((value) => !value)} aria-expanded={showPlayerMaps}>
                    <Grid3X3 className="size-4" /> Mapas da campanha
                    <ChevronDown className={`ml-auto size-4 transition-transform ${showPlayerMaps ? "rotate-180" : ""}`} />
                  </Button>
                </div>

                <div className="rpg-battle-grid-collapse" data-open={showPlayerMaps} aria-hidden={!showPlayerMaps}>
                  <div className="rpg-battle-grid-clip">
                    <div className="rpg-map-index flex flex-col gap-2">
                      {Array.from(new Map(savedMaps.map((map) => [map.id, map])).values()).map((map) => (
                        <Button key={map.id} size="sm" variant="outline" className={`rpg-map-entry w-full justify-start overflow-hidden text-left text-xs ${activeMap?.id === map.id ? "is-active" : ""}`} onClick={() => setActiveMap(map)}>
                          <Grid3X3 className="mr-2 size-3 shrink-0" /> <span className="truncate">{map.name}</span>
                        </Button>
                      ))}
                      {savedMaps.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum mapa disponível.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence>
              {activePoll && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="panel flex flex-col rounded-xl border border-primary/50 overflow-hidden bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.2)] shrink-0 backdrop-blur-sm">
                  <div className="p-4 border-b border-primary/20 bg-black/40">
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#eee3cf]"><BarChart2 className="size-4 text-primary" /> Enquete em andamento</h2>
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

            <div className="rpg-cartography rpg-history-panel flex min-h-[300px] flex-1 flex-col overflow-hidden">
              <div className="rpg-history-heading shrink-0 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Dices className="size-4" /> Histórico da jornada</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar-sepia">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center italic mt-4">Nenhum evento registrado ainda.</p>
                ) : (
                  history.map((record) => (
                    <div key={record.id} className="rpg-history-entry flex flex-col gap-2 p-3 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between items-start">
                        <span className="rpg-history-name font-bold text-foreground">{record.title} <span className="rpg-history-profile ml-1 font-normal text-muted-foreground">({record.subtitle})</span></span>
                        <span className="rpg-history-time mt-0.5 text-muted-foreground">{record.time}</span>
                      </div>
                      <div className="rpg-history-detail flex items-center justify-between border px-3 py-2">
                        <span className={`rpg-history-detail-label font-semibold text-muted-foreground ${record.detail === "CLIMA ALTERADO" ? "is-weather" : ""}`}>{formatRollLabel(record.detail)}</span>
                        <span className={`text-xl font-black font-mono ${record.type === 'poll' ? 'text-foreground' : 'text-primary'}`}>{record.result}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rpg-leave-panel panel mt-auto shrink-0 p-4">
              <Button variant="destructive" className="rpg-leave-button w-full gap-2 font-semibold" disabled={leaving} onClick={handleLeaveCampaign}>
                <DoorOpen className="size-4" />
                {leaving ? "Saindo..." : (isGm ? "Encerrar Campanha" : "Abandonar sessão")}
              </Button>
            </div>
          </aside>

        </div>
      </div>
    </div>
  )
}