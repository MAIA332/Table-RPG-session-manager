"use client"
import { VoiceDock } from "./voice/voice-dock"
import { ArenaMinigame } from "./arena/arena-minigame"
import "./voice/voice.css"
import "./fullscreen-archives.css"
import { controllerAlert, controllerConfirm } from '@/lib/input/dialogs'
import {
  assertInventoryChange,
  assertInventoryFits,
  type ItemWeight,
} from "@/lib/inventory-weight"
import { CombatMonsterCard } from "./combat-monster-card"
import { CreatureAbilitiesManager } from "./creature-abilities-manager"

import { CreatureVitals } from "./creature-vitals"
import { useCombat } from "@/lib/use-combat"
import { CampaignCombat, type CombatActionRequest } from "./campaign-combat"
import { MonsterAttackPreviewShelf } from "./monster-attack-preview"
import type { PlayerAttackPreview, PlayerSpecialAttack, PlayerSpecialAttackCharacter } from "@/lib/player-special-attacks"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { ControllerGlyph } from "./controller/controller-glyph"
import { registerInputHandler } from "@/lib/input/dispatcher"
import { targetOfAction, restoreTargetOfAction, characterBoundOfAction } from "@/lib/input/targeted-actions"
import { skillRank } from "@/lib/skill-progression"
import { loreBonusLabel, type LoreUpgradeRecord } from "@/lib/special-attack-lore"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

import { apiFetch } from "@/lib/client"
import { bestiaryToNpc } from "@/lib/bestiary-to-npc"
import { useRealtime } from "@/lib/use-realtime"
import type { CustomCheck } from "@/lib/custom-checks"
import { CharacterCreator } from "@/components/character-creator"
import { CharacterBookShelf, ClassCardReveal } from "./class-books"
import { isTrainingActive } from "@/lib/training-model"
import { createClientId } from "@/lib/client-id"
import { createCombatInstanceId } from "@/lib/combat-instance-id"
import type { MonsterDiceState } from "@/lib/monster-dice"
import { upsertArchivedNPC, upsertNurseryNPC, linkSpawnedCharacter } from "@/lib/npc-nursery"
import { captureArchivedCharacter, buildArchivedNpcPatch, missingRestoredFields } from "@/lib/npc-archive-snapshot"
import { createNurseryRestorePatch, nurseryRestorationFields, missingNurseryExtras } from "@/lib/npc-restoration"
import { Button } from "@/components/ui/button"
import { CharacterPortrait } from "@/components/character-portrait"
import { PortraitGalleryViewer } from "@/components/portrait-gallery-viewer"
import {
  DiceRollPresentation,
  HandRaisePresentation,
  formatRollLabel,
  getDiceFromLabel,
  type DicePresentation,
  type DiceRollDetails,
  type HandPresentation,
} from "@/components/session-effects"

// IMPORTAÇÃO NOVA
import {
  GmDifficultyGuide,
  type DiceRollResult,
} from "@/components/gm-difficulty-guide"
import {
  DEFAULT_DIFFICULTY_SETTINGS, readDifficultySettings, dicePoolFromEvent,
  type DifficultySettings,
} from "@/lib/dynamic-difficulty"

import { GmBestiary } from "./gm-bestiary"
import { GmPanel } from "./gm-panel"

import {
  CharacterSheet,
  CreatureSheet,
  NPCCreator,
  type NPCDraft,
} from "@/components/character-sheet"

import { NpcNursery } from "./npc-nursery"

import { ATTRIBUTE_META, BASE_MAX_IP, EQUIPMENT, BESTIARY, CLASSES, getEquipment } from "@/lib/game-data"

import type {
  Character,
  Role,
  Creature,
  ActiveCreature,
  AttributeKey,
  ActivePoll,
  DieSize,
  ClassLevel,
  StoreFolder,
  GalleryFolder,
  GalleryBroadcastRequest,
  ItemTransfer,
} from "@/lib/types"

import {
  ArrowLeft,
  Crown,
  Plus,
  Radio,
  Shield,
  Users,
  DoorOpen,
  Dices,
  Gift,
  X,
  Send,
  Skull,
  Target,
  Heart,
  Zap,
  Package,
  Info,
  Loader2,
  Store,
  Coins,
  Inbox,
  Sun,
  CloudSun,
  CloudRainWind,
  CloudSnow,
  Cloudy,
  CloudFog,
  Sparkles,
  Grid3X3,
  BarChart2,
  Clock,
  Trash2,
  CheckCircle2,
  Save,
  UserPlus,
  Mic,
  RefreshCw,
  Clapperboard,
  Search,
  Pencil,
  Eye,
  Image as ImageIcon,
  ChevronDown,
  Hand,
  Volume2,
  Speaker,
  BookOpen,
} from "lucide-react"

import { GameMap, TileData } from "@/lib/map-types"
import { MapImporter } from "./map-importer"
import { BattlemapEngine } from "./battlemap-engine"

import { Soundpad, type ActiveSound, type Track } from "./soundpad"
import { SoundPlaybackEngine } from "./sound-playback-engine"
import { CutsceneManager } from "./cutscene-manager"
import { useControllerModalReturnGroup } from "@/lib/input/modal-focus-return"
import { DeathCheckOverlay } from "./death-check-overlay"
import { CutscenePlayer } from "./cutscene-player"
import type { Cutscene } from "./cutscene-types"

import { Imagepad, SharedImage } from "./imagepad"
import { GalleryImageViewer } from "./gallery-image-viewer"
import { CrisisControls } from "./crisis-controls"
import { crisisBlocksRoll, crisisSelfDamageOnRoll, type CrisisPublicState } from "@/lib/crisis-model"
import { Lorebook, type LoreEntry } from "./lorebook"
import { ThemeSwitcher } from "./theme-switcher"
import { PersonalNotes } from "./personal-notes"
import { HazardData } from "./condition-manager"

export interface Member {
  userId: string
  role: Role
  name: string
}

interface CampaignData {
  campaign: { id: string; name: string; code: string; ownerId: string }
  role: Role
  members: Member[]
  characters: Character[]
  me: { id: string; name: string }
}

interface HistoryRecord {
  id: string
  type: "roll" | "poll"
  title: string
  subtitle: string
  detail: string
  result: string | number
  time: string
}
interface DraftPoll {
  id: string
  question: string
  options: string[]
  duration: number
}
interface DroppedLoot {
  uid: string
  itemId: string
  sourceName: string
}

export interface CustomItem {
  id: string
  name: string
  type: "text" | "image" | "video" | "app-blueprints"
  content: string
}

type WeatherType = "clear" | "sunny" | "cloudy" | "fog" | "rain" | "blizzard"

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.2 } },
} as any
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } },
} as any
let handRaiseAudioContext: AudioContext | null = null

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function storeJsonWhenIdle(key: string, value: unknown) {
  if (typeof window === "undefined") return
  const write = () => localStorage.setItem(key, JSON.stringify(value))
  if (typeof window.requestIdleCallback === "function")
    window.requestIdleCallback(write, { timeout: 800 })
  else window.setTimeout(write, 0)
}

