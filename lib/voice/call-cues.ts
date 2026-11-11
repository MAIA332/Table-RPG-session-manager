"use client"

/**
 * Sons da interface da chamada. Não passam pelo Soundpad, microfone ou redução
 * de volume da trilha da campanha: são efeitos locais e não são publicados.
 *
 * O repositório do RPG contém atualmente extensões .MP3 em maiúsculas.
 * O fallback .mp3 evita 404 em instalações que as renomearam.
 */
export type CallCue = "connected" | "disconnected"

const CUE_PATHS: Record<CallCue, readonly string[]> = {
  connected: ["/sounds/connected.MP3", "/sounds/connected.mp3"],
  disconnected: ["/sounds/disconnected.MP3", "/sounds/disconnected.mp3"],
}

const CUE_VOLUME = 0.75

export class CallCuePlayer {
  private context: AudioContext | null = null
  private buffers = new Map<CallCue, AudioBuffer>()
  private loads = new Map<CallCue, Promise<AudioBuffer | null>>()
  private current: AudioBufferSourceNode | null = null
  private fallbackAudio: HTMLAudioElement | null = null
  private generation = 0

  /** Chamar diretamente no gesto de Entrar: libera áudio mesmo após fetch/token. */
  unlock(): void {
    if (typeof window === "undefined") return
    try {
      if (!this.context && typeof window.AudioContext === "function") {
        this.context = new window.AudioContext()
      }
      if (this.context?.state === "suspended") {
        void this.context.resume().catch(() => undefined)
      }
      // Pré-carrega os dois efeitos para não atrasar a confirmação da chamada.
      if (this.context) {
        void this.load("connected")
        void this.load("disconnected")
      }
    } catch (error) {
      console.debug("[Mesa de Voz] Áudio de interface indisponível:", error)
    }
  }

  play(cue: CallCue): void {
    const generation = ++this.generation
    try { this.current?.stop() } catch { /* o som já acabou */ }
    this.current = null
    if (this.fallbackAudio) {
      this.fallbackAudio.pause()
      this.fallbackAudio = null
    }
    if (!this.context) this.unlock()
    void this.playAsync(cue, generation)
  }

  private async load(cue: CallCue): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(cue)
    if (cached) return cached
    const inflight = this.loads.get(cue)
    if (inflight) return inflight
    const context = this.context
    if (!context) return null
    const promise = (async () => {
      for (const path of CUE_PATHS[cue]) {
        try {
          const response = await fetch(path, { cache: "force-cache" })
          if (!response.ok) continue
          const buffer = await context.decodeAudioData(await response.arrayBuffer())
          this.buffers.set(cue, buffer)
          return buffer
        } catch { /* arquivo não existe ou não pode ser decodificado */ }
      }
      console.warn(`[Mesa de Voz] Efeito ${cue} não encontrado em /public/sounds.`)
      return null
    })()
    this.loads.set(cue, promise)
    try { return await promise }
    finally { this.loads.delete(cue) }
  }

  private async playAsync(cue: CallCue, generation: number): Promise<void> {
    const context = this.context
    if (context) {
      const buffer = await this.load(cue)
      if (generation !== this.generation) return
      if (buffer) {
        try {
          if (context.state === "suspended") await context.resume()
          if (generation !== this.generation) return
          if (context.state === "running") {
            const source = context.createBufferSource()
            const gain = context.createGain()
            source.buffer = buffer
            gain.gain.value = CUE_VOLUME
            source.connect(gain)
            gain.connect(context.destination)
            source.onended = () => {
              if (this.current === source) this.current = null
              source.disconnect()
              gain.disconnect()
            }
            this.current = source
            source.start()
            return
          }
        } catch (error) {
          console.debug("[Mesa de Voz] Falha ao tocar efeito pelo Web Audio:", error)
        }
      }
    }
    if (generation === this.generation) await this.playFallback(cue, generation)
  }

  /** Para navegadores sem Web Audio ou com reprodução suspensa. */
  private async playFallback(cue: CallCue, generation: number): Promise<void> {
    if (typeof Audio === "undefined") return
    for (const path of CUE_PATHS[cue]) {
      if (generation !== this.generation) return
      const audio = new Audio(path)
      audio.volume = CUE_VOLUME
      audio.preload = "auto"
      this.fallbackAudio = audio
      try {
        await audio.play()
        return
      } catch { /* tentar nome alternativo com extensão minúscula */ }
      if (this.fallbackAudio === audio) this.fallbackAudio = null
    }
    console.debug(`[Mesa de Voz] O navegador bloqueou a reprodução do efeito ${cue}.`)
  }
}
