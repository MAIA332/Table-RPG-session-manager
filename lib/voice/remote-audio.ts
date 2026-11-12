/** Reprodução individual com CAMINHO DE SEGURANÇA sempre audível.
 * O LiveKit toca a faixa diretamente por padrão. Equalização/amplificação
 * usam Web Audio somente quando o AudioContext e o elemento de saída estão ativos.
 * Se o navegador suspender o grafo, a reprodução direta retorna imediatamente.
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

/** Uma faixa remota LiveKit; attach() permanece a saída primária de áudio. */
type RemoteTrackAudio = {
  readonly mediaStreamTrack: MediaStreamTrack
  attach: (element?: HTMLMediaElement) => HTMLMediaElement
  detach: (element?: HTMLMediaElement) => unknown
}

export class RemoteVoicePlayback {
  private static shared: AudioContext | null = null
  private static users = 0
  readonly element: HTMLAudioElement
  readonly personId: string
  private readonly track: RemoteTrackAudio
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private filters: BiquadFilterNode[] = []
  private gain?: GainNode
  private limiter?: DynamicsCompressorNode
  private destination?: MediaStreamAudioDestinationNode
  private processedElement?: HTMLAudioElement
  private closed = false
  private enhanced = false
  private enhancing?: Promise<void>
  private eq: VoiceEqualizer = { ...DEFAULT_VOICE_EQ }
  private volume = 1
  private outputDeviceId = ""

  constructor(track: RemoteTrackAudio, personId: string) {
    this.track = track
    this.personId = personId
    // O áudio padrão é responsabilidade do SDK LiveKit: nunca depende de Web Audio.
    const direct = track.attach() as HTMLAudioElement
    this.element = direct
    direct.dataset.personId = personId
    direct.autoplay = true
    direct.preload = "auto"
    direct.style.display = "none"
    document.body.append(direct)
  }

  private needsEnhancement(): boolean {
    return this.volume > 1.001 || VOICE_EQ_BANDS.some(band => Math.abs(this.eq[band.key]) > 0.01)
  }

  private static releaseContext(context?: AudioContext): void {
    if (!context) return
    RemoteVoicePlayback.users = Math.max(0, RemoteVoicePlayback.users - 1)
    if (RemoteVoicePlayback.users === 0 && RemoteVoicePlayback.shared === context) {
      RemoteVoicePlayback.shared = null
      void context.close().catch(() => undefined)
    }
  }

  private initGraph(): void {
    if (this.context || this.closed) return
    const context = RemoteVoicePlayback.shared && RemoteVoicePlayback.shared.state !== "closed"
      ? RemoteVoicePlayback.shared : new AudioContext({ latencyHint: "interactive" })
    RemoteVoicePlayback.shared = context
    RemoteVoicePlayback.users++
    this.context = context
    try {
      this.source = context.createMediaStreamSource(new MediaStream([this.track.mediaStreamTrack]))
      this.filters = VOICE_EQ_BANDS.map((band, i) => {
        const node = context.createBiquadFilter()
        node.type = i === 0 ? "lowshelf" : i === VOICE_EQ_BANDS.length - 1 ? "highshelf" : "peaking"
        node.frequency.value = band.hz
        if (node.type === "peaking") node.Q.value = 0.8
        return node
      })
      this.gain = context.createGain()
      this.limiter = context.createDynamicsCompressor()
      this.limiter.threshold.value = -5
      this.limiter.knee.value = 4
      this.limiter.ratio.value = 16
      this.limiter.attack.value = 0.003
      this.limiter.release.value = 0.12
      this.destination = context.createMediaStreamDestination()
      let tail: AudioNode = this.source
      for (const node of this.filters) { tail.connect(node); tail = node }
      tail.connect(this.gain)
      this.gain.connect(this.limiter)
      this.limiter.connect(this.destination)
      this.processedElement = document.createElement("audio")
      this.processedElement.autoplay = true
      this.processedElement.preload = "auto"
      this.processedElement.style.display = "none"
      this.processedElement.srcObject = this.destination.stream
      document.body.append(this.processedElement)
      this.applyGraphSettings()
      if (this.outputDeviceId) void this.setOutputDevice(this.outputDeviceId)
    } catch (error) {
      this.destroyGraph()
      throw error
    }
  }

