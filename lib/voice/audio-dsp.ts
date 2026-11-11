/** Processamento de voz 100% local: captura WebAudio -> WASM em AudioWorklet -> Opus do WebRTC.
 * Nenhum áudio bruto ou modelo é enviado a serviços de terceiros.
 */
export type VoiceNoiseMode = "off" | "native" | "rnnoise" | "gtcrn" | "voice"
export type VoiceAudioProfile = {
  noiseMode: VoiceNoiseMode
  echo: boolean
  gain: boolean
  inputGainDb: number
  studio: boolean
  isolation: number
}

export const VOICE_DSP_PATH = "/voice-dsp"
export const VOICE_PROFILE_DEFAULTS: VoiceAudioProfile = {
  noiseMode: "voice", echo: true, gain: false, inputGainDb: 0, studio: true, isolation: 65,
}

export const isAdvancedNoise = (mode: VoiceNoiseMode) => mode === "rnnoise" || mode === "gtcrn" || mode === "voice"
export const safeIsolation = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 65))
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
const isolationWorklets = new WeakSet<AudioContext>()
async function createIsolationNode(context: AudioContext, strength: number): Promise<AudioWorkletNode> {
  if (!isolationWorklets.has(context)) {
    await context.audioWorklet.addModule(`${VOICE_DSP_PATH}/otms-voice-isolation.js`)
    isolationWorklets.add(context)
  }
  return new AudioWorkletNode(context, "otms-voice-isolation", {
    numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1],
    processorOptions: { strength: safeIsolation(strength) },
  })
}


type NeuralMode = "rnnoise" | "gtcrn" | "voice"

async function neuralNode(
  context: AudioContext,
  mode: NeuralMode,
): Promise<NeuralNode> {
  await verifyVoiceDspAssets()

  if (!context.audioWorklet || typeof WebAssembly === "undefined") {
    throw new Error(
      "Seu navegador não oferece AudioWorklet/WebAssembly."
    )
  }

  // O modo "voice" utiliza RNNoise como motor neural.
  // A diferença está no processamento adicional de isolamento.
  const moduleKey: "rnnoise" | "gtcrn" =
    mode === "voice" ? "rnnoise" : mode

  const usesRnnoise = moduleKey === "rnnoise"

  if (usesRnnoise && context.sampleRate !== 48000) {
    throw new Error(
      "RNNoise exige AudioContext de 48 kHz; use o modo Nativo neste dispositivo."
    )
  }

  const {
    loadRnnoise,
    RnnoiseWorkletNode,
    loadGtcrn,
    GtcrnWorkletNode,
  } = await import("@sapphi-red/web-noise-suppressor")

  const loaded =
    worklets.get(context) ?? new Set<VoiceNoiseMode>()

  // Evita registrar o mesmo worklet duas vezes.
  if (!loaded.has(moduleKey)) {
    await context.audioWorklet.addModule(
      `${VOICE_DSP_PATH}/${moduleKey}-worklet.js`
    )

    loaded.add(moduleKey)
    worklets.set(context, loaded)
  }

  if (usesRnnoise) {
    const wasmBinary = await loadRnnoise({
      url: `${VOICE_DSP_PATH}/rnnoise.wasm`,
      simdUrl: `${VOICE_DSP_PATH}/rnnoise_simd.wasm`,
    })

    return new RnnoiseWorkletNode(context, {
      maxChannels: 1,
      wasmBinary,
    })
  }

  const wasmBinary = await loadGtcrn({
    url: `${VOICE_DSP_PATH}/gtcrn.wasm`,
  })

  return new GtcrnWorkletNode(context, {
    maxChannels: 1,
    wasmBinary,
  })
}


/** Narrator chain: conservative tonal shaping after denoising, not a broadcast loudness maximizer.
 * 70 Hz HPF removes low-frequency rumble; subtle warmth/presence; a single gentle
 * compressor avoids breath pumping and preserves speech dynamics.
 */
export class VoicePipeline {
  readonly output: MediaStreamTrack
  readonly inputAnalyser: AnalyserNode
  readonly outputAnalyser: AnalyserNode
  private readonly source: MediaStreamAudioSourceNode
  private readonly gainNode: GainNode
  private readonly destination: MediaStreamAudioDestinationNode
  private readonly effect?: NeuralNode
  private readonly isolationNode?: AudioWorkletNode
  private readonly stages: AudioNode[]
  private readonly context: AudioContext

  private constructor(context: AudioContext, source: MediaStreamAudioSourceNode,
    pre: AnalyserNode, post: AnalyserNode, gain: GainNode,
    destination: MediaStreamAudioDestinationNode, stages: AudioNode[], effect?: NeuralNode, isolationNode?: AudioWorkletNode) {
    this.context = context
    this.source = source
    this.inputAnalyser = pre
    this.outputAnalyser = post
    this.gainNode = gain
    this.destination = destination
    this.stages = stages
    this.effect = effect
    this.isolationNode = isolationNode
    const track = destination.stream.getAudioTracks()[0]
    if (!track) throw new Error("Falha ao criar saída de áudio processado.")
    this.output = track
  }

