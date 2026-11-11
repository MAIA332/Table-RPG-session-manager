/** Mixagem individual de participantes da Mesa de Voz.
 * Usa Web Audio no navegador; o áudio bruto permanece local e o LiveKit não muda.
 * 200% corresponde a +6.02 dB, NÃO ao volume HTMLMediaElement (limitado a 100%).
 */
export type VoiceEqualizer = {
  preset: "flat" | "narration" | "clarity" | "warm" | "custom"
  bass: number
  lowMid: number
  mid: number
  presence: number
  treble: number
}
export const DEFAULT_VOICE_EQ: VoiceEqualizer = {
  preset: "flat", bass: 0, lowMid: 0, mid: 0, presence: 0, treble: 0,
}
export const VOICE_EQ_PRESETS: Record<Exclude<VoiceEqualizer["preset"], "custom">, Omit<VoiceEqualizer, "preset">> = {
  flat: { bass: 0, lowMid: 0, mid: 0, presence: 0, treble: 0 },
  narration: { bass: 2, lowMid: -1.5, mid: 0.5, presence: 2, treble: 0.5 },
  clarity: { bass: -2, lowMid: -2, mid: 1, presence: 3, treble: 2 },
  warm: { bass: 3, lowMid: 1, mid: 0, presence: -0.5, treble: -1.5 },
}
export const VOICE_EQ_BANDS = [
  { key: "bass", name: "Graves", hz: 130 },
  { key: "lowMid", name: "Médios-graves", hz: 380 },
  { key: "mid", name: "Médios", hz: 1250 },
  { key: "presence", name: "Presença", hz: 3500 },
  { key: "treble", name: "Agudos", hz: 7800 },
] as const

export function safePeerVolume(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1
}
export function safeEqDb(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0
}
export function normalizeVoiceEq(value: unknown): VoiceEqualizer {
  if (!value || typeof value !== "object") return { ...DEFAULT_VOICE_EQ }
  const input = value as Partial<VoiceEqualizer>
  const preset = input.preset === "narration" || input.preset === "clarity" || input.preset === "warm" || input.preset === "custom" ? input.preset : "flat"
  return { preset, bass: safeEqDb(input.bass), lowMid: safeEqDb(input.lowMid), mid: safeEqDb(input.mid),
    presence: safeEqDb(input.presence), treble: safeEqDb(input.treble) }
}

/** Cada remote track tem sua própria fonte, ganho e EQ; o destino é a saída de áudio escolhida. */
export class RemoteVoicePlayback {
  // Um único AudioContext por aba evita limites de quantidade de contextos
  // quando há vários jogadores/NPCs falando simultaneamente.
  private static shared: AudioContext | null = null
  private static users = 0
  readonly element: HTMLAudioElement
  readonly personId: string
  private readonly context: AudioContext
  private readonly source: MediaStreamAudioSourceNode
  private readonly filters: BiquadFilterNode[]
  private readonly gain: GainNode
  private readonly limiter: DynamicsCompressorNode
  private readonly output: MediaStreamAudioDestinationNode
  private closed = false

  constructor(mediaTrack: MediaStreamTrack, personId: string) {
    const context = RemoteVoicePlayback.shared?.state !== "closed" && RemoteVoicePlayback.shared
      ? RemoteVoicePlayback.shared : new AudioContext({ latencyHint: "interactive" })
    RemoteVoicePlayback.shared = context
    RemoteVoicePlayback.users++
    this.context = context
    this.personId = personId
    const cleanupOnError: AudioNode[] = []
    try {
      this.source = context.createMediaStreamSource(new MediaStream([mediaTrack]))
      cleanupOnError.push(this.source)
      this.filters = VOICE_EQ_BANDS.map((band, i) => {
        const node = context.createBiquadFilter()
        node.type = i === 0 ? "lowshelf" : i === VOICE_EQ_BANDS.length - 1 ? "highshelf" : "peaking"
        node.frequency.value = band.hz
        if (node.type === "peaking") node.Q.value = 0.8
        cleanupOnError.push(node)
        return node
      })
      this.gain = context.createGain()
      cleanupOnError.push(this.gain)
      this.limiter = context.createDynamicsCompressor()
      this.limiter.threshold.value = -5
      this.limiter.knee.value = 4
      this.limiter.ratio.value = 16
      this.limiter.attack.value = 0.003
      this.limiter.release.value = 0.12
      cleanupOnError.push(this.limiter)
      this.output = context.createMediaStreamDestination()
      cleanupOnError.push(this.output)
      let node: AudioNode = this.source
      for (const filter of this.filters) { node.connect(filter); node = filter }
      node.connect(this.gain)
      this.gain.connect(this.limiter)
      this.limiter.connect(this.output)
      this.element = document.createElement("audio")
      this.element.autoplay = true
      this.element.preload = "auto"
      this.element.style.display = "none"
      this.element.dataset.personId = personId
      this.element.srcObject = this.output.stream
      document.body.append(this.element)
    } catch (cause) {
      for (const node of cleanupOnError) try { node.disconnect() } catch { /* cleanup best-effort */ }
      RemoteVoicePlayback.releaseContext(context)
      throw cause
    }
  }

  private static releaseContext(context: AudioContext) {
    RemoteVoicePlayback.users = Math.max(0, RemoteVoicePlayback.users - 1)
    if (RemoteVoicePlayback.users === 0 && RemoteVoicePlayback.shared === context) {
      RemoteVoicePlayback.shared = null
      void context.close().catch(() => undefined)
    }
  }

  setEq(profile: VoiceEqualizer) {
    const value = normalizeVoiceEq(profile)
    for (let i = 0; i < VOICE_EQ_BANDS.length; i++) {
      const amount = safeEqDb(value[VOICE_EQ_BANDS[i].key])
      this.filters[i].gain.setTargetAtTime(amount, this.context.currentTime, 0.035)
    }
  }
  setVolume(master: number, personal: number, deaf: boolean) {
    const level = deaf ? 0 : safePeerVolume(master) * safePeerVolume(personal)
    // Clamped to <=200% per participant. The compressor is AFTER gain, so it
    // handles peaks that otherwise distort when boosting a quiet participant.
    this.gain.gain.setTargetAtTime(Math.min(2, level), this.context.currentTime, 0.018)
  }
  setOutputDevice(id: string): Promise<void> {
    const element = this.element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    return typeof element.setSinkId === "function" ? element.setSinkId(id) : Promise.resolve()
  }
  async play(): Promise<void> {
    if (this.closed) return
    // Iniciar ambas promessas no mesmo gesto do usuário, sem esperar a
    // primeira terminar (autoplay pode ser bloqueado se perder o gesto).
    const resume = this.context.state !== "running" && this.context.state !== "closed" ? this.context.resume() : Promise.resolve()
    await Promise.all([resume, this.element.play()])
  }
  get state() { return this.context.state }
  dispose() {
    if (this.closed) return
    this.closed = true
    this.element.pause()
    this.element.srcObject = null
    this.element.remove()
    this.source.disconnect()
    this.filters.forEach(node => node.disconnect())
    this.gain.disconnect()
    this.limiter.disconnect()
    this.output.disconnect()
    // Não interromper a faixa remota: sua propriedade pertence ao LiveKit.
    for (const track of this.output.stream.getTracks()) track.stop()
    RemoteVoicePlayback.releaseContext(this.context)
  }
}