  private applyGraphSettings() {
    if (!this.context) return
    for (let i = 0; i < VOICE_EQ_BANDS.length; i++) {
      this.filters[i]?.gain.setTargetAtTime(this.eq[VOICE_EQ_BANDS[i].key], this.context.currentTime, 0.035)
    }
    this.gain?.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.018)
  }

  private useDirect() {
    this.enhanced = false
    this.element.volume = Math.min(1, this.volume)
    // Nunca manter dois fluxos audíveis simultaneamente.
    if (this.processedElement) { this.processedElement.volume = 0; this.processedElement.pause() }
  }

  private async enableEnhancement() {
    if (this.closed || !this.needsEnhancement()) { this.useDirect(); return }
    if (this.enhancing) return this.enhancing
    this.enhancing = (async () => {
      try {
        this.initGraph()
        const context = this.context
        const output = this.processedElement
        if (!context || !output) return
        this.applyGraphSettings()
        // resume() pode ficar pendente indefinidamente quando a política de autoplay
        // bloqueia o contexto. Timeout = fallback direto, jamais uma chamada muda.
        const ready = await Promise.race([
          Promise.all([
            context.state === "running" ? Promise.resolve() : context.resume(),
            output.play(),
          ]).then(() => true, () => false),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 650)),
        ])
        if (!ready || context.state !== "running" || output.paused || this.closed || !this.needsEnhancement()) {
          this.useDirect()
          return
        }
        // Só depois de confirmar que a saída processada está rodando
        // diminuímos a saída direta. Se suspender depois, watchdog recupera.
        output.volume = 1
        this.element.volume = 0
        this.enhanced = true
      } catch (error) {
        console.warn("[Mesa de Voz] EQ indisponível; mantendo som direto LiveKit:", error)
        this.useDirect()
      }
    })().finally(() => { this.enhancing = undefined })
    return this.enhancing
  }

  setEq(profile: VoiceEqualizer) {
    this.eq = normalizeVoiceEq(profile)
    this.applyGraphSettings()
    if (!this.needsEnhancement()) this.useDirect()
    else if (this.enhanced && this.context?.state !== "running") this.useDirect()
    else if (!this.enhanced) void this.enableEnhancement()
  }
  setVolume(master: number, personal: number, deaf: boolean) {
    this.volume = deaf ? 0 : Math.min(2, safePeerVolume(master) * safePeerVolume(personal))
    this.applyGraphSettings()
    if (deaf || !this.needsEnhancement()) this.useDirect()
    else if (this.enhanced && this.context?.state !== "running") this.useDirect()
    else if (!this.enhanced) void this.enableEnhancement()
    if (!this.enhanced) this.element.volume = Math.min(1, this.volume)
  }
  async setOutputDevice(id: string): Promise<void> {
    this.outputDeviceId = id
    const setSink = (element?: HTMLAudioElement) => {
      const target = element as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | undefined
      return target?.setSinkId ? target.setSinkId(id) : Promise.resolve()
    }
    const results = await Promise.allSettled([setSink(this.element), setSink(this.processedElement)])
    if (results[0].status === "rejected") throw results[0].reason
  }
  async play(): Promise<void> {
    if (this.closed) return
    // A faixa original SEMPRE é reproduzida, mesmo que o AudioContext falhe.
    await this.element.play()
    if (this.enhanced && this.context?.state !== "running") this.useDirect()
    if (this.needsEnhancement() && !this.enhanced) await this.enableEnhancement()
  }
  get state() { return this.enhanced && this.context?.state !== "running" ? "suspended" : "running" }
  private destroyGraph() {
    this.useDirect()
    this.source?.disconnect()
    this.filters.forEach(n => n.disconnect())
    this.gain?.disconnect()
    this.limiter?.disconnect()
    this.destination?.disconnect()
    this.processedElement?.remove()
    if (this.processedElement) this.processedElement.srcObject = null
    this.destination?.stream.getTracks().forEach(t => t.stop())
    this.source = undefined
    this.filters = []
    this.gain = undefined
    this.limiter = undefined
    this.destination = undefined
    this.processedElement = undefined
    RemoteVoicePlayback.releaseContext(this.context)
    this.context = undefined
  }
  dispose() {
    if (this.closed) return
    this.closed = true
    this.track.detach(this.element)
    this.element.pause()
    this.element.remove()
    if (this.context) this.destroyGraph()
  }
}
