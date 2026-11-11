/** Processamento de voz 100% local: captura WebAudio -> WASM em AudioWorklet -> Opus do WebRTC.
 * Nenhum áudio bruto ou modelo é enviado a serviços de terceiros.
 */
export type VoiceNoiseMode = "off" | "native" | "rnnoise" | "gtcrn"
export type VoiceAudioProfile = {
  noiseMode: VoiceNoiseMode
  echo: boolean
  gain: boolean
  inputGainDb: number
}

export const VOICE_DSP_PATH = "/voice-dsp"
export const VOICE_PROFILE_DEFAULTS: VoiceAudioProfile = {
  noiseMode: "native", echo: true, gain: false, inputGainDb: 0,
}

export const isAdvancedNoise = (mode: VoiceNoiseMode) => mode === "rnnoise" || mode === "gtcrn"
export const safeInputGain = (value: number) => Math.max(-12, Math.min(6, Number.isFinite(value) ? value : 0))
export const dbToGain = (value: number) => Math.pow(10, safeInputGain(value) / 20)

export function captureForProfile(profile: VoiceAudioProfile, deviceId = "") {
  return {
    echoCancellation: profile.echo,
    // Avoid double suppression/AGC before a neural model. Echo cancellation stays independent.
    noiseSuppression: profile.noiseMode === "native",
    autoGainControl: profile.gain,
    channelCount: 1,
    sampleRate: 48000,
    ...(deviceId ? { deviceId } : {}),
  }
}

export type VoiceMeter = { rms: number; peak: number; clipping: boolean }
export function readMeter(analyser: AnalyserNode): VoiceMeter {
  const data = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(data)
  let sum = 0, peak = 0
  for (let i = 0; i < data.length; i++) {
    const n = data[i]
    sum += n * n
    peak = Math.max(peak, Math.abs(n))
  }
  const rms = Math.sqrt(sum / data.length)
  return { rms: Math.min(1, rms * 2.5), peak, clipping: peak >= 0.985 }
}

type NeuralNode = (AudioWorkletNode & { destroy(): void })

/** Não afirma que um filtro neural está ativo se os modelos não foram publicados.
 * O arquivo é produzido pelo script de sincronização durante `npm run dev/build`.
 */
let assetsPromise: Promise<void> | undefined
export async function verifyVoiceDspAssets(): Promise<void> {
  if (!assetsPromise) assetsPromise = (async () => {
    const result = await fetch(`${VOICE_DSP_PATH}/assets.json`, { cache: "no-store" })
    if (!result.ok) throw new Error(`Assets RNNoise/GTCRN ausentes (HTTP ${result.status}). Execute npm run predev e reinicie o Next.js.`)
    const manifest: unknown = await result.json()
    if (!manifest || typeof manifest !== "object" ||
      !Array.isArray((manifest as {files?: unknown}).files) ||
      (manifest as {files: unknown[]}).files.length !== 5) {
      throw new Error("Manifesto de supressão de ruído incompleto.")
    }
  })().catch(error => { assetsPromise = undefined; throw error })
  return assetsPromise
}
const worklets = new WeakMap<AudioContext, Set<VoiceNoiseMode>>()

async function neuralNode(context: AudioContext, mode: "rnnoise" | "gtcrn"): Promise<NeuralNode> {
  await verifyVoiceDspAssets()
  if (!context.audioWorklet || typeof WebAssembly === "undefined") {
    throw new Error("Seu navegador não oferece AudioWorklet/WebAssembly.")
  }
  if (mode === "rnnoise" && context.sampleRate !== 48000) {
    // RNNoise needs 48000Hz; never distort audio silently using a different rate.
    throw new Error("RNNoise exige AudioContext de 48 kHz; use o modo Nativo neste dispositivo.")
  }
  const {
    loadRnnoise, RnnoiseWorkletNode, loadGtcrn, GtcrnWorkletNode,
  } = await import("@sapphi-red/web-noise-suppressor")
  const loaded = worklets.get(context) ?? new Set<VoiceNoiseMode>()
  if (!loaded.has(mode)) {
    await context.audioWorklet.addModule(`${VOICE_DSP_PATH}/${mode}-worklet.js`)
    loaded.add(mode)
    worklets.set(context, loaded)
  }
  if (mode === "rnnoise") {
    const wasmBinary = await loadRnnoise({
      url: `${VOICE_DSP_PATH}/rnnoise.wasm`,
      simdUrl: `${VOICE_DSP_PATH}/rnnoise_simd.wasm`,
    })
    return new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary })
  }
  const wasmBinary = await loadGtcrn({ url: `${VOICE_DSP_PATH}/gtcrn.wasm` })
  return new GtcrnWorkletNode(context, { maxChannels: 1, wasmBinary })
}

export class VoicePipeline {
  readonly output: MediaStreamTrack
  readonly inputAnalyser: AnalyserNode
  readonly outputAnalyser: AnalyserNode
  private readonly source: MediaStreamAudioSourceNode
  private readonly gainNode: GainNode
  private readonly destination: MediaStreamAudioDestinationNode
  private readonly effect?: NeuralNode

