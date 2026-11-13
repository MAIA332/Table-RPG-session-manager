"use client"
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent, type FormEvent } from "react"
import {
  AudioLines, ChevronDown, Headphones, HeadphoneOff, LoaderCircle, MessageCircle,
  Mic, MicOff, PhoneOff, Phone, Settings2, Signal, SignalLow, Volume2, X,
  ShieldCheck, UserRound, RadioTower, AlertTriangle, UserRoundX,
  GripVertical, Plus, Trash2, Eye, EyeOff, ArrowRightLeft, VolumeX,
} from "lucide-react"
import { createPortal } from "react-dom"
import { Room, RoomEvent, Track, type Participant, type RemoteTrack, type LocalAudioTrack, type RemoteAudioTrack } from "livekit-client"
import { VoiceAudioSettings } from "./voice-audio-settings"
import { audioCounter, audioDelta, audioHealth, type AudioCounter, type AudioDelta } from "@/lib/voice/audio-diagnostics"
import { VoiceNoiseProcessor, createInputMeter, captureForProfile, isAdvancedNoise, safeInputGain, safeIsolation, type VoiceNoiseMode, type VoiceAudioProfile } from "@/lib/voice/audio-dsp"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { registerInputHoldHandler } from "@/lib/input/hold"
import { VoiceChat } from "./voice-chat"
import type { VoiceRoomInfo, VoiceModerationState } from "@/lib/voice/types"
import { controllerConfirm } from "@/lib/input/dialogs"
import { controllerFocus } from "@/lib/input/focus"
import { CallCuePlayer, type CallCue } from "@/lib/voice/call-cues"
import {
  DEFAULT_VOICE_EQ, VOICE_EQ_BANDS, VOICE_EQ_PRESETS, RemoteVoicePlayback,
  normalizeVoiceEq, safeEqDb, safePeerVolume, type VoiceEqualizer,
} from "@/lib/voice/remote-audio"

export interface VoiceDockProps {
  campaignId: string
  userId: string
  userName: string
  role: "gm" | "player"
  members: Array<{ userId: string; name: string; role: string }>
}

type VoiceStatus = "idle" | "connecting" | "connected" | "reconnecting"
type VoiceTab = "participants" | "chat" | "settings"
const VOICE_TABS: VoiceTab[] = ["participants", "chat", "settings"]
type VoicePreferences = {
  mute: boolean
  deaf: boolean
  noiseMode: VoiceNoiseMode
  echo: boolean
  gain: boolean
  inputGainDb: number
  studio: boolean
  isolation: number
  deviceProfiles: Record<string, VoiceAudioProfile>
  overlay: boolean
  duckMusic: boolean
  duckDepth: number
  mode: "open" | "ptt"
  volume: number
  deviceId: string
  personVolumes: Record<string, number>
  personEqualizers: Record<string, VoiceEqualizer>
}
const defaults: VoicePreferences = {
  mute: false, deaf: false, noiseMode: "voice", echo: true, gain: false, inputGainDb: 0, studio: true, isolation: 65,
  deviceProfiles: {}, overlay: false, duckMusic: false, duckDepth: 0.35,
  mode: "open", volume: 1, deviceId: "", personVolumes: {}, personEqualizers: {},
}
type VoicePeer = { id: string; name: string; speaking: boolean; microphone: boolean; isMe: boolean; role: string }
type AudioAttachment = { element: HTMLAudioElement; track: RemoteTrack; playback?: RemoteVoicePlayback }
const validNoiseMode = (x: unknown): x is VoiceNoiseMode => x === "off" || x === "native" || x === "rnnoise" || x === "gtcrn" || x === "voice"
const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1))

// Os navegadores gerenciam a persistência do consentimento. Toda entrada verifica
// a captura novamente, mas o navegador pode não repetir o popup se já autorizou.
function describeMicrophoneError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ""
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Acesso ao microfone negado. Abra as permissões deste site na barra de endereço, selecione Permitir e tente entrar novamente."
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nenhum microfone compatível foi encontrado. Conecte um dispositivo e tente novamente."
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "O microfone selecionado não está disponível. Em Ajustes, escolha Microfone padrão e tente novamente."
    case "NotReadableError":
    case "TrackStartError":
      return "O sistema não conseguiu abrir o microfone. Verifique se outro aplicativo o está usando e tente novamente."
    case "AbortError":
      return "A captura do microfone foi interrompida. Verifique o dispositivo e tente novamente."
    default:
      return "Não foi possível iniciar o microfone. Verifique as permissões e o dispositivo nas configurações do navegador."
  }
}