function getHandRaiseAudioContext() {
  if (typeof window === "undefined") return null
  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext
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

  const playNote = (
    start: number,
    frequency: number,
    duration: number,
    peak: number,
  ) => {
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
  const buffer = ctx.createBuffer(
    1,
    Math.floor(ctx.sampleRate * duration),
    ctx.sampleRate,
  )
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
    clickGain.gain.exponentialRampToValueAtTime(
      (0.075 - index * 0.007) * safeVolume,
      now + offset + 0.006,
    )
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

const WeatherOverlay = ({
  weather,
  effectsVolume,
}: {
  weather: WeatherType
  effectsVolume: number
}) => {
  useEffect(() => {
    if (weather === "clear") return

    const audioUrls: Record<string, string> = {
      rain: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/rain.mp3",
      blizzard:
        "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/wind.mp3",
      sunny:
        "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/ambiences/outdoor.mp3",
      cloudy:
        "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/weather/wind.mp3",
      fog: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/ambiences/cave.mp3",
    }

    const url = audioUrls[weather]
    if (!url) return

    const audio = new Audio(url)
    audio.loop = true
    audio.preload = "auto"
    const weatherLevel =
      weather === "rain" || weather === "blizzard" ? 0.22 : 0.14
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
            {Array.from({ length: 5 }, (_, index) => (
              <span
                key={index}
                style={{ animationDelay: `${index * -1.3}s` }}
              />
            ))}
          </div>
          <div className="weather-dust-field">
            {Array.from({ length: 18 }, (_, index) => (
              <span
                key={index}
                style={{
                  left: `${(index * 31 + 9) % 100}%`,
                  top: `${(index * 47 + 13) % 92}%`,
                  animationDelay: `${index * -0.7}s`,
                  animationDuration: `${7 + (index % 6)}s`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {weather === "cloudy" && (
        <div className="weather-cloud-field">
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              style={{
                top: `${8 + index * 18}%`,
                animationDelay: `${index * -7}s`,
                animationDuration: `${34 + index * 4}s`,
              }}
            />
          ))}
        </div>
      )}

      {weather === "fog" && (
        <div className="weather-fog-field">
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={index}
              style={{
                top: `${index * 15 - 8}%`,
                animationDelay: `${index * -2.1}s`,
                animationDuration: `${11 + index * 1.4}s`,
              }}
            />
          ))}
        </div>
      )}

      {weather === "rain" && (
        <>
          <div className="weather-cloud-field is-storm">
            {Array.from({ length: 4 }, (_, index) => (
              <span
                key={index}
                style={{
                  top: `${-2 + index * 11}%`,
                  animationDelay: `${index * -11}s`,
                  animationDuration: `${38 + index * 5}s`,
                }}
              />
            ))}
          </div>
          <div className="weather-rain-field">
            {rainParticles.map((particle, index) => (
              <span
                key={index}
                style={{
                  left: `${particle.left}%`,
                  opacity: particle.opacity,
                  animationDelay: `${particle.delay}s`,
                  animationDuration: `${particle.duration}s`,
                }}
              />
            ))}
            <i className="weather-lightning" />
          </div>
        </>
      )}

      {weather === "blizzard" && (
        <>
          <div className="weather-wind-field">
            {Array.from({ length: 10 }, (_, index) => (
              <span
                key={index}
                style={{
                  top: `${5 + index * 10}%`,
                  animationDelay: `${index * -0.9}s`,
                  animationDuration: `${2.7 + (index % 4) * 0.5}s`,
                }}
              />
            ))}
          </div>
          <div className="weather-snow-field">
            {snowParticles.map((particle, index) => (
              <span
                key={index}
                style={
                  {
                    left: `${particle.left}%`,
                    width: particle.size,
                    height: particle.size,
                    animationDelay: `${particle.delay}s`,
                    animationDuration: `${particle.duration}s`,
                    "--weather-drift": `${particle.drift}vw`,
                  } as any
                }
              />
            ))}
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
  const [playerAttackPreviews, setPlayerAttackPreviews] = useState<PlayerAttackPreview[]>([])
  const [playerPreviewOffset, setPlayerPreviewOffset] = useState(0)
  const refreshPlayerAttackPreviews = useCallback(async () => {
    const response = await apiFetch<{ previews: PlayerAttackPreview[]; serverNow: number }>(
      `/api/campaigns/${encodeURIComponent(initial.campaign.id)}/player-attack-previews`,
      { cache: "no-store" },
    )
    setPlayerAttackPreviews(Array.isArray(response.previews) ? response.previews : [])
    if (Number.isFinite(response.serverNow)) setPlayerPreviewOffset(response.serverNow - Date.now())
  }, [initial.campaign.id])
  useEffect(() => {
    void refreshPlayerAttackPreviews().catch(console.error)
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPlayerAttackPreviews().catch(() => undefined)
    }, 5000)
    const onFocus = () => void refreshPlayerAttackPreviews().catch(() => undefined)
    window.addEventListener("focus", onFocus)
    return () => { window.clearInterval(poll); window.removeEventListener("focus", onFocus) }
  }, [refreshPlayerAttackPreviews])
  async function cancelPlayerAttackPreview(previewId: string) {
    if (initial.role !== "gm") return
    try {
      await apiFetch(`/api/campaigns/${encodeURIComponent(initial.campaign.id)}/player-attack-previews`, {
        method: "DELETE", body: JSON.stringify({ previewId }),
      })
      await refreshPlayerAttackPreviews()
    } catch (error) { controllerAlert(error instanceof Error ? error.message : "Falha ao encerrar a imagem.") }
  }

  const [controllerFocusSkill, setControllerFocusSkill] = useState<number | string | null>(null)
  const [controllerPanelRequest, setControllerPanelRequest] = useState<string | null>(null)
  const restoringControllerVitals = useRef(new Set<string>())
  const [inventorySyncError, setInventorySyncError] = useState<string | null>(null)
  // Ignora respostas antigas se duas requisições forem iniciadas quase juntas.
  const ownedInventoryRequestVersion = useRef(0)
  const persistedInventoryCatalogLoaded = useRef(false)
  const [creating, setCreating] = useState(false)
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(
    null,
  )
  const [portraitGalleryCharacterId, setPortraitGalleryCharacterId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [activeMap, setActiveMap] = useState<GameMap | null>(null)
  const [showMapImporter, setShowMapImporter] = useState(false)
  const [showBattleGrid, setShowBattleGrid] = useState(false)
  const [showPlayerMaps, setShowPlayerMaps] = useState(false)

  // Clima
  const [weather, setWeather] = useState<WeatherType>("clear")

  // Painel de Loot (GmPanel)
  const [showGmPanel, setShowGmPanel] = useState(false)

  // Dificuldade adaptativa: a API autenticada do MongoDB é a única fonte de verdade.
  // O registro de rolagem recebe um snapshot desses valores: edições do Mestre
  // aplicam-se nas próximas rolagens e não reclassificam testes anteriores.
  const [difficultySettings, setDifficultySettings] = useState<DifficultySettings>({ ...DEFAULT_DIFFICULTY_SETTINGS })
  const [difficultyRevision, setDifficultyRevision] = useState(0)
  const [difficultyLoading, setDifficultyLoading] = useState(true)
  const [difficultyError, setDifficultyError] = useState("")
  const difficultySettingsRef = useRef<DifficultySettings>({ ...DEFAULT_DIFFICULTY_SETTINGS })
  const difficultyRevisionRef = useRef(0)
  const difficultyLoadedRef = useRef(false)
  const difficultyRequestVersion = useRef(0)
  const refreshDifficultySettings = useCallback(async () => {
    const version = ++difficultyRequestVersion.current
    try {
      const answer = await apiFetch<{ success: boolean; settings: DifficultySettings; revision: number }>(
        `/api/campaigns/${encodeURIComponent(data.campaign.id)}/difficulty`, { cache: "no-store" },
      )
      if (version !== difficultyRequestVersion.current) return
      if (answer.success !== true || !Number.isSafeInteger(answer.revision))
        throw new Error("A API não confirmou a configuração de dificuldade.")
      const received = readDifficultySettings(answer.settings)
      if (answer.revision < difficultyRevisionRef.current) return
      difficultySettingsRef.current = received
      difficultyRevisionRef.current = answer.revision
      difficultyLoadedRef.current = true
      setDifficultySettings(received)
      setDifficultyRevision(answer.revision)
      setDifficultyError("")
    } catch (error) {
      if (version === difficultyRequestVersion.current) {
        setDifficultyError(error instanceof Error ? error.message : "Não foi possível sincronizar a dificuldade.")
      }
      throw error
    } finally {
      if (version === difficultyRequestVersion.current) setDifficultyLoading(false)
    }
  }, [data.campaign.id])
  useEffect(() => {
    difficultySettingsRef.current = { ...DEFAULT_DIFFICULTY_SETTINGS }
    difficultyRevisionRef.current = 0
    difficultyLoadedRef.current = false
    setDifficultySettings({ ...DEFAULT_DIFFICULTY_SETTINGS })
    setDifficultyRevision(0)
    setDifficultyLoading(true)
    setDifficultyError("")
    void refreshDifficultySettings().catch(() => undefined)
    const check = () => { if (document.visibilityState === "visible") void refreshDifficultySettings().catch(() => undefined) }
    const timer = window.setInterval(check, 15_000)
    window.addEventListener("focus", check)
    return () => { ++difficultyRequestVersion.current; window.clearInterval(timer); window.removeEventListener("focus", check) }
  }, [refreshDifficultySettings])
  const saveDifficultySettings = useCallback(async (requested: DifficultySettings) => {
    if (data.role !== "gm") throw new Error("Somente o Mestre pode alterar os parâmetros.")
    if (!difficultyLoadedRef.current) throw new Error("Aguarde a sincronização das configurações.")
    // Invalida consultas iniciadas antes deste salvamento; a revisão é atômica.
    ++difficultyRequestVersion.current
    const result = await apiFetch<{ success: boolean; settings: DifficultySettings; revision: number }>(
      `/api/campaigns/${encodeURIComponent(data.campaign.id)}/difficulty`, {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: difficultyRevisionRef.current, settings: requested }),
      },
    ).catch(async error => {
      await refreshDifficultySettings().catch(() => undefined)
      throw error
    })
    if (result.success !== true || !Number.isSafeInteger(result.revision))
      throw new Error("O MongoDB não confirmou os novos parâmetros.")
    const confirmed = readDifficultySettings(result.settings)
    difficultySettingsRef.current = confirmed
    difficultyRevisionRef.current = result.revision
    difficultyLoadedRef.current = true
    setDifficultySettings(confirmed)
    setDifficultyRevision(result.revision)
    setDifficultyError("")
    setDifficultyLoading(false)
  }, [data.campaign.id, data.role, refreshDifficultySettings])

  // ESTADO DA ÚLTIMA ROLAGEM LIDA PARA O MESTRE
  const [latestDiceRoll, setLatestDiceRoll] = useState<DiceRollResult | null>(
    null,
  )
  // A visão do jogador acompanha apenas as próprias fichas, não a última
  // rolagem pública de outro integrante da mesa.
  const [latestPlayerDiceRoll, setLatestPlayerDiceRoll] = useState<DiceRollResult | null>(null)
  const ownDiceCharactersRef = useRef({ ids: new Set<string>(), names: new Set<string>() })
  ownDiceCharactersRef.current = {
    ids: new Set(characters.filter(c => c.ownerId === data.me.id).map(c => c.id)),
    names: new Set(characters.filter(c => c.ownerId === data.me.id).map(c => c.name)),
  }
  useEffect(() => {
    setLatestDiceRoll(null)
    setLatestPlayerDiceRoll(null)
  }, [data.campaign.id, data.me.id])

  // Criador de Itens Úteis (Handouts)
  const [itemNotification, setItemNotification] = useState<string | null>(null)
  const [inventoryToOpen, setInventoryToOpen] = useState<string | null>(null)
  // A mochila acionada por atalho é uma tela independente, não uma ficha empilhada.
  const [inventoryShortcutId, setInventoryShortcutId] = useState<string | null>(null)
  const [itemTransfers, setItemTransfers] = useState<ItemTransfer[]>([])
  const [resolvingTransferId, setResolvingTransferId] = useState<string | null>(
    null,
  )

  // Criador de Enquetes e Rascunhos
  const [showPollModal, setShowPollModal] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pollDuration, setPollDuration] = useState(60)
  const [draftPolls, setDraftPolls] = useState<DraftPoll[]>([])

  // Enquete Ativa (Global da Sala)
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null)
  const [pollMinimized, setPollMinimized] = useState(false)
  useEffect(() => setPollMinimized(false), [activePoll?.id])
  const [now, setNow] = useState(Date.now())

  // Berçário de NPCs Customizados
  const [showNursery, setShowNursery] = useState(false)
  const [customNPCs, setCustomNPCs] = useState<NPCDraft[]>([])
  const customNPCsRef = useRef<NPCDraft[]>([])
  const nurseryWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const archivingCharacterIdsRef = useRef(new Set<string>())

  // Loots Caídos de NPCs mortos
  const [showDroppedLoots, setShowDroppedLoots] = useState(false)
  const [npcLoots, setNpcLoots] = useState<DroppedLoot[]>([])
  const [selectedDroppedLoot, setSelectedDroppedLoot] =
    useState<DroppedLoot | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<
    string | null
  >(null)

  // Bestiário
  const [showBestiary, setShowBestiary] = useState(false)
  const [activeCreatures, setActiveCreatures] = useState<ActiveCreature[]>([])
  const combatController = useCombat(data.campaign.id)
  useEffect(() => {
    if (!showBestiary || data.role !== "gm") return
    let active = true
    void apiFetch<{ state: { customCreatures: Creature[] } }>(
      `/api/campaigns/${data.campaign.id}/state`,
    )
      .then((result) => {
        if (active) setCustomCreatures(result.state.customCreatures || [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [showBestiary, data.role, data.campaign.id])
  const [combatUiError, setCombatUiError] = useState("")
  const [editingCreatureAbilities, setEditingCreatureAbilities] = useState<
    string | null
  >(null)
  const [controlledCharacterId, setControlledCharacterId] = useState("")
  const ownedCombatCharacters =
    combatController.combat?.characters.filter(
      (c) =>
        c.ownerId === data.me.id &&
        combatController.combat!.participantCharacterIds.includes(c.id),
    ) || []
  const myCombatCharacter =
    ownedCombatCharacters.find(
      (c) => c.id === combatController.combat?.actorCharacterId,
    ) ||
    ownedCombatCharacters.find((c) => c.id === controlledCharacterId) ||
    combatController.combat?.characters.find(
      (c) =>
        c.ownerId === data.me.id &&
        combatController.combat?.participantCharacterIds.includes(c.id),
    )
  const qtePending =
    !!combatController.combat?.qte &&
    !combatController.combat.qte.targets.every(
      (id) => !!combatController.combat?.qte?.outcomes[id],
    )
  const canGmAct =
    !!combatController.combat?.enabled &&
    !combatController.combat.pendingAttack &&
    combatController.combat.spotlight.side === "gm" &&
    !qtePending
  const runCombat = async (command: {
    type: string
    [key: string]: unknown
  }) => {
    setCombatUiError("")
    try {
      return await combatController.send(command)
    } catch (error) {
      setCombatUiError(
        error instanceof Error ? error.message : "Ação não confirmada",
      )
      return null
    }
  }
  const requestMyTurn = async () => {
    if (!myCombatCharacter) {
      setCombatUiError(
        "Seu personagem ainda não foi incluído nos participantes. Peça ao Mestre para selecioná-lo.",
      )
      return
    }
    if (myCombatCharacter.resources.hp <= 0) {
      setCombatUiError("Seu personagem está sem HP para agir.")
      return
    }
    await runCombat({ type: "request", characterId: myCombatCharacter.id })
  }

  const [combatActionRequest, setCombatActionRequest] =
    useState<CombatActionRequest | null>(null)
  const openCombatAction = (
    instanceId: string,
    attackIndex?: number,
    abilityId?: string,
  ) =>
    setCombatActionRequest({
      id: createClientId(),
      instanceId,
      attackIndex,
      abilityId,
    })
  useEffect(() => {
    const snapshot = combatController.combat
    if (!snapshot) return
    setActiveCreatures(snapshot.creatures as unknown as ActiveCreature[])
    setCharacters((current) =>
      current.map((character) => {
        const received = snapshot.characters.find((c) => c.id === character.id)
        if (
          !received ||
          Number(received.updatedAt || 0) < Number(character.updatedAt || 0)
        )
          return character
        if (
          character.resources.hp === received.resources.hp &&
          character.resources.mp === received.resources.mp
        )
          return character
        return {
          ...character,
          resources: {
            ...character.resources,
            hp: received.resources.hp,
            mp: received.resources.mp,
          },
        }
      }),
    )
  }, [combatController.combat])
  const [selectedCombatCharId, setSelectedCombatCharId] = useState<
    string | null
  >(null)
  const [selectedCombatCreatureId, setSelectedCombatCreatureId] = useState<
    string | null
  >(null)
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)
  const [savedMaps, setSavedMaps] = useState<GameMap[]>([])

  // Histórico Unificado
  const [history, setHistory] = useState<HistoryRecord[]>([])

  // SOUNDPAD STATES
  const [showSoundpad, setShowSoundpad] = useState(false)
  const [activeSounds, setActiveSounds] = useState<ActiveSound[]>([])
  const [soundTargetUserId, setSoundTargetUserId] = useState<string | null>(null)
  const completedSoundIds = useRef(new Set<string>())
  const soundRefreshVersion = useRef(0)
  useEffect(() => {
    completedSoundIds.current.clear()
    soundRefreshVersion.current++
    setActiveSounds([])
    setSoundTargetUserId(null)
    return () => { soundRefreshVersion.current++ }
  }, [data.campaign.id, data.me.id])

  const refreshSounds = useCallback(async () => {
    const version = ++soundRefreshVersion.current
    const response = await apiFetch<{ sounds: ActiveSound[] }>(
      `/api/campaigns/${data.campaign.id}/sound`,
      { cache: "no-store" },
    )
    if (version !== soundRefreshVersion.current) return
    const sounds = response.sounds || []
    setActiveSounds(sounds.filter(sound =>
      !completedSoundIds.current.has(sound.id) &&
      (data.role === "gm" || sound.targetUserId == null || sound.targetUserId === data.me.id)
    ))
  }, [data.campaign.id, data.me.id, data.role])

  const handleSoundEnded = useCallback((sound: ActiveSound) => {
    completedSoundIds.current.add(sound.id)
    setActiveSounds(prev => prev.filter(item => item.id !== sound.id))
    if (sound.loop || (data.role !== "gm" && sound.targetUserId !== data.me.id)) return
    void apiFetch(`/api/campaigns/${data.campaign.id}/sound`, {
      method: "POST",
      body: JSON.stringify({ action: "ended", id: sound.id }),
    }).then(() => refreshSounds()).catch(console.error)
  }, [data.campaign.id, data.me.id, data.role, refreshSounds])
  const [customSounds, setCustomSounds] = useState<Track[]>([])
  const [showVolumeMixer, setShowVolumeMixer] = useState(false)
  const [effectsVolume, setEffectsVolume] = useState(0.5)
  const [handRaiseCooldown, setHandRaiseCooldown] = useState(false)
  const [dicePresentations, setDicePresentations] = useState<
    DicePresentation[]
  >([])
  const [handPresentation, setHandPresentation] =
    useState<HandPresentation | null>(null)
  const volumeMixerRef = useRef<HTMLDivElement | null>(null)
  const mapsLoadedFromApiRef = useRef(false)
  const campaignStateLoadedFromApiRef = useRef(false)
  const campaignStateSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const lastActiveMapIdRef = useRef<string | null>(null)

  // === CUTSCENES STATES ===
  const [showCutsceneManager, setShowCutsceneManager] = useState(false)
  const [cutscenes, setCutscenes] = useState<Cutscene[]>([])
  const [cutscenePlayId, setCutscenePlayId] = useState("")
  const seenCutscenePlays = useRef(new Set<string>())
  const [activeCutscene, setActiveCutscene] = useState<Cutscene | null>(null)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)
  // 1. ESTADO DA MIRA (CROSSHAIR)
  const [pendingCombatAction, setPendingCombatAction] = useState<{
    sourceId: string
    attackIndex?: number
    abilityId?: string
    isGm: boolean
  } | null>(null)

  // 2. FUNÇÃO QUE EXECUTA O ATAQUE AO CLICAR NA CARTA
  useEffect(() => {
    if (!pendingCombatAction) return
    const snapshot = combatController.combat
    const allowed = pendingCombatAction.isGm
      ? canGmAct
      : snapshot?.spotlight.side === "group" &&
        snapshot?.spotlight.activePlayerId === data.me.id &&
        snapshot?.actorCharacterId === pendingCombatAction.sourceId &&
        !snapshot?.spotlight.request &&
        !qtePending
    if (!allowed) setPendingCombatAction(null)
  }, [
    combatController.combat,
    pendingCombatAction,
    canGmAct,
    qtePending,
    data.me.id,
  ])
  const handleTargetSelect = async (targetId: string) => {
    if (!pendingCombatAction || combatController.pending) return
    const action = pendingCombatAction
    const snapshot = combatController.combat
    if (action.isGm && !snapshot?.participantCharacterIds.includes(targetId)) {
      setCombatUiError("Escolha um participante do combate como alvo.")
      return
    }
    const result = await runCombat(
      action.isGm
        ? {
            type: "monster-attack",
            instanceId: action.sourceId,
            characterId: targetId,
            attackIndex: action.attackIndex,
            abilityId: action.abilityId,
          }
        : {
            type: "player-attack",
            characterId: action.sourceId,
            instanceId: targetId,
            attackIndex: action.attackIndex,
          },
    )
    if (result) setPendingCombatAction(null)
  }

  // === GALERIA ARCANA ===
  const [showImagepad, setShowImagepad] = useState(false)
  const [galleryTargetingEnabled, setGalleryTargetingEnabled] = useState(false)
  const imageDeliveryQueue = useRef<Promise<void>>(Promise.resolve())
  const imageDeliveryGeneration = useRef(0)
  useEffect(() => {
    imageDeliveryGeneration.current++
    imageDeliveryQueue.current = Promise.resolve()
    setGalleryTargetingEnabled(false)
    return () => { imageDeliveryGeneration.current++ }
  }, [data.campaign.id, data.me.id])
  const [activeFullscreenImage, setActiveFullscreenImage] = useState<
    string | null
  >(null)

  const [galleryImages, setGalleryImages] = useState<SharedImage[]>([])

  const [galleryFolders, setGalleryFolders] = useState<GalleryFolder[]>([
    {
      id: "root",
      name: "Todas as imagens",
    },
  ])
  const [galleryRequests, setGalleryRequests] = useState<GalleryBroadcastRequest[]>([])
  const [galleryNotice, setGalleryNotice] = useState<string | null>(null)

  // === LOREBOOK ===
  const [showLorebook, setShowLorebook] = useState(false)
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([])

  // === CUSTOM DATA ===
  const [customCreatures, setCustomCreatures] = useState<Creature[]>([])
  const [customEquipment, setCustomEquipment] = useState<any[]>([])
  const [customClasses, setCustomClasses] = useState<any[]>([])
  const [booksRevision, setBooksRevision] = useState(0)
  const [customChecks, setCustomChecks] = useState<CustomCheck[]>([])
  const [customChecksRevision, setCustomChecksRevision] = useState(0)
  const checksRequestVersion = useRef(0)
  const refreshCustomChecks = useCallback(async () => {
    const currentRequest = ++checksRequestVersion.current
    const response = await apiFetch<{ checks: CustomCheck[]; revision: number }>(
      `/api/campaigns/${encodeURIComponent(data.campaign.id)}/custom-checks`,
      { cache: "no-store" },
    )
    if (currentRequest !== checksRequestVersion.current) return
    setCustomChecks(Array.isArray(response.checks) ? response.checks : [])
    setCustomChecksRevision(Number(response.revision) || 0)
  }, [data.campaign.id])
  useEffect(() => { void refreshCustomChecks().catch(console.error) }, [refreshCustomChecks])
  const [cardReveal, setCardReveal] = useState<{ cardName: string; cardImage?: string | null; cardEffects?: string; casterName: string } | null>(null)
  const cardRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (cardRevealTimer.current) clearTimeout(cardRevealTimer.current) }, [])
  const [storeFolders, setStoreFolders] = useState<StoreFolder[]>([])

  const [activeHazards, setActiveHazards] = useState<HazardData[]>([])

  const isGm = data.role === "gm"
  const mapRequestVersion = useRef(0)
  const pendingOpenMapId = useRef<string | null>(null)
  const [mapActionPending, setMapActionPending] = useState(false)
  const mapActionBusy = useRef(false)
  const refreshMaps = useCallback(async (openMapId?: string) => {
    if (openMapId) pendingOpenMapId.current = openMapId
    const version = ++mapRequestVersion.current
    const response = await fetch(`/api/campaigns/${encodeURIComponent(data.campaign.id)}/maps`, { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Não foi possível atualizar os mapas.")
    if (!Array.isArray(body.maps)) throw new Error("Lista de mapas inválida.")
    if (version !== mapRequestVersion.current) return
    const maps = (body.maps as GameMap[]).filter(map => data.role === "gm" || map.isPublic === true)
    const firstLoad = !mapsLoadedFromApiRef.current
    mapsLoadedFromApiRef.current = true
    setSavedMaps(maps)
    // Remove the old shared cache; private maps are no longer persisted in the browser.
    try { localStorage.removeItem(`maps_${data.campaign.id}`) } catch {}
    const requestedId = pendingOpenMapId.current
    pendingOpenMapId.current = null
    setActiveMap(previous => {
      const id = requestedId || previous?.id || (firstLoad ? lastActiveMapIdRef.current : null)
      return maps.find(map => map.id === id) || null
    })
  }, [data.campaign.id, data.role])

  useEffect(() => {
    mapsLoadedFromApiRef.current = false
    pendingOpenMapId.current = null
    setSavedMaps([])
    setActiveMap(null)
    const refresh = () => { void refreshMaps().catch(console.error) }
    refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh() }, 3000)
    window.addEventListener("focus", refresh)
    return () => {
      ++mapRequestVersion.current
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [refreshMaps])

  const effectsVolumeRef = useRef(effectsVolume)
  const isGmRef = useRef(isGm)

  useEffect(() => {
    effectsVolumeRef.current = effectsVolume
  }, [effectsVolume])

  useEffect(() => {
    isGmRef.current = isGm
  }, [isGm])

  useEffect(() => {
    apiFetch<{ transfers: ItemTransfer[] }>(
      `/api/item-transfers?campaignId=${encodeURIComponent(data.campaign.id)}`,
    )
      .then((result) => setItemTransfers(result.transfers || []))
      .catch(console.error)
  }, [data.campaign.id])

  const persistCampaignState = useCallback(
    (state: Record<string, unknown>) => {
      if (!isGm) return Promise.resolve()
      const request = campaignStateSaveQueueRef.current
        .catch(() => undefined)
        .then(() =>
          apiFetch(`/api/campaigns/${data.campaign.id}/state`, {
            method: "POST",
            body: JSON.stringify({ state }),
          }),
        )
      campaignStateSaveQueueRef.current = request
      request.catch(console.error)
      return request
    },
    [data.campaign.id, isGm],
  )
  const applyGalleryResponse = useCallback((response: {
    images?: SharedImage[]
    folders?: GalleryFolder[]
    requests?: GalleryBroadcastRequest[]
    capabilities?: { targetedImages?: boolean }
  }) => {
    setGalleryTargetingEnabled(response.capabilities?.targetedImages === true)
    const normalizedImages = (response.images || []).map((image) => ({
      ...image,
      folderId: image.folderId || "root",
    }))
    setGalleryImages(normalizedImages)
    setGalleryFolders(response.folders || [{ id: "root", name: "Todas as imagens" }])
    setGalleryRequests(response.requests || [])
    storeJsonWhenIdle(`images_${data.campaign.id}`, normalizedImages)
    storeJsonWhenIdle(`gallery_folders_${data.campaign.id}`, response.folders || [])
  }, [data.campaign.id])

  // Respostas antigas de GET não podem desfazer criações/renomeações já confirmadas.
  const galleryRefreshVersion = useRef(0)
  const refreshGallery = useCallback(async () => {
    const version = ++galleryRefreshVersion.current
    const response = await apiFetch<{
      images: SharedImage[]
      folders: GalleryFolder[]
      requests: GalleryBroadcastRequest[]
      capabilities?: { targetedImages?: boolean }
    }>(`/api/campaigns/${data.campaign.id}/gallery`)
    if (version !== galleryRefreshVersion.current) return
    applyGalleryResponse(response)
  }, [applyGalleryResponse, data.campaign.id])

  const galleryAction = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (action === "broadcast" || action === "resolve-broadcast") {
      if (data.role !== "gm") throw new Error("Apenas o mestre pode transmitir imagens.")
      if (payload.targetUserId != null && (!galleryTargetingEnabled || !data.members.some(member => member.role === "player" && member.userId === payload.targetUserId))) {
        throw new Error("O envio individual não está disponível para esse jogador.")
      }
    }
    // O protocolo incremental evita que a API envie megabytes de base64 em
    // toda alteração de visibilidade, exclusão, movimentação ou adição.
    const useDelta = ["toggle-public", "delete", "move", "add", "create-folder", "rename-folder", "delete-folder"].includes(action)
    const response = await apiFetch<{
      images?: SharedImage[]
      folders?: GalleryFolder[]
      requests?: GalleryBroadcastRequest[]
      capabilities?: { targetedImages?: boolean }
      delta?: { action: string; imageId?: string; isPublic?: boolean; folderId?: string; destinationFolderId?: string }
    }>(`/api/campaigns/${data.campaign.id}/gallery`, {
      method: "POST",
      body: JSON.stringify({ action, ...payload, ...(useDelta ? { compactResponse: true } : {}) }),
    })
    // Cancela GETs anteriores que poderiam restaurar pastas desatualizadas.
    ++galleryRefreshVersion.current
    if (response.delta) {
      // Aplicar somente após confirmação do servidor: falhas não alteram a UI.
      const delta = response.delta
      if (Array.isArray(response.folders)) {
        setGalleryFolders(response.folders)
        storeJsonWhenIdle(`gallery_folders_${data.campaign.id}`, response.folders)
      }
      if (["toggle-public", "delete", "move", "add", "delete-folder"].includes(delta.action)) setGalleryImages(current => {
        let next = current
        if (delta.action === "toggle-public") next = current.map(image =>
          image.id === delta.imageId ? { ...image, isPublic: delta.isPublic === true } : image)
        else if (delta.action === "delete") next = current.filter(image => image.id !== delta.imageId)
        else if (delta.action === "move") next = current.map(image =>
          image.id === delta.imageId ? { ...image, folderId: delta.folderId || "root" } : image)
        else if (delta.action === "add" && payload.image && typeof payload.image === "object") {
          const added = payload.image as SharedImage
          if (!current.some(image => image.id === delta.imageId)) next = [...current, added]
        }
        else if (delta.action === "delete-folder") next = current.map(image =>
          image.folderId === delta.folderId
            ? { ...image, folderId: delta.destinationFolderId || "root" }
            : image)
        storeJsonWhenIdle(`images_${data.campaign.id}`, next)
        return next
      })
      if (delta.action === "delete") setGalleryRequests(current =>
        current.filter(entry => entry.imageId !== delta.imageId))
    } else if (Array.isArray(response.images)) {
      // Compatibilidade com servidores que ainda respondem no formato antigo.
      applyGalleryResponse({
        images: response.images,
        folders: response.folders,
        requests: response.requests,
        capabilities: response.capabilities,
      })
    }
    // Show locally after successful delivery; do not broaden the server recipients.
    if (data.role === "gm" && payload.targetUserId != null &&
      (action === "broadcast" || (action === "resolve-broadcast" && payload.resolution === "approved"))) {
      const request = galleryRequests.find(entry => entry.id === payload.requestId)
      const image = response.images?.find(entry => entry.id === payload.imageId)
        || galleryImages.find(entry => entry.id === payload.imageId)
      const url = image?.url || request?.imageUrl
      if (url) setActiveFullscreenImage(url)
    }
  }, [applyGalleryResponse, data.campaign.id, data.role, data.members, galleryTargetingEnabled, galleryImages, galleryRequests])

  // Montagem & Carregar Storage
  useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      lastActiveMapIdRef.current = localStorage.getItem(
        `last_active_map_${data.campaign.id}`,
      )
      const loadStoredState = () => {
        if (!campaignStateLoadedFromApiRef.current) {
          const savedCustomCreatures = localStorage.getItem(
            `custom_creatures_${data.campaign.id}`,
          )
          if (savedCustomCreatures) {
            try {
              setCustomCreatures(JSON.parse(savedCustomCreatures))
            } catch (e) {}
          }

          const savedCustomClasses = localStorage.getItem(
            `custom_classes_${data.campaign.id}`,
          )
          if (savedCustomClasses) {
            try {
              setCustomClasses(JSON.parse(savedCustomClasses))
            } catch (e) {}
          }

          const savedCustomEquipment = localStorage.getItem(
            `custom_equipment_${data.campaign.id}`,
          )
          if (savedCustomEquipment) {
            try {
              setCustomEquipment(JSON.parse(savedCustomEquipment))
            } catch (e) {}
          }

          const savedDrafts = localStorage.getItem(`drafts_${data.campaign.id}`)
          if (savedDrafts) {
            try {
              setDraftPolls(JSON.parse(savedDrafts))
            } catch (e) {}
          }

          const savedGallery = localStorage.getItem(
            `images_${data.campaign.id}`,
          )
          if (savedGallery) {
            try {
              setGalleryImages(JSON.parse(savedGallery))
            } catch (e) {}
          }

          const savedGalleryFolders = localStorage.getItem(
            `gallery_folders_${data.campaign.id}`,
          )

          if (savedGalleryFolders) {
            try {
              setGalleryFolders(JSON.parse(savedGalleryFolders))
            } catch {}
          }

          const savedLore = localStorage.getItem(`lore_${data.campaign.id}`)
          if (savedLore) {
            try {
              setLoreEntries(JSON.parse(savedLore))
            } catch (e) {}
          }

          const savedNPCs = localStorage.getItem(
            `custom_npcs_${data.campaign.id}`,
          )
          if (savedNPCs) {
            try {
              const restored = JSON.parse(savedNPCs)
              if (Array.isArray(restored)) {
                customNPCsRef.current = restored
                setCustomNPCs(restored)
              }
            } catch (e) {}
          }

          const savedLoots = localStorage.getItem(
            `npc_loots_${data.campaign.id}`,
          )
          if (savedLoots) {
            try {
              setNpcLoots(JSON.parse(savedLoots))
            } catch (e) {}
          }

          const savedWeather = localStorage.getItem(
            `weather_${data.campaign.id}`,
          )
          if (savedWeather) {
            setWeather(savedWeather as WeatherType)
          }

          const savedCutscenesStr = localStorage.getItem(
            `cutscenes_${data.campaign.id}`,
          )
          if (savedCutscenesStr) {
            try {
              setCutscenes(JSON.parse(savedCutscenesStr))
            } catch (e) {}
          }

          const savedCustomSounds = localStorage.getItem(
            `custom_sounds_${data.campaign.id}`,
          )
          if (savedCustomSounds) {
            try {
              setCustomSounds(JSON.parse(savedCustomSounds))
            } catch (e) {}
          }
        }

        const savedMixerStr = localStorage.getItem(
          `audio_mixer_${data.campaign.id}`,
        )
        if (savedMixerStr) {
          try {
            const savedMixer = JSON.parse(savedMixerStr)
            if (typeof savedMixer.effects === "number")
              setEffectsVolume(clampVolume(savedMixer.effects))
            else if (typeof savedMixer.music === "number")
              setEffectsVolume(clampVolume(savedMixer.music))
          } catch (e) {}
        }

        // Map access is always restored from the authenticated API.
        try { localStorage.removeItem(`maps_${data.campaign.id}`) } catch {}

      }

      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(loadStoredState, {
          timeout: 350,
        })
        return () => window.cancelIdleCallback(idleId)
      }

      const timeoutId = window.setTimeout(loadStoredState, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [data.campaign.id])

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return
    localStorage.setItem(
      `audio_mixer_${data.campaign.id}`,
      JSON.stringify({ music: effectsVolume, effects: effectsVolume }),
    )
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
    if (isGm) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Bloqueia F12
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault()
      }
      // Bloqueia Ctrl+Shift+I / Cmd+Option+I (Inspecionar)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "I" || e.key === "i")
      ) {
        e.preventDefault()
      }
      // Bloqueia Ctrl+Shift+J / Cmd+Option+J (Console)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "J" || e.key === "j")
      ) {
        e.preventDefault()
      }
      // Bloqueia Ctrl+Shift+C / Cmd+Option+C (Seletor de Elemento)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "C" || e.key === "c")
      ) {
        e.preventDefault()
      }
      // Bloqueia Ctrl+U / Cmd+U (Ver código-fonte)
      if ((e.ctrlKey || e.metaKey) && (e.key === "U" || e.key === "u")) {
        e.preventDefault()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      // Bloqueia o botão direito do mouse (evita "Inspecionar Elemento" pelo menu)
      e.preventDefault()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("contextmenu", handleContextMenu)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("contextmenu", handleContextMenu)
    }
  }, [isGm])

  // Timer da Enquete
  useEffect(() => {
    if (!activePoll) return
    const int = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(int)
  }, [activePoll])

  // Recupera enquetes ativas no banco, mesmo após perder um evento SSE ou recarregar.
  useEffect(() => {
    let cancelled = false
    const refreshPoll = async () => {
      try {
        const state = await apiFetch<{activePoll:ActivePoll|null}>(`/api/campaigns/${data.campaign.id}/poll`,{cache:'no-store'})
        if (!cancelled) setActivePoll(current => {
          if (!state.activePoll) return null
          if (current?.id === state.activePoll.id && Object.keys(current.votes).length > Object.keys(state.activePoll.votes).length) return current
          return state.activePoll
        })
      } catch { /* estado anterior permanece até a reconexão */ }
    }
    void refreshPoll()
    const timer = window.setInterval(()=>void refreshPoll(),15_000)
    const onVisibility = () => {if (document.visibilityState === 'visible') void refreshPoll()}
    document.addEventListener('visibilitychange',onVisibility)
    return () => {cancelled=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility)}
  }, [data.campaign.id])

  // Baixa os mapas via API e sincroniza com o localstorage
  useEffect(() => {
    apiFetch<{ state: Record<string, any>; persistedFields: string[] }>(
      `/api/campaigns/${data.campaign.id}/state`,
    )
      .then((res) => {
        if (!res?.state) return
        campaignStateLoadedFromApiRef.current = true
        const persisted = new Set(res.persistedFields || [])
        if (isGm && Array.isArray(res.state.loreUpgradeHistory)) {
          const records = res.state.loreUpgradeHistory as LoreUpgradeRecord[]
          setHistory(previous => {
            const added = records.filter(record => record && typeof record.id === 'string'
              && !previous.some(entry=>entry.id===record.id)).map(record => ({
                id:record.id,type:'poll' as const,title:`${record.characterName} · Lore investido`,
                subtitle:'Golpe especial',detail:`${record.attackName} · ${record.cost} LP gastos`,
                result:loreBonusLabel(record.newLevel),
                time:new Date(record.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              }))
            return [...added,...previous].slice(0,50)
          })
        }
        const readArray = (key: string) => {
          try {
            const value = JSON.parse(localStorage.getItem(key) || "[]")
            return Array.isArray(value) ? value : []
          } catch {
            return []
          }
        }

        if (!isGm) {
          const gallery = Array.isArray(res.state.gallery)
            ? res.state.gallery.map((image: any) => ({
                ...image,
                folderId: image?.folderId || "root",
              }))
            : []
          const lore = Array.isArray(res.state.lore) ? res.state.lore : []
          const customEq = Array.isArray(res.state.customEquipment)
            ? res.state.customEquipment
            : []
          const customCls = Array.isArray(res.state.customClasses)
            ? res.state.customClasses
            : []
          const savedGalleryFolders = Array.isArray(res.state.galleryFolders)
            ? res.state.galleryFolders
            : [
                {
                  id: "root",
                  name: "Todas as imagens",
                },
              ]
          const savedStoreFolders = Array.isArray(res.state.storeFolders)
            ? res.state.storeFolders
            : []

          setStoreFolders(savedStoreFolders)
          setGalleryFolders(savedGalleryFolders)

          storeJsonWhenIdle(
            `store_folders_${data.campaign.id}`,
            savedStoreFolders,
          )
          setGalleryImages(gallery)
          setLoreEntries(lore)
          if (!persistedInventoryCatalogLoaded.current) setCustomEquipment(customEq)
          setCustomClasses(customCls)
          setWeather((res.state.weather || "clear") as WeatherType)
          storeJsonWhenIdle(`images_${data.campaign.id}`, gallery)
          storeJsonWhenIdle(`lore_${data.campaign.id}`, lore)
          storeJsonWhenIdle(`custom_classes_${data.campaign.id}`, customCls)
          storeJsonWhenIdle(`custom_equipment_${data.campaign.id}`, customEq)
          storeJsonWhenIdle(
            `gallery_folders_${data.campaign.id}`,
            savedGalleryFolders,
          )

          localStorage.setItem(
            `weather_${data.campaign.id}`,
            res.state.weather || "clear",
          )
          return
        }

        const migration: Record<string, unknown> = {}
        const pickArray = (field: string, storageKey: string) => {
          if (persisted.has(field))
            return Array.isArray(res.state[field]) ? res.state[field] : []
          const hasCachedValue = localStorage.getItem(storageKey) !== null
          const cached = readArray(storageKey)
          if (hasCachedValue) migration[field] = cached
          return cached
        }
        const savedCustomCreatures = pickArray(
          "customCreatures",
          `custom_creatures_${data.campaign.id}`,
        ) as Creature[]
        const savedCustomEquipment = pickArray(
          "customEquipment",
          `custom_equipment_${data.campaign.id}`,
        ) as any[]
        const savedCustomClasses = pickArray(
          "customClasses",
          `custom_classes_${data.campaign.id}`,
        ) as any[]
        const gallery = pickArray(
          "gallery",
          `images_${data.campaign.id}`,
        ) as SharedImage[]
        const savedGalleryFolders = pickArray(
          "galleryFolders",
          `gallery_folders_${data.campaign.id}`,
        ) as GalleryFolder[]
        const lore = pickArray(
          "lore",
          `lore_${data.campaign.id}`,
        ) as LoreEntry[]
        const savedCutscenes = pickArray(
          "cutscenes",
          `cutscenes_${data.campaign.id}`,
        ) as Cutscene[]
        const savedNPCs = pickArray(
          "customNPCs",
          `custom_npcs_${data.campaign.id}`,
        ) as NPCDraft[]
        const savedLoots = pickArray(
          "npcLoots",
          `npc_loots_${data.campaign.id}`,
        ) as DroppedLoot[]
        const savedDrafts = pickArray(
          "draftPolls",
          `drafts_${data.campaign.id}`,
        ) as DraftPoll[]
        const savedSounds = pickArray(
          "customSounds",
          `custom_sounds_${data.campaign.id}`,
        ) as Track[]
        const savedStoreFolders = pickArray(
          "storeFolders",
          `store_folders_${data.campaign.id}`,
        ) as StoreFolder[]
        const cachedWeather = localStorage.getItem(
          `weather_${data.campaign.id}`,
        )

        const savedWeather = persisted.has("weather")
          ? String(res.state.weather || "clear")
          : cachedWeather || "clear"

        if (!persisted.has("weather") && cachedWeather !== null)
          migration.weather = savedWeather
        setGalleryImages(gallery)
        setGalleryFolders(
          savedGalleryFolders.length
            ? savedGalleryFolders
            : [{ id: "root", name: "Todas as imagens" }],
        )
        setLoreEntries(lore)
        setCutscenes(savedCutscenes)
        customNPCsRef.current = savedNPCs
        setCustomNPCs(savedNPCs)
        setNpcLoots(savedLoots)
        setCustomCreatures(savedCustomCreatures)
        if (!persistedInventoryCatalogLoaded.current) setCustomEquipment(savedCustomEquipment)
        setCustomClasses(savedCustomClasses)
        setDraftPolls(savedDrafts)
        setCustomSounds(savedSounds)
        setStoreFolders(savedStoreFolders)
        setWeather(savedWeather as WeatherType)
        storeJsonWhenIdle(`images_${data.campaign.id}`, gallery)
        storeJsonWhenIdle(
          `gallery_folders_${data.campaign.id}`,
          savedGalleryFolders,
        )
        storeJsonWhenIdle(
          `custom_classes_${data.campaign.id}`,
          savedCustomClasses,
        )
        storeJsonWhenIdle(`lore_${data.campaign.id}`, lore)
        storeJsonWhenIdle(`cutscenes_${data.campaign.id}`, savedCutscenes)
        storeJsonWhenIdle(`custom_npcs_${data.campaign.id}`, savedNPCs)
        storeJsonWhenIdle(`npc_loots_${data.campaign.id}`, savedLoots)
        storeJsonWhenIdle(`drafts_${data.campaign.id}`, savedDrafts)
        storeJsonWhenIdle(`custom_sounds_${data.campaign.id}`, savedSounds)
        storeJsonWhenIdle(
          `custom_creatures_${data.campaign.id}`,
          savedCustomCreatures,
        )
        storeJsonWhenIdle(
          `custom_equipment_${data.campaign.id}`,
          savedCustomEquipment,
        )
        storeJsonWhenIdle(
          `store_folders_${data.campaign.id}`,
          savedStoreFolders,
        )
        localStorage.setItem(`weather_${data.campaign.id}`, savedWeather)
        if (Object.keys(migration).length > 0)
          void persistCampaignState(migration)
      })
      .catch(() => {})
  }, [data.campaign.id, isGm, persistCampaignState])

  // Persiste no LocalStorage qual mapa está aberto para reabrir em caso de reload
  useEffect(() => {
    if (activeMap) {
      localStorage.setItem(`last_active_map_${data.campaign.id}`, activeMap.id)
    } else {
      localStorage.removeItem(`last_active_map_${data.campaign.id}`)
    }
  }, [activeMap?.id, data.campaign.id])

  // Sincroniza savedMaps localmente se houver edição
  const syncMapsToStorage = useCallback(
    (maps: GameMap[]) => {
      const uniqueMaps = Array.from(
        new Map(maps.map((m) => [m.id, m])).values(),
      )
      setSavedMaps(uniqueMaps)
      try { localStorage.removeItem(`maps_${data.campaign.id}`) } catch {}
    },
    [data.campaign.id],
  )

  async function handleImageClick(image: SharedImage, targetUserId: string | null = null) {
    if (isGm) {
      await galleryAction("broadcast", { imageId: image.id, targetUserId })
      setShowImagepad(false)
    } else {
      setActiveFullscreenImage(image.url)
    }
  }

  const saveCustomCreaturesToStorage = async (creatures: Creature[]) => {
    if (!isGm) throw new Error("Apenas o mestre pode editar o bestiário.")
    await persistCampaignState({ customCreatures: creatures })
    setCustomCreatures(creatures)
    try {
      localStorage.setItem(`custom_creatures_${data.campaign.id}`, JSON.stringify(creatures))
    } catch (error) { console.warn("Não foi possível atualizar o cache do bestiário.", error) }
  }

  const saveCustomClassesToStorage = async (clsArray: any[]) => {
    if (!isGm) throw new Error("Somente o mestre pode editar classes.")
    // MongoDB é a fonte de verdade: não anuncie a atualização antes da gravação.
    await persistCampaignState({ customClasses: clsArray })
    setCustomClasses(clsArray)
    try {
      localStorage.setItem(`custom_classes_${data.campaign.id}`, JSON.stringify(clsArray))
    } catch {}
    // Mantém o mecanismo de atualização de classes já usado pelo RPG.
    await apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: "sys_classes",
        characterName: "Sistema",
        playerName: "Mestre",
        attribute: "SYNC_CLASSES:UPDATE",
        // Apenas um sinal público. Definições ocultas NUNCA viajam no canal de rolagens.
        result: "updated",
      }),
    }).catch(console.error)
    setBooksRevision(v => v + 1)
  }

  const saveCustomEquipmentToStorage = (eqs: any[]) => {
    setCustomEquipment(eqs)
    localStorage.setItem(
      `custom_equipment_${data.campaign.id}`,
      JSON.stringify(eqs),
    )
    void persistCampaignState({ customEquipment: eqs })

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: "sys_equip",
        characterName: "Sistema",
        playerName: "Mestre",
        attribute: `SYNC_EQUIPMENT:UPDATE`,
        result: JSON.stringify(eqs),
      }),
    }).catch(console.error)
  }
  async function saveEquipmentDefinition(eq: any) {
    const next = customEquipment.some((item) => item.id === eq.id)
      ? customEquipment.map((item) => (item.id === eq.id ? eq : item))
      : [...customEquipment, eq]
    await persistCampaignState({ customEquipment: next })
    setCustomEquipment(next)
    try {
      localStorage.setItem(
        `custom_equipment_${data.campaign.id}`,
        JSON.stringify(next),
      )
    } catch (error) {
      console.error(error)
    }
    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: "sys_equip",
        characterName: "Sistema",
        playerName: "Mestre",
        attribute: "SYNC_EQUIPMENT:UPDATE",
        result: JSON.stringify(next),
      }),
    }).catch(console.error)
  }

  const saveStoreFolders = useCallback(
    (folders: StoreFolder[]) => {
      setStoreFolders(folders)

      localStorage.setItem(
        `store_folders_${data.campaign.id}`,
        JSON.stringify(folders),
      )

      void persistCampaignState({
        storeFolders: folders,
      })

      // Sincroniza imediatamente com os jogadores conectados
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST",
        body: JSON.stringify({
          characterId: "sys_store",
          characterName: "Sistema",
          playerName: "Mestre",
          attribute: "SYNC_STORE_FOLDERS:UPDATE",
          result: JSON.stringify(folders),
        }),
      }).catch(console.error)
    },
    [data.campaign.id, persistCampaignState],
  )

  const handleCreateFolder = useCallback(
    (folder: StoreFolder) => {
      if (folder.isSystem) {
        // SISTEMA/CUSTOM podem ser criadas apenas pelo sistema.
        // O GM somente altera as já existentes.
        const existing = storeFolders.find((f) => f.id === folder.id)

        if (existing) {
          const updated = storeFolders.map((f) =>
            f.id === folder.id ? { ...f, ...folder, isSystem: true } : f,
          )

          saveStoreFolders(updated)
          return
        }
      }

      if (storeFolders.some((f) => f.id === folder.id)) return

      saveStoreFolders([
        ...storeFolders,
        {
          ...folder,
          isSystem: false,
          isVisible: folder.isVisible !== false,
        },
      ])
    },
    [storeFolders, saveStoreFolders],
  )

  const handleUpdateFolder = useCallback(
    (id: string, updates: Partial<StoreFolder>) => {
      const updated = storeFolders.map((folder) => {
        if (folder.id !== id) return folder

        return {
          ...folder,
          ...updates,

          // Nunca permitir transformar uma pasta do sistema em custom
          isSystem: folder.isSystem,
        }
      })

      saveStoreFolders(updated)
    },
    [storeFolders, saveStoreFolders],
  )

  const handleDeleteFolder = useCallback(
    (id: string) => {
      const folder = storeFolders.find((f) => f.id === id)

      if (folder?.isSystem || id === "system" || id === "custom") {
        controllerAlert("As pastas SISTEMA e CUSTOM não podem ser excluídas.")
        return
      }

      const updatedEquipment = customEquipment.map((item) =>
        item.folderId === id ? { ...item, folderId: "custom" } : item,
      )

      saveCustomEquipmentToStorage(updatedEquipment)

      saveStoreFolders(storeFolders.filter((folder) => folder.id !== id))
    },
    [
      storeFolders,
      customEquipment,
      saveCustomEquipmentToStorage,
      saveStoreFolders,
    ],
  )

  const handleMoveCustomItem = useCallback(
    (itemId: string, folderId: string) => {
      const destination = [
        "custom",
        ...storeFolders
          .filter((folder) => !folder.isSystem)
          .map((folder) => folder.id),
      ]

      // Segurança: não permite mover custom para SISTEMA
      if (!destination.includes(folderId)) {
        console.warn(
          "Tentativa de mover item custom para pasta inválida:",
          folderId,
        )
        return
      }

      const updated = customEquipment.map((item) =>
        item.id === itemId ? { ...item, folderId } : item,
      )

      saveCustomEquipmentToStorage(updated)
    },
    [customEquipment, storeFolders],
  )

  // Verificador de Expiração da Enquete
  useEffect(() => {
    if (!activePoll) return
    if (now >= activePoll.expiresAt) {
      const voteCounts = activePoll.options.map(() => 0)
      Object.values(activePoll.votes).forEach((optIdx) => {
        if (voteCounts[optIdx] !== undefined) voteCounts[optIdx]++
      })
      const maxVotes = Math.max(...voteCounts)
      const winners = activePoll.options.filter(
        (_, idx) => voteCounts[idx] === maxVotes,
      )
      const winnerText =
        winners.length > 1 ? "Empate: " + winners.join(", ") : winners[0]

      setHistory((prev) =>
        [
          {
            id: activePoll.id,
            type: "poll" as const,
            title: activePoll.question,
            subtitle: "Enquete Encerrada",
            detail: winnerText || "Nenhum voto",
            result: `${maxVotes} voto(s)`,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...prev,
        ].slice(0, 50),
      )

      setActivePoll(null)
    }
  }, [now, activePoll])

  const handlePlaySound = useCallback(
    async (track: { id: string; url: string }, loop: boolean, targetUserId: string | null = null) => {
      if (data.role !== "gm") return
      if (targetUserId !== null) {
        if (!data.members.some(member => member.userId === targetUserId && member.role === "player")) return
        try {
          const response = await apiFetch<{ capabilities?: { targetedSound?: boolean } }>(
            `/api/campaigns/${data.campaign.id}/sound`,
          )
          if (response.capabilities?.targetedSound !== true) {
            controllerAlert("O servidor ainda não permite áudio individual. Nenhum som foi enviado.")
            return
          }
        } catch {
          controllerAlert("Não foi possível confirmar o envio individual. Nenhum som foi enviado.")
          return
        }
      }
      const uid = `${track.id}_${createClientId()}`
      const sound = { id: uid, trackId: track.id, url: track.url, loop, targetUserId }
      setActiveSounds((prev) => [
        ...prev.filter((item) => item.id !== uid),
        sound,
      ])
      apiFetch<{ sounds: ActiveSound[] }>(
        `/api/campaigns/${data.campaign.id}/sound`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "play",
            id: uid,
            trackId: track.id,
            url: track.url,
            loop,
            targetUserId,
          }),
        },
      )
        .then(() => refreshSounds())
        .catch(() => {
          setActiveSounds((prev) => prev.filter((item) => item.id !== uid))
        })
    },
    [data.campaign.id, data.role, data.members, refreshSounds],
  )

  const handleStopSound = useCallback(
    (id: string) => {
      if (data.role !== "gm") return
      setActiveSounds((prev) => prev.filter((sound) => sound.id !== id))
      apiFetch<{ sounds: ActiveSound[] }>(
        `/api/campaigns/${data.campaign.id}/sound`,
        { method: "POST", body: JSON.stringify({ action: "stop", id }) },
      )
        .then(() => refreshSounds())
        .catch(console.error)
    },
    [data.campaign.id, data.role, refreshSounds],
  )

  const handleStopAllSounds = useCallback(() => {
    if (data.role !== "gm") return
    setActiveSounds([])
    apiFetch<{ sounds: ActiveSound[] }>(
      `/api/campaigns/${data.campaign.id}/sound`,
      { method: "POST", body: JSON.stringify({ action: "stop_all" }) },
    )
      .then(() => refreshSounds())
      .catch(console.error)
  }, [data.campaign.id, data.role, refreshSounds])

  /**
   * Reconciliacao do inventario com a fonte autoritativa (MongoDB).
   * Um evento SSE ou um snapshot da sala nao substitui a leitura persistida.
   * Apenas personagens pertencentes ao usuario autenticado sao retornados.
   */
  const refreshOwnedInventory = useCallback(async () => {
    const version = ++ownedInventoryRequestVersion.current
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(data.campaign.id)}/owned-inventory`,
      { cache: "no-store", credentials: "same-origin" },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `Nao foi possivel sincronizar a mochila (${response.status}).`)
    }
    const body: {
      characters?: Array<{
        id: string
        equipment: string[]
        customItems: Character["customItems"]
        updatedAt: number
      }>
      customEquipment?: any[]
    } = await response.json()
    if (version !== ownedInventoryRequestVersion.current) return
    if (!Array.isArray(body.characters))
      throw new Error("Inventario persistido: resposta invalida.")
    const saved = new Map(body.characters.map((entry) => [entry.id, entry]))
    // O catalogo tambem e persistido no Mongo. Um ID salvo no inventario
    // sem seu cadastro pode fazer o item parecer ter desaparecido na mochila.
    if (Array.isArray(body.customEquipment)) {
      persistedInventoryCatalogLoaded.current = true
      setCustomEquipment(body.customEquipment)
    }
    setCharacters((previous) => previous.map((character) => {
      if (data.role !== "gm" && character.ownerId !== data.me.id) return character
      const entry = saved.get(character.id)
      if (!entry) return character
      if (!Array.isArray(entry.equipment) || !Array.isArray(entry.customItems))
        return character
      // MongoDB e a fonte de verdade. Nao inferimos que o inventario e mais
      // novo so porque outra parte da ficha tem um updatedAt diferente.
      const sameEquipment = JSON.stringify(character.equipment || []) === JSON.stringify(entry.equipment)
      const sameCustomItems = JSON.stringify(character.customItems || []) === JSON.stringify(entry.customItems)
      // Consultas de mochila podem terminar depois de um ajuste de HP/MP.
      // Seus timestamps antigos nunca devem rebaixar a versão da ficha.
      const inventoryUpdatedAt = Number(entry.updatedAt || 0)
      const authoritativeUpdatedAt = Math.max(Number(character.updatedAt || 0), inventoryUpdatedAt)
      if (sameEquipment && sameCustomItems) return character
      return {
        ...character,
        equipment: entry.equipment,
        customItems: entry.customItems,
        updatedAt: authoritativeUpdatedAt,
      }
    }))
    // Item registrado por ID, mas cadastro ausente do banco = item invisivel.
    const catalogIds = new Set([
      ...EQUIPMENT.map((item) => item.id),
      ...(Array.isArray(body.customEquipment) ? body.customEquipment : [])
        .filter((item: any) => item && typeof item.id === "string")
        .map((item: any) => item.id),
    ])
    const missingCatalogId = body.characters.some((entry) =>
      entry.equipment.some((itemId) => !catalogIds.has(itemId)),
    )
    setInventorySyncError(missingCatalogId
      ? "Existem IDs de equipamentos salvos na mochila, mas sem cadastro persistido no catálogo. O Mestre precisa restaurar o cadastro com o mesmo ID."
      : null)
  }, [data.campaign.id, data.me.id, data.role])

  // CTRL+F5, retomada da aba ou falha do SSE: inventario sempre consultado no Mongo.
  useEffect(() => {
    let active = true
    const sync = () => {
      void refreshOwnedInventory().catch((error) => {
        if (active) setInventorySyncError(error instanceof Error ? error.message : "Falha ao sincronizar mochila.")
      })
    }
    sync()
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync()
    }
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", onVisibility)
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") sync()
    }, 30000)
    return () => {
      active = false
      ++ownedInventoryRequestVersion.current
      window.removeEventListener("focus", sync)
      document.removeEventListener("visibilitychange", onVisibility)
      window.clearInterval(poll)
    }
  }, [refreshOwnedInventory])

  const seenCombatRolls = useRef(new Set<string>())
  const handleEvent = useCallback(
    (event: any) => {
      if (event.type === "arena:changed") {
        window.dispatchEvent(new Event("otms.arena.changed"))
        return
      }
      if (event.type === "voice:chat-updated") {
        window.dispatchEvent(new Event("otms.voice.chat-update"))
        return
      }
      if (event.type === "player-attack-preview:updated") {
        void refreshPlayerAttackPreviews().catch(console.error)
        return
      }
      if (event.type === "difficulty:settings:updated") {
        void refreshDifficultySettings().catch(() => undefined)
        return
      }
      if (event.type === "custom-checks:updated") {
        void refreshCustomChecks().catch(console.error)
        return
      }
      if (event.type === "class-books:updated" || event.type === "class-books:played") {
        setBooksRevision(current => current + 1)
        if (event.type === "class-books:played" && event.action === "cast") {
          setCardReveal({
            cardName: String(event.cardName || "Magia"),
            cardImage: typeof event.cardImage === "string" ? event.cardImage : null,
            cardEffects: String(event.cardEffects || ""),
            casterName: String(event.casterName || "Viajante"),
          })
          if (cardRevealTimer.current) clearTimeout(cardRevealTimer.current)
          cardRevealTimer.current = setTimeout(() => setCardReveal(null), 3500)
        }
        // Publicação, atribuição, revogação e conjuração podem alterar
        // recursos ou modificadores dos personagens; reconciliar em ambos.
        {
          void apiFetch<{ characters: Character[] }>(`/api/campaigns/${data.campaign.id}`)
            .then(result => {
              if (!Array.isArray(result.characters)) return
              setCharacters(current => {
                const received = new Map(result.characters.map(c => [c.id, c]))
                return current.map(c => {
                  const next = received.get(c.id)
                  return next && Number(next.updatedAt || 0) >= Number(c.updatedAt || 0) ? next : c
                })
              })
            })
            .catch(() => undefined)
        }
        return
      }
      if (
        event.type === "gallery:changed" ||
        event.type === "gallery:broadcast-requested"
      ) {
        void refreshGallery().catch(console.error)
        if (
          event.type === "gallery:broadcast-requested" &&
          isGmRef.current
        ) {
          setGalleryNotice("Um jogador solicitou o envio de uma imagem.")
          window.setTimeout(() => setGalleryNotice(null), 7000)
        }
        return
      }
      if (event.type === "gallery:broadcast-resolved") {
        void refreshGallery().catch(console.error)
        if (event.requesterId === data.me.id) {
          setGalleryNotice(
            event.resolution === "approved"
              ? "O mestre aprovou o envio da sua imagem."
              : "O mestre recusou o envio da sua imagem.",
          )
          window.setTimeout(() => setGalleryNotice(null), 7000)
        }
        return
      }
      if (event.type === "gallery:image-available" && typeof event.deliveryId === "string") {
        const generation = imageDeliveryGeneration.current
        imageDeliveryQueue.current = imageDeliveryQueue.current.catch(() => undefined).then(async () => {
          if (generation !== imageDeliveryGeneration.current) return
          const response = await apiFetch<{ broadcast: { id: string; url: string; name: string } | null }>(
            `/api/campaigns/${data.campaign.id}/gallery?deliveryId=${encodeURIComponent(event.deliveryId)}`,
            { cache: "no-store" },
          )
          if (generation === imageDeliveryGeneration.current && response.broadcast?.url) {
            setActiveFullscreenImage(response.broadcast.url)
          }
        }).catch(console.error)
        return
      }
      if (event.type === "gallery:image-show") {
        const generation = imageDeliveryGeneration.current
        imageDeliveryQueue.current = imageDeliveryQueue.current.catch(() => undefined).then(() => {
          if (generation === imageDeliveryGeneration.current && typeof event.url === "string") setActiveFullscreenImage(event.url)
        })
        return
      }

      // Clima Persistente
      if (
        event.type === "weather:change" ||
        event.eventType === "weather:change" ||
        event.action === "weather:change"
      ) {
        const w = event.weather
        if (w) {
          setWeather(w)
          localStorage.setItem(`weather_${data.campaign.id}`, w)
        }
        return
      }

      // Monstros
      if (event.type === "creature:spawn") {
        return
      }
      if (event.type === "creature:update") {
        return
      }
      if (event.type === "creature:remove") {
        return
      }
      if (event.type === "hazard:launch") {
        setActiveHazards((prev) => {
          const incoming = event.hazard as HazardData

          return [
            ...prev.filter((hazard) => {
              if (hazard.type !== incoming.type) return true

              // Um novo hazard global substitui todos daquele tipo
              if (incoming.targetCharacterIds === null) {
                return false
              }

              // Remove o hazard anterior do mesmo personagem
              return !(
                hazard.targetCharacterIds?.length === 1 &&
                hazard.targetCharacterIds[0] ===
                  incoming.targetCharacterIds?.[0]
              )
            }),
            incoming,
          ]
        })

        return
      }

      if (event.type === "hazard:stop" || event.action === "hazard:stop") {
        // Garante que vai encontrar o tipo
        const typeToStop =
          event.hazardType || event.hazard?.type || event.hazard?.hazardType

        // O PULO DO GATO AQUI: Se for undefined, forçamos a ser null
        const targetsToStop =
          event.targetCharacterIds ?? event.hazard?.targetCharacterIds ?? null

        console.log("🛑 RECEBEU STOP CORRIGIDO:", { typeToStop, targetsToStop })

        setActiveHazards((prev) =>
          prev.filter((hazard) => {
            // 1. Se for de outro tipo, mantém
            if (hazard.type !== typeToStop) return true

            // 2. Se for null (agora garantido graças ao ?? null acima), removemos!
            if (targetsToStop === null) return false

            // 3. Se o Mestre mandou parar para um alvo específico
            if (hazard.targetCharacterIds && targetsToStop) {
              const isTargeted = hazard.targetCharacterIds.some((id) =>
                targetsToStop.includes(id),
              )
              if (isTargeted) return false
            }

            // Caso contrário, mantém
            return true
          }),
        )
        return
      }
      if (String(event.type).startsWith("map:")) {
        void refreshMaps(event.type === "map:changed" ? event.openMapId : undefined).catch(console.error)
        return
      }

      // O evento coletivo só avisa da mudança; a API filtra os dados por usuário.
      if (event.type === "sound:changed") {
        void refreshSounds().catch(console.error)
        return
      }

      // Soundpad Events
      if (event.type === "sound:play") {
        if (event.sound.targetUserId != null && event.sound.targetUserId !== data.me.id && !isGmRef.current) return
        setActiveSounds((prev) => [
          ...prev.filter((sound) => sound.id !== event.sound.id),
          event.sound,
        ])
        return
      }
      if (event.type === "sound:stop") {
        setActiveSounds((prev) => prev.filter((s) => s.id !== event.soundId))
        return
      }
      if (event.type === "sound:stop_all") {
        setActiveSounds([])
        return
      }

      // Dados & Truques de Mestre Ocultos
      if (event.type === "dice:roll") {
        const attr = String(event.attribute || "")

        if (attr === "PLAYER_HAND_RAISED") {
          const playerName =
            event.playerName || event.characterName || "Jogador"
          const characterName = event.characterName || playerName
          const noticeId = String(
            event.result || `${event.playerName}-${Date.now()}`,
          )
          setHandPresentation({ id: noticeId, characterName, playerName })
          window.setTimeout(() => {
            setHandPresentation((current) =>
              current?.id === noticeId ? null : current,
            )
          }, 3600)
          if (isGmRef.current) playHandRaiseSound(effectsVolumeRef.current)
          return
        }

        if (attr.startsWith("SYNC_WEATHER:")) {
          const newWeather = attr.split(":")[1] as WeatherType
          setWeather(newWeather)
          localStorage.setItem(`weather_${data.campaign.id}`, newWeather)

          setHistory((prev) =>
            [
              {
                id: Math.random().toString(36).substring(7),
                type: "roll" as const,
                title: "Mestre",
                subtitle: "Controle do Ambiente",
                detail: "CLIMA ALTERADO",
                result: event.result,
                time: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
              ...prev,
            ].slice(0, 50),
          )
          return
        }

        if (attr.startsWith("SYNC_ITEM_GIVEN")) {
          try {
            const payload = JSON.parse(String(event.result))
            // SSE anuncia a entrega; os itens e a ficha sao lidos do MongoDB.
            // Compatibilidade com eventos legados que incluem payload.character.
            const ownerId = payload.ownerId || payload.character?.ownerId
            if (ownerId === data.me.id) {
              setItemNotification(String(payload.itemName || "Novo item"))
              setInventoryToOpen(String(payload.charId || ""))
              window.setTimeout(() => setItemNotification(null), 8000)
            }
            // GM e jogador consultam exatamente a mesma fonte persistida.
            void refreshOwnedInventory().catch((error) =>
              setInventorySyncError(error instanceof Error ? error.message : "Falha ao confirmar entrega."),
            )
          } catch (error) {
            console.error("Falha ao ler notificacao de item", error)
          }
          return
        }

        if (attr.startsWith("SYNC_IMAGE:")) {
          const action = attr.split(":")[1]
          if (action === "SHOW") {
            setActiveFullscreenImage(String(event.result))
          }
          return
        }

        if (attr.startsWith("SYNC_CUTSCENE:")) {
          const action = attr.split(":")[1]

          if (action === "PLAY") {
            try {
              const c = JSON.parse(String(event.result))
              const playId = String(c.playbackId || event.eventId || `${c.id}:${event.occurredAt || event.result}`)
              if (seenCutscenePlays.current.has(playId)) return
              seenCutscenePlays.current.add(playId)
              if (seenCutscenePlays.current.size > 100) seenCutscenePlays.current.delete(seenCutscenePlays.current.values().next().value!)
              setCutscenePlayId(playId)
              setActiveCutscene(c)
              setActiveSceneIndex(0)
            } catch (e) {
              console.error("Falha ao abrir cutscene", e)
            }
          } else if (action === "STOP") {
            setActiveCutscene(null)
          } else if (action === "SCENE") {
            setActiveSceneIndex(Number(event.result))
          }
          return
        }

        if (attr.startsWith("SYNC_MAP:")) {
          // Compatibility with older master clients, always rechecking visibility.
          if (attr === "SYNC_MAP:SHOW") void refreshMaps(String(event.result)).catch(console.error)
          return
        }

        if (attr === "SYNC_GALLERY:UPDATE") {
          try {
            const payload = JSON.parse(String(event.result))

            // Novo formato
            if (
              payload &&
              typeof payload === "object" &&
              !Array.isArray(payload)
            ) {
              const syncedImages = Array.isArray(payload.images)
                ? payload.images.map((image: any) => ({
                    ...image,
                    folderId: image?.folderId || "root",
                  }))
                : []

              const syncedFolders = Array.isArray(payload.folders)
                ? payload.folders
                : [
                    {
                      id: "root",
                      name: "Todas as imagens",
                    },
                  ]

              setGalleryImages(syncedImages)
              setGalleryFolders(syncedFolders)

              localStorage.setItem(
                `images_${data.campaign.id}`,
                JSON.stringify(syncedImages),
              )

              localStorage.setItem(
                `gallery_folders_${data.campaign.id}`,
                JSON.stringify(syncedFolders),
              )

              return
            }

            // Compatibilidade com eventos antigos
            if (Array.isArray(payload)) {
              const syncedImages = payload.map((image: any) => ({
                ...image,
                folderId: image?.folderId || "root",
              }))

              setGalleryImages(syncedImages)

              localStorage.setItem(
                `images_${data.campaign.id}`,
                JSON.stringify(syncedImages),
              )
            }
          } catch (e) {
            console.error("Erro ao sincronizar galeria:", e)
          }

          return
        }

        if (attr === "SYNC_LORE:UPDATE") {
          try {
            const synced = JSON.parse(String(event.result))
            setLoreEntries(synced)
            localStorage.setItem(
              `lore_${data.campaign.id}`,
              JSON.stringify(synced),
            )
          } catch (e) {}
          return
        }

        if (attr.includes("SYNC_GALLERY:UPDATE")) {
          try {
            const synced = JSON.parse(String(event.result))
            setGalleryImages(synced)
            localStorage.setItem(
              `images_${data.campaign.id}`,
              JSON.stringify(synced),
            )
          } catch (e) {}
          return
        }

        if (attr === "SYNC_EQUIPMENT:UPDATE") {
          try {
            const synced = JSON.parse(String(event.result))
            setCustomEquipment(synced)
            localStorage.setItem(
              `custom_equipment_${data.campaign.id}`,
              JSON.stringify(synced),
            )
          } catch (e) {}
          return
        }
        if (attr === "SYNC_STORE_FOLDERS:UPDATE") {
          try {
            const synced = JSON.parse(String(event.result))

            if (Array.isArray(synced)) {
              setStoreFolders(synced)

              localStorage.setItem(
                `store_folders_${data.campaign.id}`,
                JSON.stringify(synced),
              )
            }
          } catch (e) {
            console.error("Erro ao sincronizar pastas da loja:", e)
          }

          return
        }

        if (attr === "SYNC_CLASSES:UPDATE") {
          // Reconsulta autenticada: jamais aceitar definições completas no
          // evento de rolagem, pois a visibilidade depende da conta da sessão.
          void apiFetch<{ classes: any[] }>(
            `/api/campaigns/${encodeURIComponent(data.campaign.id)}/public-classes`,
            { cache: "no-store" },
          ).then(result => {
            if (!Array.isArray(result.classes)) return
            setCustomClasses(result.classes)
            storeJsonWhenIdle(`custom_classes_${data.campaign.id}`, result.classes)
            setBooksRevision(previous => previous + 1)
          }).catch(console.error)
          return
        }

        if (attr.includes("SYNC_LORE:UPDATE")) {
          try {
            const synced = JSON.parse(String(event.result))
            setLoreEntries(synced)
            localStorage.setItem(
              `lore_${data.campaign.id}`,
              JSON.stringify(synced),
            )
          } catch (e) {}
          return
        }

        if (event.eventId) {
          if (seenCombatRolls.current.has(event.eventId)) return
          seenCombatRolls.current.add(event.eventId)
        }
        const effectId =
          event.eventId ||
          `${event.characterId || "roll"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const isItemRoll = attr.startsWith("ITEM_ROLL:")
        const isItemUse = attr.startsWith("ITEM_USE:")
        const cleanAttribute = attr.replace(/^ITEM_(?:ROLL|USE):/, "")
        const numericResult =
          typeof event.result === "number"
            ? event.result
            : typeof event.result === "string" && event.result.trim() !== ""
              ? Number(event.result)
              : NaN
        const hasNumericResult = Number.isFinite(numericResult)

        // Mensagens e descrições nunca são exibidas no painel numérico de dados.
        if (hasNumericResult && !isItemUse && !event.replay) {
          playDiceRollSound(effectsVolumeRef.current)
          // O Guia necessita das faces reais. Não usar fallback 2d8 quando
          // a rolagem não informa os dados: isso fabricaria uma dificuldade.
          const diceSides = dicePoolFromEvent({
            attribute: attr,
            dice: event.dice,
            breakdown: event.breakdown,
          })
          const rollForGuide: DiceRollResult = {
            id: effectId,
            diceCount: diceSides.length,
            diceSides,
            result: numericResult, // total publicado JÁ inclui bônus e penalidades
            characterName: String(event.characterName || "Rolagem"),
            playerName: String(event.playerName || ""),
            attribute: cleanAttribute,
            // Uma rolagem guarda os parâmetros que estavam confirmados ao recebê-la.
            ...(difficultyLoadedRef.current ? { difficultySettings: { ...difficultySettingsRef.current } } : {}),
          }
          setLatestDiceRoll(rollForGuide)
          const claimedCharacterId = typeof event.rollContext?.characterId === "string"
            ? event.rollContext.characterId : String(event.characterId || "")
          const owned = ownDiceCharactersRef.current
          const fromMyCharacter = owned.ids.has(claimedCharacterId) ||
            ((claimedCharacterId === "sys" || !claimedCharacterId) &&
              owned.names.has(String(event.characterName || "")) &&
              String(event.playerName || "") === data.me.name)
          if (fromMyCharacter) setLatestPlayerDiceRoll(rollForGuide)
          const presentation: DicePresentation = {
            id: effectId,
            characterName: event.characterName || "Rolagem",
            playerName: event.playerName || "Jogador",
            attribute: attr,
            result: numericResult,
            dice: isItemRoll ? [] : getDiceFromLabel(attr),
            breakdown: isItemRoll ? undefined : event.breakdown,
            modifier: isItemRoll ? undefined : event.modifier,
          }
          setDicePresentations((prev) => [...prev, presentation].slice(-2))
          window.setTimeout(() => {
            setDicePresentations((prev) =>
              prev.filter((effect) => effect.id !== effectId),
            )
          }, 4300)
        }

        const itemKind = cleanAttribute.includes(" • Dano") ? "Dano" : "Acerto"
        setHistory((prev) =>
          [
            {
              id: effectId,
              type: "roll" as const,
              title: event.characterName,
              subtitle: event.playerName,
              detail: isItemRoll
                ? `${itemKind}: ${event.breakdown || "—"}`
                : isItemUse
                  ? cleanAttribute
                  : `${cleanAttribute}${event.breakdown ? ` ${event.breakdown}` : ""}${event.modifier ? ` · Mod: ${event.modifier > 0 ? "+" : ""}${event.modifier}` : ""}`,
              result:
                hasNumericResult && !isItemUse
                  ? numericResult
                  : isItemUse
                    ? "Utilizada"
                    : String(event.result).slice(0, 180),
              time: new Date(event.occurredAt || Date.now()).toLocaleTimeString(
                [],
                {
                  hour: "2-digit",
                  minute: "2-digit",
                },
              ),
            },
            ...prev,
          ].slice(0, 50),
        )
        return
      }

      if (event.type === "special-attack:lore-upgraded") {
        const record = event.record
        if (data.role === 'gm' || record.ownerId === data.me.id) {
          setHistory(prev => prev.some(entry => entry.id === record.id) ? prev : [{
            id:record.id,type:'poll' as const,title:`${record.characterName} · Lore investido`,
            subtitle:'Golpe especial', detail:`${record.attackName} · ${record.cost} LP gastos`,
            result:loreBonusLabel(record.newLevel),
            time:new Date(record.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
          },...prev].slice(0,50))
        }
        return
      }
      if (event.type === "poll:start") {
        setActivePoll(event.poll)
        return
      }
      if (event.type === "poll:vote") {
        setActivePoll((prev) => {
          if (!prev || prev.id !== event.pollId) return prev
          return {
            ...prev,
            votes: { ...prev.votes, [event.userId]: event.optionIndex },
          }
        })
        return
      }

      if (event.type === "item-transfer:created") {
        if (event.transfer.recipientOwnerId === data.me.id)
          setItemTransfers((current) =>
            current.some((item) => item.id === event.transfer.id)
              ? current
              : [...current, event.transfer],
          )
        return
      }
      if (event.type === "item-transfer:resolved") {
        setItemTransfers((current) =>
          current.filter((item) => item.id !== event.transfer.id),
        )
      }

      // Atualização de HP/MP não altera o inventário: evitar uma nova consulta
      // de mochila a cada rajada de cliques. Ainda conciliamos o combate/morte.
      if (event.type === "character:updated" || event.type === "character:created") {
        const vitalsOnly = (event as typeof event & { vitalsOnly?: boolean }).vitalsOnly === true
        void combatController.refresh().catch(console.error)
        if (!vitalsOnly && (event.character?.ownerId === data.me.id || data.role === "gm")) {
          void refreshOwnedInventory().catch((error) =>
            setInventorySyncError(error instanceof Error ? error.message : "Falha ao sincronizar mochila."),
          )
        }
      }
      if (event.type === "item-transfer:resolved") {
        void refreshOwnedInventory().catch((error) =>
          setInventorySyncError(error instanceof Error ? error.message : "Falha ao sincronizar transferencia."),
        )
      }

      setCharacters((prev) => {
        switch (event.type) {
          case "character:created":
            return prev.some((c) => c.id === event.character.id)
              ? prev
              : [...prev, event.character]
          case "character:updated":
            return prev.map((c) => {
              if (c.id === event.character.id) {
                if (
                  Number(event.character.updatedAt || 0) <
                  Number(c.updatedAt || 0)
                )
                  return c
                return {
                  ...event.character,
                  customItems:
                    (event.character as any).customItems ||
                    (c as any).customItems ||
                    [],
                  customModifiers:
                    (event.character as any).customModifiers ||
                    (c as any).customModifiers ||
                    [],
                  bonds:
                    (event.character as any).bonds || (c as any).bonds || [],
                }
              }
              return c
            })
          case "character:deleted":
            return prev.filter((c) => c.id !== event.characterId)
          default:
            return prev
        }
      })
    },
    [data.campaign.id, data.me.id, data.role, refreshGallery, refreshSounds, refreshMaps, combatController.refresh, refreshOwnedInventory, refreshCustomChecks, refreshPlayerAttackPreviews, refreshDifficultySettings],
  )

  useEffect(() => {
    const snapshot = combatController.combat
    if (!snapshot) return
    // Process oldest first; both histories share server IDs and timestamps.
    for (const entry of [...snapshot.log].sort((a, b) => a.at - b.at)) {
      if (entry.roll) {
        handleEvent({ ...entry.roll, eventId: entry.id, occurredAt: entry.at,
          replay: snapshot.serverNow - entry.at > 10000 })
      } else if (!seenCombatRolls.current.has(entry.id)) {
        seenCombatRolls.current.add(entry.id)
        setHistory(prev => [{
          id: entry.id, type: "roll" as const, title: "Combate", subtitle: "Evento de combate",
          detail: entry.text, result: "Registrado",
          time: new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }, ...prev].slice(0, 50))
      }
    }
  }, [combatController.combat, handleEvent])
  const realtimeStatus = useRealtime(data.campaign.id, handleEvent)
  const live = realtimeStatus === "live"

  useEffect(() => {
    if (realtimeStatus !== "live") return
    void refreshGallery().catch(console.error)
    void refreshSounds().catch(console.error)
    void refreshCustomChecks().catch(console.error)
  }, [data.campaign.id, realtimeStatus, refreshGallery, refreshSounds, refreshCustomChecks])

  const applyOptimistic = useCallback(
    (c: Character) =>
      setCharacters((prev) =>
        prev.map((x) => {
          if (x.id === c.id) {
            // Nunca substituir uma confirmação mais recente por resposta atrasada.
            if (Number(c.updatedAt || 0) < Number(x.updatedAt || 0)) return x
            return {
              ...c,
              customItems:
                (c as any).customItems || (x as any).customItems || [],
              customModifiers:
                (c as any).customModifiers || (x as any).customModifiers || [],
              bonds: (c as any).bonds || (x as any).bonds || [],
            }
          }
          return x
        }),
      ),
    [],
  )

  async function handleCreateMap(newMap: GameMap) {
    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
        method: "POST",
        body: JSON.stringify({ action: "create", map: { ...newMap, campaignId: data.campaign.id, tokens: {}, isPublic: false } }),
      })
      setShowMapImporter(false)
      await refreshMaps(newMap.id)
    } catch (error) {
      controllerAlert(error instanceof Error ? error.message : "Não foi possível criar o mapa.")
    }
  }

  async function changeMapVisibility(mapId: string, isPublic: boolean, open = false) {
    if (!isGm || mapActionBusy.current) return
    mapActionBusy.current = true
    setMapActionPending(true)
    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
        method: "POST",
        body: JSON.stringify({ action: open ? "show" : "visibility", mapId, isPublic }),
      })
      await refreshMaps(open ? mapId : undefined)
    } catch (error) {
      controllerAlert(error instanceof Error ? error.message : "Não foi possível alterar a visibilidade do mapa.")
    } finally {
      mapActionBusy.current = false
      setMapActionPending(false)
    }
  }

  async function handleRenameMap(mapId: string, currentName: string) {
    const newName = window.prompt(
      "Digite o novo nome para o mapa:",
      currentName,
    )
    if (!newName || newName.trim() === "" || newName === currentName) return

    const trimmedName = newName.trim()

    // Atualiza localmente
    const updatedMaps = savedMaps.map((m) =>
      m.id === mapId ? { ...m, name: trimmedName } : m,
    )
    syncMapsToStorage(updatedMaps)

    setActiveMap((prev) => {
      if (prev && prev.id === mapId) {
        return { ...prev, name: trimmedName }
      }
      return prev
    })

    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
        method: "POST",
        body: JSON.stringify({ action: "rename", mapId, name: trimmedName }),
      })
    } catch (err) {
      console.error("Erro ao renomear mapa", err)
      controllerAlert("Falha ao renomear mapa.")
    }
  }

  async function handleDeleteMap(mapId: string) {
    if (
      !await controllerConfirm(
        "Tem certeza que deseja deletar este mapa? Ele será removido para todos.",
      )
    )
      return

    if (activeMap?.id === mapId) {
      setActiveMap(null)
    }

    const nextMaps = savedMaps.filter((m) => m.id !== mapId)
    syncMapsToStorage(nextMaps)

    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
        method: "POST",
        body: JSON.stringify({ action: "delete", mapId }),
      })
    } catch (err) {
      console.error("Erro ao deletar mapa", err)
    }
  }

  function handleMoveToken(
    mapId: string,
    tokenId: string,
    x: number,
    y: number,
    type: "character" | "creature",
  ) {
    setActiveMap((prev) => {
      if (!prev) return prev
      const updatedMap = {
        ...prev,
        tokens: { ...(prev.tokens || {}), [tokenId]: { x, y, type } },
      }
      syncMapsToStorage(
        savedMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)),
      )
      return updatedMap
    })

    apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
      method: "POST",
      body: JSON.stringify({
        action: "update_tokens",
        mapId,
        tokenId,
        x,
        y,
        tokenType: type,
      }),
    })
  }

  function handlePaintTerrain(mapId: string, tile: TileData) {
    setActiveMap((prev) => {
      if (!prev) return prev
      const updatedMap = {
        ...prev,
        tiles: { ...prev.tiles, [`${tile.x},${tile.y}`]: tile },
      }
      syncMapsToStorage(
        savedMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)),
      )
      return updatedMap
    })

    apiFetch(`/api/campaigns/${data.campaign.id}/maps`, {
      method: "POST",
      body: JSON.stringify({ action: "update_terrain", mapId, tileData: tile }),
    })
  }

  function handleBroadcastRoll(
    characterOrCreatureName: string,
    attrName: string,
    result: number | string,
    details?: DiceRollDetails & { rollContext?: { characterId: string; baseResult: number; modifierWithoutItems: number; targets: string[] } },
  ) {
    return apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: "sys",
        characterName: characterOrCreatureName,
        playerName: data.me.name,
        attribute: attrName,
        result,
        breakdown: details?.breakdown,
        modifier: details?.modifier,
        ...(details?.rollContext ? { rollContext: details.rollContext } : {}),
      }),
    }).catch((error) => {
      console.error(error)
      return false
    })
  }

  /** NPCs do Mestre em combate usam o mesmo sigilo das criaturas do bestiário. */
  function crisisConditionsOf(characterId: string) {
    const combat = combatController.combat as typeof combatController.combat & { crisis?: CrisisPublicState } | null
    return combat?.crisis?.players?.[characterId]?.conditions || []
  }

  function crisisConditionsOfCreature(instanceId: string) {
    const combat = combatController.combat as typeof combatController.combat & { crisis?: CrisisPublicState } | null
    return combat?.crisis?.creatures?.[instanceId]?.conditions || []
  }

  function handleCombatSheetRoll(
    character: Character,
    attribute: string,
    result: number | string,
    details?: DiceRollDetails,
  ) {
    if (isTrainingActive((character as any).training)) {
      setCombatUiError(`${character.name} está treinando e não pode fazer rolagens até a conclusão.`)
      return
    }
    const conditions = crisisConditionsOf(character.id)
    if (crisisBlocksRoll(conditions)) {
      setCombatUiError(`${character.name} está com Paralisia e não pode realizar rolagens.`)
      return
    }
    if (isGm && combatController.combat?.enabled && isMasterOwnedCharacter(character)) {
      const numericResult = typeof result === "number" ? result : Number(result)
      if (!Number.isFinite(numericResult)) {
        setCombatUiError("Não foi possível registrar esta rolagem privada do NPC: resultado inválido.")
        return
      }
      // Não chamar a rota coletiva /roll: ela enviaria o resultado até mesmo
      // para jogadores quando a preferência estiver configurada como privada.
      void runCombat({
        type: "gm-npc-roll",
        characterId: character.id,
        label: attribute,
        result: numericResult,
        dice: attribute.match(/\bd\d{1,4}\b/gi) || [],
        breakdown: details?.breakdown || undefined,
      })
      return
    }
    void handleBroadcastRoll(character.name, attribute, result, details)
    if (crisisSelfDamageOnRoll(conditions)) {
      void runCombat({ type: "crisis-sheet-roll", characterId: character.id })
    }
  }

  function handleRaiseHand() {
    if (isGm || handRaiseCooldown) return
    const noticeId = `${data.me.id}-${Date.now()}`
    const characterName =
      characters.find((character) => character.ownerId === data.me.id)?.name ||
      data.me.name
    playHandRaiseSound(effectsVolume)
    setHandPresentation({
      id: noticeId,
      characterName,
      playerName: data.me.name,
    })
    setHandRaiseCooldown(true)
    window.setTimeout(
      () =>
        setHandPresentation((current) =>
          current?.id === noticeId ? null : current,
        ),
      3600,
    )
    window.setTimeout(() => setHandRaiseCooldown(false), 5000)
    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: data.me.id,
        characterName,
        playerName: data.me.name,
        attribute: "PLAYER_HAND_RAISED",
        result: noticeId,
      }),
    }).catch(console.error)
  }

  async function handleArchiveCharacter(selectedCharacter: Character) {
    if (!isGm || !selectedCharacter?.id || archivingCharacterIdsRef.current.has(selectedCharacter.id)) return
    // CharacterSheet já pede confirmação no modal de arquivamento.
    archivingCharacterIdsRef.current.add(selectedCharacter.id)
    try {
      // Recuperar a versão persistida mais recente ANTES de tirar o snapshot:
      // golpes/afinidades/retratos podem ter sido salvos por APIs separadas.
      const response = await apiFetch<{ character: Character }>(
        `/api/characters/${encodeURIComponent(selectedCharacter.id)}/nursery-restore`,
        { cache: "no-store" },
      )
      const character = response.character
      if (!character?.id || character.id !== selectedCharacter.id || character.campaignId !== data.campaign.id)
        throw new Error("Não foi possível consultar a ficha atualizada para arquivamento.")
      // Importante: arquivar NÃO cria sempre um novo NPC. A origem e os IDs
      // de invocações anteriores permitem reencontrar o mesmo registro.
      const draft: NPCDraft = {
        id: `npc-archived-${character.id}`,
        sourceCharacterId: character.id,
        linkedCharacterIds: [character.id],
        npcLevel: character.npcLevel,
        npcChecks: character.npcChecks,
        bestiaryAffinities: character.bestiaryAffinities,
        name: character.name,
        avatarUrl: character.avatarUrl || "",
        origin: character.origin || "Herói Caído/Aposentado",
        identity: character.identity || "",
        theme: character.theme || "",
        classes: character.classes || [],
        skills: character.skills || {},
        attributes: character.attributes,
        equipment: character.equipment || [],
        portraitLabel: (character as Character & { portraitLabel?: string }).portraitLabel || "Normal",
        portraitGallery: (character as Character & { portraitGallery?: NPCDraft["portraitGallery"] }).portraitGallery || [],
        elementalAffinities: (character as Character & { elementalAffinities?: NPCDraft["elementalAffinities"] }).elementalAffinities,
        specialAttacks: (character as Character & PlayerSpecialAttackCharacter).specialAttacks || [],
        npcModifiers: structuredClone((character as any).customModifiers || []),
        npcEquippedIds: Array.isArray((character as any).npcEquippedIds)
          ? structuredClone((character as any).npcEquippedIds)
          : undefined,
        // Snapshot integral, incluindo recursos atuais, itens personalizados,
        // itens equipados/guardados, condições, efeitos e estados de uso.
        archivedSnapshot: captureArchivedCharacter(character),
        archivedAt: Date.now(),
      }

      // Segurança: só exclui a ficha ativa DEPOIS de confirmar o salvamento
      // do NPC no estado persistido da campanha (MongoDB).
      await commitCustomNPCs(previous => {
        const updated = upsertArchivedNPC(previous, draft)
        // Preserva o snapshot mesmo se o normalizador legado do Berçário
        // conhecer somente os campos antigos de NPCDraft.
        let snapshotAttached = false
        const next = updated.map(entry => {
          const sameNpc = entry.id === draft.id ||
            entry.sourceCharacterId === character.id ||
            entry.linkedCharacterIds?.includes(character.id)
          if (!sameNpc) return entry
          snapshotAttached = true
          return { ...entry, archivedSnapshot: draft.archivedSnapshot, archivedAt: draft.archivedAt,
            portraitLabel: draft.portraitLabel, portraitGallery: draft.portraitGallery,
            elementalAffinities: draft.elementalAffinities,
            specialAttacks: draft.specialAttacks, npcModifiers: draft.npcModifiers,
            npcEquippedIds: draft.npcEquippedIds }
        })
        if (!snapshotAttached) throw new Error("Não foi possível associar o snapshot ao NPC. A ficha ativa foi preservada.")
        return next
      })
      try {
        await apiFetch(`/api/characters/${character.id}`, { method: "DELETE" })
      } catch (deleteError) {
        // Registro do NPC já está salvo; repetir a ação não criará duplicatas.
        throw new Error(`NPC salvo no Berçário, mas a ficha ativa não pôde ser removida: ${deleteError instanceof Error ? deleteError.message : "erro desconhecido"}. Tente arquivar novamente; a operação é idempotente.`)
      }
      setCharacters(prev => prev.filter(c => c.id !== character.id))
      if (selectedCombatCharId === character.id) setSelectedCombatCharId(null)
      controllerAlert(`${character.name} foi arquivado no Berçário sem duplicar o registro.`)
    } catch (error) {
      console.error("Falha ao arquivar personagem", error)
      controllerAlert(error instanceof Error ? error.message : "Não foi possível arquivar.")
    } finally {
      archivingCharacterIdsRef.current.delete(selectedCharacter.id)
    }
  }

  function handleSetWeather(w: WeatherType) {
    setWeather(w)
    localStorage.setItem(`weather_${data.campaign.id}`, w)
    void persistCampaignState({ weather: w })

    const weatherNames: Record<string, string> = {
      clear: "Céu Limpo",
      sunny: "Ensolarado",
      cloudy: "Nublado",
      fog: "Neblina",
      rain: "Chuva",
      blizzard: "Nevasca",
    }

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: "sys_weather",
        characterName: "Mestre",
        playerName: data.me.name,
        attribute: `SYNC_WEATHER:${w}`,
        result: weatherNames[w] || w,
      }),
    }).catch(console.error)
  }

  function saveCutscenes(newCutscenes: Cutscene[]) {
    setCutscenes(newCutscenes)
    localStorage.setItem(
      `cutscenes_${data.campaign.id}`,
      JSON.stringify(newCutscenes),
    )
    void persistCampaignState({ cutscenes: newCutscenes })
  }

  function saveCustomSounds(newSounds: Track[]) {
    setCustomSounds(newSounds)
    localStorage.setItem(
      `custom_sounds_${data.campaign.id}`,
      JSON.stringify(newSounds),
    )
    void persistCampaignState({ customSounds: newSounds })
  }

  function syncCutscene(action: "PLAY" | "STOP" | "SCENE", payload?: any) {
    if (action === "PLAY") payload = { ...payload, playbackId: createClientId() }
    const attr = `SYNC_CUTSCENE:${action}`
    const result = payload
      ? typeof payload === "string"
        ? payload
        : JSON.stringify(payload)
      : "..."

    apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
      method: "POST",
      body: JSON.stringify({
        characterId: "sys_cutscene",
        characterName: "Sistema",
        playerName: "Mestre",
        attribute: attr,
        result,
      }),
    }).catch(console.error)
  }

  function handleForceSyncMap(mapId: string) {
    void changeMapVisibility(mapId, true, true)
  }

  /**
   * Serializa modificações no Berçário para não perder NPCs quando criação,
   * edição, invocação e arquivamento acontecem próximos no tempo.
   * A interface só confirma a alteração após o MongoDB confirmar o PATCH.
   */
  function commitCustomNPCs(
    updater: (current: NPCDraft[]) => NPCDraft[],
  ): Promise<NPCDraft[]> {
    const task = nurseryWriteQueueRef.current.catch(() => undefined).then(async () => {
      const next = updater(customNPCsRef.current)
      if (!Array.isArray(next)) throw new Error("Lista de NPCs inválida.")
      if (JSON.stringify(next) === JSON.stringify(customNPCsRef.current)) return customNPCsRef.current
      await persistCampaignState({ customNPCs: next })
      customNPCsRef.current = next
      setCustomNPCs(next)
      try {
        localStorage.setItem(`custom_npcs_${data.campaign.id}`, JSON.stringify(next))
      } catch { /* O servidor já confirmou a persistência. */ }
      return next
    })
    nurseryWriteQueueRef.current = task.then(() => undefined, () => undefined)
    return task
  }

  async function handleDeleteCustomNPC(id: string) {
    await commitCustomNPCs(current => current.filter(c => c.id !== id))
  }

  async function handleSaveCustomNPC(npc: NPCDraft) {
    await commitCustomNPCs(current => {
      const previous = current.find(entry => entry.id === npc.id)
      return upsertNurseryNPC(current, npc).map(entry => entry.id === npc.id ? {
        ...entry,
        archivedSnapshot: npc.archivedSnapshot ?? previous?.archivedSnapshot,
        archivedAt: npc.archivedAt ?? previous?.archivedAt,
        sourceCharacterId: npc.sourceCharacterId ?? previous?.sourceCharacterId,
        linkedCharacterIds: npc.linkedCharacterIds ?? previous?.linkedCharacterIds,
        portraitLabel: npc.portraitLabel ?? previous?.portraitLabel,
        portraitGallery: npc.portraitGallery ?? previous?.portraitGallery,
        elementalAffinities: npc.elementalAffinities ?? previous?.elementalAffinities,
        // [] é uma remoção intencional dos golpes: nunca usar fallback baseado em tamanho.
        specialAttacks: npc.specialAttacks ?? previous?.specialAttacks,
        npcModifiers: npc.npcModifiers ?? previous?.npcModifiers,
        npcEquippedIds: npc.npcEquippedIds ?? previous?.npcEquippedIds,
      } : entry)
    })
  }

  /**
   * A rota nursery-restore salva todos os extras de forma transacional.
   * A antiga segunda chamada para /affinities falhava em NPCs com afinidades
   * fixadas (pedia Lore) MESMO após os dados já estarem restaurados.
   * Não usamos o fluxo de edição de jogadores ao invocar/arquivar um NPC.
   */
  async function restoreNpcExtras(draft: NPCDraft, current: Character): Promise<Character> {
    // O POST /nursery-restore já devolve a versão persistida pela transação.
    // Não consultar /api/characters/[id] via GET: essa rota não oferece GET
    // e causava 405 após o NPC ter sido criado/restaurado corretamente.
    const persisted = current
    if (!persisted?.id) throw new Error("A API não confirmou a restauração do NPC.")
    const archived = draft.archivedSnapshot as (Character & {
      specialAttacks?: NPCDraft["specialAttacks"]
      portraitLabel?: string
      portraitGallery?: NPCDraft["portraitGallery"]
      elementalAffinities?: NPCDraft["elementalAffinities"]
    }) | undefined
    // Inclui NPCs antigos: quando o campo está ausente no draft, ele ainda
    // pode existir no snapshot arquivado.
    const expected = {
      specialAttacks: draft.specialAttacks ?? archived?.specialAttacks,
      portraitLabel: draft.portraitLabel ?? archived?.portraitLabel,
      portraitGallery: draft.portraitGallery ?? archived?.portraitGallery,
      elementalAffinities: draft.elementalAffinities ?? archived?.elementalAffinities,
    }
    const missing = missingNurseryExtras(expected, persisted)
    if (missing.length) throw new Error(`Dados do NPC não persistidos: ${missing.join(", ")}`)
    return persisted
  }

  async function spawnNPC(draft: NPCDraft) {
    try {
      if (draft.archivedSnapshot?.campaignId && draft.archivedSnapshot.campaignId !== data.campaign.id) {
        throw new Error("O snapshot deste NPC pertence a outra campanha.")
      }
      const maxIp = draft.resources?.maxIp ?? draft.archivedSnapshot?.resources?.maxIp ?? BASE_MAX_IP
      const restorePatch = createNurseryRestorePatch(draft, buildArchivedNpcPatch(draft))
      assertInventoryFits({
        equipment: draft.equipment,
        resources: { maxIp },
        attributes: draft.attributes,
        customItems: draft.archivedSnapshot?.customItems ?? [],
      }, customEquipment)
      const response = await apiFetch<{ character: Character }>(`/api/characters`, {
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
          isNpc: true,
          npcLevel: draft.npcLevel ?? draft.archivedSnapshot?.npcLevel ?? Math.max(1, draft.classes.reduce((sum, entry) => sum + entry.level, 0)),
          resources: draft.resources ?? draft.archivedSnapshot?.resources,
          npcChecks: draft.npcChecks ?? draft.archivedSnapshot?.npcChecks,
          customModifiers: draft.customModifiers,
          bestiaryAffinities: draft.bestiaryAffinities ?? draft.archivedSnapshot?.bestiaryAffinities,
        }),
      })
      const spawnedId = response.character?.id
      if (!spawnedId) throw new Error("A API não retornou o ID do NPC criado.")

      let restorationError: string | null = null
      let restoredCharacter = response.character
      try {
        if (restorePatch) {
          const result = await apiFetch<{ character: Character }>(
            `/api/characters/${encodeURIComponent(spawnedId)}/nursery-restore`,
            { method: "POST", body: JSON.stringify({ npcId: draft.id }) },
          )
          if (!result.character?.id) throw new Error("A API não confirmou a ficha restaurada.")
          restoredCharacter = result.character
        }
        // Valida o objeto confirmado e persistido pelo próprio POST de restauração.
        restoredCharacter = await restoreNpcExtras(draft, restoredCharacter)
        if (restorePatch) {
          const missing = [...new Set([
            ...missingRestoredFields(draft, restoredCharacter, restorePatch),
            ...nurseryRestorationFields(restorePatch, restoredCharacter),
          ])]
          if (missing.length) throw new Error(`A API não preservou: ${missing.join(", ")}`)
        }
      } catch (error) {
        restorationError = error instanceof Error ? error.message : "Erro desconhecido na restauração."
      }

      // Registrar a ligação MESMO se uma etapa de restauração falhar.
      // Assim o Mestre pode reparar a ficha existente em vez de criar outra.
      try {
        await commitCustomNPCs(current => {
          const linked = linkSpawnedCharacter(current, draft.id, spawnedId)
          return linked.map(entry => entry.id === draft.id ? {
            ...entry,
            archivedSnapshot: entry.archivedSnapshot ?? draft.archivedSnapshot,
            archivedAt: entry.archivedAt ?? draft.archivedAt,
            portraitLabel: entry.portraitLabel ?? draft.portraitLabel,
            portraitGallery: entry.portraitGallery ?? draft.portraitGallery,
            elementalAffinities: entry.elementalAffinities ?? draft.elementalAffinities,
            specialAttacks: entry.specialAttacks ?? draft.specialAttacks,
            npcModifiers: entry.npcModifiers ?? draft.npcModifiers,
            npcEquippedIds: entry.npcEquippedIds ?? draft.npcEquippedIds,
          } : entry)
        })
      } catch (linkError) {
        throw new Error(`A ficha ${spawnedId} foi criada, mas o vínculo com o Berçário não foi salvo: ${linkError instanceof Error ? linkError.message : "erro"}. Não invoque novamente antes de verificar a sala.`)
      }

      if (restorationError) {
        throw new Error(`NPC ${spawnedId} criado, mas a restauração NÃO foi concluída: ${restorationError}. O registro permaneceu no Berçário; use Restaurar ficha existente após conferir a ficha ativa. Não invoque novamente.`)
      }
      setShowNursery(false)
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  /** Repara uma invocação já criada sem gerar outra ficha/ID. */
  async function repairSpawnedNPC(draft: NPCDraft, characterId: string) {
    if (!isGm) throw new Error("Apenas o Mestre pode restaurar NPCs.")
    if (!draft.linkedCharacterIds?.includes(characterId)) {
      throw new Error("Esta ficha não está vinculada ao NPC arquivado.")
    }
    const active = characters.find(entry => entry.id === characterId)
    if (!active || active.campaignId !== data.campaign.id) {
      throw new Error("A ficha indicada não está ativa nesta campanha.")
    }
    const patch = createNurseryRestorePatch(draft, buildArchivedNpcPatch(draft))
    let restored = active
    if (patch) {
      const response = await apiFetch<{ character: Character }>(
        `/api/characters/${encodeURIComponent(characterId)}/nursery-restore`,
        { method: "POST", body: JSON.stringify({ npcId: draft.id }) },
      )
      if (!response.character) throw new Error("A API não confirmou a ficha restaurada.")
      restored = response.character
    }
    // NPCs manuais não possuem snapshot, mas podem precisar de reparo de
    // golpes/retratos/afinidades após falha parcial na primeira invocação.
    restored = await restoreNpcExtras(draft, restored)
    if (patch) {
      const missing = missingRestoredFields(draft, restored, patch)
      if (missing.length) throw new Error(`A API ainda não preservou: ${missing.join(", ")}`)
    }
    applyOptimistic(restored)
  }

  const saveNpcLoots = (loots: DroppedLoot[]) => {
    setNpcLoots(loots)
    localStorage.setItem(`npc_loots_${data.campaign.id}`, JSON.stringify(loots))
    void persistCampaignState({ npcLoots: loots })
  }

  async function handleKillNPC(character: Character) {
    if (
      !await controllerConfirm(
        `Tem certeza que deseja declarar a morte de ${character.name}? Seus equipamentos (se houver) serão enviados ao Baú de Loots Caídos.`,
      )
    )
      return

    const dropped: DroppedLoot[] = character.equipment.map((itemId) => ({
      uid: Math.random().toString(36).substring(2, 9),
      itemId,
      sourceName: character.name,
    }))

    if (dropped.length > 0) {
      saveNpcLoots([...dropped, ...npcLoots])
      controllerAlert(
        `${dropped.length} item(ns) foram movidos para a caixa de Loots de NPC!`,
      )
    }

    setCharacters((prev) => prev.filter((c) => c.id !== character.id))
    if (selectedCombatCharId === character.id) setSelectedCombatCharId(null)
    try {
      await apiFetch(`/api/characters/${character.id}`, { method: "DELETE" })
    } catch (err) {
      console.error("Falha ao deletar o NPC.", err)
    }
  }

  async function handleGiveDroppedLoot() {
    if (!selectedDroppedLoot || !selectedTargetCharId) return
    const targetCharacter = characters.find(
      (c) => c.id === selectedTargetCharId,
    )
    if (!targetCharacter) return

    try {
      const newEquipment = [
        ...targetCharacter.equipment,
        selectedDroppedLoot.itemId,
      ]
      const { character: updated } = await apiFetch<{ character: Character }>(
        `/api/characters/${targetCharacter.id}`,
        { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) },
      )
      applyOptimistic(updated)

      saveNpcLoots(npcLoots.filter((l) => l.uid !== selectedDroppedLoot.uid))

      // CORREÇÃO: Procurar o item também nos itens customizados criados pelo mestre
      const itemObj =
        customEquipment.find((e) => e.id === selectedDroppedLoot.itemId) ||
        getEquipment(selectedDroppedLoot.itemId)
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST",
        body: JSON.stringify({
          characterId: "sys_item",
          characterName: "Sistema",
          playerName: "Mestre",
          attribute: `SYNC_ITEM_GIVEN`,
          result: JSON.stringify({
            charId: targetCharacter.id,
            character: updated,
            itemName: itemObj?.name || "Loot de Inimigo",
          }),
        }),
      }).catch(console.error)

      setSelectedDroppedLoot(null)
      setSelectedTargetCharId(null)
    } catch (err) {
      controllerAlert(err instanceof Error ? err.message : "Erro ao enviar Loot.")
    }
  }

  // --- Handlers do novo GmPanel ---
  const handleGiveZenits = async (targetId: string, amount: number) => {
    const targetCharacter = characters.find((c) => c.id === targetId)
    if (targetCharacter) {
      const currentZenit = targetCharacter.zenit || 0
      const newZenit = currentZenit + amount

      const { character: updated } = await apiFetch<{ character: Character }>(
        `/api/characters/${targetCharacter.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ zenit: newZenit }),
        },
      )

      applyOptimistic(updated)

      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST",
        body: JSON.stringify({
          characterId: "sys_zenits",
          characterName: targetCharacter.name,
          playerName: "Mestre",
          attribute: `RECEBEU ZENITS`,
          result: `+${amount}z`,
        }),
      }).catch(console.error)
    }
  }

  const handleGiveCustomItem = async (
    targetId: string,
    name: string,
    type: string,
    content: string,
    weight: ItemWeight = { weight: 100, weightUnit: "g" },
  ) => {
    const targetCharacter = characters.find((c) => c.id === targetId)
    if (targetCharacter) {
      const newItem: CustomItem = {
        id: Math.random().toString(36).substring(2, 9),
        name: name,
        type: type as any,
        content: content,
        ...weight,
      }
      const currentCustom = (targetCharacter as any).customItems || []
      const updatedCustomItems = [...currentCustom, newItem]

      assertInventoryChange(
        targetCharacter,
        { ...targetCharacter, customItems: updatedCustomItems },
        customEquipment,
      )
      const { character: updated } = await apiFetch<{ character: Character }>(
        `/api/characters/${targetCharacter.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ customItems: updatedCustomItems }),
        },
      )

      // Nao apresentar um item como entregue quando o PATCH nao o retornou.
      if (!Array.isArray(updated.customItems) ||
          !updated.customItems.some((saved) => saved.id === newItem.id)) {
        throw new Error("A API nao confirmou a relíquia no inventario persistido. Revise a rota PATCH de personagens.")
      }
      applyOptimistic(updated)

      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST",
        body: JSON.stringify({
          characterId: "sys_item",
          characterName: "Sistema",
          playerName: "Mestre",
          attribute: `SYNC_ITEM_GIVEN`,
          result: JSON.stringify({
            charId: targetCharacter.id,
            ownerId: targetCharacter.ownerId,
            itemName: newItem.name,
          }),
        }),
      }).catch(console.error)
    }
  }

  const handleGiveSystemItem = async (targetId: string, itemId: string) => {
    const targetCharacter = characters.find((c) => c.id === targetId)
    const targetCreature = activeCreatures.find(
      (c) => c.instanceId === targetId,
    )

    if (targetCharacter) {
      // CORREÇÃO: Garante que equipment é um array para evitar bugs
      const currentEquip = Array.isArray(targetCharacter.equipment)
        ? targetCharacter.equipment
        : []
      const newEquipment = [...currentEquip, itemId]
      assertInventoryChange(
        targetCharacter,
        { ...targetCharacter, equipment: newEquipment },
        customEquipment,
      )

      const { character: updated } = await apiFetch<{ character: Character }>(
        `/api/characters/${targetCharacter.id}`,
        { method: "PATCH", body: JSON.stringify({ equipment: newEquipment }) },
      )
      const savedCount = (updated.equipment || []).filter((id) => id === itemId).length
      const expectedCount = newEquipment.filter((id) => id === itemId).length
      if (savedCount < expectedCount) {
        throw new Error("A API nao confirmou o equipamento no inventario persistido. Revise a rota PATCH de personagens.")
      }
      applyOptimistic(updated)

      const itemObj =
        customEquipment.find((e) => e.id === itemId) || getEquipment(itemId)
      apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
        method: "POST",
        body: JSON.stringify({
          characterId: "sys_item",
          characterName: "Sistema",
          playerName: "Mestre",
          attribute: `SYNC_ITEM_GIVEN`,
          result: JSON.stringify({
            charId: targetCharacter.id,
            ownerId: targetCharacter.ownerId,
            itemName: itemObj?.name || "Novo Equipamento",
          }),
        }),
      }).catch(console.error)
    } else if (targetCreature) {
      const currentEquip = Array.isArray((targetCreature as any).equipment)
        ? (targetCreature as any).equipment
        : []
      const newEquipment = [...currentEquip, itemId]
      updateCreatureVital(targetCreature.instanceId, {
        equipment: newEquipment,
      } as any)
    }
  }

  async function handleKillCreature(creature: ActiveCreature) {
    if (!isGm) return
    if (
      !await controllerConfirm(
        `Confirmar a derrota de ${creature.name} e distribuir XP para o grupo?`,
      )
    )
      return

    const xpToGive = Math.max(1, Math.floor(creature.level / 5))

    await removeCreature(creature.instanceId)
    setSelectedCombatCreatureId(null)

    const updatedCharacters = characters.map((c) => ({
      ...c,
      resources: {
        ...c.resources,
        xp: ((c.resources as any).xp || 0) + xpToGive,
      },
    }))
    setCharacters(updatedCharacters)

    Promise.all(
      characters.map((c) =>
        apiFetch(`/api/characters/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            resources: { xp: ((c.resources as any).xp || 0) + xpToGive },
          }),
        }),
      ),
    ).catch(console.error)

    setHistory((prev) =>
      [
        {
          id: Math.random().toString(36).substring(7),
          type: "poll" as const,
          title: `Vitória! ${creature.name} foi derrotado.`,
          subtitle: "Recompensa do Grupo",
          detail: "Todos os heróis receberam",
          result: `+${xpToGive} XP`,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        ...prev,
      ].slice(0, 50),
    )
  }

  const saveDraftsToStorage = (drafts: DraftPoll[]) => {
    setDraftPolls(drafts)
    localStorage.setItem(`drafts_${data.campaign.id}`, JSON.stringify(drafts))
    void persistCampaignState({ draftPolls: drafts })
  }

  function handleSaveDraft() {
    const validOptions = pollOptions.filter((o) => o.trim() !== "")
    if (validOptions.length < 2 || !pollQuestion.trim())
      return controllerAlert("Preencha a pergunta e pelo menos 2 opções.")

    const newDraft: DraftPoll = {
      id: Math.random().toString(36).substring(7),
      question: pollQuestion,
      options: validOptions,
      duration: pollDuration,
    }

    saveDraftsToStorage([newDraft, ...draftPolls])
    setPollQuestion("")
    setPollOptions(["", ""])
  }

  function handleDeleteDraft(id: string) {
    saveDraftsToStorage(draftPolls.filter((d) => d.id !== id))
  }

  async function handleLaunchDraft(draft: DraftPoll) {
    const poll: ActivePoll = {
      id: createClientId(),
      question: draft.question,
      options: draft.options,
      votes: {},
      expiresAt: Date.now() + draft.duration * 1000,
    }
    try {
      const result = await apiFetch<{activePoll:ActivePoll}>(`/api/campaigns/${data.campaign.id}/poll`, {
        method: "POST",body: JSON.stringify({action:"start",poll}),
      })
      if (result.activePoll) setActivePoll(result.activePoll)
      setShowPollModal(false)
    } catch(error) { void controllerAlert(error instanceof Error ? error.message : "Enquete não lançada.") }
  }
  const handleLaunchHazard = useCallback(
    async (
      type: "oxygen" | "bleeding" | "reaction",
      minutes: number,
      targetCharacterIds: string[] | null,
    ) => {
      const durationMs = minutes * 60 * 1000

      const newHazard: HazardData = {
        id: createClientId(),
        type,
        duration: durationMs,
        endTime: Date.now() + durationMs,
        targetCharacterIds,
      }

      setActiveHazards((prev) => {
        // Remove somente o mesmo tipo para o mesmo alvo
        const filtered = prev.filter((hazard) => {
          if (hazard.type !== type) return true

          // Condição global
          if (targetCharacterIds === null) {
            return false
          }

          // Remove somente se for exatamente o mesmo personagem
          if (
            hazard.targetCharacterIds?.length === 1 &&
            hazard.targetCharacterIds[0] === targetCharacterIds[0]
          ) {
            return false
          }

          return true
        })

        return [...filtered, newHazard]
      })

      try {
        await fetch(`/api/campaigns/${data.campaign.id}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "hazard:launch",
            hazard: newHazard,
          }),
        })
      } catch (error) {
        console.error("Erro ao sincronizar nova ameaça:", error)
      }
    },
    [data.campaign.id],
  )
  const handleStopHazard = useCallback(
    async (
      type: "oxygen" | "bleeding" | "reaction",
      targetCharacterIds: string[] | null,
    ) => {
      setActiveHazards((prev) =>
        prev.filter((hazard) => {
          if (hazard.type !== type) return true

          // Parar para TODOS
          if (targetCharacterIds === null) {
            return false
          }

          // Parar somente o personagem selecionado
          if (
            hazard.targetCharacterIds?.length === 1 &&
            hazard.targetCharacterIds[0] === targetCharacterIds[0]
          ) {
            return false
          }

          return true
        }),
      )

      try {
        await fetch(`/api/campaigns/${data.campaign.id}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "hazard:stop",
            hazardType: type,
            targetCharacterIds,
          }),
        })
      } catch (error) {
        console.error("Erro ao sincronizar fim da ameaça:", error)
      }
    },
    [data.campaign.id],
  )

  async function handleCreateAndLaunchPoll() {
    const validOptions = pollOptions.filter((o) => o.trim() !== "")
    if (validOptions.length < 2 || !pollQuestion.trim())
      return controllerAlert("Preencha a pergunta e pelo menos 2 opções.")

    const poll: ActivePoll = {
      id: Math.random().toString(36).substring(7),
      question: pollQuestion,
      options: validOptions,
      votes: {},
      expiresAt: Date.now() + pollDuration * 1000,
    }

    try {
      const result = await apiFetch<{activePoll:ActivePoll}>(`/api/campaigns/${data.campaign.id}/poll`, {
        method:"POST",body:JSON.stringify({action:"start",poll}),
      })
      if (result.activePoll) setActivePoll(result.activePoll)
      setShowPollModal(false)
      setPollQuestion("")
      setPollOptions(["", ""])
    } catch(error) { void controllerAlert(error instanceof Error ? error.message : "Não foi possível lançar a enquete.") }
  }

  async function handleVote(optionIndex: number) {
    if (!activePoll) return
    const currentId = activePoll.id
    try {
      const result = await apiFetch<{activePoll:ActivePoll}>(`/api/campaigns/${data.campaign.id}/poll`, {
        method:"POST",body:JSON.stringify({action:"vote",pollId:currentId,optionIndex}),
      })
      if (result.activePoll) setActivePoll(poll=>poll?.id===currentId ? result.activePoll : poll)
    } catch(error) { void controllerAlert(error instanceof Error ? error.message : "Voto não registrado.") }
  }

  async function spawnCreature(creature: Creature) {
    const instance = {
      ...creature,
      instanceId: createCombatInstanceId(),
      currentHp: creature.maxHp,
      currentMp: creature.maxMp,
      currentIp: 6,
      equipment: [],
    }
    try {
      await combatController.send({ type: "spawn", creature: instance })
      setShowBestiary(false)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setCombatUiError(`Não foi possível invocar ${creature.name}: ${detail}`)
      console.error("[Bestiário] Falha ao invocar criatura", { name: creature.name, error })
      throw error // O Bestiário exibe o motivo sem fechar a janela.
    }
  }

  async function updateCreatureVital(
    instanceId: string,
    updates: Partial<ActiveCreature>,
  ) {
    const creature = activeCreatures.find((c) => c.instanceId === instanceId)
    if (!creature) return
    const patch = { ...updates }
    if (typeof patch.currentHp === "number")
      patch.currentHp = Math.max(0, Math.min(creature.maxHp, patch.currentHp))
    if (typeof patch.currentMp === "number")
      patch.currentMp = Math.max(0, Math.min(creature.maxMp, patch.currentMp))
    try {
      await combatController.send({
        type: "update-creature",
        instanceId,
        updates: patch,
      })
    } catch {}
  }

  async function removeCreature(instanceId: string) {
    await combatController.send({ type: "remove-creature", instanceId })
  }

  async function handleLeaveCampaign() {
    if (
      !await controllerConfirm(
        isGm
          ? "Tem certeza que deseja encerrar e deletar esta campanha para todos?"
          : "Tem certeza que deseja abandonar esta mesa?",
      )
    )
      return
    setLeaving(true)
    try {
      await apiFetch(`/api/campaigns/${data.campaign.id}/leave`, {
        method: "POST",
      })
      router.push("/campaigns")
      router.refresh()
    } catch (err) {
      setLeaving(false)
    }
  }

  const handleSaveLoreEntries = useCallback(
    async (newEntries: LoreEntry[]) => {
      // 1. Atualiza estado e LocalStorage para resposta imediata
      setLoreEntries(newEntries)
      localStorage.setItem(
        `lore_${data.campaign.id}`,
        JSON.stringify(newEntries),
      )

      if (isGm) {
        // 2. Avisa os jogadores online via WebSocket (o que você já tinha)
        apiFetch(`/api/campaigns/${data.campaign.id}/roll`, {
          method: "POST",
          body: JSON.stringify({
            characterId: "sys_lore",
            characterName: "Sistema",
            playerName: "Mestre",
            attribute: `SYNC_LORE:UPDATE`,
            result: JSON.stringify(newEntries),
          }),
        }).catch(console.error)

        // 3. NOVO: Salva definitivamente no banco de dados!
        await persistCampaignState({ lore: newEntries })
      }
    },
    [data.campaign.id, isGm, persistCampaignState],
  )

  const myCharacters = characters.filter((c) => c.ownerId === data.me.id)
  const otherCharacters = characters.filter((c) => c.ownerId !== data.me.id)
  // NPCs/fichas pertencentes a membros com papel de Mestre (incluindo o dono
  // da campanha) são sempre recolhidos na visão dos jogadores.
  const gmOwnerIds = new Set([
    data.campaign.ownerId,
    ...data.members.filter(member => member.role === "gm").map(member => member.userId),
  ])
  const isMasterOwnedCharacter = (character: Character) => gmOwnerIds.has(character.ownerId)
  const canExpandCharacter = (character: Character) => isGm || !isMasterOwnedCharacter(character)
  const isCombatActive =
    (isGm && activeCreatures.length > 0) || combatController.combat?.enabled
  const mainCombatShortcutBusy = useRef(false)
  async function toggleMainCombat() {
    if (!isGm || !isCombatActive || combatController.pending || mainCombatShortcutBusy.current) return
    const snapshot = combatController.combat
    if (!snapshot) return
    mainCombatShortcutBusy.current = true
    try {
      if (snapshot.enabled) {
        if (await controllerConfirm("Encerrar o combate? Os tokens serão zerados; criaturas e ataques cadastrados serão preservados.", true))
          await runCombat({type: "end"})
      } else {
        const participants = snapshot.participantCharacterIds.length
          ? snapshot.participantCharacterIds
          : characters.filter(c => data.members.some(member => member.userId === c.ownerId)).map(c => c.id)
        if (!participants.length) {
          // Preserve o fluxo de configuração quando não há personagens escalados.
          openCombatAction(activeCreatures[0]?.instanceId || "")
          controllerAlert("Adicione participantes no painel de combate antes de iniciar.")
          return
        }
        if (await controllerConfirm(`Iniciar o combate com ${participants.length} participante(s)?`, true))
          await runCombat({type: "start", characterIds: participants})
      }
    } finally { mainCombatShortcutBusy.current = false }
  }
  async function removeFocusedCombatCreature() {
    if (!isGm || !isCombatActive || combatController.pending || mainCombatShortcutBusy.current || !activeCreatures.length) return
    const focused = document.activeElement instanceof Element
      ? document.activeElement.closest<HTMLElement>('[data-controller-creature-instance]')?.dataset.controllerCreatureInstance : undefined
    const targetId = focused || selectedCombatCreatureId || (activeCreatures.length === 1 ? activeCreatures[0].instanceId : "")
    const creature = activeCreatures.find(item => item.instanceId === targetId)
    if (!creature) { controllerAlert("Selecione uma criatura na mesa antes de usar R3 para removê-la."); return }
    mainCombatShortcutBusy.current = true
    try {
      if (!await controllerConfirm(`Remover ${creature.name} da cena?`, true)) return
      if (await runCombat({type: "remove-creature", instanceId: creature.instanceId}))
        setSelectedCombatCreatureId(current => current === creature.instanceId ? null : current)
    } finally { mainCombatShortcutBusy.current = false }
  }
  useControllerActions({
    'combat.toggle': () => { void toggleMainCombat(); return true },
    'combat.creature.remove': () => { void removeFocusedCombatCreature(); return true },
  }, {enabled: isGm && !!isCombatActive, priority: 340})
  const combatDiceState = combatController.combat as (typeof combatController.combat & MonsterDiceState)
  const recentCreatureRolls = [
    ...(combatDiceState?.monsterAttributeRolls || []),
    ...(combatDiceState?.monsterCheckRolls || []),
  ].sort((a, b) => b.at - a.at).slice(0, 10)

  async function resolveItemTransfer(
    transferId: string,
    resolution: "accepted" | "rejected",
  ) {
    if (resolvingTransferId) return
    setResolvingTransferId(transferId)
    try {
      const result = await apiFetch<{ donor: Character; recipient: Character }>(
        `/api/item-transfers/${transferId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ resolution }),
        },
      )
      setCharacters((current) =>
        current.map((character) =>
          character.id === result.donor.id
            ? result.donor
            : character.id === result.recipient.id
              ? result.recipient
              : character,
        ),
      )
      setItemTransfers((current) =>
        current.filter((item) => item.id !== transferId),
      )
    } catch (error) {
      controllerAlert(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a transferência.",
      )
    } finally {
      setResolvingTransferId(null)
    }
  }

  const ownedControllerCharacters = characters.filter(c => c.ownerId === data.me.id)
  const selectedControllerCharacter = ownedControllerCharacters.find(c => c.id === selectedCombatCharId)
    || ownedControllerCharacters[0]

  const openControllerSkill = (index: number | string, characterId?: string) => {
    if (activeMap || showGmPanel) return false
    const own = characterId
      ? ownedControllerCharacters.find(c => c.id === characterId)
      : selectedControllerCharacter
    if (!own) return true
    // A solicitação sobrevive à expansão e é entregue apenas à ficha escolhida.
    setControllerFocusSkill(index)
    setControllerPanelRequest(null)
    setSelectedCombatCharId(own.id)
    return true
  }

  // Os seletores apresentam SOMENTE personagens pertencentes ao usuário.
  // Cada habilidade/golpe carrega o characterId, mesmo quando dois NPCs
  // aprenderam a mesma técnica. Não armazenamos nomes nos atalhos.
  const ownControllerCharacter = selectedControllerCharacter
  const controllerCharacterChoices = ownedControllerCharacters.map(c => ({ id:c.id, name:c.name }))
  const controllerSkillChoices = ownedControllerCharacters.flatMap(own => {
    const ownSkillIds = (own.classes || []).map(cls => cls.classId)
    return [...CLASSES, ...customClasses]
      .filter(cls => ownSkillIds.includes(cls.id) || Boolean(cls.parentClassId && ownSkillIds.includes(cls.parentClassId)))
      .flatMap(cls => cls.skills.filter((skill:any) => skillRank(own.skills?.[skill.id]) > 0)
        .map((skill:any) => ({id:skill.id,name:`${skill.name} · ${cls.name}`,characterId:own.id})))
      .filter((choice,index,array) => array.findIndex(candidate => candidate.id === choice.id) === index)
  })
  const controllerSpecialChoices = ownedControllerCharacters.flatMap(own =>
    ((own as Character & PlayerSpecialAttackCharacter).specialAttacks || [])
      .map(attack => ({id:attack.id,name:attack.name,characterId:own.id})))
  const choiceSignature = JSON.stringify({skills:controllerSkillChoices,specials:controllerSpecialChoices,characters:controllerCharacterChoices})
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('otms.controller.skills',{detail:{
      skills:controllerSkillChoices,specials:controllerSpecialChoices,characters:controllerCharacterChoices,
    }}))
  }, [choiceSignature])

  // Resolva ações por IDs estáveis e confira a posse NA HORA do acionamento.
  // Compatibilidade: atalhos anteriores sem characterId continuam funcionando.
  useEffect(() => registerInputHandler(action => {
    const restoreId = restoreTargetOfAction(action)
    if (action === 'character.restore' || restoreId) {
      if (activeMap || showGmPanel) return false
      const own = restoreId
        ? ownedControllerCharacters.find(c => c.id === restoreId)
        : ownedControllerCharacters[0]
      if (!own) { controllerAlert('Selecione um personagem seu nas configurações do controle.'); return true }
      if (restoringControllerVitals.current.has(own.id)) return true
      restoringControllerVitals.current.add(own.id)
      void apiFetch<{character: Character}>(`/api/characters/${encodeURIComponent(own.id)}/vitals`, {
        method:'PATCH', body:JSON.stringify({changes:{hp:{mode:'max',amount:0},mp:{mode:'max',amount:0}}}),
      }).then(result => {
        if (!result.character?.id) throw new Error('O servidor não confirmou a recuperação.')
        applyOptimistic(result.character)
      }).catch(error => controllerAlert(error instanceof Error ? error.message : 'Não foi possível maximizar vida e mana.'))
        .finally(() => restoringControllerVitals.current.delete(own.id))
      return true
    }
    if (activeMap || showGmPanel) return false
    const bound = characterBoundOfAction(action)
    if (bound) {
      const own = ownedControllerCharacters.find(c => c.id === bound.characterId)
      if (!own) { controllerAlert('O personagem escolhido não está disponível nesta sessão.'); return true }
      if (bound.command === 'character.sheet') {
        setControllerFocusSkill(null)
        setControllerPanelRequest(null)
        setSelectedCombatCharId(own.id)
        return true
      }
      if (bound.command === 'special.manager') {
        setControllerFocusSkill(null)
        setControllerPanelRequest('special.manager')
        setSelectedCombatCharId(own.id)
        return true
      }
      const position = Number(bound.command.slice(-1)) - 1
      return openControllerSkill(position, own.id)
    }
    const target = targetOfAction(action)
    if (!target) return false
    const owner = target.characterId
      ? ownedControllerCharacters.find(c => c.id === target.characterId)
      : ownedControllerCharacters.find(c => target.kind === 'skill'
          ? controllerSkillChoices.some(choice => choice.id === target.id && choice.characterId === c.id)
          : controllerSpecialChoices.some(choice => choice.id === target.id && choice.characterId === c.id))
    if (!owner) { controllerAlert('Este personagem ou comando não está mais disponível.'); return true }
    const authorized = target.kind === 'skill'
      ? controllerSkillChoices.some(choice => choice.id === target.id && choice.characterId === owner.id)
      : controllerSpecialChoices.some(choice => choice.id === target.id && choice.characterId === owner.id)
    if (!authorized) { controllerAlert('Esta técnica não está disponível para o personagem selecionado.'); return true }
    if (target.kind === 'skill') return openControllerSkill(target.id, owner.id)
    setControllerFocusSkill(null)
    // O componente do arsenal recebe o ID legado validado, que ele já entende.
    setControllerPanelRequest(`special.open.${target.id}`)
    setSelectedCombatCharId(owner.id)
    return true
  }, 155), [choiceSignature, activeMap, showGmPanel, selectedCombatCharId, data.me.id])

  const openControllerSheetPanel = (panel: string) => {
    if (activeMap || showGmPanel || !ownControllerCharacter) return false
    setControllerFocusSkill(null)
    setControllerPanelRequest(panel)
    setSelectedCombatCharId(ownControllerCharacter.id)
    return true
  }

  // Atalhos semânticos: reuse ações existentes e respeite permissões. Sem efeitos no desktop.
  useControllerActions({
    "skill.ability1": () => openControllerSkill(0),
    "skill.ability2": () => openControllerSkill(1),
    "skill.ability3": () => openControllerSkill(2),
    "skill.ability4": () => openControllerSkill(3),
    "special.manager": () => openControllerSheetPanel('special.manager'),
    "character.training": () => openControllerSheetPanel('training'),
    "character.affinities": () => openControllerSheetPanel('affinities'),
    "character.bonds": () => openControllerSheetPanel('bonds'),
    "character.store": () => openControllerSheetPanel('store'),
    "character.mannequin": () => openControllerSheetPanel('mannequin'),
    "player.theme": () => {
      if (activeMap) return false
      document.querySelector<HTMLButtonElement>('[data-controller-target="player.theme"] button')?.click()
      return true
    },
    "character.sheet": () => {
      if (selectedCombatCharId || showGmPanel || activeMap) return false
      const own = characters.find(c => c.ownerId === data.me.id) || (isGm ? characters[0] : undefined)
      if (!own) return true
      setSelectedCombatCharId(own.id)
      return true
    },
    "character.inventory": () => {
      if (activeMap || showGmPanel) return false
      const own = characters.find(c => c.ownerId === data.me.id) || (isGm ? characters[0] : undefined)
      if (!own) return true
      setInventoryShortcutId(own.id)
      setInventoryToOpen(own.id)
      setSelectedCombatCharId(own.id)
      return true
    },
    "map.open": () => {
      if (selectedCombatCharId || showGmPanel) return false
      if (activeMap) setActiveMap(null)
      else setActiveMap(savedMaps.find(map => isGm || map.isPublic === true) || null)
      return true
    },
    "gallery.open": () => {
      if (activeMap || showGmPanel) return false
      setShowImagepad(true); return true
    },
    "gm.bestiary": () => {
      if (!isGm || activeMap || showGmPanel) return false
      setShowBestiary(true); return true
    },
    "world.lore": () => { if (activeMap) return false; setShowLorebook(true); return true },
    "gm.panel": () => { if (!isGm || activeMap) return false; setShowGmPanel(true); return true },
    "gm.soundpad": () => { if (!isGm || activeMap) return false; setShowSoundpad(true); return true },
    "gm.scenes": () => { if (!isGm || activeMap) return false; setShowCutsceneManager(true); return true },
    "gm.poll": () => { if (!isGm || activeMap) return false; setShowPollModal(true); return true },
    "gm.custom": () => { if (!isGm || activeMap) return false; setShowGmPanel(true); return true },
    "gm.loots": () => { if (!isGm || activeMap) return false; setShowDroppedLoots(true); return true },
    "gm.battleGrid": () => { if (!isGm || activeMap) return false; setShowBattleGrid(v=>!v); return true },
    "gm.crisis": () => { if (!isGm || activeMap) return false; window.dispatchEvent(new Event('otms.gm.open-crisis')); return true },
    "gm.mapImporter": () => { if (!isGm || activeMap) return false; setShowMapImporter(true); return true },
    "gm.weather": () => { if (!isGm || activeMap) return false; const target=document.querySelector<HTMLElement>('[data-controller-target="gm.weather"] button'); target?.scrollIntoView({block:'center'}); target?.focus({preventScroll:true}); return true },
    "gm.difficulty": () => { if (!isGm || activeMap) return false; const target=document.querySelector<HTMLElement>('[data-controller-target="gm.difficulty"] button'); target?.scrollIntoView({block:'center'}); target?.focus({preventScroll:true}); return true },
    "player.gallery": () => { if (activeMap) return false; setShowImagepad(true); return true },
    "player.maps": () => { if (activeMap) return false; setShowPlayerMaps(value=>!value); return true },
    "player.mixer": () => { if (activeMap) return false; setShowVolumeMixer(v=>!v); return true },
    "player.notes": () => {
      if (activeMap) return false
      const button = document.querySelector<HTMLElement>('[data-controller-target="player.notes"] button')
      if (button) {button.click(); return true}
      return false
    },
    "player.hand": () => { if (isGm || handRaiseCooldown || activeMap) return false; handleRaiseHand(); return true },
    "combat.focus": () => {
      if (activeMap) return false
      const launcher = document.querySelector<HTMLButtonElement>('[data-controller-combat-launcher]')
      if (launcher) {launcher.click(); return true}
      const target = document.querySelector<HTMLButtonElement>('[data-controller-combat-start]')
      if (target && !target.disabled) {target.focus({preventScroll:true});target.scrollIntoView({block:'center'});return true}
      return false
    },
  }, {priority: 20})

  // Restaura o foco ao botão exato que abriu cada camada da sala.
  // O Diário e as Cenas gerenciam suas próprias raízes e não entram nesta lista.
  useControllerModalReturnGroup({
    gm: showGmPanel,
    bestiary: showBestiary,
    soundpad: showSoundpad,
    gallery: showImagepad,
    poll: showPollModal,
    nursery: showNursery,
    drops: showDroppedLoots,
    importer: showMapImporter,
    mixer: showVolumeMixer,
    portrait: !!portraitGalleryCharacterId,
  })

  // Fechamento contextual com B: modais da sala antes da navegação da página.
  // Handlers de modais internos da ficha e do mapa têm prioridade maior.
  useControllerActions({
    'ui.back': () => {
      if (activeFullscreenImage) { setActiveFullscreenImage(null); return true }
      if (showImagepad) { setShowImagepad(false); return true }
      if (showBestiary) { setShowBestiary(false); return true }
      if (showLorebook) { setShowLorebook(false); return true }
      if (showGmPanel) { setShowGmPanel(false); return true }
      if (showSoundpad) { setShowSoundpad(false); return true }
      if (showVolumeMixer) { setShowVolumeMixer(false); return true }
      if (showPollModal) { setShowPollModal(false); return true }
      if (showNursery) { setShowNursery(false); return true }
      if (showDroppedLoots) { setShowDroppedLoots(false); return true }
      if (showCutsceneManager) { setShowCutsceneManager(false); return true }
      if (showMapImporter) { setShowMapImporter(false); return true }
      if (portraitGalleryCharacterId) { setPortraitGalleryCharacterId(null); return true }
      if (selectedCombatCharId) { setSelectedCombatCharId(null); setInventoryToOpen(null); setInventoryShortcutId(null); setControllerPanelRequest(null); setControllerFocusSkill(null); return true }
      if (expandedCharacterId) { setExpandedCharacterId(null); return true }
      return false
    },
  }, {priority: 125})

  return (
    <div className="rpg-page mx-auto flex min-h-dvh max-w-[1680px] flex-col px-3 py-4 sm:px-4 md:h-screen md:px-6 md:py-6">
      <ArenaMinigame campaignId={data.campaign.id} userId={data.me.id} isGm={isGm} />
      <ClassCardReveal value={cardReveal} />
      <MonsterAttackPreviewShelf
        previews={playerAttackPreviews.map(preview => ({
          id: preview.id,
          characterId: preview.characterId,
          creatureName: preview.characterName,
          attackName: `${preview.attackName} · ${preview.targetDefense === "magical" ? "Defesa Mágica" : "Defesa Física"}`,
          imageUrl: preview.imageUrl,
          startedAt: preview.startedAt,
          expiresAt: preview.expiresAt,
        }))}
        serverOffset={playerPreviewOffset}
        position="left"
        onCancel={isGm ? (previewId) => { void cancelPlayerAttackPreview(previewId) } : undefined}
      />
      {/* Motor único de áudio: permanece montado enquanto a sala estiver aberta. */}
      <SoundPlaybackEngine
        key={`${data.campaign.id}:${data.me.id}`}
        activeSounds={activeSounds}
        currentUserId={data.me.id}
        isGm={isGm}
        musicVolume={effectsVolume}
        effectsVolume={effectsVolume}
        onSoundEnded={handleSoundEnded}
        campaignId={data.campaign.id}
        isSoundpadOpen={showSoundpad}
        onOpenSoundpad={() => setShowSoundpad(true)}
        customTracks={customSounds}
        onPlaySound={handlePlaySound}
        onStopSound={handleStopSound}
        hotkeyTargetUserId={soundTargetUserId}
      />
      {/* Somente o Soundpad cria o portal de tela cheia; não envolver em outro modal. */}
      {showSoundpad && (
        <Soundpad
          isGm={isGm}
          currentUserId={data.me.id}
          players={data.members.filter(member => member.role === "player")}
          targetUserId={soundTargetUserId}
          onTargetUserIdChange={setSoundTargetUserId}
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
          onClose={() => setShowSoundpad(false)}
        />
      )}
      {mounted &&
        createPortal(
          <>
            {editingCreatureAbilities &&
              combatController.combat?.creatures.find(
                (c) => c.instanceId === editingCreatureAbilities,
              ) && (
                <CreatureAbilitiesManager
                  key={editingCreatureAbilities}
                  creature={combatController.combat.creatures.find(
                    (c) => c.instanceId === editingCreatureAbilities,
                  )!}
                  controller={combatController}
                  onClose={() => setEditingCreatureAbilities(null)}
                  onSaved={async () => {
                    const result = await apiFetch<{
                      state: { customCreatures: Creature[] }
                    }>(`/api/campaigns/${data.campaign.id}/state`)
                    setCustomCreatures(result.state.customCreatures || [])
                  }}
                />
              )}
            <DeathCheckOverlay controller={combatController} viewerId={data.me.id} isGm={isGm} campaignId={data.campaign.id} characters={characters} />
            {portraitGalleryCharacterId && (() => {
              const selected = characters.find(entry => entry.id === portraitGalleryCharacterId)
              return selected ? <PortraitGalleryViewer
                name={selected.name}
                character={selected}
                onClose={() => setPortraitGalleryCharacterId(null)}
              /> : null
            })()}
            <CampaignCombat
              controller={combatController}
              campaignId={data.campaign.id}
              viewerId={data.me.id}
              isGm={isGm}
              characters={characters}
              members={data.members}
              customChecks={customChecks}
              booksRevision={booksRevision}
              onCharacterUpdated={applyOptimistic}
              actionRequest={combatActionRequest}
              onAbilitiesSaved={async () => {
                const result = await apiFetch<{
                  state: { customCreatures: Creature[] }
                }>(`/api/campaigns/${data.campaign.id}/state`)
                setCustomCreatures(result.state.customCreatures || [])
              }}
            />
            <AnimatePresence initial={false}>
              {itemTransfers[0] && (
                <motion.div
                  initial={{ opacity: 0, y: -24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -24 }}
                  className="fixed right-4 top-4 z-[650] w-[min(92vw,390px)] rounded-xl border border-primary/40 bg-zinc-950 p-5 shadow-2xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/15 p-2">
                      <Gift className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-lg font-bold text-foreground">
                        Presente recebido
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">
                          {itemTransfers[0].donorCharacterName}
                        </strong>{" "}
                        quer enviar{" "}
                        <strong className="text-primary">
                          {itemTransfers[0].itemName}
                        </strong>{" "}
                        para {itemTransfers[0].recipientCharacterName}.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={!!resolvingTransferId}
                      onClick={() =>
                        resolveItemTransfer(itemTransfers[0].id, "rejected")
                      }
                    >
                      Recusar
                    </Button>
                    <Button
                      disabled={!!resolvingTransferId}
                      onClick={() =>
                        resolveItemTransfer(itemTransfers[0].id, "accepted")
                      }
                      className="gap-2"
                    >
                      <CheckCircle2 className="size-4" /> Aceitar
                    </Button>
                  </div>
                  {itemTransfers.length > 1 && (
                    <p className="mt-3 text-right text-[10px] text-muted-foreground">
                      +{itemTransfers.length - 1} transferência(s) aguardando
                    </p>
                  )}
                </motion.div>
              )}
              {creating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[500] overflow-y-auto bg-background/95 backdrop-blur-sm"
                >
                  <div className="rpg-page mx-auto max-w-4xl px-5 py-8 sm:px-6">
                    <span className="rpg-kicker mb-3">
                      Registro de viajante
                    </span>
                    <h1 className="rpg-title mb-6 text-2xl font-black">
                      Forjar viajante
                    </h1>
                    <CharacterCreator
                      campaignId={data.campaign.id}
                      campaignCharacters={characters}
                      customClasses={customClasses}
                      onCancel={() => setCreating(false)}
                      onCreated={(c) => {
                        setCharacters((prev) =>
                          prev.some((x) => x.id === c.id) ? prev : [...prev, c],
                        )
                        setCreating(false)
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {activeMap && (isGm || activeMap.isPublic === true) && (
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
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
                  onClick={() => setShowMapImporter(false)}
                >
                  <div
                    role="dialog" aria-modal="true" aria-label="Importar mapa"
                    className="relative w-full max-w-4xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      onClick={() => setShowMapImporter(false)}
                      className="absolute -top-10 right-0 text-muted-foreground hover:text-white"
                    >
                      <X className="size-6" />
                    </button>
                    <MapImporter onMapReady={handleCreateMap} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <WeatherOverlay weather={weather} effectsVolume={effectsVolume} />

            <AnimatePresence>
              {hoveredImage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none bg-black/80 backdrop-blur-sm"
                >
                  <div className="relative w-[80vw] max-w-[500px] aspect-square rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/10">
                    <Image
                      src={hoveredImage}
                      alt="Zoom"
                      fill
                      className="object-contain"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <NpcNursery
              isOpen={showNursery}
              onClose={() => setShowNursery(false)}
              customNPCs={customNPCs}
              onSpawn={spawnNPC}
              onRepair={repairSpawnedNPC}
              onDelete={handleDeleteCustomNPC}
              customClasses={customClasses}
              campaignCharacters={characters}
              customEquipment={customEquipment}
              onCreated={handleSaveCustomNPC}
            />

            {/* MANAGER DE CUTSCENES (Mestre) */}
            <CutsceneManager
              isOpen={showCutsceneManager && isGm}
              onClose={() => setShowCutsceneManager(false)}
              cutscenes={cutscenes}
              onSave={saveCutscenes}
              onPlay={(id) => {
                const c = cutscenes.find((x) => x.id === id)
                if (c) {
                  syncCutscene("PLAY", c)
                  setShowCutsceneManager(false)
                }
              }}
            />

            {/* OVERLAY GLOBAL DA CUTSCENE ATIVA (TODOS OS JOGADORES) */}
            <AnimatePresence>
              {activeCutscene && (
                <CutscenePlayer
                  key={cutscenePlayId}
                  cutscene={activeCutscene}
                  sceneIndex={activeSceneIndex}
                  isGm={isGm}
                  onSyncScene={(idx) => syncCutscene("SCENE", idx.toString())}
                  onClose={() => setActiveCutscene(null)}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showPollModal && (
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden"
                  onClick={() => setShowPollModal(false)}
                >
                  <motion.div
                    variants={modalVariants}
                    role="dialog" aria-modal="true" aria-label="Gerenciar enquetes"
                    className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-lg flex-col border border-primary/50 bg-zinc-950 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                      <div>
                        <h4 className="font-serif text-2xl font-black flex items-center gap-2">
                          <BarChart2 className="size-6 text-primary" />{" "}
                          <span className="text-foreground">
                            Gerenciar enquetes
                          </span>
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Crie votações ou lance enquetes salvas para o grupo.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowPollModal(false)}
                        className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <X className="size-5 text-muted-foreground hover:text-white" />
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-8">
                      {draftPolls.length > 0 && (
                        <div className="flex flex-col gap-3">
                          <h5 className="text-xs font-bold uppercase tracking-widest text-primary border-b border-white/10 pb-2 flex items-center gap-2">
                            <Save className="size-3" /> Enquetes Preparadas
                          </h5>
                          <div className="flex flex-col gap-2">
                            {draftPolls.map((draft) => (
                              <div
                                key={draft.id}
                                className="flex justify-between items-center p-3 rounded-lg border border-border/40 bg-card/20 group"
                              >
                                <div className="min-w-0 pr-4">
                                  <p className="text-sm font-bold text-foreground truncate">
                                    {draft.question}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">
                                    {draft.options.length} opções •{" "}
                                    {draft.duration} Segundos
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground h-8"
                                    onClick={() => handleLaunchDraft(draft)}
                                  >
                                    <Send className="size-3 mr-1.5" /> Lançar
                                  </Button>
                                  <button
                                    onClick={() => handleDeleteDraft(draft.id)}
                                    className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-5">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-primary border-b border-white/10 pb-2 flex items-center gap-2">
                          <Plus className="size-3" /> Nova Enquete
                        </h5>

                        <label className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Pergunta
                          </span>
                          <input
                            type="text"
                            value={pollQuestion}
                            onChange={(e) => setPollQuestion(e.target.value)}
                            placeholder="Ex: Qual caminho devemos seguir?"
                            className="bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                          />
                        </label>

                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Opções
                          </span>
                          {pollOptions.map((opt, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const newOpts = [...pollOptions]
                                  newOpts[idx] = e.target.value
                                  setPollOptions(newOpts)
                                }}
                                placeholder={`Opção ${idx + 1}`}
                                className="flex-1 bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                              />
                              {pollOptions.length > 2 && (
                                <Button
                                  variant="outline"
                                  className="border-destructive/50 text-destructive shrink-0 px-3"
                                  onClick={() =>
                                    setPollOptions(
                                      pollOptions.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            className="w-fit border-dashed border-white/20 mt-1 h-8 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setPollOptions([...pollOptions, ""])}
                          >
                            <Plus className="size-3 mr-1.5" /> Adicionar Opção
                          </Button>
                        </div>

                        <label className="flex flex-col gap-2 border-t border-border/40 pt-5 mt-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Duração (Cronômetro)
                          </span>
                          <select
                            value={pollDuration}
                            onChange={(e) =>
                              setPollDuration(Number(e.target.value))
                            }
                            className="bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                          >
                            <option value={30}>30 Segundos</option>
                            <option value={60}>1 Minuto</option>
                            <option value={120}>2 Minutos</option>
                            <option value={300}>5 Minutos</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="p-6 border-t border-border/50 bg-black/40 flex justify-between gap-3 shrink-0">
                      <Button
                        variant="ghost"
                        onClick={() => setShowPollModal(false)}
                      >
                        Fechar
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                          onClick={handleSaveDraft}
                        >
                          Salvar Preparada
                        </Button>
                        <Button
                          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                          onClick={handleCreateAndLaunchPoll}
                        >
                          <Send className="size-4" /> Lançar Enquete
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <GmPanel
              campaignId={data.campaign.id}
              booksRevision={booksRevision}
              customChecks={customChecks}
              customChecksRevision={customChecksRevision}
              onRefreshCustomChecks={refreshCustomChecks}
              isOpen={showGmPanel}
              onClose={() => setShowGmPanel(false)}
              characters={characters}
              activeCreatures={activeCreatures}
              members={data.members}
              customEquipment={customEquipment}
              customClasses={customClasses} // <-- AQUI
              onCreateEquipment={saveEquipmentDefinition}
              onDeleteEquipment={(id) =>
                saveCustomEquipmentToStorage(
                  customEquipment.filter((e: any) => e.id !== id),
                )
              }
              onCreateClass={(cls) =>
                saveCustomClassesToStorage([
                  ...customClasses.filter((existing: any) => existing.id !== cls.id),
                  cls,
                ])
              }
              onDeleteClass={(id) => {
                void (async () => {
                  const definition = customClasses.find((cls: any) => cls.id === id)
                  if (characters.some(c => (c.classes || []).some((entry: any) =>
                    entry === id || entry?.classId === id || entry?.id === id)) ||
                    customClasses.some((cls: any) => cls.parentClassId === id) ||
                    (definition?.skills || []).some((skill: any) =>
                      characters.some(character => Number(character.skills?.[skill.id] || 0) > 0))) {
                    throw new Error("A classe/subclasse possui personagens, habilidades ou especializações vinculadas.")
                  }
                  const response = await apiFetch<{
                    books?: { classId: string }[]
                    characterProgress?: Record<string, { subclassIds?: string[] }>
                  }>(`/api/campaigns/${encodeURIComponent(data.campaign.id)}/class-books`, { cache: "no-store" })
                  if ((response.books || []).some(book => book.classId === id) ||
                    Object.values(response.characterProgress || {}).some(progress =>
                      progress.subclassIds?.includes(id))) {
                    throw new Error("Antes de excluir, desvincule os livros e especializações dos personagens.")
                  }
                  await saveCustomClassesToStorage(customClasses.filter((cls: any) => cls.id !== id))
                })().catch(error => controllerAlert(error instanceof Error ? error.message : "Falha ao excluir classe."))
              }}
              onGiveZenits={handleGiveZenits}
              onGiveCustomItem={handleGiveCustomItem}
              onGiveSystemItem={handleGiveSystemItem}
              activeHazards={activeHazards}
              onLaunchHazard={handleLaunchHazard}
              onStopHazard={handleStopHazard}
              storeFolders={storeFolders}
              onCreateFolder={handleCreateFolder}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveCustomItem={handleMoveCustomItem}
            />

            <AnimatePresence>
              {showDroppedLoots && (
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden"
                  onClick={() => setShowDroppedLoots(false)}
                >
                  <motion.div
                    variants={modalVariants}
                    role="dialog" aria-modal="true" aria-label="Loot dos NPCs"
                    className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-3xl flex-col border border-accent/50 bg-zinc-950 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center p-6 border-b border-border/50 bg-black/40 shrink-0">
                      <div>
                        <h4 className="font-serif text-2xl font-black flex items-center gap-2">
                          <Inbox className="size-6 text-accent" />{" "}
                          <span className="text-foreground">Loots (NPCs)</span>
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Gerencie e distribua os itens que caíram de inimigos
                          derrotados.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowDroppedLoots(false)}
                        className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <X className="size-5 text-muted-foreground hover:text-white" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-6">
                      {npcLoots.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground italic border border-dashed border-border/40 rounded-xl bg-card/10">
                          Nenhum loot caiu ainda.
                        </div>
                      ) : (
                        <>
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest text-primary shrink-0 mb-3">
                              1. Escolha o Loot Extraído
                            </h5>
                            <div className="grid gap-3 sm:grid-cols-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar-sepia border border-border/30 rounded-lg p-2 bg-black/20">
                              {npcLoots.map((loot) => {
                                const item =
                                  customEquipment.find(
                                    (e) => e.id === loot.itemId,
                                  ) || getEquipment(loot.itemId)
                                if (!item) return null
                                return (
                                  <div
                                    key={loot.uid}
                                    className={`flex flex-col text-left p-3 rounded-lg border transition-colors ${selectedDroppedLoot?.uid === loot.uid ? "border-accent bg-accent/20" : "border-border/60 bg-card/40 hover:border-accent/40"}`}
                                  >
                                    <button
                                      className="text-left w-full"
                                      onClick={() =>
                                        setSelectedDroppedLoot(loot)
                                      }
                                    >
                                      <div className="flex justify-between items-start w-full gap-2">
                                        <p className="font-bold text-sm text-foreground">
                                          {item.name}
                                        </p>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">
                                        Caiu de: {loot.sourceName}
                                      </p>
                                    </button>

                                    <div className="mt-3 flex justify-end">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          saveNpcLoots(
                                            npcLoots.filter(
                                              (l) => l.uid !== loot.uid,
                                            ),
                                          )
                                          if (
                                            selectedDroppedLoot?.uid ===
                                            loot.uid
                                          )
                                            setSelectedDroppedLoot(null)
                                        }}
                                      >
                                        <Trash2 className="size-3 mr-1.5" />{" "}
                                        Descartar
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {selectedDroppedLoot && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                            >
                              <h5 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
                                2. Entregar para (Inventário)
                              </h5>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {characters.map((c) => {
                                  const owner = data.members.find(
                                    (m) => m.userId === c.ownerId,
                                  )
                                  return (
                                    <button
                                      key={c.id}
                                      onClick={() =>
                                        setSelectedTargetCharId(c.id)
                                      }
                                      className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-colors ${selectedTargetCharId === c.id ? "border-primary bg-primary/20" : "border-border/60 bg-card/40 hover:border-primary/40"}`}
                                    >
                                      <p className="font-serif font-bold text-foreground text-center">
                                        {c.name}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                                        Jogador: {owner?.name || "Desconhecido"}
                                      </p>
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
                      <Button
                        variant="ghost"
                        onClick={() => setShowDroppedLoots(false)}
                      >
                        Fechar
                      </Button>
                      <Button
                        className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                        disabled={!selectedDroppedLoot || !selectedTargetCharId}
                        onClick={handleGiveDroppedLoot}
                      >
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
              onConvertToNpc={async creature => {
                const draft = bestiaryToNpc(creature, `npc-bestiary-${creature.id}`)
                await commitCustomNPCs(current => upsertNurseryNPC(current, draft))
                setShowNursery(true)
              }}
              customCreatures={customCreatures}
              onCreate={(c) =>
                saveCustomCreaturesToStorage([c, ...customCreatures])
              }
              onUpdate={(creature) => {
                // Uma criatura de catálogo pode ser personalizada pelo Mestre:
                // salvar com o mesmo ID sobrepõe apenas esta campanha, sem
                // alterar o bestiário padrão ou outras campanhas.
                return saveCustomCreaturesToStorage(customCreatures.some(entry => entry.id === creature.id)
                  ? customCreatures.map(entry => entry.id === creature.id ? creature : entry)
                  : [creature, ...customCreatures])
              }}
              onDelete={(id) =>
                saveCustomCreaturesToStorage(
                  customCreatures.filter((c) => c.id !== id),
                )
              }
            />

            <AnimatePresence>
              {selectedCombatCreatureId && (
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto"
                  onClick={() => setSelectedCombatCreatureId(null)}
                >
                  <div
                    className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      onClick={() => setSelectedCombatCreatureId(null)}
                      className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"
                    >
                      <X className="size-6 text-white" />
                    </button>
                    {activeCreatures
                      .filter((c) => c.instanceId === selectedCombatCreatureId)
                      .map((c) => (
                        <CreatureSheet
                          onUseAttack={(index, abilityId) =>
                            openCombatAction(c.instanceId, index, abilityId)
                          }
                          onOpenCombat={() => openCombatAction(c.instanceId)}
                          key={c.instanceId}
                          creature={c}
                          isGm={isGm}
                          customEquipment={customEquipment}
                          onUpdate={updateCreatureVital}
                          onRoll={(attr: string, _res: number) => {
                            // A ficha legada sorteia uma prévia no navegador.
                            // Ignoramos a prévia e usamos SOMENTE o dado
                            // gerado/persistido pelo servidor do combate.
                            const attribute = (["dex", "ins", "mig", "wlp"] as const)
                              .find(key => attr.startsWith(`${ATTRIBUTE_META[key].label} [`))
                            if (!attribute) {
                              setCombatUiError(`Atributo não reconhecido: ${attr}`)
                              return
                            }
                            void runCombat({ type: "monster-attribute-roll", instanceId: c.instanceId, attribute })
                          }}
                          onKill={() => handleKillCreature(c)}
                        />
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* FICHAS ABERTAS EM COMBATE/POR CLICK */}
            <AnimatePresence>
              {selectedCombatCharId && (
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  data-controller-layer="active"
                  className="combat-character-sheet-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto"
                  onClick={() => { setSelectedCombatCharId(null); setInventoryShortcutId(null); setInventoryToOpen(null) }}
                >
                  <div
                    className="relative w-full max-w-4xl mx-auto my-auto pt-10 pb-10"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      aria-label="Fechar ficha do personagem"
                      onClick={() => { setSelectedCombatCharId(null); setInventoryShortcutId(null); setInventoryToOpen(null) }}
                      className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full z-10"
                    >
                      <X className="size-6 text-white" />
                    </button>
                    {characters
                      .filter((c) => c.id === selectedCombatCharId)
                      .map((c) => (
                        <CharacterSheet
                          key={c.id}
                          crisisConditions={crisisConditionsOf(c.id)}
                          spotlightActive={
                            combatController.combat?.enabled &&
                            combatController.combat?.actorCharacterId ===
                              c.id &&
                            combatController.combat?.spotlight
                              .activePlayerId === c.ownerId
                          }
                          expanded={canExpandCharacter(c)}
                          canExpand={canExpandCharacter(c)}
                          showCompactDefenses={isMasterOwnedCharacter(c)}
                          character={c}
                          npcOnly={isMasterOwnedCharacter(c)}
                          editable={isGm || c.ownerId === data.me.id}
                          isGm={isGm}
                          isOwned={c.ownerId === data.me.id}
                          campaignMembers={data.members}
                          campaignCharacters={characters}
                          onOptimistic={applyOptimistic}
                          activeHazards={activeHazards}
                          customClasses={customClasses}
                          booksRevision={booksRevision}
                          customChecks={customChecks}
                          customEquipment={customEquipment}
                          onRoll={(
                            attr: string,
                            res: number | string,
                            details?: DiceRollDetails,
                          ) => handleCombatSheetRoll(c, attr, res, details)}
                          onKill={isGm ? handleKillNPC : undefined}
                          shouldOpenInventory={inventoryToOpen === c.id}
                          controllerFocusSkill={controllerFocusSkill}
                          onControllerSkillFocused={() => setControllerFocusSkill(null)}
                          controllerPanelRequest={controllerPanelRequest}
                          onControllerPanelOpened={() => setControllerPanelRequest(null)}
                          onClearInventoryRequest={() => setInventoryToOpen(null)}
                          inventoryStandalone={inventoryShortcutId === c.id}
                          onInventoryClosed={() => {
                            if (inventoryShortcutId === c.id) {
                              setInventoryShortcutId(null)
                              setInventoryToOpen(null)
                              setSelectedCombatCharId(null)
                            }
                          }}
                          onArchive={isGm ? handleArchiveCharacter : undefined}
                          storeFolders={storeFolders}
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

            {/* GALERIA ARCANA MODALS */}
            <AnimatePresence>
              {showImagepad && (
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="rpg-archive-overlay fixed inset-0 z-[810] flex h-[100dvh] w-screen overflow-hidden bg-[#060c12]"
                  onClick={() => setShowImagepad(false)}
                >
                  <motion.div
                    variants={modalVariants}
                    role="dialog" aria-modal="true" aria-label="Galeria arcana"
                    data-controller-layer="active"
                    className="rpg-gallery-fullscreen relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="rpg-media-modal-frame min-h-0 flex-1 w-full overflow-hidden">
                      <Imagepad
                        isGm={isGm}
                        myUserId={data.me.id}
                        players={data.members.filter(member => member.role === "player")}
                        targetingEnabled={galleryTargetingEnabled}
                        images={galleryImages}
                        folders={galleryFolders}
                        requests={galleryRequests}
                        onAction={galleryAction}
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
                <GalleryImageViewer
                  key={activeFullscreenImage}
                  src={activeFullscreenImage}
                  onClose={() => setActiveFullscreenImage(null)}
                />
              )}
            </AnimatePresence>

          </>,
          document.body,
        )}

      {mounted &&
        createPortal(
          <AnimatePresence>
            {galleryNotice && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 30, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: 20, x: "-50%" }}
                className="fixed bottom-8 left-1/2 z-[450] flex max-w-[90vw] items-center gap-3 rounded-lg border border-amber-300/60 bg-zinc-950/95 px-5 py-3 text-left text-amber-100 shadow-2xl"
                onClick={() => {
                  if (isGm && galleryRequests.length) setShowImagepad(true)
                  setGalleryNotice(null)
                }}
              >
                <ImageIcon className="size-5 shrink-0 text-amber-300" />
                <span className="text-sm font-semibold">{galleryNotice}</span>
              </motion.button>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* TOAST DE NOTIFICAÇÃO DE ITEM RECEBIDO */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {itemNotification && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9, x: "-50%" }}
                animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                exit={{ opacity: 0, y: 20, scale: 0.9, x: "-50%" }}
                className="fixed bottom-10 left-1/2 z-[400] flex items-center gap-4 bg-green-600/95 border-2 border-green-400 text-white px-6 py-4 rounded-2xl shadow-[0_0_40px_rgba(34,197,94,0.6)] backdrop-blur-md cursor-pointer"
                onClick={() => {
                  if (inventoryToOpen) {
                    setSelectedCombatCharId(inventoryToOpen)
                    setItemNotification(null)
                  }
                }}
              >
                <Gift className="size-8 animate-bounce text-green-100" />
                <div className="flex flex-col pr-6">
                  <span className="font-black text-base uppercase tracking-widest text-green-100">
                    Item Recebido!
                  </span>
                  <span className="text-sm font-medium">
                    O mestre enviou: <strong>{itemNotification}</strong>
                  </span>
                  <span className="text-[10px] opacity-80 mt-0.5">
                    Clique aqui para abrir sua mochila.
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setItemNotification(null)
                  }}
                  className="absolute top-2 right-2 hover:bg-white/20 p-1 rounded-full transition-colors"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {mounted &&
        createPortal(
          <>
            {dicePresentations
              .filter((effect) => !effect.attribute.startsWith("ITEM_ROLL:"))
              .map((effect) => (
                <DiceRollPresentation key={effect.id} effect={effect} />
              ))}
            {dicePresentations.some((effect) =>
              effect.attribute.startsWith("ITEM_ROLL:"),
            ) && (
              <div className="pointer-events-none fixed inset-0 z-[10002] flex items-center justify-center p-6">
                <div className="flex flex-wrap justify-center gap-4">
                  {dicePresentations
                    .filter((effect) =>
                      effect.attribute.startsWith("ITEM_ROLL:"),
                    )
                    .map((effect) => (
                      <motion.div
                        key={effect.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        role="status"
                        aria-live="polite"
                        aria-label={`${effect.attribute.includes(" • Dano") ? "Dano" : "Acerto"}: ${effect.result}`}
                        className="flex min-h-32 min-w-32 items-center justify-center rounded-2xl border border-primary/40 bg-background/95 px-8 py-5 shadow-2xl sm:min-h-40 sm:min-w-40"
                      >
                        <span className="font-mono text-6xl font-black tabular-nums text-primary sm:text-7xl">
                          {effect.result}
                        </span>
                      </motion.div>
                    ))}
                </div>
              </div>
            )}
            {handPresentation && (
              <HandRaisePresentation
                key={handPresentation.id}
                effect={handPresentation}
              />
            )}
          </>,
          document.body,
        )}

      {/* HEADER DA SALA */}
      <header className="rpg-cartography campaign-cartography relative z-40 mb-5 flex shrink-0 flex-wrap items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <div className="flex min-h-16 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/campaigns")}
            aria-label="Voltar"
            className="rpg-cartography-action"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="campaign-heading flex min-h-14 flex-col justify-center">
            <span className="rpg-cartography-kicker">Sessão</span>
            <h1 className="rpg-title rpg-cartography-title text-xl font-black md:text-2xl">
              {data.campaign.name}
            </h1>
            <div className="rpg-cartography-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm">
              <span className="font-mono">#{data.campaign.code}</span>
              <span
                className="campaign-connection inline-flex items-center gap-1"
                data-state={realtimeStatus}
              >
                <Radio className={`size-3.5 ${live ? "animate-pulse" : ""}`} />
                {live
                  ? "Ao vivo"
                  : realtimeStatus === "reconnecting"
                    ? "Reconectando..."
                    : "Conectando..."}
              </span>

              {/* WIDGET DO CLIMA ATUAL */}
              <span className="campaign-current-weather inline-flex items-center gap-1.5 border-l border-border/50 pl-2 transition-colors">
                {weather === "clear" && (
                  <>
                    <CloudSun className="size-4 text-[#c8ae79]" /> Limpo
                  </>
                )}
                {weather === "sunny" && (
                  <>
                    <Sun className="size-4 text-[#c49a5f]" /> Ensolarado
                  </>
                )}
                {weather === "cloudy" && (
                  <>
                    <Cloudy className="size-4 text-[#a9b0ae]" /> Nublado
                  </>
                )}
                {weather === "fog" && (
                  <>
                    <CloudFog className="size-4 text-[#b8b2a6]" /> Neblina
                  </>
                )}
                {weather === "rain" && (
                  <>
                    <CloudRainWind className="size-4 text-[#94aeba]" /> Chovendo
                  </>
                )}
                {weather === "blizzard" && (
                  <>
                    <CloudSnow className="size-4 text-[#d9ddd9]" /> Nevasca
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div data-controller-target="player.notes"><PersonalNotes campaignId={data.campaign.id} /></div>
          <div data-controller-target="player.theme"><ThemeSwitcher /></div>
          <VoiceDock
            campaignId={data.campaign.id}
            userId={data.me.id}
            userName={data.me.name}
            role={isGm ? "gm" : "player"}
            members={data.members}
          />
          <div className="relative" ref={volumeMixerRef}>
            <Button
              variant="outline"
              size="sm"
              className="rpg-cartography-action h-9 gap-2"
              onClick={() => setShowVolumeMixer((value) => !value)}
              aria-expanded={showVolumeMixer}
            >
              <Volume2 className="size-4" /> Mixer
            </Button>
            <AnimatePresence>
              {showVolumeMixer && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  className="rpg-modal rpg-volume-mixer absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(90vw,280px)] rounded-md border border-primary/30 bg-background/95 p-4 text-foreground shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Áudio da Mesa
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowVolumeMixer(false)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                      aria-label="Fechar mixer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div>
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="rpg-mixer-label flex items-center gap-2 font-semibold">
                          <Speaker className="size-4" /> Efeitos sonoros
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {Math.round(effectsVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={effectsVolume}
                        onChange={(e) =>
                          setEffectsVolume(
                            clampVolume(parseFloat(e.target.value)),
                          )
                        }
                        className="w-full h-1.5 cursor-pointer appearance-none rounded-lg bg-muted"
                        style={{ accentColor: "var(--accent)" }}
                      />
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isGm && (
            <Button
              size="sm"
              className="h-9 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
              onClick={handleRaiseHand}
              disabled={handRaiseCooldown}
            >
              <Hand className="size-4" />{" "}
              {handRaiseCooldown ? "Enviado" : "Levantar a mão"}
            </Button>
          )}

          <span className="rpg-cartography-chip inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold md:text-sm">
            {isGm ? (
              <Crown className="size-4" />
            ) : (
              <Shield className="size-4" />
            )}{" "}
            {isGm ? "Mestre" : "Jogador"}
          </span>
        </div>
      </header>

      {/* ÁREA PRINCIPAL DA SALA */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col min-h-0 h-full overflow-hidden">
            {isCombatActive ? (
              <div data-controller-combat-table={isGm ? "active" : undefined} data-controller-has-creature={activeCreatures.length > 0} className="flex flex-col h-full gap-5 relative min-h-0">
                {/* --- SUPER BARRA DE STATUS DO COMBATE --- */}
                <div
                  className={`shrink-0 flex flex-wrap items-center justify-between gap-4 px-5 py-4 rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] relative z-20 backdrop-blur-md transition-colors ${pendingCombatAction ? "bg-red-950/90 border border-red-500 ring-2 ring-red-500/50" : "bg-zinc-950/90 border border-amber-500/30"}`}
                >
                  {pendingCombatAction ? (
                    <div className="flex-1 flex items-center justify-center animate-pulse">
                      <Target className="size-6 text-red-400 mr-3" />
                      <span className="font-black text-red-400 uppercase tracking-widest text-lg">
                        Selecione o Alvo no Campo!
                      </span>
                      <button
                        onClick={() => setPendingCombatAction(null)}
                        className="ml-6 text-xs text-zinc-400 hover:text-white underline"
                      >
                        Cancelar Ação
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-5">
                        {combatController.combat?.enabled ? (
                          <>
                            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                              <Target className="size-6 animate-pulse" />
                            </div>
                            <div>
                              <h3 className="font-serif text-xl font-black text-amber-400 leading-none tracking-wide drop-shadow-md">
                                COMBATE EM ANDAMENTO
                              </h3>
                              <p className="text-xs text-zinc-400 uppercase tracking-widest mt-1.5 font-bold">
                                Turno atual:{" "}
                                <strong className="text-white">
                                  {combatController.combat.spotlight.side ===
                                  "gm"
                                    ? "MESTRE"
                                    : "JOGADORES"}
                                </strong>
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-red-950 text-red-500 ring-1 ring-red-900 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                              <Skull className="size-6" />
                            </div>
                            <div>
                              <h3 className="font-serif text-xl font-black text-red-400 leading-none tracking-wide drop-shadow-md">
                                AMEAÇA DETECTADA
                              </h3>
                              <p className="text-xs text-red-500/80 uppercase tracking-widest mt-1.5 font-bold animate-pulse">
                                Aguardando o Mestre iniciar o combate
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        {/* A MOEDA DO CAOS: TOKENS DE AÇÃO DIRETO NA TELA */}
                        {isGm && combatController.combat?.enabled && (
                          <div
                            className="hidden sm:flex items-center gap-3 bg-red-950/40 border border-red-900/50 px-4 py-2 rounded-lg"
                            title="Tokens de Ação (Ações Especiais do Mestre)"
                          >
                            <div className="relative">
                              <Skull className="size-5 text-red-500" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-widest text-red-400 font-bold">
                                Tokens de Ação
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-lg font-black text-red-100 leading-none">
                                  {combatController.combat.spotlight.tokens}
                                </span>
                                {isGm && (
                                  <button
                                    onClick={() =>
                                      runCombat({
                                        type: "gm-spend",
                                        amount: 1,
                                      }).catch((e) => controllerAlert(e.message))
                                    }
                                    className="bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full size-4 flex items-center justify-center text-xs leading-none"
                                    title="Gastar 1 Token"
                                  >
                                    -
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* CONTROLES DE HOLOFOTE DO MESTRE */}
                        {isGm && (
                          <div className="flex gap-2">
                            {!combatController.combat?.enabled && (
                              <Button
                                data-controller-combat-start="true"
                                className="bg-amber-500 text-black hover:bg-amber-400 font-bold gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                disabled={combatController.pending || mainCombatShortcutBusy.current}
                                onClick={() => void toggleMainCombat()}
                              >
                                <ControllerGlyph button="LS" small/><Zap className="size-4" /> Iniciar Combate
                              </Button>
                            )}
                            {combatController.combat?.enabled && (
                              <Button type="button" size="sm" variant="outline" className="gap-2 border-red-500/40 text-red-200 hover:bg-red-950/40"
                                disabled={combatController.pending || mainCombatShortcutBusy.current}
                                onClick={() => void toggleMainCombat()} title="Encerrar combate · L3">
                                <ControllerGlyph button="LS" small/> Encerrar combate
                              </Button>
                            )}
                            {combatController.combat?.enabled && (
                              <div className="flex gap-2 border-l border-white/10 pl-4">
                                {combatController.combat.spotlight.side ===
                                "gm" ? (
                                  <Button
                                    size="sm"
                                    className="bg-amber-500 text-black hover:bg-amber-400 font-bold shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                                    disabled={
                                      combatController.pending || qtePending
                                    }
                                    onClick={() =>
                                      void runCombat({ type: "gm-pass" })
                                    }
                                  >
                                    <Send className="size-3 mr-2" /> Passar
                                    Holofote
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/50 text-red-400 hover:bg-red-950 hover:text-red-300"
                                    disabled={
                                      combatController.pending ||
                                      qtePending ||
                                      combatController.combat.spotlight.tokens <
                                        1
                                    }
                                    onClick={() =>
                                      runCombat({ type: "gm-steal" })
                                    }
                                  >
                                    <Zap className="size-3 mr-2" /> Roubar
                                    Holofote
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-white/10 text-zinc-400 hover:text-white"
                                  onClick={() =>
                                    openCombatAction(
                                      activeCreatures[0]?.instanceId || "",
                                    )
                                  }
                                  title="Abrir configurações avançadas"
                                >
                                  Participantes e ataques
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* CONTROLES DE HOLOFOTE DO JOGADOR */}
                        {combatController.combat?.enabled && (
                          <div className="flex gap-2 border-l border-white/10 pl-4">
                            {!isGm && !myCombatCharacter && (
                              <span className="text-xs text-amber-200">
                                O Mestre precisa incluir seu personagem nos
                                participantes.
                              </span>
                            )}
                            {ownedCombatCharacters.length > 1 && (
                              <select
                                aria-label="Agir como"
                                className="rounded bg-zinc-900 p-2 text-sm"
                                value={myCombatCharacter?.id || ""}
                                disabled={
                                  !!combatController.combat.actorCharacterId
                                }
                                onChange={(e) =>
                                  setControlledCharacterId(e.target.value)
                                }
                              >
                                {ownedCombatCharacters.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {/* Pedir Holofote */}
                            {combatController.combat.spotlight.side ===
                              "group" &&
                              !combatController.combat.spotlight
                                .activePlayerId &&
                              !combatController.combat.spotlight.request && (
                                <Button
                                  size="sm"
                                  className="bg-amber-300 text-zinc-950 hover:bg-amber-400 font-bold shadow-[0_0_15px_rgba(252,211,77,0.4)]"
                                  disabled={
                                    combatController.pending ||
                                    !myCombatCharacter ||
                                    myCombatCharacter.resources.hp <= 0 ||
                                    qtePending
                                  }
                                  onClick={() => void requestMyTurn()}
                                >
                                  <Hand className="size-3 mr-2" /> Pedir a Vez
                                </Button>
                              )}

                            {/* Cancelar Pedido (Se fui eu que pedi) */}
                            {combatController.combat.spotlight.request
                              ?.playerId === data.me.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-500/50 text-amber-400"
                                onClick={() =>
                                  runCombat({
                                    type: "cancel",
                                    actorId: data.me.id,
                                    requestId:
                                      combatController.combat!.spotlight
                                        .request!.id,
                                  })
                                }
                              >
                                Cancelar Pedido (
                                {
                                  combatController.combat.spotlight.request
                                    .approved.length
                                }
                                /
                                {
                                  combatController.combat.spotlight.request
                                    .required.length
                                }
                                )
                              </Button>
                            )}

                            {/* Aprovar Aliado (Se outro pediu) */}
                            {combatController.combat.spotlight.request &&
                              combatController.combat.spotlight.request
                                .playerId !== data.me.id &&
                              combatController.combat.spotlight.request.required.includes(
                                data.me.id,
                              ) && (
                                <Button
                                  size="sm"
                                  className="font-bold animate-pulse"
                                  disabled={combatController.combat.spotlight.request.approved.includes(
                                    data.me.id,
                                  )}
                                  onClick={() =>
                                    runCombat({
                                      type: "approve",
                                      actorId: data.me.id,
                                      requestId:
                                        combatController.combat!.spotlight
                                          .request!.id,
                                    })
                                  }
                                >
                                  {combatController.combat.spotlight.request.approved.includes(
                                    data.me.id,
                                  )
                                    ? "Apoiado!"
                                    : "Apoiar Aliado"}
                                </Button>
                              )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {(combatUiError || combatController.error) && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-400/40 bg-red-950/70 p-3 text-sm text-red-100"
                  >
                    {combatUiError || combatController.error}
                  </div>
                )}
                {isGm && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">
                    <p>
                      {!combatController.combat?.enabled
                        ? "1. Abra Iniciar Combate e selecione os participantes."
                        : qtePending
                          ? "QTE em andamento: aguarde as reações dos jogadores."
                          : pendingCombatAction
                            ? "Clique no retrato de um participante no painel Grupo para confirmar o alvo."
                            : canGmAct
                              ? "Sua ação: escolha um ataque na criatura e depois clique no jogador alvo."
                              : "O grupo está agindo. Uma falha transfere o Holofote; para interromper, use Roubar Holofote."}
                    </p>
                    {combatController.combat?.enabled && (
                      <button
                        className="rounded-lg border border-amber-300/40 px-3 py-2 font-semibold disabled:opacity-40"
                        disabled={combatController.pending}
                        onClick={() =>
                          void runCombat({ type: "gm-round", passiveTokens: 1 })
                        }
                      >
                        Adquirir +1 Token de Ação
                      </button>
                    )}
                  </div>
                )}
                {/* --- ÁREA DIVIDIDA: INIMIGOS E GRUPO LADO A LADO --- */}
                <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-5">
                  {/* PAINEL DE INIMIGOS */}
                  <div className="flex-[3] flex flex-col min-h-0 bg-black/40 border border-destructive/30 rounded-xl p-5 overflow-y-auto custom-scrollbar-sepia relative shadow-[inset_0_0_40px_rgba(255,0,0,0.02)] backdrop-blur-sm">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-[10px] font-bold uppercase tracking-widest text-destructive flex items-center gap-2">
                        <Skull className="size-3" /> Ameaças em Cena
                      </h2>
                      {isGm && <label className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs font-semibold text-amber-100">
                        <input type="checkbox" disabled={combatController.pending}
                          checked={(combatController.combat as (typeof combatController.combat & MonsterDiceState))?.shareMonsterRolls === true}
                          onChange={event => void runCombat({ type: "set-monster-roll-visibility", enabled: event.target.checked })} />
                        Mostrar dados dos monstros aos jogadores
                      </label>}
                    </div>

                    <div className="flex flex-wrap content-start gap-4 pb-10">
                      {(combatController.combat?.creatures || []).map(
                        (creature) => (
                          <div key={creature.instanceId} data-controller-creature-instance={creature.instanceId} className="w-full sm:max-w-[420px]">
                          <CombatMonsterCard
                            creature={creature}
                            crisisConditions={crisisConditionsOfCreature(creature.instanceId)}
                            customChecks={customChecks}
                            isGm={isGm}
                            pending={combatController.pending}
                            canAct={canGmAct && !crisisBlocksRoll(crisisConditionsOfCreature(creature.instanceId))}
                            targeting={
                              !!pendingCombatAction && !pendingCombatAction.isGm
                            }
                            onSelect={() => {
                              if (
                                pendingCombatAction &&
                                !pendingCombatAction.isGm
                              )
                                void handleTargetSelect(creature.instanceId)
                              else if (isGm)
                                setSelectedCombatCreatureId(creature.instanceId)
                              else setActiveFullscreenImage(creature.imageUrl)
                            }}
                            onAttack={(attackIndex, abilityId) =>
                              setPendingCombatAction({
                                sourceId: creature.instanceId,
                                attackIndex,
                                abilityId,
                                isGm: true,
                              })
                            }
                            onQte={(abilityId) => {
                              setPendingCombatAction(null)
                              void runCombat({
                                type: "start-qte",
                                instanceId: creature.instanceId,
                                abilityId,
                              })
                            }}
                            onConfigure={() =>
                              setEditingCreatureAbilities(creature.instanceId)
                            }
                            onRemove={async () => {
                              if (await controllerConfirm(`Remover ${creature.name} da cena?`))
                                void runCombat({
                                  type: "remove-creature",
                                  instanceId: creature.instanceId,
                                })
                            }}
                            onAttributeRoll={(attribute) => void runCombat({
                              type: "monster-attribute-roll",
                              instanceId: creature.instanceId,
                              attribute,
                            })}
                            onCheckRoll={(checkId) => void runCombat({
                              type: "monster-check-roll",
                              instanceId: creature.instanceId,
                              checkId,
                            })}
                            onCustomCheckRoll={(customCheck) => void runCombat({
                              type: "monster-custom-check-roll",
                              instanceId: creature.instanceId,
                              customCheck: {
                                id: customCheck.id,
                                name: customCheck.name,
                                dice: customCheck.dice,
                              },
                            })}
                            onVital={(resource, change) => {
                              const max =
                                resource === "currentHp"
                                  ? creature.maxHp
                                  : creature.maxMp
                              void updateCreatureVital(creature.instanceId, {
                                [resource]:
                                  change === "full"
                                    ? max
                                    : Math.max(
                                        0,
                                        Math.min(
                                          max,
                                          creature[resource] + change,
                                        ),
                                      ),
                              })
                            }}
                          />
                          </div>
                        ),
                      )}
                    </div>
                    {recentCreatureRolls.length > 0 && (
                      <section className="mt-4 rounded-xl border border-amber-400/20 bg-black/30 p-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                          Testes das criaturas
                        </h3>
                        <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto text-xs">
                          {recentCreatureRolls.map(roll => (
                            <li key={roll.id} className="rounded-md border border-white/10 px-2 py-1.5 text-zinc-300">
                              <span className="font-semibold text-amber-100">{roll.creatureName}</span>
                              {"checkName" in roll ? ` · ${roll.checkName}` : ` · ${roll.attribute.toUpperCase()}`}
                              {`: ${roll.result}`}
                              {isGm && !roll.shared ? " · Privada" : ""}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>

                  {/* PAINEL DO GRUPO (Com 1-Clique para Jogadores) */}
                  <div className="flex-[2] flex flex-col min-h-0 bg-card/20 border border-primary/20 rounded-xl p-5 overflow-y-auto custom-scrollbar-sepia relative backdrop-blur-sm shadow-[inset_0_0_40px_rgba(0,0,0,0.2)]">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2 mb-5 shrink-0">
                      <Users className="size-3" /> Grupo
                    </h2>

                    <div className="flex flex-col gap-3 pb-10">
                      {characters.map((char) => {
                        const isMyTurn =
                          combatController.combat?.enabled &&
                          combatController.combat.spotlight.side === "group" &&
                          combatController.combat.spotlight.activePlayerId ===
                            char.ownerId &&
                          combatController.combat.actorCharacterId ===
                            char.id &&
                          !combatController.combat.spotlight.request
                        const isMe = char.ownerId === data.me.id
                        const myAttacks =
                          combatController.combat?.playerAttacks[char.id] || []

                        return (
                          <div
                            key={char.id}
                            onClick={() => {
                              if (
                                pendingCombatAction &&
                                pendingCombatAction.isGm
                              ) {
                                handleTargetSelect(char.id)
                              } else if (isGm || isMe) {
                                setSelectedCombatCharId(char.id)
                              }
                            }}
                            className={`flex flex-col bg-zinc-950 border rounded-xl p-3 w-full transition-all group relative overflow-hidden ${pendingCombatAction && pendingCombatAction.isGm ? "cursor-crosshair border-red-500 hover:bg-red-500/10 scale-[1.02] shadow-[0_0_20px_rgba(220,38,38,0.2)] z-10" : isMyTurn ? "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.15)] scale-[1.02] z-10" : "border-border/50 hover:border-primary/50 cursor-pointer"}`}
                          >
                            {isMyTurn && (
                              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
                            )}

                            <div className="flex items-center gap-4 relative z-10 pointer-events-none">
                              <button type="button" aria-label={`Ver retratos de ${char.name}`}
                                title="Abrir galeria de retratos"
                                className="pointer-events-auto relative shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                onClick={event => {
                                  event.stopPropagation()
                                  if (pendingCombatAction?.isGm) { void handleTargetSelect(char.id); return }
                                  setPortraitGalleryCharacterId(char.id)
                                }}>
                                <CharacterPortrait
                                  src={char.avatarUrl}
                                  alt={`Retrato de ${char.name}`}
                                  frame={char.portraitFrame}
                                  crop={char.portraitCrop}
                                  className={`size-12 shrink-0 transition-all ${isMyTurn ? "rounded-full ring-2 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.8)] motion-safe:animate-pulse" : ""}`}
                                  sizes="48px"
                                />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-1">
                                  <p
                                    className={`font-serif text-sm font-bold truncate transition-colors pr-2 ${isMyTurn ? "text-amber-400" : "text-foreground"}`}
                                  >
                                    {char.name}
                                  </p>
                                  {isMe && (
                                    <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider font-bold shrink-0">
                                      Você
                                    </span>
                                  )}
                                </div>
                                {(isGm || isMe) && (
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-mono font-medium text-[color:var(--hp)] bg-black/40 px-1.5 rounded">
                                      {char.resources.hp} HP
                                    </span>
                                    <span className="text-[10px] font-mono font-medium text-[color:var(--mp)] bg-black/40 px-1.5 rounded">
                                      {char.resources.mp} MP
                                    </span>
                                  </div>
                                )}
                                {isMyTurn && (
                                  <p className="text-[9px] text-amber-300 font-bold uppercase tracking-widest mt-2 animate-pulse">
                                    ⚡ Holofote!
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* O PODER DO 1-CLIQUE PARA O JOGADOR */}
                            {(isGm || isMe) && (
                              <button
                                type="button"
                                className="relative z-10 mt-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:border-primary/70 hover:bg-primary/20"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedCombatCharId(char.id)
                                }}
                              >
                                Abrir ficha
                              </button>
                            )}
                            {(isGm || isMe) && (
                              <div className="relative z-20 mt-2 w-full min-w-0 pointer-events-auto"
                                onClick={(event) => event.stopPropagation()}>
                                <CharacterBookShelf
                                  campaignId={data.campaign.id}
                                  character={char}
                                  isGm={isGm}
                                  refreshToken={booksRevision}
                                  onCharacterUpdated={applyOptimistic}
                                />
                              </div>
                            )}
                            {isMyTurn && isMe && !qtePending && (
                              <div className="mt-4 pt-4 border-t border-amber-500/20 w-full relative z-20 pointer-events-auto">
                                <p className="text-[10px] text-amber-400 uppercase tracking-widest font-bold mb-2">
                                  Suas Ações Rápidas:
                                </p>
                                {!myAttacks || myAttacks.length === 0 ? (
                                  <p className="text-[10px] text-zinc-500 italic bg-black/40 p-2 rounded">
                                    Nenhum ataque configurado. O Mestre deve
                                    abrir o Painel e cadastrar suas armas.
                                  </p>
                                ) : (
                                  <div className="flex flex-col gap-2">
                                    {myAttacks.map((atk, idx) => (
                                      <button
                                        key={idx}
                                        className="flex justify-between items-center bg-zinc-900/80 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/50 rounded-md p-2 transition-colors text-left shadow-sm"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          const enemies =
                                            activeCreatures.filter(
                                              (c) => c.currentHp > 0,
                                            )
                                          if (enemies.length === 1) {
                                            // Se tiver só 1 alvo vivo, ataca direto (Super Rápido)
                                            runCombat({
                                              type: "player-attack",
                                              characterId: char.id,
                                              instanceId: enemies[0].instanceId,
                                              attackIndex: idx,
                                            }).catch(console.error)
                                          } else if (enemies.length > 1) {
                                            // Se tiver mais de 1 alvo, entra no modo "Mira"
                                            setPendingCombatAction({
                                              sourceId: char.id,
                                              attackIndex: idx,
                                              isGm: false,
                                            })
                                          } else {
                                            controllerAlert(
                                              "Não há ameaças ativas para atacar!",
                                            )
                                          }
                                        }}
                                      >
                                        <span className="text-xs font-bold text-zinc-200">
                                          {atk.name}
                                        </span>
                                        <span className="text-[9px] font-mono text-amber-500/80 bg-black/50 px-1.5 py-0.5 rounded">
                                          {atk.damage} {atk.type}
                                        </span>
                                      </button>
                                    ))}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full mt-1 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 text-xs h-7"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        runCombat({ type: "finish" }).catch(
                                          console.error,
                                        )
                                      }}
                                    >
                                      Encerrar Meu Turno
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rpg-character-scroll h-full overflow-y-auto px-1 py-1 custom-scrollbar-sepia">
                <section className="mb-8">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="rpg-section-title">
                      {isGm ? "Viajantes do Mestre" : "Meus viajantes"}
                    </h2>

                    <div className="flex gap-2">
                      {isGm && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rpg-bestiary-nursery h-8 gap-1.5"
                          onClick={() => setShowNursery(true)}
                        >
                          <UserPlus className="size-4" />{" "}
                          <span className="text-foreground">Berçário</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => setCreating(true)}
                        className="h-8 gap-1.5 backdrop-blur-sm"
                      >
                        <Plus className="size-4" /> Novo viajante
                      </Button>
                    </div>
                  </div>
                  {inventorySyncError && (
                    <p role="alert" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
                      Nao foi possivel confirmar a mochila no MongoDB: {inventorySyncError}
                    </p>
                  )}
                  {myCharacters.length === 0 ? (
                    <div className="rpg-empty rounded-md border border-dashed border-border/60 bg-black/20 p-8 text-center text-sm text-muted-foreground">
                      Você ainda não criou um viajante.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {myCharacters.map((c) => (
                        <div key={c.id}>
                          <CharacterBookShelf campaignId={data.campaign.id} character={c} isGm={isGm} refreshToken={booksRevision} onCharacterUpdated={applyOptimistic} />
                        <CharacterSheet
                          key={c.id}
                          crisisConditions={crisisConditionsOf(c.id)}
                          spotlightActive={
                            combatController.combat?.enabled &&
                            combatController.combat?.actorCharacterId ===
                              c.id &&
                            combatController.combat?.spotlight
                              .activePlayerId === c.ownerId
                          }
                          character={c}
                          npcOnly={isMasterOwnedCharacter(c)}
                          editable={true}
                          canExpand={canExpandCharacter(c)}
                          showCompactDefenses={isMasterOwnedCharacter(c)}
                          activeHazards={activeHazards}
                          isGm={isGm}
                          isOwned={true}
                          customClasses={customClasses}
                          booksRevision={booksRevision}
                          customChecks={customChecks}
                          campaignMembers={data.members}
                          campaignCharacters={characters}
                          customEquipment={customEquipment}
                          onOptimistic={applyOptimistic}
                          onRoll={(
                            attr: string,
                            res: number | string,
                            details?: DiceRollDetails,
                          ) => handleCombatSheetRoll(c, attr, res, details)}
                          onKill={isGm ? handleKillNPC : undefined}
                          onArchive={isGm ? handleArchiveCharacter : undefined}
                          expanded={expandedCharacterId === c.id}
                          onExpandedChange={(next: boolean) =>
                            setExpandedCharacterId(next ? c.id : null)
                          }
                          storeFolders={storeFolders}
                        />
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {otherCharacters.length > 0 && (
                  <section>
                    <h2 className="rpg-section-title mb-3">
                      {isGm
                        ? "Viajantes dos jogadores"
                        : "Companheiros de jornada"}
                    </h2>
                    <div className="flex flex-col gap-6">
                      {otherCharacters.map((c) => (
                        <div key={c.id}>
                          {isGm && <CharacterBookShelf campaignId={data.campaign.id} character={c} isGm refreshToken={booksRevision} onCharacterUpdated={applyOptimistic} />}
                        <CharacterSheet
                          key={c.id}
                          crisisConditions={crisisConditionsOf(c.id)}
                          spotlightActive={
                            combatController.combat?.enabled &&
                            combatController.combat?.actorCharacterId ===
                              c.id &&
                            combatController.combat?.spotlight
                              .activePlayerId === c.ownerId
                          }
                          character={c}
                          npcOnly={isMasterOwnedCharacter(c)}
                          editable={isGm}
                          canExpand={canExpandCharacter(c)}
                          showCompactDefenses={isMasterOwnedCharacter(c)}
                          activeHazards={activeHazards}
                          isGm={isGm}
                          isOwned={false}
                          campaignMembers={data.members}
                          campaignCharacters={characters}
                          customEquipment={customEquipment}
                          customClasses={customClasses}
                          booksRevision={booksRevision}
                          customChecks={customChecks}
                          onOptimistic={applyOptimistic}
                          onRoll={(
                            attr: string,
                            res: number | string,
                            details?: DiceRollDetails,
                          ) => handleCombatSheetRoll(c, attr, res, details)}
                          onKill={isGm ? handleKillNPC : undefined}
                          onArchive={isGm ? handleArchiveCharacter : undefined}
                          expanded={expandedCharacterId === c.id}
                          onExpandedChange={(next: boolean) =>
                            setExpandedCharacterId(next ? c.id : null)
                          }
                          storeFolders={storeFolders}
                        />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: PAINEL DO MESTRE & HISTÓRICO */}
          <aside data-controller-bindable-panel="session" className="rpg-session-sidebar flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-4 pr-1 custom-scrollbar-sepia">
            {isGm && (
              <>
                <div className="panel rpg-gm-tools shrink-0 border border-accent/40 p-4">
                  <div className="rpg-gm-heading mb-4 border-b pb-3">
                    <h2 className="flex items-center gap-2 font-serif text-base font-bold">
                      <Crown className="size-4" /> Grimório do Mestre
                    </h2>
                  </div>

                  <div className="flex flex-col gap-2">
                    <CrisisControls controller={combatController} />
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowCutsceneManager(true)}
                    >
                      <Clapperboard className="size-4" /> Cenas
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button relative w-full justify-start gap-2"
                      onClick={() => setShowImagepad(true)}
                    >
                      <ImageIcon className="size-4" /> Galeria arcana
                      {galleryRequests.length > 0 && (
                        <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-black">
                          {galleryRequests.length}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowSoundpad(true)}
                    >
                      <Mic className="size-4" /> Efeitos sonoros
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowLorebook(true)}
                    >
                      <BookOpen className="size-4" />{" "}
                      <span className="text-[#eee3cf]">Diário do mundo</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowPollModal(true)}
                    >
                      <BarChart2 className="size-4" /> Criar enquete
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowGmPanel(true)}
                    >
                      <Gift className="size-4" /> Customizaveis
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button relative w-full justify-start gap-2"
                      onClick={() => setShowDroppedLoots(true)}
                    >
                      <Inbox className="size-4" /> Gerenciar loots
                      {npcLoots.length > 0 && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                          {npcLoots.length}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowBestiary(true)}
                    >
                      <Skull className="size-4" /> Bestiário
                    </Button>
                    <Button
                      variant="outline"
                      className="rpg-tool-button w-full justify-start gap-2"
                      onClick={() => setShowBattleGrid((value) => !value)}
                      aria-expanded={showBattleGrid}
                    >
                      <Grid3X3 className="size-4" /> Grade de batalha
                      <ChevronDown
                        className={`ml-auto size-4 transition-transform ${showBattleGrid ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </div>

                  <div
                    className="rpg-battle-grid-collapse"
                    data-open={showBattleGrid}
                    aria-hidden={!showBattleGrid}
                  >
                    <div className="rpg-battle-grid-clip">
                      <div className="rpg-map-index flex flex-col gap-2">
                        {Array.from(
                          new Map(savedMaps.map((m) => [m.id, m])).values(),
                        ).map((m) => (
                          <div key={m.id} className="flex gap-2 w-full">
                            <Button
                              size="sm"
                              variant="outline"
                              className={`rpg-map-entry flex-1 justify-start overflow-hidden text-left text-xs ${activeMap?.id === m.id ? "is-active" : ""}`}
                              onClick={() => setActiveMap(m)}
                              title="Abrir para você (Preparação)"
                            >
                              <Grid3X3 className="size-3 mr-2 shrink-0" />{" "}
                              <span className="truncate">{m.name} · {m.isPublic === true ? "Visível" : "Oculto"}</span>
                            </Button>

                            <Button size="sm" variant="outline" disabled={mapActionPending}
                              onClick={() => void changeMapVisibility(m.id, m.isPublic !== true)}
                              title={m.isPublic === true ? "Ocultar dos jogadores e fechar o mapa nas telas deles" : "Permitir que os jogadores vejam e abram este mapa"}>
                              {m.isPublic === true ? "Ocultar" : "Revelar"}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="rpg-map-action rpg-map-action-share w-9 shrink-0 px-0"
                              disabled={mapActionPending}
                              onClick={() => handleForceSyncMap(m.id)}
                              title="Revelar e abrir este mapa para todos os jogadores"
                            >
                              <Eye className="size-3" />
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="rpg-map-action rpg-map-action-edit w-9 shrink-0 px-0"
                              onClick={() => handleRenameMap(m.id, m.name)}
                              title="Renomear mapa"
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rpg-map-action rpg-map-action-delete w-9 shrink-0 px-0"
                              onClick={() => handleDeleteMap(m.id)}
                              title="Deletar mapa"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          className="rpg-map-entry w-full justify-start text-xs"
                          onClick={() => setShowMapImporter(true)}
                        >
                          <Plus className="size-3 mr-2" /> Importar Novo Mapa
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div data-controller-target="gm.difficulty"><GmDifficultyGuide latestRoll={latestDiceRoll} viewer="gm"
                    settings={difficultySettings} settingsRevision={difficultyRevision}
                    settingsLoading={difficultyLoading} settingsError={difficultyError}
                    onSaveSettings={saveDifficultySettings} /></div>

                  {/* Clima Dinâmico */}
                  <div data-controller-target="gm.weather" className="rpg-gm-section mt-4 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="rpg-weather-heading whitespace-nowrap font-bold uppercase tracking-widest">
                        Clima Dinâmico
                      </p>
                      <button
                        onClick={() => handleSetWeather(weather)}
                        className="flex items-center gap-1.5 text-xs font-bold uppercase text-primary hover:text-primary/80"
                        title="Forçar clima para quem acabou de entrar"
                      >
                        <RefreshCw className="size-3.5" /> Sincronizar
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSetWeather("clear")}
                        className={`rpg-weather-button h-8 w-full p-0 ${weather === "clear" ? "is-active" : ""}`}
                        data-weather="clear"
                        title="Céu Limpo"
                      >
                        <CloudSun className="size-[18px]" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSetWeather("sunny")}
                        className={`rpg-weather-button h-8 w-full p-0 ${weather === "sunny" ? "is-active" : ""}`}
                        data-weather="sunny"
                        title="Ensolarado"
                      >
                        <Sun className="size-[18px]" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSetWeather("cloudy")}
                        className={`rpg-weather-button h-8 w-full p-0 ${weather === "cloudy" ? "is-active" : ""}`}
                        data-weather="cloudy"
                        title="Nublado"
                      >
                        <Cloudy className="size-[18px]" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSetWeather("fog")}
                        className={`rpg-weather-button h-8 w-full p-0 ${weather === "fog" ? "is-active" : ""}`}
                        data-weather="fog"
                        title="Neblina"
                      >
                        <CloudFog className="size-[18px]" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSetWeather("rain")}
                        className={`rpg-weather-button h-8 w-full p-0 ${weather === "rain" ? "is-active" : ""}`}
                        data-weather="rain"
                        title="Chuvoso"
                      >
                        <CloudRainWind className="size-[18px]" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSetWeather("blizzard")}
                        className={`rpg-weather-button h-8 w-full p-0 ${weather === "blizzard" ? "is-active" : ""}`}
                        data-weather="blizzard"
                        title="Nevasca"
                      >
                        <CloudSnow className="size-[18px]" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!isGm && (
              <div className="panel rpg-gm-tools shrink-0 border border-accent/40 p-4">
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="rpg-tool-button w-full justify-start gap-2"
                    onClick={() => setShowImagepad(true)}
                  >
                    <ImageIcon className="size-4" /> Acervo visual
                  </Button>
                  <Button
                    variant="outline"
                    className="rpg-tool-button w-full justify-start gap-2"
                    onClick={() => setShowLorebook(true)}
                  >
                    <BookOpen className="size-4" /> Diário do mundo
                  </Button>
                  <Button
                    variant="outline"
                    className="rpg-tool-button w-full justify-start gap-2"
                    onClick={() => setShowPlayerMaps((value) => !value)}
                    aria-expanded={showPlayerMaps}
                  >
                    <Grid3X3 className="size-4" /> Mapas da campanha
                    <ChevronDown
                      className={`ml-auto size-4 transition-transform ${showPlayerMaps ? "rotate-180" : ""}`}
                    />
                  </Button>
                </div>

                <div
                  className="rpg-battle-grid-collapse"
                  data-open={showPlayerMaps}
                  aria-hidden={!showPlayerMaps}
                >
                  <div className="rpg-battle-grid-clip">
                    <div className="rpg-map-index flex flex-col gap-2">
                      {Array.from(
                        new Map(savedMaps.map((map) => [map.id, map])).values(),
                      ).map((map) => (
                        <Button
                          key={map.id}
                          size="sm"
                          variant="outline"
                          className={`rpg-map-entry w-full justify-start overflow-hidden text-left text-xs ${activeMap?.id === map.id ? "is-active" : ""}`}
                          onClick={() => setActiveMap(map)}
                        >
                          <Grid3X3 className="mr-2 size-3 shrink-0" />{" "}
                          <span className="truncate">{map.name}</span>
                        </Button>
                      ))}
                      {savedMaps.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                          Nenhum mapa disponível.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isGm && <GmDifficultyGuide latestRoll={latestPlayerDiceRoll} viewer="player"
              settings={difficultySettings} settingsRevision={difficultyRevision}
              settingsLoading={difficultyLoading} settingsError={difficultyError} />}

            <div className="rpg-cartography rpg-history-panel flex min-h-[300px] flex-1 flex-col overflow-hidden">
              <div className="rpg-history-heading shrink-0 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Dices className="size-4" /> Histórico da jornada
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar-sepia">
                {activePoll && now < activePoll.expiresAt && <section aria-label="Enquete disponível para votar" className="sticky top-0 z-10 max-h-[min(66vh,560px)] overflow-y-auto rounded-lg border border-[#aa7e40] bg-[#f3e5c9] p-3 text-[#352516] shadow-[0_12px_32px_rgba(0,0,0,.2)] sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs uppercase tracking-wider text-[#6c471a]">Enquete ao vivo · vote aqui</strong>
                    <div className="flex items-center gap-2"><span className="font-mono text-xs">{Math.max(0,Math.ceil((activePoll.expiresAt-now)/1000))}s</span>
                      <button type="button" aria-expanded={!pollMinimized} aria-controls="otms-poll-voting-options"
                        onClick={() => setPollMinimized(value=>!value)}
                        className="rounded-md border border-[#aa7e40] bg-white/65 px-3 py-1.5 text-xs font-semibold text-[#553514] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#995e1d]">
                        {pollMinimized ? 'Expandir enquete' : 'Minimizar enquete'}
                      </button>
                    </div>
                  </div>
                  {!pollMinimized && <div id="otms-poll-voting-options">
                  <p className="mt-2 text-sm font-bold text-[#352516]">{activePoll.question}</p>
                  <div className="mt-3 flex flex-col gap-2">{activePoll.options.map((option,index)=>{
                    const selected = activePoll.votes[data.me.id] === index
                    const votes = Object.values(activePoll.votes).filter(vote=>vote===index).length
                    return <button key={`${activePoll.id}-${index}`} type="button" aria-pressed={selected} onClick={()=>void handleVote(index)}
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'border-[#885212] bg-[#e5c48c] text-[#34200b]' : 'border-[#bba077] bg-[#fff9ec] text-[#352516] hover:border-[#996527] hover:bg-white'}`}>
                      <span>{String.fromCharCode(65+index)} · {option}</span><span className="shrink-0 text-[10px] text-muted-foreground">{votes} voto(s)</span>
                    </button>
                  })}</div><p className="mt-2 text-[10px] text-[#654b2d]">{activePoll.votes[data.me.id] === undefined ? 'Selecione uma resposta com A ou clique.' : 'Seu voto foi registrado. Você pode alterá-lo até o término.'}</p></div>}
                  {pollMinimized && <p className="mt-2 truncate text-xs text-[#664b2c]">{activePoll.question} · Expandir para votar</p>}
                </section>}
                {history.length === 0 && !activePoll ? (
                  <p className="text-xs text-muted-foreground text-center italic mt-4">
                    Nenhum evento registrado ainda.
                  </p>
                ) : (
                  history.map((record) => (
                    <div
                      key={record.id}
                      className="rpg-history-entry flex flex-col gap-2 p-3 animate-in fade-in slide-in-from-top-2"
                    >
                      <div className="flex justify-between items-start">
                        <span className="rpg-history-name font-bold text-foreground">
                          {record.title}{" "}
                          <span className="rpg-history-profile ml-1 font-normal text-muted-foreground">
                            ({record.subtitle})
                          </span>
                        </span>
                        <span className="rpg-history-time mt-0.5 text-muted-foreground">
                          {record.time}
                        </span>
                      </div>
                      <div className="rpg-history-detail flex min-w-0 flex-wrap items-center justify-between gap-2 border px-3 py-2">
                        <span
                          className={`rpg-history-detail-label min-w-0 break-words font-semibold text-muted-foreground ${record.detail === "CLIMA ALTERADO" ? "is-weather" : ""}`}
                        >
                          {formatRollLabel(record.detail)}
                        </span>
                        <span
                          className={
                            typeof record.result === "number"
                              ? "shrink-0 font-mono text-xl font-black text-primary"
                              : "max-w-full break-words text-xs font-medium leading-relaxed text-muted-foreground"
                          }
                        >
                          {record.result}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rpg-leave-panel panel mt-auto shrink-0 p-4">
              <Button
                variant="destructive"
                className="rpg-leave-button w-full gap-2 font-semibold"
                disabled={leaving}
                onClick={handleLeaveCampaign}
              >
                <DoorOpen className="size-4" />
                {leaving
                  ? "Saindo..."
                  : isGm
                    ? "Encerrar Campanha"
                    : "Abandonar sessão"}
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
  