  private constructor(
    private readonly context: AudioContext,
    source: MediaStreamAudioSourceNode,
    pre: AnalyserNode,
    post: AnalyserNode,
    gain: GainNode,
    destination: MediaStreamAudioDestinationNode,
    effect?: NeuralNode,
  ) {
    this.source = source
    this.inputAnalyser = pre
    this.outputAnalyser = post
    this.gainNode = gain
    this.destination = destination
    this.effect = effect
    const track = destination.stream.getAudioTracks()[0]
    if (!track) throw new Error("Falha ao criar saída de áudio processado.")
    this.output = track
  }

  static async create(
    context: AudioContext,
    sourceTrack: MediaStreamTrack,
    mode: VoiceNoiseMode,
    inputGainDb: number,
  ): Promise<VoicePipeline> {
    const source = context.createMediaStreamSource(new MediaStream([sourceTrack]))
    const pre = context.createAnalyser()
    const post = context.createAnalyser()
    pre.fftSize = post.fftSize = 1024
    const gain = context.createGain()
    gain.gain.value = dbToGain(inputGainDb)
    const destination = context.createMediaStreamDestination()
    let effect: NeuralNode | undefined
    try {
      if (isAdvancedNoise(mode)) effect = await neuralNode(context, mode)
      source.connect(pre)
      if (effect) {
        pre.connect(effect)
        effect.connect(gain)
      } else pre.connect(gain)
      // Não comprimir agressivamente a voz: isso causava bombeamento e som robótico.
      // O ganho digital permanece controlável; picos são sinalizados pelo medidor.
      gain.connect(post)
      post.connect(destination)
      // Never connect the microphone to speakers here: prevents feedback/echo.
      return new VoicePipeline(context, source, pre, post, gain, destination, effect)
    } catch (error) {
      effect?.destroy()
      effect?.disconnect()
      source.disconnect()
      pre.disconnect()
      post.disconnect()
      gain.disconnect()
      destination.disconnect()
      throw error
    }
  }

  setInputGain(db: number) {
    this.gainNode.gain.setTargetAtTime(dbToGain(db), this.context.currentTime, 0.025)
  }
  close() {
    this.source.disconnect()
    this.inputAnalyser.disconnect()
    this.effect?.destroy()
    this.effect?.disconnect()
    this.gainNode.disconnect()
    this.outputAnalyser.disconnect()
    this.destination.disconnect()
    this.output.stop()
  }
}

/** Structural implementation of LiveKit TrackProcessor<Audio>, kept separate from room lifecycle.
 * On unmute/device swap, LiveKit calls restart(), rebuilding against the new capture track.
 */
export class VoiceNoiseProcessor {
  readonly name = "otms-local-voice-dsp"
  processedTrack?: MediaStreamTrack
  private graph?: VoicePipeline
  private ownedContext?: AudioContext
  constructor(private mode: VoiceNoiseMode, private db: number) {}
  async init(options: { track: MediaStreamTrack; audioContext: AudioContext }) { await this.restart(options) }
  async restart(options: { track: MediaStreamTrack; audioContext: AudioContext }) {
    await this.destroy()
    // RNNoise trabalha em 48 kHz. Nem todo navegador cria o AudioContext do SDK
    // nessa frequência; nesse caso, usar um contexto dedicado com resampling nativo.
    let context = options.audioContext
    if (isAdvancedNoise(this.mode) && context.sampleRate !== 48000) {
      context = new AudioContext({sampleRate: 48000})
      this.ownedContext = context
      await context.resume()
    }
    try {
      this.graph = await VoicePipeline.create(context, options.track, this.mode, this.db)
      this.processedTrack = this.graph.output
    } catch (cause) {
      await this.destroy()
      throw cause
    }
  }
  setInputGain(db: number) { this.db = db; this.graph?.setInputGain(db) }
  readMeter() {
    if (!this.graph) return { rms: 0, peak: 0, clipping: false }
    const input = readMeter(this.graph.inputAnalyser)
    const output = readMeter(this.graph.outputAnalyser)
    return { rms: output.rms, peak: output.peak, clipping: input.clipping }
  }
  async destroy() {
    this.graph?.close()
    this.graph = undefined
    this.processedTrack = undefined
    if (this.ownedContext) {
      const owned = this.ownedContext
      this.ownedContext = undefined
      if (owned.state !== "closed") await owned.close().catch(() => undefined)
    }
  }
}

/** Meter that never routes its input to speakers; caller owns the track. */
export async function createInputMeter(track: MediaStreamTrack) {
  const context = new AudioContext()
  const source = context.createMediaStreamSource(new MediaStream([track]))
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  await context.resume()
  return {
    read: () => readMeter(analyser),
    close: async () => { source.disconnect(); analyser.disconnect(); await context.close() },
  }
}
