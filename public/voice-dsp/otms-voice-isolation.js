/* AudioWorklet: expander dinâmico de ruído residual pós-RNNoise.
 * Entrada 0: voz processada; entrada 1: microfone bruto (somente análise).
 * Abertura rápida, hold e release longos: protege consoantes finais e pausas
 * sem usar gates instantâneos que criam voz robótica.
 * Nenhum dado de áudio é enviado para fora da aba.
 */
class OtmsVoiceIsolationProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.strength = this.clamp(options.processorOptions?.strength ?? 65)
    this.envelope = 0
    this.rawEnvelope = 0
    this.open = 1
    this.hold = 0
    this.noiseFloor = 0.002
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'strength') this.strength = this.clamp(e.data.value)
    }
  }
  clamp(value) { return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 65 }
  process(inputs, outputs) {
    const clean = inputs[0]?.[0]
    const raw = inputs[1]?.[0]
    const out = outputs[0]?.[0]
    if (!out) return true
    if (!clean) { out.fill(0); return true }
    // Medição em janelas curtas: transientes de teclado deixam de abrir o gate
    // quando não existe voz sustentada após a supressão neural.
    let sum = 0, rawSum = 0
    for (let i=0; i<clean.length; i++) {
      sum += clean[i]*clean[i]
      if (raw) rawSum += raw[i]*raw[i]
    }
    const level = Math.sqrt(sum / Math.max(1, clean.length))
    const rawLevel = raw ? Math.sqrt(rawSum / Math.max(1, clean.length)) : level
    const time = clean.length / sampleRate
    // Filtros de detecção seguem a envoltória sem saltos abruptos de volume.
    const fast = 1 - Math.exp(-time / 0.022)
    this.envelope += (level - this.envelope)*fast
    this.rawEnvelope += (rawLevel - this.rawEnvelope)*fast
    const noiseAlpha = 1 - Math.exp(-time / 8)
    if (this.envelope < this.noiseFloor * 2.5) {
      this.noiseFloor += (this.envelope - this.noiseFloor) * noiseAlpha
    } else {
      this.noiseFloor += (this.envelope - this.noiseFloor) * noiseAlpha * 0.04
    }
    this.noiseFloor = Math.max(0.0004, Math.min(0.008, this.noiseFloor))
    const normalized = this.strength/100
    // Filtro neural tende a reduzir cliques mais que voz; o gate usa seu
    // resultado como referência, não os picos brutos do teclado.
    const threshold = Math.max(0.003, this.noiseFloor * (2.0 + normalized*2.2))
    // RNNoise costuma deixar o estalo de teclado muito menor que a entrada
    // bruta. Se a energia residual for apenas uma pequena fração da original,
    // não abrir a porta para o estalo isolado. Enquanto alguém está falando,
    // o hold prevalece para não apagar consoantes e respirações.
    const residualRatio = this.envelope / Math.max(0.0008, this.rawEnvelope)
    const keyboardLike = this.rawEnvelope > 0.016 && residualRatio < 0.14 && this.hold < 0.03
    const speech = this.envelope > threshold && !keyboardLike
    if (speech) this.hold = 0.30 + (1-normalized)*0.15
    else this.hold = Math.max(0, this.hold - time)
    // Piso NÃO-ZERO para preservar sussurros e bordas de palavras.
    const floor = Math.pow(0.05, normalized)
    const desired = speech || this.hold > 0 ? 1 : floor
    const tau = desired > this.open ? 0.008 : 0.30
    this.open += (desired - this.open)*(1 - Math.exp(-time/tau))
    // Pequeno processamento intra-bloco reduz descontinuidades dos frames.
    const endGain = this.open
    const startGain = this.lastGain ?? endGain
    const delta = (endGain - startGain)/Math.max(1, out.length)
    for (let i=0;i<out.length;i++) out[i]=(clean[i] || 0)*(startGain+delta*(i+1))
    this.lastGain=endGain
    return true
  }
}
registerProcessor('otms-voice-isolation', OtmsVoiceIsolationProcessor)