export function VoiceDock({ campaignId, userId, userName, role, members }: VoiceDockProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<VoiceTab>("participants")
  const tabRef = useRef<VoiceTab>("participants")
  tabRef.current = tab
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [rooms, setRooms] = useState<VoiceRoomInfo[]>([
    { id: "main", name: "Sala principal", isDefault: true, participants: [], previewAvailable: false },
  ])
  const [selectedRoomId, setSelectedRoomId] = useState("main")
  const [roomNameInput, setRoomNameInput] = useState("")
  const [roomBusy, setRoomBusy] = useState(false)
  const [roomError, setRoomError] = useState("")
  const [switching, setSwitching] = useState(false)
  const switchingRef = useRef(false)
  const confirmSwitchRef = useRef(false)
  const touchMoveRef = useRef<{
    pointerId: number; person: {id: string; name: string; role: string}; sourceRoomId: string;
    x: number; y: number; destination: string | null
  } | null>(null)
  const [dropRoomId, setDropRoomId] = useState<string | null>(null)
  const [moderationBusy, setModerationBusy] = useState(false)
  const [moderationMap, setModerationMap] = useState<Record<string, VoiceModerationState>>({})
  const [myModeration, setMyModeration] = useState<VoiceModerationState>({microphoneMuted: false, audioMuted: false})
  const moderationRef = useRef(myModeration)
  moderationRef.current = myModeration
  const processedMoveRef = useRef("")
  const [overlayPosition, setOverlayPosition] = useState<{x: number; y: number} | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayDragRef = useRef<{id: number; x: number; y: number; left: number; top: number} | null>(null)
  const [preferences, setPreferences] = useState<VoicePreferences>(defaults)
  const [hydrated, setHydrated] = useState(false)
  const [held, setHeld] = useState(false)
  const [pttReleaseTail, setPttReleaseTail] = useState(false)
  const pttTailTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [error, setError] = useState("")
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [connectionGood, setConnectionGood] = useState(true)
  const [unread, setUnread] = useState(0)
  const [peerAudioOpen, setPeerAudioOpen] = useState<string | null>(null)
  const [dspStatus, setDspStatus] = useState("")
  const [inputLevel, setInputLevel] = useState(0)
  const [clipping, setClipping] = useState(false)
  const [localMicInfo, setLocalMicInfo] = useState("Microfone ainda não publicado")
  const [sendStats, setSendStats] = useState<AudioDelta>({})
  const [receiveStats, setReceiveStats] = useState<AudioDelta>({})
  const [outputDeviceId, setOutputDeviceId] = useState("")
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const previousStatsRef = useRef<Map<string, AudioCounter>>(new Map())
  const audioTaskRef = useRef<Promise<void>>(Promise.resolve())
  const meterCloseRef = useRef<(() => Promise<void>) | null>(null)
  const meterTrackRef = useRef<MediaStreamTrack | null>(null)
  const meterReadRef = useRef<(() => { rms: number; peak: number; clipping: boolean }) | null>(null)
  const appliedModeRef = useRef<VoiceNoiseMode | "">("")
  const appliedStudioRef = useRef<boolean | null>(null)
  const neuralFallbackRef = useRef<VoiceNoiseMode | null>(null)
  const requestedNoiseRef = useRef<VoiceNoiseMode | null>(null)
  const suppressionFaultRef = useRef(0)
  // Segurança: falha do AudioContext nunca pode deixar o microfone publicado em silêncio.
  const emergencyRawRef = useRef(false)
  const processorUnhealthyRef = useRef(0)
  const constraintCacheRef = useRef<WeakMap<MediaStreamTrack, string>>(new WeakMap())
  const roomRef = useRef<Room | null>(null)
  // Inicialização tardia: refs preservados pelo Fast Refresh podem estar nulos.
  const attachRef = useRef<Map<RemoteTrack, AudioAttachment> | null>(null)
  const joinSeq = useRef(0)
  const connectionEstablishedRef = useRef(false)
  const callCuePlayerRef = useRef<CallCuePlayer | null>(null)
  const callCuePlayer = useCallback(() => {
    if (!callCuePlayerRef.current) callCuePlayerRef.current = new CallCuePlayer()
    return callCuePlayerRef.current
  }, [])
  const playCallCue = useCallback((cue: CallCue) => callCuePlayer().play(cue), [callCuePlayer])
  const desiredMicRef = useRef(false)
  const micChain = useRef<Promise<void>>(Promise.resolve())
  const prefsRef = useRef(preferences)
  prefsRef.current = preferences
  const statusRef = useRef(status)
  statusRef.current = status
  const heldRef = useRef(held)
  heldRef.current = held
  const panelRef = useRef<HTMLDivElement>(null)
  const tabNavRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const attachments = useCallback(() => {
    if (!attachRef.current) attachRef.current = new Map<RemoteTrack, AudioAttachment>()
    return attachRef.current
  }, [])

  useEffect(() => {
    try {
      const v4 = localStorage.getItem(`otms-voice-v4-${userId}`)
      const v3 = localStorage.getItem(`otms-voice-v3-${userId}`)
      const v2 = localStorage.getItem(`otms-voice-v2-${userId}`)
      const saved = JSON.parse(v4 || v3 || v2 || localStorage.getItem(`otms-voice-v1-${userId}`) || "{}")
      // Novo padrão: RNNoise + expander suave de teclado. GTCRN continua
      // opcional, mas perfis antigos não ficam presos ao modo robótico.
      const migratedMode = !v4 && (saved.noiseMode === "gtcrn" || saved.noiseMode === "native")
        ? "voice" : validNoiseMode(saved.noiseMode) ? saved.noiseMode : "voice"
      const oldProfiles = saved.deviceProfiles && typeof saved.deviceProfiles === "object" && !Array.isArray(saved.deviceProfiles)
        ? saved.deviceProfiles as Record<string, VoiceAudioProfile> : {}
      const deviceProfiles = Object.fromEntries(Object.entries(oldProfiles).map(([id, p]) => [id, {
        ...p,
        noiseMode: !v4 && (p.noiseMode === "gtcrn" || p.noiseMode === "native") ? "voice" : p.noiseMode,
        isolation: safeIsolation(Number(p.isolation ?? 65)),
      }]))
      if (saved && typeof saved === "object") setPreferences({
        mute: saved.mute === true,
        deaf: saved.deaf === true,
        noiseMode: migratedMode,
        echo: saved.echo !== false, gain: saved.gain === true,
        inputGainDb: safeInputGain(Number(saved.inputGainDb ?? 0)),
        studio: v3 ? saved.studio !== false : true, isolation: safeIsolation(Number(saved.isolation ?? 65)),
        deviceProfiles,
        overlay: saved.overlay === true,
        duckMusic: saved.duckMusic === true,
        duckDepth: clamp(Number(saved.duckDepth ?? 0.35)),
        mode: saved.mode === "ptt" ? "ptt" : "open",
        volume: clamp(Number(saved.volume ?? 1)),
        deviceId: typeof saved.deviceId === "string" ? saved.deviceId : "",
        personVolumes: saved.personVolumes && typeof saved.personVolumes === "object" && !Array.isArray(saved.personVolumes)
          ? Object.fromEntries(Object.entries(saved.personVolumes).map(([id, v]) => [id, safePeerVolume(v)])) : {},
        personEqualizers: saved.personEqualizers && typeof saved.personEqualizers === "object" && !Array.isArray(saved.personEqualizers)
          ? Object.fromEntries(Object.entries(saved.personEqualizers).map(([id, v]) => [id, normalizeVoiceEq(v)])) : {},
      })
    } catch { /* Perfil local indisponível. */ }
    try { setOutputDeviceId(localStorage.getItem(`otms-voice-output-v1-${userId}`) || "") } catch { /* sem storage */ }
    try {
      const position = JSON.parse(localStorage.getItem(`otms-voice-overlay-position-${userId}`) || "null")
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y))
        setOverlayPosition({x: position.x, y: position.y})
    } catch { /* Sem storage. */ }
    setHydrated(true)
  }, [userId])
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(`otms-voice-v4-${userId}`, JSON.stringify(preferences)) } catch { /* Storage privado. */ }
  }, [preferences, userId, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(`otms-voice-output-v1-${userId}`, outputDeviceId) } catch { /* sem storage */ }
  }, [hydrated, userId, outputDeviceId])

  useEffect(() => {
    if (!hydrated || !overlayPosition) return
    try { localStorage.setItem(`otms-voice-overlay-position-${userId}`, JSON.stringify(overlayPosition)) } catch { /* Storage privado. */ }
  }, [overlayPosition, hydrated, userId])

  const updatePreferences = useCallback((patch: Partial<VoicePreferences>) => {
    setPreferences(current => {
      let next = { ...current, ...patch }
      if (patch.deviceId !== undefined && patch.deviceId !== current.deviceId) {
        const saved = current.deviceProfiles[patch.deviceId || "default"]
        if (saved) next = {
          ...next,
          noiseMode: validNoiseMode(saved.noiseMode) ? saved.noiseMode : current.noiseMode,
          echo: saved.echo !== false, gain: saved.gain === true,
          inputGainDb: safeInputGain(Number(saved.inputGainDb)), studio: saved.studio !== false, isolation: safeIsolation(Number(saved.isolation ?? 65)),
        }
      }
      if (patch.isolation !== undefined || patch.noiseMode !== undefined || patch.echo !== undefined || patch.gain !== undefined || patch.inputGainDb !== undefined || patch.studio !== undefined) {
        next.deviceProfiles = {...next.deviceProfiles, [next.deviceId || "default"]: {
          noiseMode: next.noiseMode, echo: next.echo, gain: next.gain, inputGainDb: next.inputGainDb, studio: next.studio, isolation: next.isolation,
        }}
      }
      return next
    })
  }, [])
  const updatePeers = useCallback((room: Room) => {
    const info = (p: Participant, isMe: boolean): VoicePeer => ({
      id: p.identity,
      name: p.name || members.find(member => member.userId === p.identity)?.name || (isMe ? userName : "Participante"),
      speaking: p.isSpeaking,
      microphone: p.isMicrophoneEnabled,
      isMe,
      role: members.find(member => member.userId === p.identity)?.role || (isMe ? role : "player"),
    })
    setPeers([info(room.localParticipant, true), ...[...room.remoteParticipants.values()].map(p => info(p, false))])
  }, [members, role, userName])

  const cleanAudio = useCallback(() => {
    const attached = attachRef.current
    if (!attached) return
    for (const {element, track, playback} of attached.values()) {
      if (playback) playback.dispose()
      else { track.detach(element); element.pause(); element.remove() }
    }
    attached.clear()
  }, [])

  const leave = useCallback(() => {
    const hadJoined = connectionEstablishedRef.current
    connectionEstablishedRef.current = false
    if (hadJoined) playCallCue("disconnected")
    ++joinSeq.current
    desiredMicRef.current = false
    if (pttTailTimer.current) clearTimeout(pttTailTimer.current)
    pttTailTimer.current = null
    setPttReleaseTail(false)
    heldRef.current = false
    setHeld(false)
    const room = roomRef.current
    roomRef.current = null
    // Invalidate all room callbacks BEFORE disconnect() emits asynchronous events.
    if (room) void room.disconnect(true).catch(cause => console.debug("[Mesa de Voz] Erro ao encerrar sinalização (limpeza local concluída):", cause))
    cleanAudio()
    setPeers([])
    setError("")
    setDspStatus("")
    statusRef.current = "idle"
    setStatus("idle")
    setAudioBlocked(false)
    setConnectionGood(true)
    appliedModeRef.current = ""
    appliedStudioRef.current = null
    neuralFallbackRef.current = null
    requestedNoiseRef.current = null
    suppressionFaultRef.current = 0
    emergencyRawRef.current = false
    processorUnhealthyRef.current = 0
    void meterCloseRef.current?.()
    meterCloseRef.current = null
    meterReadRef.current = null
    meterTrackRef.current = null
    setInputLevel(0)
    setClipping(false)
    setLocalMicInfo("Microfone ainda não publicado")
    setSendStats({})
    setReceiveStats({})
    previousStatsRef.current.clear()
    window.dispatchEvent(new CustomEvent("rpg:voice-duck", {detail:{campaignId, active:false, factor:1}}))
  }, [cleanAudio, campaignId, playCallCue])

  const captureOptions = useCallback(() => captureForProfile(prefsRef.current, prefsRef.current.deviceId), [])

  // The effective mode may fall back for this call. Never reapply a faulty neural
  // processor on every mute/unmute or settings render (that used to interrupt audio).
  const configureProcessing = useCallback(async (room: Room) => {
    if (roomRef.current !== room) return
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined
    if (!track) {
      setLocalMicInfo("Sem faixa publicada. Ative o microfone para preparar a voz.")
      return
    }
    const prefs = prefsRef.current
    if (requestedNoiseRef.current !== prefs.noiseMode) {
      requestedNoiseRef.current = prefs.noiseMode
      neuralFallbackRef.current = null
      suppressionFaultRef.current = 0
      emergencyRawRef.current = false
      processorUnhealthyRef.current = 0
    }
    const mode = neuralFallbackRef.current ?? prefs.noiseMode
    const advanced = isAdvancedNoise(mode)
    const needsGraph = !emergencyRawRef.current && (advanced || prefs.inputGainDb !== 0 || prefs.studio)
    const current = track.getProcessor()
    const constraints = {
      noiseSuppression: emergencyRawRef.current || mode === "native",
      echoCancellation: prefs.echo,
      autoGainControl: prefs.gain,
    }
    const applyCaptureConstraints = async () => {
      const source = track.mediaStreamTrack
      const signature = JSON.stringify(constraints)
      if (constraintCacheRef.current.get(source) === signature) return
      await track.applyConstraints(constraints)
      constraintCacheRef.current.set(track.mediaStreamTrack, signature)
    }
    try {
      if (current instanceof VoiceNoiseProcessor && appliedModeRef.current === mode &&
          appliedStudioRef.current === prefs.studio && needsGraph) {
        await applyCaptureConstraints()
        current.setInputGain(prefs.inputGainDb)
        current.setIsolation(prefs.isolation)
        setDspStatus(`${mode.toUpperCase()} · ${prefs.studio ? "voz de narrador" : "som natural"} · ativo`)
        return
      }
      if (current?.name === "otms-local-voice-dsp") await track.stopProcessor()
      if (roomRef.current !== room) return
      await applyCaptureConstraints()
      if (needsGraph) {
        await track.setProcessor(new VoiceNoiseProcessor(mode, prefs.inputGainDb, prefs.studio, prefs.isolation))
        if (roomRef.current !== room) return
      }
      appliedModeRef.current = mode
      appliedStudioRef.current = needsGraph ? prefs.studio : false
      const effective = track.mediaStreamTrack.getSettings()
      setLocalMicInfo(`Faixa ${track.mediaStreamTrack.readyState} · ${effective.sampleRate || "?"} Hz · ${effective.channelCount || "?"} canal(is)`)
      setDspStatus(emergencyRawRef.current
        ? "Áudio de segurança: microfone nativo ativo; filtro neural desativado após falha."
        : mode === prefs.noiseMode
        ? `${mode.toUpperCase()} · ${prefs.studio ? "voz de narrador" : "sem masterização"} · ${advanced ? "modelo neural carregado" : "processamento local"}`
        : `${mode.toUpperCase()} (fallback de ${prefs.noiseMode.toUpperCase()}) · áudio mantido`)
    } catch (cause) {
      console.warn("[Mesa de Voz] Processador de áudio indisponível:", cause)
      if (roomRef.current !== room) return
      // Fail-open: tentar outro processador depende do mesmo AudioContext
      // e pode publicar uma faixa sem áudio. Restaurar a faixa bruta primeiro.
      emergencyRawRef.current = true
      processorUnhealthyRef.current = 0
      neuralFallbackRef.current = "native"
      appliedModeRef.current = "native"
      appliedStudioRef.current = false
      try {
        if (track.getProcessor()?.name === "otms-local-voice-dsp") await track.stopProcessor()
      } catch (stopCause) {
        console.warn("[Mesa de Voz] Não foi possível retirar o processador:", stopCause)
      }
      try {
        await track.applyConstraints({noiseSuppression:true, echoCancellation:prefs.echo, autoGainControl:prefs.gain})
      } catch (nativeCause) {
        console.warn("[Mesa de Voz] Restrições nativas indisponíveis:", nativeCause)
      }
      setDspStatus(`${mode.toUpperCase()} falhou: ${cause instanceof Error ? cause.message : "erro de processamento"}. Áudio nativo restaurado.`)
      setLocalMicInfo("Microfone em modo nativo de segurança (sem DSP Web Audio)")
    }
  }, [])

  // O medidor usa a trilha realmente enviada, mas não abre nova captura.
  useEffect(() => {
    if (status !== "connected") return
    let canceled = false
    let lastPeakAt = 0
    const interval = window.setInterval(() => {
      const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined
      const processor = track?.getProcessor()
      if (processor instanceof VoiceNoiseProcessor) {
        if (meterCloseRef.current) {
          void meterCloseRef.current()
          meterCloseRef.current = null
          meterReadRef.current = null
          meterTrackRef.current = null
        }
        const result = processor.readMeter()
        setInputLevel(result.rms)
        if (result.clipping) lastPeakAt = Date.now()
        setClipping(Date.now() - lastPeakAt < 1100)
        return
      }
      const media = track?.mediaStreamTrack
      if (!media || media.readyState !== "live") {setInputLevel(0);return}
      if (meterTrackRef.current !== media) {
        void meterCloseRef.current?.()
        meterReadRef.current = null
        meterTrackRef.current = media
        void createInputMeter(media).then(meter => {
          if (canceled || meterTrackRef.current !== media) { void meter.close();return }
          meterReadRef.current = meter.read
          meterCloseRef.current = meter.close
        }).catch(() => undefined)
      }
      const value = meterReadRef.current?.()
      if (value) {
        setInputLevel(value.rms)
        if (value.clipping) lastPeakAt = Date.now()
        setClipping(Date.now() - lastPeakAt < 1100)
      }
    }, 120)
    return () => {
      canceled = true
      clearInterval(interval)
      void meterCloseRef.current?.()
      meterCloseRef.current = null
      meterReadRef.current = null
      meterTrackRef.current = null
    }
  }, [status])

  // Estatísticas reais por faixa de áudio (sem inspecionar propriedades privadas do SDK).
  // Os valores vêm do RTCRtpSender/Receiver e são úteis para separar rede ruim de DSP ruim.
  useEffect(() => {
    if (status !== "connected") return
    let active = true
    let busy = false
    previousStatsRef.current.clear()
    const poll = async () => {
      if (busy || !active) return
      const room = roomRef.current
      if (!room) return
      busy = true
      try {
        const outgoing = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined
        if (outgoing && !outgoing.isMuted) {
          const raw = await outgoing.getSenderStats()
          if (raw && active) {
            const count = audioCounter(raw, false)
            setSendStats(audioDelta(count, previousStatsRef.current.get("tx")))
            previousStatsRef.current.set("tx", count)
          }
        }
        const receivers = Array.from(attachRef.current?.entries() ?? [])
        let worst: AudioDelta | undefined
        for (const [track, item] of receivers) {
          if (track.kind !== Track.Kind.Audio) continue
          const stats = await (track as RemoteAudioTrack).getReceiverStats()
          if (!stats || !active) continue
          const key = `rx:${item.playback?.personId || item.element.dataset.personId || track.sid || "remote"}`
          const count = audioCounter(stats, true)
          const delta = audioDelta(count, previousStatsRef.current.get(key))
          previousStatsRef.current.set(key, count)
          if (!worst || audioHealth(delta) === "warning" ||
             (audioHealth(worst) === "unknown" && audioHealth(delta) !== "unknown")) worst = delta
        }
        if (active) setReceiveStats(worst || {})
      } catch (cause) {
        // Estatísticas opcionais: jamais interromper a transmissão por telemetria.
        console.debug("[Mesa de Voz] Estatísticas WebRTC indisponíveis", cause)
      } finally { busy = false }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 3000)
    return () => {active = false; clearInterval(timer); previousStatsRef.current.clear()}
  }, [status])

  // Trocar a saída do áudio processado, inclusive ao voltar para padrão.
  useEffect(() => {
    for (const {element, playback} of attachRef.current?.values() ?? []) {
      const sink = element as HTMLAudioElement & {setSinkId?: (id: string) => Promise<void>}
      const request = playback ? playback.setOutputDevice(outputDeviceId)
        : typeof sink.setSinkId === "function" ? sink.setSinkId(outputDeviceId) : Promise.resolve()
      void request.catch(() => setError("Não foi possível selecionar a saída de áudio; usando a saída padrão."))
    }
  }, [outputDeviceId, peers.length])

  // Chamado imediatamente pelo clique/atalho de entrar na chamada e ANTES do
  // token/LiveKit. Ao finalizar, libera o stream de verificação sem publicá-lo.
  const requestMicrophoneAccess = useCallback(async () => {
    if (typeof window === "undefined" || !window.isSecureContext ||
        typeof navigator.mediaDevices?.getUserMedia !== "function") {
      throw new Error("O microfone exige HTTPS ou localhost. Abra o RPG por um endereço HTTPS (ou use um túnel para localhost), não pelo IP HTTP da rede.")
    }

    const settings = captureOptions()
    const { deviceId, ...audioSettings } = settings
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...audioSettings,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        video: false,
      })
      if (!stream.getAudioTracks().some(track => track.readyState === "live")) {
        throw new Error("Microfone não forneceu uma faixa de áudio ativa.")
      }
    } catch (cause) {
      console.warn("[Mesa de Voz] Falha na verificação do microfone:", cause)
      throw new Error(describeMicrophoneError(cause))
    } finally {
      // Não manter uma captura duplicada da que o LiveKit abrirá após conectar.
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [captureOptions])

  /** Serializa mudanças de microfone para que soltar PTT sempre termine silenciado. */
  const setDesiredMic = useCallback((enabled: boolean) => {
    desiredMicRef.current = enabled
    const room = roomRef.current
    if (!room) return
    // Mute imediato antes da fila assíncrona de captura/permissões.
    if (!enabled) void room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mute().catch(() => undefined)
    micChain.current = micChain.current.catch(() => undefined).then(async () => {
      if (roomRef.current !== room || statusRef.current !== "connected") return
      const requested = desiredMicRef.current && !moderationRef.current.microphoneMuted && room.localParticipant.permissions?.canPublish !== false
      try {
        await room.localParticipant.setMicrophoneEnabled(requested, requested ? captureOptions() : undefined)
        if (requested && roomRef.current === room && desiredMicRef.current) {
          audioTaskRef.current = audioTaskRef.current.catch(() => undefined).then(() => configureProcessing(room))
          await audioTaskRef.current
        }
        if (requested && !desiredMicRef.current) await room.localParticipant.setMicrophoneEnabled(false)
        if (roomRef.current === room) {
          updatePeers(room)
          setLocalMicInfo(requested ? "Microfone publicado" : "Microfone silenciado (captura mantida)")
        }
      } catch (cause) {
        if (requested && roomRef.current === room && room.localParticipant.permissions?.canPublish !== false && !moderationRef.current.microphoneMuted) {
          console.warn("[Mesa de Voz] Falha ao publicar microfone:", cause)
          setError(describeMicrophoneError(cause))
          setPreferences(current => ({...current, mute: true}))
        }
      }
    })
  }, [captureOptions, configureProcessing, updatePeers])

  useEffect(() => {
    setDesiredMic(status === "connected" && !preferences.mute && !myModeration.microphoneMuted &&
      (preferences.mode === "open" || held || pttReleaseTail))
  }, [status, preferences.mode, preferences.mute, held, pttReleaseTail, myModeration.microphoneMuted, setDesiredMic])

  useEffect(() => {
    const room = roomRef.current
    if (!room || status !== "connected") return
    audioTaskRef.current = audioTaskRef.current.catch(() => undefined).then(async () => {
      if (roomRef.current === room) await configureProcessing(room)
    })
  }, [status, preferences.noiseMode, preferences.echo, preferences.gain, preferences.inputGainDb, preferences.studio, preferences.isolation, configureProcessing])

  useEffect(() => {
    const room = roomRef.current
    if (!room || status !== "connected" || !preferences.deviceId) return
    void room.switchActiveDevice("audioinput", preferences.deviceId)
      .then(() => {
        if (roomRef.current === room) {
          audioTaskRef.current = audioTaskRef.current.catch(() => undefined).then(() => configureProcessing(room))
        }
      })
      .catch(() => setError("Microfone selecionado indisponível."))
  }, [preferences.deviceId, status])

  // Atenuação baseada em áudio REAL (incluindo a própria voz do Mestre), e não
  // apenas nos eventos espaçados de ActiveSpeakersChanged. Mantém 1s de hold
  // após a última sílaba para a música não subir entre palavras.
  useEffect(() => {
    let lastVoiceAt = -Infinity
    let previousFactor = NaN
    const dispatch = (factor: number) => {
      if (Math.abs(factor - previousFactor) < 0.001) return
      previousFactor = factor
      window.dispatchEvent(new CustomEvent("rpg:voice-duck", {detail: {
        campaignId, active: factor < 1, factor,
      }}))
    }
    const tick = () => {
      const room = roomRef.current
      if (status !== "connected" || !preferences.duckMusic || !room) { dispatch(1); return }
      const all = [room.localParticipant, ...room.remoteParticipants.values()]
      const participantSpeaking = all.some(person => person.isMicrophoneEnabled &&
        (person.isSpeaking || person.audioLevel > 0.035))
      const local = room.localParticipant
      const localLevel = meterReadRef.current?.().rms ||
        ((local.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined)?.getProcessor() instanceof VoiceNoiseProcessor
          ? ((local.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack).getProcessor() as VoiceNoiseProcessor).readMeter().rms : 0)
      if (participantSpeaking || (local.isMicrophoneEnabled && localLevel > 0.065)) lastVoiceAt = performance.now()
      const active = performance.now() - lastVoiceAt < 1050
      dispatch(active ? clamp(preferences.duckDepth) : 1)
    }
    tick()
    const timer = window.setInterval(tick, 160)
    return () => {
      clearInterval(timer)
      window.dispatchEvent(new CustomEvent("rpg:voice-duck", {detail:{campaignId,active:false,factor:1}}))
    }
  }, [campaignId, status, preferences.duckMusic, preferences.duckDepth])

  const applyVolumes = useCallback(() => {
    const attached = attachRef.current
    if (!attached) return
    const values = prefsRef.current
    for (const {element, playback} of attached.values()) {
      const identity = playback?.personId || element.dataset.personId || ""
      const personal = safePeerVolume(values.personVolumes[identity])
      const eq = normalizeVoiceEq(values.personEqualizers[identity] || DEFAULT_VOICE_EQ)
      if (playback) {
        playback.setEq(eq)
        playback.setVolume(values.volume, personal, values.deaf || moderationRef.current.audioMuted)
      } else {
        // Fallback sem WebAudio: o HTMLAudioElement limita a 100%.
        element.volume = values.deaf || moderationRef.current.audioMuted ? 0 : clamp(values.volume * personal)
      }
    }
  }, [])
  useEffect(() => { applyVolumes() }, [applyVolumes, preferences.volume, preferences.deaf, myModeration.audioMuted, preferences.personVolumes, preferences.personEqualizers])

  // Playback/context watchdog. Do not republish the microphone on every tick:
  // that caused the old random speech cuts. Reanimate playback where the browser
  // permits it; offer a user-gesture button when autoplay remains blocked.
  useEffect(() => {
    if (status !== "connected" && status !== "reconnecting") return
    let active = true
    const restore = () => {
      if (!active || document.visibilityState === "hidden") return
      const room = roomRef.current
      if (!room) return
      for (const {element, playback} of attachRef.current?.values() ?? []) {
        if (!element.isConnected) continue
        if (!prefsRef.current.deaf && !moderationRef.current.audioMuted && (element.paused || (playback && playback.state !== "running"))) {
          const attempt = playback ? playback.play() : element.play()
          void attempt.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
        }
      }
      const outgoing = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined
      const processor = outgoing?.getProcessor()
      if (!(processor instanceof VoiceNoiseProcessor)) return
      const health = processor.health()
      if (!health) return
      if (health.state !== "running") {
        // Um AudioContext suspenso produz uma faixa silenciosa mesmo que o SDK
        // marque o microfone como publicado. Tentar retomar; após duas leituras,
        // remover o DSP (não testar outro processador igualmente suspenso).
        if (!outgoing?.isMuted && room.localParticipant.isMicrophoneEnabled) {
          processorUnhealthyRef.current++
          if (processorUnhealthyRef.current >= 2 && roomRef.current === room && !emergencyRawRef.current) {
            emergencyRawRef.current = true
            neuralFallbackRef.current = "native"
            processorUnhealthyRef.current = 0
            setDspStatus("Processamento suspenso pelo navegador; restaurando o microfone nativo.")
            audioTaskRef.current = audioTaskRef.current.catch(() => undefined).then(() => configureProcessing(room))
          } else void processor.resume().catch(() => undefined)
        } else processorUnhealthyRef.current = 0
        suppressionFaultRef.current = 0
        return
      }
      processorUnhealthyRef.current = 0
      // Silêncio pós-supressão com microfone bruto ruidoso é o resultado
      // DESEJADO (ex.: teclado). Não confundir com falha do processador:
      // o watchdog antigo removia o filtro após ~10s de digitação.
      suppressionFaultRef.current = 0
    }
    const onFocus = () => restore()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    const timer = window.setInterval(restore, 2500)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [status, configureProcessing])

  const join = useCallback(async (targetRoomId = selectedRoomId, skipMicrophoneCheck = false) => {
    if (roomRef.current || statusRef.current !== "idle") return
    // O navegador precisa liberar o AudioContext no gesto do usuário, antes
    // da verificação do microfone e da chamada assíncrona ao token.
    callCuePlayer().unlock()
    connectionEstablishedRef.current = false
    const seq = ++joinSeq.current
    statusRef.current = "connecting"
    setError("")
    setStatus("connecting")
    try {
      // Obter antes as permissões impostas pelo Mestre. Quem está com o
      // microfone bloqueado pode entrar apenas para ouvir sem dispositivo de
      // captura, e a autorização anterior é reutilizada ao trocar de sala.
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/token?roomId=${encodeURIComponent(targetRoomId)}`, {method: "POST"})
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Falha na autenticação da voz.")
      if (seq !== joinSeq.current) return
      if (data.moderation && typeof data.moderation.microphoneMuted === "boolean" && typeof data.moderation.audioMuted === "boolean") {
        moderationRef.current = data.moderation
        setMyModeration(data.moderation)
      }
      if (!skipMicrophoneCheck && data.moderation?.microphoneMuted !== true) {
        await requestMicrophoneAccess()
        if (seq !== joinSeq.current) return
      }
      const room = new Room({
        adaptiveStream: false, // Não há vídeo na sala; priorizar áudio contínuo.
        audioCaptureDefaults: captureOptions(),
        publishDefaults: {
          // 64 kbps mono: speech clarity with headroom for Opus RED on poor networks.
          // This is a ceiling, not a guaranteed rate or lossless/podcast encoding.
          audioPreset: {maxBitrate: 64_000},
          forceStereo: false,
          dtx: false, // Evita interrupções no início de palavras baixas.
          red: true, // Redundância Opus contra perda de pacotes.
          stopMicTrackOnMute: false, // PTT não deve reacquirir a captura a cada pressão.
        },
      })
      roomRef.current = room
      const refresh = () => { if (roomRef.current === room) updatePeers(room) }
      const onTrack = (track: RemoteTrack, _publication: unknown, participant: Participant) => {
        if (roomRef.current !== room || track.kind !== Track.Kind.Audio) return
        // Pequeno buffer de reprodução para acomodar jitter sem alterar os dados de voz.
        // O navegador pode ignorar o hint; não o confundimos com correção de perda UDP.
        ;(track as RemoteAudioTrack).setPlayoutDelay(0.16)
        const previous = attachments().get(track)
        if (previous) {
          if (previous.playback) previous.playback.dispose()
          else { previous.track.detach(previous.element); previous.element.pause(); previous.element.remove() }
          attachments().delete(track)
        }
        // O grafo Web Audio torna possível aumentar até 200% e equalizar cada
        // participante sem alterar seu áudio para os demais ouvintes.
        let playback: RemoteVoicePlayback | undefined
        let element: HTMLAudioElement
        try {
          playback = new RemoteVoicePlayback(track, participant.identity)
          element = playback.element
        } catch (cause) {
          console.warn("[Mesa de Voz] Web Audio indisponível; recepção básica:", cause)
          element = track.attach() as HTMLAudioElement
          element.dataset.personId = participant.identity
          element.autoplay = true
          element.preload = "auto"
          element.style.display = "none"
          document.body.append(element)
        }
        const recover = () => {
          if (roomRef.current !== room || prefsRef.current.deaf || moderationRef.current.audioMuted) return
          if (document.visibilityState === "hidden") return
          if (element.paused && element.isConnected) {
            const attempt = playback ? playback.play() : element.play()
            void attempt.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
          }
        }
        element.addEventListener("pause", () => { if (!element.ended) queueMicrotask(recover) })
        element.addEventListener("stalled", recover)
        element.addEventListener("emptied", recover)
        element.addEventListener("playing", () => setAudioBlocked(false))
        if (outputDeviceId) {
          const sink = element as HTMLAudioElement & {setSinkId?: (id: string) => Promise<void>}
          const request = playback ? playback.setOutputDevice(outputDeviceId)
            : sink.setSinkId?.(outputDeviceId)
          void request?.catch(() => undefined)
        }
        attachments().set(track, {element, track, playback})
        applyVolumes()
        void (playback ? playback.play() : element.play())
          .then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
        refresh()
      }
      const offTrack = (track: RemoteTrack) => {
        const attached = attachRef.current?.get(track)
        if (attached) {
          if (attached.playback) attached.playback.dispose()
          else { track.detach(attached.element); attached.element.pause(); attached.element.remove() }
          attachRef.current?.delete(track)
        }
        if (roomRef.current === room) refresh()
      }
      // Também sinaliza entrada/saída de outros participantes, como em uma call.
      // Não reproduz os usuários que já estavam presentes quando esta sala abriu.
      const onPeerJoined = () => {
        refresh()
        if (roomRef.current === room && connectionEstablishedRef.current && statusRef.current === "connected")
          playCallCue("connected")
      }
      const onPeerLeft = () => {
        refresh()
        if (roomRef.current === room && connectionEstablishedRef.current && statusRef.current === "connected")
          playCallCue("disconnected")
      }
      room.on(RoomEvent.ParticipantConnected, onPeerJoined)
      room.on(RoomEvent.ParticipantDisconnected, onPeerLeft)
      // Dados recebidos são apenas um aviso: o comando é sempre lido na API
      // autenticada, jamais executado diretamente a partir de payloads de jogadores.
      room.on(RoomEvent.DataReceived, (_payload, participant, _kind, topic) => {
        if (!participant && topic === "otms.voice.moderation.v1" && roomRef.current === room) {
          window.dispatchEvent(new Event("otms.voice.moderation-refresh"))
        }
      })
      room.on(RoomEvent.TrackSubscribed, onTrack)
      room.on(RoomEvent.TrackUnsubscribed, offTrack)
      room.on(RoomEvent.TrackMuted, refresh)
      room.on(RoomEvent.TrackUnmuted, refresh)
      room.on(RoomEvent.ActiveSpeakersChanged, refresh)
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (roomRef.current === room) setAudioBlocked(!room.canPlaybackAudio)
      })
      room.on(RoomEvent.MediaDevicesError, error => {
        if (roomRef.current !== room) return
        console.warn("[Mesa de Voz] Falha de dispositivo de áudio:", error)
        setError("O dispositivo de áudio foi desconectado ou ficou indisponível. Verifique microfone e saída.")
      })
      room.on(RoomEvent.ConnectionQualityChanged, () => {
        if (roomRef.current === room) setConnectionGood(room.localParticipant.connectionQuality !== "poor" && room.localParticipant.connectionQuality !== "lost")
      })
      room.on(RoomEvent.Reconnecting, () => { if (roomRef.current === room) setStatus("reconnecting") })
      room.on(RoomEvent.Reconnected, () => {
        if (roomRef.current === room) {
          statusRef.current = "connected"
          setStatus("connected"); setError(""); refresh()
          void room.startAudio().catch(() => setAudioBlocked(true))
          // Some browsers suspend the DSP context on Wi-Fi/visibility changes.
          const local = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined
          const processor = local?.getProcessor()
          if (processor instanceof VoiceNoiseProcessor) void processor.resume().catch(() => undefined)
        }
      })
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) {
          const hadJoined = connectionEstablishedRef.current
          connectionEstablishedRef.current = false
          if (hadJoined) playCallCue("disconnected")
          roomRef.current = null
          cleanAudio()
          setPeers([])
          appliedModeRef.current = ""
          setDspStatus("")
          statusRef.current = "idle"
          setStatus("idle")
          setError("Conexão de voz encerrada. Você pode entrar novamente.")
        }
      })
      await room.connect(data.url as string, data.token as string, { autoSubscribe: true })
      if (roomRef.current !== room || seq !== joinSeq.current) { room.disconnect(); return }
      connectionEstablishedRef.current = true
      statusRef.current = "connected"
      setStatus("connected")
      playCallCue("connected")
      refresh()
      void room.startAudio().catch(() => setAudioBlocked(true))
      void navigator.mediaDevices?.enumerateDevices?.()
        .then(all => {
          setDevices(all.filter(d => d.kind === "audioinput"))
          setOutputDevices(all.filter(d => d.kind === "audiooutput"))
        })
        .catch(() => undefined)
    } catch (cause) {
      if (seq !== joinSeq.current) return
      const room = roomRef.current
      roomRef.current = null
      connectionEstablishedRef.current = false
      room?.disconnect()
      cleanAudio()
      appliedModeRef.current = ""
      statusRef.current = "idle"
      setStatus("idle")
      setError(cause instanceof Error ? cause.message : "Falha ao conectar à sala de voz.")
    }
  }, [campaignId, selectedRoomId, captureOptions, requestMicrophoneAccess, updatePeers, cleanAudio, applyVolumes, attachments, outputDeviceId, callCuePlayer, playCallCue])

  // Uma troca solicitada pelo próprio usuário pede confirmação amigável a
  // controle; uma transferência autenticada do Mestre não pede nova ação.
  const switchRoom = useCallback(async (targetId: string, askConfirmation: boolean, moveId?: string) => {
    if (targetId === selectedRoomId || !rooms.some(room => room.id === targetId) || switchingRef.current || (askConfirmation && confirmSwitchRef.current)) return
    if (statusRef.current === "idle") {setSelectedRoomId(targetId); return}
    if (statusRef.current !== "connected") return
    const destination = rooms.find(room => room.id === targetId)
    const previousRoom = roomRef.current
    if (askConfirmation) {
      confirmSwitchRef.current = true
      try {
        if (!await controllerConfirm(`Trocar para "${destination?.name || "outra sala"}" agora? Você sairá da sala atual e entrará automaticamente na nova.`)) return
      } finally {confirmSwitchRef.current = false}
    }
    if (statusRef.current !== "connected" || roomRef.current !== previousRoom || switchingRef.current) return
    switchingRef.current = true
    setSwitching(true)
    try {
      leave() // Encerrar mídia e handlers da sala anterior antes de conectar a próxima.
      setSelectedRoomId(targetId)
      await join(targetId, true) // Captura já consentida, sem um segundo popup.
      if (moveId && statusRef.current === "connected") {
        void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/moderation`, {
          method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({moveId}),
        }).catch(() => undefined)
      }
    } finally {
      switchingRef.current = false
      setSwitching(false)
    }
  }, [selectedRoomId, rooms, leave, join, campaignId])

  const refreshModeration = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/moderation?roomId=${encodeURIComponent(selectedRoomId)}`, {cache:"no-store"})
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Moderação indisponível")
      if (data.mine && typeof data.mine.microphoneMuted === "boolean" && typeof data.mine.audioMuted === "boolean")
        setMyModeration(data.mine)
      if (role === "gm" && data.moderation && typeof data.moderation === "object") setModerationMap(data.moderation)
      const move = data.pendingMove
      if (move && typeof move.id === "string" && move.fromRoomId === selectedRoomId &&
          typeof move.toRoomId === "string" && processedMoveRef.current !== move.id &&
          rooms.some(room => room.id === move.toRoomId) && statusRef.current === "connected" && !switchingRef.current) {
        processedMoveRef.current = move.id
        void switchRoom(move.toRoomId, false, move.id)
      }
    } catch (cause) {
      console.debug("[Mesa de Voz] Consulta de moderação indisponível:", cause)
    }
  }, [campaignId, role, selectedRoomId, switchRoom, rooms])

  useEffect(() => {
    if (!expanded && status !== "connected" && status !== "reconnecting") return
    let disposed = false
    let busy = false
    const poll = async () => {
      if (busy || disposed) return
      busy = true
      try {await refreshModeration()} finally {busy = false}
    }
    void poll()
    const timer = window.setInterval(() => {if (document.visibilityState === "visible") void poll()}, 1700)
    window.addEventListener("otms.voice.moderation-refresh", poll)
    return () => {disposed = true; clearInterval(timer); window.removeEventListener("otms.voice.moderation-refresh", poll)}
  }, [expanded, status, refreshModeration])

  const navigateVoiceTab = useCallback((direction: -1 | 1) => {
    if (!panelRef.current) return false
    const position = VOICE_TABS.indexOf(tabRef.current)
    const next = VOICE_TABS[(position + direction + VOICE_TABS.length) % VOICE_TABS.length]
    tabRef.current = next
    setTab(next)
    if (next === "chat") setUnread(0)
    requestAnimationFrame(() => {
      tabNavRef.current?.querySelector<HTMLButtonElement>(`button[data-voice-tab="${next}"]`)?.focus({preventScroll:true})
    })
    return true
  }, [])
  useControllerActions({
    "ui.next": () => navigateVoiceTab(1),
    "ui.previous": () => navigateVoiceTab(-1),
    "ui.confirm": () => panelRef.current ? controllerFocus("ui.confirm", panelRef.current) : false,
    "ui.back": () => { if (!panelRef.current) return false; setExpanded(false); triggerRef.current?.focus(); return true },
  }, {enabled: expanded, priority: 350})

  const toggleMute = useCallback(() => {if (!moderationRef.current.microphoneMuted) updatePreferences({mute: !prefsRef.current.mute})}, [updatePreferences])
  const toggleDeaf = useCallback(() => {if (!moderationRef.current.audioMuted) updatePreferences({deaf: !prefsRef.current.deaf})}, [updatePreferences])
  const toggleNoise = useCallback(() => updatePreferences({
      noiseMode: prefsRef.current.noiseMode === "voice" ? "native" : "voice",
  }), [updatePreferences])
  const togglePanel = useCallback(() => setExpanded(value => !value), [])
  const openChat = useCallback(() => {setTab("chat"); setExpanded(true)}, [])
  const setTalkHeld = useCallback((value: boolean, immediate = false) => {
    // pointerup + lostpointercapture podem disparar duas solturas seguidas:
    // preservar a cauda de 180 ms na segunda em vez de cortá-la.
    if (!value && !immediate && !heldRef.current && pttTailTimer.current) return
    if (pttTailTimer.current) clearTimeout(pttTailTimer.current)
    pttTailTimer.current = null
    const wasHeld = heldRef.current
    heldRef.current = value
    setHeld(value)
    if (value || !wasHeld || immediate || statusRef.current !== "connected" ||
        prefsRef.current.mode !== "ptt" || prefsRef.current.mute || moderationRef.current.microphoneMuted) {
      setPttReleaseTail(false)
      return
    }
    // 180 ms de soltura suave: preserva consoantes finais e ressonância ao
    // soltar o PTT. Blur, saída e mute explícito continuam sendo imediatos.
    setPttReleaseTail(true)
    pttTailTimer.current = setTimeout(() => {
      pttTailTimer.current = null
      setPttReleaseTail(false)
    }, 180)
  }, [])

  useEffect(() => registerInputHoldHandler((action, down) => {
    if (action === "voice.ptt") setTalkHeld(down)
  }), [setTalkHeld])
  useEffect(() => {
    const release = () => setTalkHeld(false, true)
    window.addEventListener("blur", release)
    document.addEventListener("visibilitychange", release)
    return () => {window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release)}
  }, [setTalkHeld])
  useEffect(() => () => {
    if (connectionEstablishedRef.current) {
      connectionEstablishedRef.current = false
      playCallCue("disconnected")
    }
    if (pttTailTimer.current) clearTimeout(pttTailTimer.current)
    ++joinSeq.current
    roomRef.current?.disconnect(true)
    roomRef.current = null
    cleanAudio()
    void meterCloseRef.current?.()
    window.dispatchEvent(new CustomEvent("rpg:voice-duck", { detail: {campaignId,active:false,factor:1} }))
  }, [cleanAudio, campaignId, playCallCue])

  const allowAudio = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const processor = (room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined)?.getProcessor()
    if (processor instanceof VoiceNoiseProcessor) void processor.resume().catch(() => undefined)
    // Must run directly in the click handler to satisfy browser autoplay policies.
    void room.startAudio().then(async () => {
      const items = Array.from(attachRef.current?.values() ?? [])
      const results = await Promise.allSettled(items.map(({element, playback}) =>
        !prefsRef.current.deaf && !moderationRef.current.audioMuted ? (playback ? playback.play() : element.play()) : Promise.resolve()))
      setAudioBlocked(results.some(result => result.status === "rejected"))
      if (!results.some(result => result.status === "rejected")) setError("")
    }).catch(() => {
      setAudioBlocked(true)
      setError("O navegador bloqueou o som. Clique novamente em Restaurar áudio e confira a saída selecionada.")
    })
  }, [])

  useControllerActions({
    "voice.join": () => { void join(); return true },
    "voice.leave": () => { leave(); return true },
    "voice.mute.toggle": () => { toggleMute(); return true },
    "voice.deafen.toggle": () => { toggleDeaf(); return true },
    "voice.panel.toggle": () => { togglePanel(); return true },
    "voice.chat.toggle": () => { openChat(); return true },
    "voice.noise.toggle": () => { toggleNoise(); return true },
    "voice.studio.toggle": () => { updatePreferences({studio: !prefsRef.current.studio}); return true },
    "voice.audio.recover": () => { allowAudio(); return true },
    "voice.volume.up": () => { updatePreferences({volume: clamp(prefsRef.current.volume + .1)}); return true },
    "voice.volume.down": () => { updatePreferences({volume: clamp(prefsRef.current.volume - .1)}); return true },
    "voice.ptt": () => true,
    "ui.back": () => {if (expanded) {setExpanded(false); triggerRef.current?.focus(); return true} return false},
  }, { priority: 165 })

  useEffect(() => {
    if (!expanded || tab !== "settings" || !navigator.mediaDevices?.enumerateDevices) return
    let active = true
    const refreshDevices = () => {
      void navigator.mediaDevices.enumerateDevices().then(all => {
        if (active) {
          setDevices(all.filter(d => d.kind === "audioinput"))
          setOutputDevices(all.filter(d => d.kind === "audiooutput"))
        }
      }).catch(() => undefined)
    }
    refreshDevices()
    navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices)
    return () => {active=false;navigator.mediaDevices.removeEventListener?.("devicechange", refreshDevices)}
  }, [expanded, tab])

  useEffect(() => {
    if (!expanded) return
    const onOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest(".otms-voice-lightbox, .otms-controller-dialog-backdrop, .otms-controller-select-overlay")) return
      setExpanded(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".otms-controller-dialog-backdrop, .otms-controller-select-overlay")) {
        setExpanded(false); triggerRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", onOutside)
    document.addEventListener("keydown", onEscape)
    return () => { document.removeEventListener("pointerdown", onOutside); document.removeEventListener("keydown", onEscape) }
  }, [expanded])

  const disconnectPeer = async (peer: VoicePeer) => {
    const roomAtRequest = roomRef.current
    if (!roomAtRequest || statusRef.current !== "connected") return
    if (!(await controllerConfirm(`Desconectar ${peer.name} da chamada? A pessoa poderá entrar novamente.`))) return
    if (roomRef.current !== roomAtRequest) return
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/moderation`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({targetId: peer.id, roomId: selectedRoomId}),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Falha ao desconectar.")
    } catch (cause) {
      // Uma resposta atrasada do botão "expulsar" não pode recriar o aviso
      // depois que o Mestre saiu da chamada por vontade própria.
      if (roomRef.current === roomAtRequest && statusRef.current === "connected")
        setError(cause instanceof Error ? cause.message : "Falha ao desconectar.")
    }
  }
  const moderatePeer = async (person: {id: string; name: string; role: string}, sourceRoomId: string,
    action: "move" | "microphone" | "audio", value: string | boolean) => {
    if (role !== "gm" || person.role !== "player" || moderationBusy || person.id === userId) return
    if (action === "move" && (typeof value !== "string" || !rooms.some(room => room.id === value) || sourceRoomId === value)) return
    setModerationBusy(true)
    setRoomError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/moderation`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({
          action, targetId: person.id, roomId: sourceRoomId,
          ...(action === "move" ? {targetRoomId: value} : {muted: value}),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Falha ao moderar jogador.")
      if (result.moderation) setModerationMap(current => ({...current, [person.id]: result.moderation}))
      if (action === "move") setRoomError(`Transferência de ${person.name} solicitada.`)
      await refreshModeration()
      await refreshRooms()
    } catch (cause) {setRoomError(cause instanceof Error ? cause.message : "Falha ao moderar jogador.")}
    finally {setModerationBusy(false)}
  }

  const beginParticipantDrag = (event: ReactDragEvent<HTMLElement>, person: {id: string; role: string}, sourceRoomId: string) => {
    if (role !== "gm" || person.role !== "player" || moderationBusy) {event.preventDefault(); return}
    event.dataTransfer.setData("application/x-otms-voice-move", JSON.stringify({id: person.id, sourceRoomId}))
    event.dataTransfer.effectAllowed = "move"
  }
  const dropParticipant = (event: ReactDragEvent<HTMLElement>, targetRoomId: string) => {
    event.preventDefault()
    setDropRoomId(null)
    if (role !== "gm" || moderationBusy) return
    try {
      const {id, sourceRoomId} = JSON.parse(event.dataTransfer.getData("application/x-otms-voice-move")) as {id: string; sourceRoomId: string}
      if (!id || !sourceRoomId || sourceRoomId === targetRoomId) return
      const person = rooms.find(r => r.id === sourceRoomId)?.participants.find(p => p.id === id) ||
        (sourceRoomId === selectedRoomId ? peers.find(p => p.id === id) : undefined)
      if (person) void moderatePeer(person, sourceRoomId, "move", targetRoomId)
    } catch { /* Não aceitar dados externos não pertencentes à lista de jogadores. */ }
  }
  // Em dispositivos de toque, HTML5 drag & drop nem sempre existe.
  // Permitir arrasto por Pointer Events, além do seletor acessível ao controle.
  const beginTouchMove = (event: ReactPointerEvent<HTMLElement>, person: {id: string; name: string; role: string}, sourceRoomId: string) => {
    if (event.pointerType === "mouse" || role !== "gm" || person.role !== "player" || moderationBusy) return
    touchMoveRef.current = {pointerId: event.pointerId, person, sourceRoomId, x: event.clientX, y: event.clientY, destination: null}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const updateTouchMove = (event: ReactPointerEvent<HTMLElement>) => {
    const touch = touchMoveRef.current
    if (!touch || touch.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 10) return
    event.preventDefault()
    const below = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-voice-drop-room]")
    const target = below?.dataset.voiceDropRoom || null
    touch.destination = target && target !== touch.sourceRoomId ? target : null
    setDropRoomId(touch.destination)
  }
  const endTouchMove = (event: ReactPointerEvent<HTMLElement>) => {
    const touch = touchMoveRef.current
    if (!touch || touch.pointerId !== event.pointerId) return
    touchMoveRef.current = null
    setDropRoomId(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (event.type === "pointerup" && touch.destination) void moderatePeer(touch.person, touch.sourceRoomId, "move", touch.destination)
  }

  const renderAdminControls = (person: {id: string; name: string; role: string}, sourceRoomId: string) => {
    if (role !== "gm" || person.role !== "player" || person.id === userId) return null
    const state = moderationMap[person.id]
    return <div className="otms-voice-moderation flex flex-wrap items-center gap-1" aria-label={`Moderação de ${person.name}`}>
      <button type="button" className="otms-voice-action !p-1.5" disabled={moderationBusy}
        onClick={() => void moderatePeer(person, sourceRoomId, "microphone", !state?.microphoneMuted)}
        aria-pressed={!!state?.microphoneMuted} title={state?.microphoneMuted ? `Liberar microfone de ${person.name}` : `Mutar microfone de ${person.name}`}
        aria-label={state?.microphoneMuted ? `Liberar microfone de ${person.name}` : `Mutar microfone de ${person.name}`}>
        {state?.microphoneMuted ? <MicOff className="size-3.5 text-red-300"/> : <Mic className="size-3.5"/>}
      </button>
      <button type="button" className="otms-voice-action !p-1.5" disabled={moderationBusy}
        onClick={() => void moderatePeer(person, sourceRoomId, "audio", !state?.audioMuted)}
        aria-pressed={!!state?.audioMuted} title={state?.audioMuted ? `Liberar áudio de ${person.name}` : `Mutar áudio recebido por ${person.name}`}
        aria-label={state?.audioMuted ? `Liberar áudio de ${person.name}` : `Mutar áudio recebido por ${person.name}`}>
        {state?.audioMuted ? <VolumeX className="size-3.5 text-red-300"/> : <Volume2 className="size-3.5"/>}
      </button>
      <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title={`Mover ${person.name} para outra sala`}>
        <ArrowRightLeft className="size-3.5"/>
        <select className="otms-voice-field max-w-[98px] p-1 text-[10px]" disabled={moderationBusy} defaultValue=""
          aria-label={`Mover ${person.name} para outra sala`} onChange={event => {
            if (event.target.value) void moderatePeer(person, sourceRoomId, "move", event.target.value)
            event.target.value = ""
          }}>
          <option value="">Mover...</option>
          {rooms.filter(r => r.id !== sourceRoomId).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </label>
    </div>
  }

  const onPttPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setTalkHeld(true)
  }
  const meSpeaking = status === "connected" && peers.some(person => person.isMe && person.microphone) &&
    !preferences.mute && !myModeration.microphoneMuted && (preferences.mode === "open" || held)
  const connectionTrouble = audioHealth(receiveStats) === "warning" || audioHealth(sendStats) === "warning"
  const inCall = status === "connected" || status === "reconnecting"
  const selectedRoom = rooms.find(item => item.id === selectedRoomId) || rooms[0]

  const refreshRooms = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/rooms`, {cache: "no-store", signal})
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar as salas.")
      if (signal?.aborted) return
      const updated = data.rooms as VoiceRoomInfo[]
      if (!Array.isArray(updated) || !updated.length) throw new Error("Resposta inválida das salas.")
      setRooms(updated)
      setRoomError("")
      if (statusRef.current === "idle") setSelectedRoomId(current => updated.some(room => room.id === current) ? current : "main")
    } catch (cause) {
      if (signal?.aborted) return
      setRoomError(cause instanceof Error ? cause.message : "Prévia das salas indisponível.")
    }
  }, [campaignId])

  useEffect(() => {
    if (!expanded && !inCall) return
    const controller = new AbortController()
    void refreshRooms(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshRooms(controller.signal)
    }, 6500)
    return () => {controller.abort();clearInterval(timer)}
  }, [expanded, inCall, refreshRooms])

  const createRoom = async (event: FormEvent) => {
    event.preventDefault()
    if (role !== "gm" || roomBusy || switching || !roomNameInput.trim()) return
    setRoomBusy(true)
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/rooms`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: roomNameInput.trim()}),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Não foi possível criar a sala.")
      const created = body.room as VoiceRoomInfo
      if (statusRef.current === "idle") setSelectedRoomId(created.id)
      setRoomNameInput("")
      await refreshRooms()
    } catch (cause) {setRoomError(cause instanceof Error ? cause.message : "Erro ao criar sala.")}
    finally {setRoomBusy(false)}
  }

  const removeRoom = async (room: VoiceRoomInfo) => {
    if (role !== "gm" || room.isDefault || roomBusy || switching) return
    if (!(await controllerConfirm(`Excluir a sala "${room.name}"?`))) return
    setRoomBusy(true)
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/rooms`, {
        method: "DELETE", headers: {"Content-Type": "application/json"}, body: JSON.stringify({roomId: room.id}),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir a sala.")
      if (room.id === selectedRoomId) setSelectedRoomId("main")
      await refreshRooms()
    } catch (cause) {setRoomError(cause instanceof Error ? cause.message : "Erro ao excluir sala.")}
    finally {setRoomBusy(false)}
  }

  const keepOverlayInView = (x: number, y: number) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    const width = rect?.width || 220
    const height = rect?.height || 96
    return {x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8))}
  }
  const beginOverlayDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    overlayDragRef.current = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top}
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveOverlay = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const origin = overlayDragRef.current
    if (!origin || origin.id !== event.pointerId) return
    setOverlayPosition(keepOverlayInView(origin.left + event.clientX - origin.x, origin.top + event.clientY - origin.y))
  }
  const endOverlayDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (overlayDragRef.current?.id !== event.pointerId) return
    overlayDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  useEffect(() => {
    if (!preferences.overlay || !inCall) return
    const onResize = () => setOverlayPosition(current => current ? keepOverlayInView(current.x, current.y) : null)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [preferences.overlay, inCall])
  const speakingPeers = peers.filter(person => person.speaking && person.microphone)

  return <div className="otms-voice-root relative" data-controller-target="voice.panel.toggle">
    <button type="button" ref={triggerRef}
      className={`otms-voice-trigger rpg-cartography-action inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${inCall ? "otms-voice-connected" : ""}`}
      onClick={togglePanel} aria-expanded={expanded} aria-controls="otms-voice-popover" aria-label="Abrir painel de voz e chat">
      {status === "connecting" || status === "reconnecting" || switching ? <LoaderCircle className="size-4 animate-spin"/> : <Headphones className="size-4"/>}
      <span>Voz</span>
      {inCall && <span className="otms-voice-count">{peers.length}</span>}
      {inCall && (preferences.mute || myModeration.microphoneMuted) && <MicOff className="size-3 text-amber-300"/>}
      {unread > 0 && <span className="otms-voice-count" aria-label={`${unread} mensagens novas`}>{Math.min(unread, 99)}</span>}
      <ChevronDown className="size-3 opacity-60"/>
    </button>
    {expanded && <div ref={panelRef} id="otms-voice-popover" role="dialog" aria-label="Mesa de voz" data-voice-tab-navigation="active" data-tab={tab}
      className="otms-voice-popover fixed bottom-3 left-3 right-3 z-[110] flex max-h-[min(80dvh,720px)] flex-col overflow-hidden rounded-xl border p-3 shadow-2xl sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-[calc(100%+0.6rem)] sm:h-[min(72dvh,600px)] sm:w-[375px]">
      <header className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight"><Headphones className="size-4 text-indigo-300"/> Mesa de Voz</h3>
            <span className={`otms-voice-status-badge ${inCall ? "otms-voice-status-live" : ""}`}>{inCall ? "Em call" : "Offline"}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {status === "idle" ? `Fora da chamada · ${selectedRoom?.name || "Sala principal"}` : status === "connecting" ? "Conectando..." : status === "reconnecting" ? "Reconectando..." : `${peers.length} em ${selectedRoom?.name || "Sala principal"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inCall && (connectionGood && !connectionTrouble ? <Signal className="size-4 text-emerald-400" aria-label="Conexão estabelecida"/> : <SignalLow className="size-4 text-amber-400" aria-label="Perda/jitter ou conexão instável"/>)}
          <button className="otms-voice-action" type="button" onClick={() => updatePreferences({overlay: !preferences.overlay})}
            aria-label={preferences.overlay ? "Desativar sobreposição de voz" : "Ativar sobreposição de voz"} aria-pressed={preferences.overlay}
            title={preferences.overlay ? "Desativar sobreposição" : "Mostrar quem está falando com o painel fechado"}>
            {preferences.overlay ? <Eye className="size-4 text-emerald-400"/> : <EyeOff className="size-4"/>}
          </button>
          <button className="otms-voice-action" type="button" onClick={() => setExpanded(false)} aria-label="Fechar painel"><X className="size-4"/></button>
        </div>
      </header>
      <nav ref={tabNavRef} className="otms-voice-tabs flex shrink-0 gap-1" aria-label="Seções da chamada">
        <button type="button" data-voice-tab="participants" aria-current={tab === "participants" ? "page" : undefined} onClick={() => setTab("participants")}>Pessoas</button>
        <button type="button" data-voice-tab="chat" aria-current={tab === "chat" ? "page" : undefined} onClick={() => {setTab("chat"); setUnread(0)}}><MessageCircle className="size-3.5"/> Chat</button>
        <button type="button" data-voice-tab="settings" aria-current={tab === "settings" ? "page" : undefined} onClick={() => setTab("settings")}><Settings2 className="size-3.5"/> Ajustes</button>
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "participants" && <div className="otms-voice-scroll h-full space-y-2 overflow-y-auto py-3">
          <div className="otms-voice-surface space-y-2 p-2.5" aria-label="Salas de voz da campanha">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs font-semibold tracking-wide text-slate-100">Salas de voz</strong>
              <span className="text-[10px] text-muted-foreground">{switching ? "Trocando de sala..." : inCall ? "Clique para trocar · arraste jogadores" : "Escolha antes de entrar"}</span></div>
            <div className="space-y-1.5">
              {rooms.map(room => <div key={room.id} data-voice-drop-room={room.id} className={`otms-voice-room-target rounded-lg p-1 ${dropRoomId === room.id ? "otms-voice-room-drop" : ""}`}
                onDragOver={event => {
                  if (role === "gm" && !moderationBusy && event.dataTransfer.types.includes("application/x-otms-voice-move")) {
                    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropRoomId(room.id)
                  }
                }}
                onDragLeave={event => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropRoomId(current => current === room.id ? null : current)
                }}
                onDrop={event => dropParticipant(event, room.id)}>
                <div className="flex items-center gap-1.5">
                  <button type="button" className={`otms-voice-room min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left text-xs ${selectedRoomId === room.id ? "otms-voice-room-active" : ""}`}
                    disabled={status === "connecting" || status === "reconnecting" || switching} aria-pressed={selectedRoomId === room.id}
                    onClick={() => void switchRoom(room.id, true)}>
                    <span className="flex items-center gap-3">
                      <span className="otms-voice-room-icon inline-flex size-8 shrink-0 items-center justify-center rounded-lg"><Volume2 className="size-4"/></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="otms-voice-room-title truncate font-medium">{room.name}</span>
                          <span className="otms-voice-room-count shrink-0">{room.previewAvailable ? `${room.participants.length}/8` : "--"}</span>
                        </span>
                        <span className="otms-voice-room-subtitle mt-0.5 block truncate text-[10px] text-muted-foreground">{!room.previewAvailable ? "Prévia indisponível" : selectedRoomId === room.id ? (inCall ? "Você está nesta sala" : "Sala selecionada") : inCall ? "Trocar para esta sala" : "Entrar nesta sala"}</span>
                      </span>
                    </span>
                  </button>
                  {role === "gm" && !room.isDefault && <button type="button" className="otms-voice-action !p-2" aria-label={`Excluir sala ${room.name}`}
                    disabled={roomBusy || !room.previewAvailable || room.participants.length > 0} title="Excluir sala vazia" onClick={() => void removeRoom(room)}><Trash2 className="size-3.5"/></button>}
                </div>
                {role === "gm" && room.previewAvailable && room.participants.length > 0 && <div className="mt-1.5 space-y-1 px-1 pb-1">
                  {room.participants.map(person => <div key={person.id} className={`otms-voice-room-person rounded-xl px-2 py-2 ${person.speaking ? "otms-voice-speaking" : ""}`}>
                    <div className="flex items-center gap-2">
                      {person.role === "player" && <span className="otms-voice-grip inline-flex cursor-grab items-center justify-center rounded-md p-1" draggable
                        title={`Arrastar ${person.name} para outra sala`} aria-label={`Arrastar ${person.name} para outra sala`}
                        onDragStart={event => beginParticipantDrag(event, person, room.id)} onDragEnd={() => setDropRoomId(null)}
                        onPointerDown={event => beginTouchMove(event, person, room.id)} onPointerMove={updateTouchMove}
                        onPointerUp={endTouchMove} onPointerCancel={endTouchMove}>
                        <GripVertical className="size-3.5"/>
                      </span>}
                      <span className="otms-voice-avatar inline-flex size-7 shrink-0 items-center justify-center rounded-full"><UserRound className="size-3.5"/></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-slate-100">{person.name}</p>
                        <p className={`text-[10px] ${person.speaking ? "text-emerald-300" : "text-muted-foreground"}`}>{person.role === "gm" ? "Mestre" : person.speaking ? "Falando agora" : "Na escuta"}</p>
                      </div>
                      {person.microphone ? <Mic className="size-3.5 text-emerald-400"/> : <MicOff className="size-3.5 text-muted-foreground"/>}
                    </div>
                    {renderAdminControls(person, room.id)}
                  </div>)}
                </div>}
              </div>)}
            </div>
            {role === "gm" && <form className="flex gap-1.5" onSubmit={createRoom}>
              <input aria-label="Nome da nova sala de voz" className="otms-voice-field min-w-0 flex-1 px-2 py-1.5 text-xs" placeholder="Nova sala..." maxLength={40} value={roomNameInput} onChange={event => setRoomNameInput(event.target.value)}/>
              <button type="submit" className="otms-voice-action" disabled={roomBusy || switching || roomNameInput.trim().length < 2} aria-label="Criar sala de voz"><Plus className="size-4"/> Criar</button>
            </form>}
            {roomError && <p role="status" className="text-[11px] text-amber-300">{roomError}</p>}
          </div>
          {status === "idle" && <div className="otms-voice-surface space-y-1.5 p-2.5" aria-live="polite">
            <h4 className="text-xs font-semibold tracking-wide text-slate-100">Prévia · {selectedRoom?.name}</h4>
            {selectedRoom?.previewAvailable ? (selectedRoom.participants.length ? selectedRoom.participants.map(person => <div key={person.id}
              className={`otms-voice-person flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs ${person.speaking ? "otms-voice-speaking" : ""}`}>
              <span className="otms-voice-avatar inline-flex size-7 shrink-0 items-center justify-center rounded-full"><UserRound className="size-3.5"/></span><span className="min-w-0 flex-1 truncate">{person.name}{person.role === "gm" ? " · Mestre" : ""}</span>
              {person.microphone ? <Mic className="size-3.5 text-emerald-400"/> : <MicOff className="size-3.5 text-muted-foreground"/>}
            </div>) : <p className="text-[11px] text-muted-foreground">Ninguém conectado. Seja o primeiro a entrar.</p>)
              : <p className="text-[11px] text-muted-foreground">Não foi possível confirmar quem está na sala agora.</p>}
          </div>}
          {inCall && (myModeration.microphoneMuted || myModeration.audioMuted) && <p role="status" className="rounded-md border border-red-700/30 bg-red-950/20 p-2 text-[11px] text-amber-200">
            O Mestre bloqueou: {myModeration.microphoneMuted ? "seu microfone" : ""}{myModeration.microphoneMuted && myModeration.audioMuted ? " e " : ""}{myModeration.audioMuted ? "o áudio que você ouve" : ""}. Os controles serão liberados pelo Mestre.
          </p>}
          {inCall && connectionTrouble && <p role="alert" className="rounded-md border border-amber-700/40 bg-amber-950/30 p-2 text-[11px] text-amber-200">Instabilidade detectada na mídia WebRTC (perda de pacotes/jitter). Se a voz estiver robótica, teste rede cabeada ou encaminhamento UDP direto ao LiveKit; filtros de microfone não corrigem pacotes perdidos.</p>}
          {inCall && peers.map(person => <div key={person.id} className={`otms-voice-person rounded-xl px-3 py-3 ${person.speaking ? "otms-voice-speaking" : ""}`}>
            <div className="flex items-center gap-2.5">
              <span className="otms-voice-avatar flex size-8 shrink-0 items-center justify-center rounded-full"><UserRound className="size-4"/></span>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{person.isMe ? `${person.name} (você)` : person.name}</p>
                <p className={`text-[10px] ${person.speaking ? "text-emerald-400" : "text-muted-foreground"}`}>{person.speaking ? "Falando" : person.isMe && !person.microphone ? "Microfone desativado" : person.role === "gm" ? "Mestre" : "Jogador"}</p>
              </div>
              {person.microphone ? <AudioLines className={`size-4 ${person.speaking ? "text-emerald-400" : "text-muted-foreground"}`}/> : <MicOff className="size-4 text-muted-foreground"/>}
              {role === "gm" && !person.isMe && person.role === "player" && <span className="otms-voice-grip cursor-grab rounded p-1" draggable
                title={`Arraste ${person.name} sobre outra sala`} aria-label={`Arrastar ${person.name} para outra sala`}
                onDragStart={event => beginParticipantDrag(event, person, selectedRoomId)} onDragEnd={() => setDropRoomId(null)}
                onPointerDown={event => beginTouchMove(event, person, selectedRoomId)} onPointerMove={updateTouchMove}
                onPointerUp={endTouchMove} onPointerCancel={endTouchMove}>
                <GripVertical className="size-3.5"/></span>}
              {role === "gm" && !person.isMe && person.role === "player" && <button type="button" className="otms-voice-action !p-1.5 text-red-300" onClick={() => void disconnectPeer(person)} title="Desconectar jogador" aria-label={`Desconectar ${person.name}`}><UserRoundX className="size-3.5"/></button>}
            </div>
            {renderAdminControls(person, selectedRoomId)}
            {!person.isMe && <div className="mt-2 space-y-2 pl-10 text-[10px] text-muted-foreground">
              <label className="flex items-center gap-2">
                <Volume2 className="size-3.5 shrink-0"/>
                <input aria-label={`Volume de ${person.name}`} className="min-w-0 flex-1 accent-amber-500" type="range" min="0" max="200" step="5" value={Math.round(safePeerVolume(preferences.personVolumes[person.id]) * 100)} onChange={e => updatePreferences({personVolumes: {...prefsRef.current.personVolumes, [person.id]: safePeerVolume(Number(e.target.value) / 100)}})} />
                <span className={safePeerVolume(preferences.personVolumes[person.id]) > 1 ? "text-amber-300" : ""}>{Math.round(safePeerVolume(preferences.personVolumes[person.id]) * 100)}%</span>
              </label>
              <button type="button" aria-expanded={peerAudioOpen === person.id} className="otms-voice-link"
                onClick={() => setPeerAudioOpen(current => current === person.id ? null : person.id)}>
                <Settings2 className="mr-1 inline size-3"/> {peerAudioOpen === person.id ? "Fechar equalizador" : `Equalizar voz de ${person.name}`}
              </button>
              {peerAudioOpen === person.id && <div className="space-y-2 rounded-lg border border-amber-700/25 p-2" aria-label={`Equalizador de ${person.name}`}>
                <label className="block">Perfil vocal
                  <select className="otms-voice-field mt-1 w-full px-2 py-1" value={normalizeVoiceEq(preferences.personEqualizers[person.id]).preset}
                    onChange={e => {
                      const preset = e.target.value as VoiceEqualizer["preset"]
                      const chosen: VoiceEqualizer = preset !== "custom" && preset in VOICE_EQ_PRESETS
                        ? { ...VOICE_EQ_PRESETS[preset as keyof typeof VOICE_EQ_PRESETS], preset }
                        : { ...normalizeVoiceEq(prefsRef.current.personEqualizers[person.id]), preset: "custom" }
                      updatePreferences({personEqualizers: {...prefsRef.current.personEqualizers, [person.id]: chosen}})
                    }}>
                    <option value="flat">Natural / Sem EQ</option>
                    <option value="narration">Narração / Podcast</option>
                    <option value="clarity">Clareza</option>
                    <option value="warm">Graves quentes</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </label>
                {VOICE_EQ_BANDS.map(band => {
                  const eq = normalizeVoiceEq(preferences.personEqualizers[person.id])
                  return <label key={band.key} className="block">
                    <span className="flex justify-between"><span>{band.name} · {band.hz} Hz</span><span>{eq[band.key] > 0 ? "+" : ""}{eq[band.key]} dB</span></span>
                    <input aria-label={`${band.name} de ${person.name}`} type="range" min="-12" max="12" step="0.5" className="mt-1 w-full accent-amber-500"
                      value={eq[band.key]} onChange={e => updatePreferences({personEqualizers: {
                        ...prefsRef.current.personEqualizers,
                        [person.id]: { ...eq, [band.key]: safeEqDb(Number(e.target.value)), preset: "custom" },
                      }})}/>
                  </label>
                })}
                <button type="button" className="otms-voice-action w-full text-[10px]" onClick={() => updatePreferences({personEqualizers: {
                  ...prefsRef.current.personEqualizers, [person.id]: { ...DEFAULT_VOICE_EQ },
                }})}>Restaurar equalização natural</button>
                <p>Acima de 100% pode amplificar ruído já existente. Um limitador ajuda a evitar distorção, mas não recupera detalhes perdidos.</p>
              </div>}
            </div>}
          </div>)}
        </div>}
        {tab === "chat" && <VoiceChat campaignId={campaignId} meId={userId} canModerate={role === "gm"} active={true} onUnreadChange={setUnread}/>}
        {tab === "settings" && <div className="otms-voice-scroll h-full space-y-4 overflow-y-auto py-3 text-xs">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-amber-600/20 p-2">
            <span>Sobreposição de voz<br/><small className="text-[10px] text-muted-foreground">Exibir quem fala quando fechar o painel</small></span>
            <input type="checkbox" className="size-4 accent-amber-500" checked={preferences.overlay} onChange={event => updatePreferences({overlay: event.target.checked})} />
          </label>
          <label className="flex items-center justify-between gap-3"><span>Modo do microfone</span>
            <select className="otms-voice-field max-w-[170px] px-2 py-1.5" value={preferences.mode} onChange={e => {setTalkHeld(false); updatePreferences({mode: e.target.value === "ptt" ? "ptt" : "open"})}}>
              <option value="open">Microfone livre</option><option value="ptt">Segurar para falar</option>
            </select></label>
          <label className="block">Volume dos participantes: {Math.round(preferences.volume * 100)}%
            <input className="mt-2 w-full accent-amber-500" type="range" min="0" max="100" value={Math.round(preferences.volume * 100)} onChange={e => updatePreferences({volume: Number(e.target.value)/100})}/>
          </label>
          <VoiceAudioSettings
            profile={{noiseMode:preferences.noiseMode, echo:preferences.echo,gain:preferences.gain,inputGainDb:preferences.inputGainDb,studio:preferences.studio,isolation:preferences.isolation}}
            deviceId={preferences.deviceId}
            devices={devices}
            updateProfile={patch => updatePreferences(patch)}
            changeDevice={deviceId => updatePreferences({deviceId})}
            inCall={inCall}
            dspStatus={dspStatus}
            level={inputLevel}
            clipping={clipping}
            localMicInfo={localMicInfo}
            sendStats={sendStats}
            receiveStats={receiveStats}
            outputDeviceId={outputDeviceId}
            outputDevices={outputDevices}
            changeOutputDevice={setOutputDeviceId}
            duckMusic={preferences.duckMusic}
            duckDepth={preferences.duckDepth}
            updateDuck={patch => updatePreferences(patch)}
          />
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="size-3.5"/> Processamento local · sem gravação automática ou envio para terceiros.</p>
        </div>}
      </div>
      {error && <p role="alert" className="mt-2 shrink-0 rounded bg-red-900/20 px-2 py-1.5 text-xs text-red-300"><AlertTriangle className="mr-1 inline size-3"/>{error}</p>}
      {inCall && <button type="button" onClick={allowAudio} className="otms-voice-link my-2 text-left text-xs" title="Reiniciar a reprodução local sem desconectar da call"><Volume2 className="mr-1 inline size-3.5"/> {audioBlocked ? "Liberar reprodução de áudio" : "Restaurar áudio se estiver sem som"}</button>}
      <footer className="otms-voice-footer mt-3 flex shrink-0 gap-2 border-t pt-3">
        {status === "idle" ? <button className="otms-voice-primary flex w-full items-center justify-center gap-2 p-2.5 text-xs" type="button" onClick={() => void join()}><Phone className="size-4"/> Entrar em {selectedRoom?.name || "Sala principal"}</button> :
          <>
            <button type="button" className="otms-voice-action flex-1" disabled={status !== "connected" || myModeration.microphoneMuted} onClick={toggleMute} aria-label={myModeration.microphoneMuted ? "Microfone bloqueado pelo Mestre" : preferences.mute ? "Ativar microfone" : "Silenciar microfone"} title={myModeration.microphoneMuted ? "Microfone bloqueado pelo Mestre" : preferences.mute ? "Ativar microfone" : "Silenciar microfone"}>
              {preferences.mute || myModeration.microphoneMuted ? <MicOff className="size-4 text-amber-300"/> : <Mic className="size-4"/>}<span>{myModeration.microphoneMuted ? "Bloqueado" : preferences.mute ? "Ativar" : "Mudo"}</span>
            </button>
            {preferences.mode === "ptt" && <button type="button" className={`otms-voice-action flex-1 ${held ? "otms-voice-ptt-active" : ""}`} disabled={status !== "connected" || myModeration.microphoneMuted}
              onPointerDown={onPttPress} onPointerUp={() => setTalkHeld(false)} onPointerCancel={() => setTalkHeld(false)} onLostPointerCapture={() => setTalkHeld(false)}
              onKeyDown={e => {if ((e.key === " " || e.key === "Enter") && !e.repeat) {e.preventDefault();setTalkHeld(true)}}}
              onKeyUp={e => {if (e.key === " " || e.key === "Enter") {e.preventDefault();setTalkHeld(false)}}}
              aria-label="Segurar para falar" aria-pressed={held}><RadioTower className="size-4"/><span>{held ? "Falando" : "Falar"}</span></button>}
            <button type="button" className="otms-voice-action flex-1" onClick={toggleDeaf} disabled={myModeration.audioMuted} aria-label={myModeration.audioMuted ? "Áudio bloqueado pelo Mestre" : preferences.deaf ? "Voltar a ouvir" : "Silenciar áudio recebido"} title="Silenciar participantes">
              {preferences.deaf || myModeration.audioMuted ? <HeadphoneOff className="size-4 text-amber-300"/> : <Headphones className="size-4"/>}<span>{myModeration.audioMuted ? "Bloqueado" : preferences.deaf ? "Ouvir" : "Áudio"}</span>
            </button>
            <button type="button" className="otms-voice-action otms-voice-leave" onClick={leave} aria-label="Sair da chamada" title="Sair da chamada"><PhoneOff className="size-4"/></button>
          </>}
      </footer>
      {inCall && preferences.mode === "ptt" && <p className="mt-2 text-center text-[10px] text-muted-foreground">{meSpeaking ? "Transmitindo voz" : "Segure o botão Falar ou o atalho configurado no controle"}</p>}
    </div>}
    {inCall && preferences.overlay && !expanded && createPortal(<div ref={overlayRef} role="region" aria-label="Sobreposição de voz"
      className="otms-voice-overlay fixed z-[105] w-[218px] max-w-[calc(100vw-16px)] rounded-xl border p-2 shadow-xl"
      style={overlayPosition ? {left: overlayPosition.x, top: overlayPosition.y} : {right: 16, top: 82}}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <button type="button" className="otms-voice-overlay-drag rounded p-1" title="Arraste para mover · setas quando focado"
          aria-label="Mover sobreposição de voz; use as setas para reposicionar"
          onPointerDown={beginOverlayDrag} onPointerMove={moveOverlay} onPointerUp={endOverlayDrag} onPointerCancel={endOverlayDrag}
          onKeyDown={event => {
            const delta: Record<string, {x:number;y:number}> = {ArrowLeft:{x:-20,y:0},ArrowRight:{x:20,y:0},ArrowUp:{x:0,y:-20},ArrowDown:{x:0,y:20}}
            const movement = delta[event.key]
            if (!movement) return
            event.preventDefault()
            const rect = overlayRef.current?.getBoundingClientRect()
            if (rect) setOverlayPosition(keepOverlayInView(rect.left + movement.x, rect.top + movement.y))
          }}><GripVertical className="size-3.5"/></button>
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{selectedRoom?.name || "Mesa de Voz"}</span>
        <button type="button" className="otms-voice-overlay-btn" onClick={() => setExpanded(true)} aria-label="Abrir painel de voz"><Headphones className="size-3.5"/></button>
        <button type="button" className="otms-voice-overlay-btn" onClick={() => updatePreferences({overlay: false})} aria-label="Desativar sobreposição"><X className="size-3.5"/></button>
      </div>
      <div className="space-y-1" aria-live="off">
        {speakingPeers.length ? speakingPeers.map(person => <div key={person.id} className="otms-voice-overlay-speaker flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px]">
          <AudioLines className="size-3 shrink-0 text-emerald-300"/><span className="truncate">{person.name}{person.isMe ? " (você)" : ""}</span>
        </div>) : <p className="px-1.5 py-1 text-[10px] text-muted-foreground">Ninguém falando agora</p>}
      </div>
    </div>, document.body)}
  </div>
}