  static async create(context: AudioContext, sourceTrack: MediaStreamTrack,
    mode: VoiceNoiseMode, inputGainDb: number, studio = true, isolation = 65): Promise<VoicePipeline> {
    const source = context.createMediaStreamSource(new MediaStream([sourceTrack]))
    const pre = context.createAnalyser()
    const post = context.createAnalyser()
    pre.fftSize = post.fftSize = 1024
    const gain = context.createGain()
    gain.gain.value = dbToGain(inputGainDb)
    const destination = context.createMediaStreamDestination()
    let effect: NeuralNode | undefined
    let isolationNode: AudioWorkletNode | undefined
    const stages: AudioNode[] = []
    try {
      if (isAdvancedNoise(mode)) effect = await neuralNode(context, mode)
      source.connect(pre)
      let tail: AudioNode = pre
      if (effect) {
        // Neural denoisers can erase weak final syllables, breaths and whispers.
        // A small dry path preserves intelligibility without disabling GTCRN.
        // GTCRN works in six 128-sample blocks; its worklet emits the first
        // processed block after five buffered blocks. Align dry speech near
        // that frame boundary before mixing.
        tail.connect(effect)
        if (mode === "voice") {
          // RNNoise removes broadband/typing noise; a soft, non-zero-floor
          // expander attenuates residual keystrokes between voice phrases.
          isolationNode = await createIsolationNode(context, isolation)
          effect.connect(isolationNode, 0, 0)
          pre.connect(isolationNode, 0, 1)
          stages.push(isolationNode)
          tail = isolationNode
        } else if (mode === "gtcrn") {
          const dryDelay = context.createDelay(0.08)
          dryDelay.delayTime.value = 5 * 128 / context.sampleRate
          const dry = context.createGain()
          dry.gain.value = 0.16
          const wet = context.createGain()
          wet.gain.value = 0.84
          const merged = context.createGain()
          pre.connect(dryDelay)
          dryDelay.connect(dry)
          dry.connect(merged)
          effect.connect(wet)
          wet.connect(merged)
          stages.push(dryDelay, dry, wet, merged)
          tail = merged
        } else {
          tail = effect
        }
      }
      const addFilter = (type: BiquadFilterType, freq: number, db = 0, q = 0.7) => {
        const node = context.createBiquadFilter()
        node.type = type
        node.frequency.value = freq
        node.gain.value = db
        node.Q.value = q
        tail.connect(node)
        tail = node
        stages.push(node)
      }
      if (studio) {
        addFilter("highpass", 72, 0, 0.707)
        addFilter("lowshelf", 155, 0.9)
        addFilter("peaking", 340, -1.4, 0.8)
        addFilter("peaking", 2750, 1.4, 0.85)
        addFilter("highshelf", 6800, 0.7)
        const compressor = context.createDynamicsCompressor()
        compressor.threshold.value = -18
        compressor.knee.value = 18
        compressor.ratio.value = 1.8
        compressor.attack.value = 0.012
        compressor.release.value = 0.24
        tail.connect(compressor)
        tail = compressor
        stages.push(compressor)
      }
      tail.connect(gain)
      gain.connect(post)
      post.connect(destination)
      // Never connect microphone to speakers (feedback/echo).
      return new VoicePipeline(context, source, pre, post, gain, destination, stages, effect, isolationNode)
    } catch (error) {
      effect?.destroy()
      effect?.disconnect()
      source.disconnect()
      pre.disconnect()
      post.disconnect()
      gain.disconnect()
      stages.forEach(node => node.disconnect())
      destination.disconnect()
      throw error
    }
  }

  setIsolation(strength: number) {
    this.isolationNode?.port.postMessage({ type: "strength", value: safeIsolation(strength) })
  }
  getState() { return this.context.state }
  async resume() {
    if (this.context.state !== "running" && this.context.state !== "closed") await this.context.resume()
    return this.context.state === "running"
  }
  getHealth() {
    return { state: this.context.state,
      raw: readMeter(this.inputAnalyser), processed: readMeter(this.outputAnalyser) }
  }
  setInputGain(db: number) {
    this.gainNode.gain.setTargetAtTime(dbToGain(db), this.context.currentTime, 0.035)
  }
  close() {
    this.source.disconnect()
    this.inputAnalyser.disconnect()
    this.effect?.destroy()
    this.effect?.disconnect()
    this.stages.forEach(node => node.disconnect())
    this.gainNode.disconnect()
    this.outputAnalyser.disconnect()
    this.destination.disconnect()
    this.output.stop()
  }
}

/** LiveKit TrackProcessor: never uses a server-side DSP service. */
export class VoiceNoiseProcessor {
  readonly name = "otms-local-voice-dsp"
  processedTrack?: MediaStreamTrack
  private graph?: VoicePipeline
  private ownedContext?: AudioContext
  constructor(private mode: VoiceNoiseMode, private db: number, private studio = true, private isolation = 65) {}
  async init(options: { track: MediaStreamTrack; audioContext: AudioContext }) { await this.restart(options) }
  async restart(options: { track: MediaStreamTrack; audioContext: AudioContext }) {
    await this.destroy()
    let context = options.audioContext
    if (context.state === "closed" || (isAdvancedNoise(this.mode) && context.sampleRate !== 48000)) {
      context = new AudioContext({sampleRate: 48000})
      this.ownedContext = context
    }
    try {
      this.graph = await VoicePipeline.create(context, options.track, this.mode, this.db, this.studio, this.isolation)
      this.processedTrack = this.graph.output
      // Do not await resume indefinitely: browsers may require a new user gesture.
      void this.graph.resume().catch(() => undefined)
    } catch (cause) {
      await this.destroy()
      throw cause
    }
  }
  setInputGain(db: number) { this.db = db; this.graph?.setInputGain(db) }
  setIsolation(value: number) { this.isolation = safeIsolation(value); this.graph?.setIsolation(this.isolation) }
  health() { return this.graph?.getHealth() }
  resume() { return this.graph?.resume() ?? Promise.resolve(false) }
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
