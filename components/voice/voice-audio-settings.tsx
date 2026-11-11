"use client"
import { useEffect, useRef, useState } from "react"
import { AudioLines, LoaderCircle, Play, Square, AlertTriangle, Mic2 } from "lucide-react"
import {
  VoicePipeline, captureForProfile, safeInputGain, safeIsolation,
  type VoiceNoiseMode, type VoiceAudioProfile,
} from "@/lib/voice/audio-dsp"

export type VoiceAudioSettingsProps = {
  profile: VoiceAudioProfile
  deviceId: string
  devices: MediaDeviceInfo[]
  updateProfile: (patch: Partial<VoiceAudioProfile>) => void
  changeDevice: (device: string) => void
  inCall: boolean
  dspStatus: string
  level: number
  clipping: boolean
  localMicInfo: string
  sendStats: { lossPct?: number; jitterMs?: number; rttMs?: number; kbps?: number; concealed?: number }
  receiveStats: { lossPct?: number; jitterMs?: number; rttMs?: number; kbps?: number; concealed?: number }
  outputDeviceId: string
  outputDevices: MediaDeviceInfo[]
  changeOutputDevice: (id: string) => void
  duckMusic: boolean
  duckDepth: number
  updateDuck: (patch: { duckMusic?: boolean; duckDepth?: number }) => void
}

function blobRecorder(stream: MediaStream) {
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
    .find(type => MediaRecorder.isTypeSupported(type))
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Não foi possível gravar a prévia local."))
    recorder.onstop = () => resolve(new Blob(chunks, {type: recorder.mimeType || "audio/webm"}))
  })
  recorder.start()
  return {recorder, done}
}

export function VoiceAudioSettings({
  profile, deviceId, devices, updateProfile, changeDevice, inCall,
  dspStatus, level, clipping, localMicInfo, sendStats, receiveStats,
  outputDeviceId, outputDevices, changeOutputDevice, duckMusic, duckDepth, updateDuck,
}: VoiceAudioSettingsProps) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState("")
  const [rawUrl, setRawUrl] = useState("")
  const [cleanUrl, setCleanUrl] = useState("")
  const [gtcrnUrl, setGtcrnUrl] = useState("")
  const [compareBoth, setCompareBoth] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const urlsRef = useRef<string[]>([])
  const mountedRef = useRef(true)
  const resetRecordings = () => {
    urlsRef.current.forEach(URL.revokeObjectURL)
    urlsRef.current = []
    setRawUrl("")
    setCleanUrl("")
    setGtcrnUrl("")
  }
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopRef.current?.()
      urlsRef.current.forEach(URL.revokeObjectURL)
      urlsRef.current = []
    }
  }, [])

  const record = async () => {
    if (recording || inCall) return
    setError("")
    resetRecordings()
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let pipeline: VoicePipeline | null = null
    let comparisonPipeline: VoicePipeline | null = null
    let stopTimer: ReturnType<typeof setTimeout> | undefined
    let ended = false
    let raw: ReturnType<typeof blobRecorder> | undefined
    let cleaned: ReturnType<typeof blobRecorder> | undefined
    let gtcrn: ReturnType<typeof blobRecorder> | undefined
    setRecording(true)
    try {
      if (!window.isSecureContext) throw new Error("Prévia de microfone exige HTTPS ou localhost.")
      stream = await navigator.mediaDevices.getUserMedia({audio: {
        ...captureForProfile(profile),
        ...(deviceId ? {deviceId: {exact: deviceId}} : {}),
      }, video: false})
      if (!mountedRef.current) return
      context = new AudioContext({sampleRate: 48000})
      await context.resume()
      pipeline = await VoicePipeline.create(context, stream.getAudioTracks()[0], compareBoth ? "voice" : profile.noiseMode, profile.inputGainDb, profile.studio, profile.isolation)
      if (compareBoth) comparisonPipeline = await VoicePipeline.create(context, stream.getAudioTracks()[0], "gtcrn", profile.inputGainDb, profile.studio, profile.isolation)
      raw = blobRecorder(stream)
      cleaned = blobRecorder(new MediaStream([pipeline.output]))
      if (comparisonPipeline) gtcrn = blobRecorder(new MediaStream([comparisonPipeline.output]))
      const activeRaw = raw
      const activeClean = cleaned
      const activeGtcrn = gtcrn
      const finish = () => {
        if (ended) return
        ended = true
        if (activeRaw.recorder.state !== "inactive") activeRaw.recorder.stop()
        if (activeClean.recorder.state !== "inactive") activeClean.recorder.stop()
        if (activeGtcrn && activeGtcrn.recorder.state !== "inactive") activeGtcrn.recorder.stop()
      }
      stopRef.current = finish
      stopTimer = setTimeout(finish, 4500)
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (!ended) return
          clearInterval(check)
          resolve()
        }, 40)
      })
      const [rawBlob, cleanBlob, gtcrnBlob] = await Promise.all([raw.done, cleaned.done, gtcrn?.done ?? Promise.resolve(undefined)])
      if (mountedRef.current) {
        const a = URL.createObjectURL(rawBlob)
        const b = URL.createObjectURL(cleanBlob)
        const c = gtcrnBlob ? URL.createObjectURL(gtcrnBlob) : ""
        urlsRef.current = [a,b,...(c?[c]:[])]
        setRawUrl(a)
        setCleanUrl(b)
        setGtcrnUrl(c)
      }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Não foi possível preparar a prévia.")
    } finally {
      if (stopTimer) clearTimeout(stopTimer)
      stopRef.current?.()
      if (raw?.recorder.state === "recording") raw.recorder.stop()
      if (cleaned?.recorder.state === "recording") cleaned.recorder.stop()
      if (gtcrn?.recorder.state === "recording") gtcrn.recorder.stop()
      stopRef.current = null
      pipeline?.close()
      comparisonPipeline?.close()
      stream?.getTracks().forEach(t => t.stop())
      if (context && context.state !== "closed") await context.close().catch(() => undefined)
      if (mountedRef.current) setRecording(false)
    }
  }
  return <div className="space-y-4">
    <section className="otms-voice-setting-card space-y-2">
      <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">Qualidade do microfone</h4><span className="text-[10px] text-amber-300">Opus · mono · até 64 kbps</span></div>
      <label className="block">Dispositivo de entrada
        <select className="otms-voice-field mt-1 w-full px-2 py-2" value={deviceId} onChange={e => changeDevice(e.target.value)}>
          <option value="">Microfone padrão</option>
          {devices.filter(d => d.deviceId).map((d,i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${i+1}`}</option>)}
        </select>
      </label>
      <p className="text-[10px] text-muted-foreground">Cada microfone mantém seu próprio perfil. O medidor mostra a faixa realmente enviada ao LiveKit.</p>
      <p role="status" className="text-[10px] text-amber-200">{localMicInfo}</p>
      <div className="flex items-center justify-between"><span>Nível de entrada</span><span className={`text-[10px] ${clipping ? "text-red-400" : "text-muted-foreground"}`}>{clipping ? "PICO / CLIPPING" : `${Math.round(level*100)}%`}</span></div>
      <div className="otms-voice-meter-track" aria-label={`Nível de entrada ${Math.round(level*100)}%`} role="meter" aria-valuenow={Math.round(level*100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={clipping ? "otms-voice-meter-fill otms-voice-meter-clip" : "otms-voice-meter-fill"} style={{width: `${Math.min(100,Math.round(level*100))}%`}}/>
      </div>
      <label className="block">Ganho de entrada: <strong>{profile.inputGainDb > 0 ? "+" : ""}{profile.inputGainDb} dB</strong>
        <input aria-label="Ganho do microfone" className="mt-2 w-full accent-amber-500" type="range" min={-12} max={6} step={1} value={profile.inputGainDb}
          onChange={e => updateProfile({inputGainDb:safeInputGain(Number(e.target.value))})}/>
      </label>
      <p className="text-[10px] text-muted-foreground">O controle de ganho ajusta digitalmente a faixa processada. Em 0 dB não cria um grafo adicional. Se houver clipping na origem, diminua o ganho no Windows/macOS; aumentar o ganho não recupera voz baixa já distorcida.</p>
    </section>

    <section className="otms-voice-setting-card space-y-2">
      <h4 className="font-semibold">Supressão de ruído</h4>
      <p className="text-[10px] text-emerald-300">Padrão: Voz isolada (RNNoise + redução suave de transientes) · fallback automático para RNNoise e Nativa</p>
      <div className="grid grid-cols-2 gap-1.5">
        {([
          ["off", "Natural"], ["native", "Nativa"],
          ["voice", "Voz isolada"], ["rnnoise", "RNNoise"], ["gtcrn", "GTCRN · beta"],
        ] as [VoiceNoiseMode,string][]).map(([key,name]) => <button key={key} type="button" aria-pressed={profile.noiseMode===key}
          className={`otms-voice-profile-btn ${profile.noiseMode===key?"otms-voice-profile-active":""}`}
          onClick={()=>updateProfile({noiseMode:key})}>{name}</button>)}
      </div>
      <p className="text-[10px] text-muted-foreground">Voz isolada usa RNNoise em WebAssembly com expander suave para atenuar teclados entre falas. GTCRN permanece opcional, pois em alguns microfones deixa a voz artificial. Nada é enviado para processamento externo. O estado efetivo é mostrado abaixo.</p>
      <label className="block">Isolamento adicional: <strong>{profile.isolation}%</strong>
        <input aria-label="Intensidade do isolamento de teclado" type="range" min="0" max="100" step="5"
          className="mt-2 w-full accent-amber-500" value={profile.isolation} disabled={profile.noiseMode !== "voice"}
          onChange={e=>updateProfile({isolation:safeIsolation(Number(e.target.value))})}/>
      </label>
      <p className="text-[10px] text-muted-foreground">Mais isolamento reduz o teclado enquanto ninguém fala, mas pode atenuar sussurros. O filtro mantém uma cauda suave para preservar palavras. Teclado alto simultâneo à fala pode continuar audível; nenhum modelo garante separação perfeita de vozes e ruídos.</p>
      {dspStatus && <p className="text-[10px] text-amber-300 break-words" role="status">{dspStatus}</p>}
      <label className="flex items-center justify-between gap-2"><span>Masterização suave para narração (voz de podcast)</span>
        <input type="checkbox" className="size-4 accent-amber-500" checked={profile.studio} onChange={e => updateProfile({studio:e.target.checked})}/>
      </label>
      <p className="text-[10px] text-muted-foreground">Filtro de graves, presença vocal e compressão leve. Não é uma normalização agressiva; mantém a expressividade do narrador. Não melhora ruídos de um microfone defeituoso nem recupera pacotes perdidos.</p>
      <label className="flex items-center justify-between gap-2"><span>Cancelamento de eco</span><input type="checkbox" className="size-4 accent-amber-500" checked={profile.echo} onChange={e=>updateProfile({echo:e.target.checked})}/></label>
      <label className="flex items-center justify-between gap-2"><span>Ganho automático do navegador</span><input type="checkbox" className="size-4 accent-amber-500" checked={profile.gain} onChange={e=>updateProfile({gain:e.target.checked})}/></label>
      <p className="text-[10px] text-muted-foreground">O ganho automático é controlado pelo navegador e pode ser ignorado pelo dispositivo; o slider de dB acima é independente e aplicado no processamento digital.</p>
    </section>

    <section className="otms-voice-setting-card space-y-2">
      <h4 className="font-semibold">Áudio recebido · Saída e rede</h4>
      <label className="block">Fone/alto-falante
        <select className="otms-voice-field mt-1 w-full px-2 py-2" value={outputDeviceId} onChange={e=>changeOutputDevice(e.target.value)}>
          <option value="">Saída padrão do sistema</option>
          {outputDevices.filter(d => d.deviceId).map((d,i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Saída ${i+1}`}</option>)}
        </select>
      </label>
      <p className="text-[10px] text-muted-foreground">A seleção de saída depende do navegador. Prefira headset e evite caixas de som para reduzir eco.</p>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md border border-amber-700/20 p-2 space-y-1">
          <strong>Enviando</strong>
          <p>Bitrate: {sendStats.kbps === undefined ? "—" : `${sendStats.kbps} kbps`}</p>
          <p>Perda: {sendStats.lossPct === undefined ? "—" : `${sendStats.lossPct}%`}</p>
          <p>RTT: {sendStats.rttMs === undefined ? "—" : `${sendStats.rttMs} ms`}</p>
        </div>
        <div className="rounded-md border border-amber-700/20 p-2 space-y-1">
          <strong>Recebendo</strong>
          <p>Bitrate: {receiveStats.kbps === undefined ? "—" : `${receiveStats.kbps} kbps`}</p>
          <p>Perda: {receiveStats.lossPct === undefined ? "—" : `${receiveStats.lossPct}%`}</p>
          <p>Jitter: {receiveStats.jitterMs === undefined ? "—" : `${receiveStats.jitterMs} ms`}</p>
          <p>Reparos de áudio: {receiveStats.concealed === undefined ? "—" : receiveStats.concealed}</p>
        </div>
      </div>
      {(sendStats.lossPct !== undefined && sendStats.lossPct >= 3 ||
        receiveStats.lossPct !== undefined && receiveStats.lossPct >= 3 ||
        receiveStats.jitterMs !== undefined && receiveStats.jitterMs >= 30) &&
        <p role="alert" className="text-[10px] text-amber-300">Perda ou jitter elevados podem causar som robótico e palavras cortadas mesmo com filtros desligados. Verifique WebRTC/UDP 7882, rede e Wi-Fi antes de aumentar a supressão.</p>}
      <p className="text-[10px] text-muted-foreground">Dados reais das faixas WebRTC quando o navegador os fornece. Um traço (—) significa métrica indisponível, não qualidade perfeita.</p>
    </section>

    <section className="otms-voice-setting-card space-y-2">
      <h4 className="flex items-center gap-2 font-semibold"><Mic2 className="size-4"/> Prévia privada A/B</h4>
      <p className="text-[10px] text-muted-foreground">Grava 4,5 segundos localmente, sem enviar áudio ao servidor. Compare a captura do navegador com o sinal processado. Use fones de ouvido.</p>
      <label className="flex items-center justify-between gap-2 text-[11px]"><span>Comparar Voz isolada × GTCRN na mesma gravação</span>
        <input type="checkbox" className="size-4 accent-amber-500" disabled={recording || inCall} checked={compareBoth} onChange={e=>setCompareBoth(e.target.checked)}/>
      </label>
      <button className="otms-voice-action w-full" type="button" onClick={recording ? ()=>stopRef.current?.() : ()=>void record()} disabled={inCall}>
        {recording ? <><Square className="size-3.5"/> Parar gravação</> : <><Play className="size-3.5"/> Gravar prévia A/B</>}
      </button>
      {inCall && <p className="text-[10px] text-muted-foreground">Saia da chamada para comparar sem abrir o microfone duas vezes.</p>}
      {recording && <p className="flex items-center gap-2 text-[10px] text-amber-300"><LoaderCircle className="size-3 animate-spin"/> Gravando apenas neste dispositivo...</p>}
      {rawUrl && <label className="block space-y-1"><span>Captura do navegador</span><audio controls preload="metadata" src={rawUrl} className="h-8 w-full"/></label>}
      {cleanUrl && <label className="block space-y-1"><span>{compareBoth ? "Voz isolada (RNNoise + expander)" : `Processado (${profile.noiseMode})`}</span><audio controls preload="metadata" src={cleanUrl} className="h-8 w-full"/></label>}
      {gtcrnUrl && <label className="block space-y-1"><span>GTCRN</span><audio controls preload="metadata" src={gtcrnUrl} className="h-8 w-full"/></label>}
      {error && <p className="flex items-start gap-1 text-[10px] text-red-300"><AlertTriangle className="mt-0.5 size-3 shrink-0"/>{error}</p>}
    </section>

    <section className="otms-voice-setting-card space-y-2">
      <h4 className="flex items-center gap-2 font-semibold"><AudioLines className="size-4"/> Ambientação da mesa</h4>
      <label className="flex items-center justify-between gap-2"><span>Reduzir música quando alguém fala</span>
        <input type="checkbox" className="size-4 accent-amber-500" checked={duckMusic} onChange={e=>updateDuck({duckMusic:e.target.checked})}/>
      </label>
      <label className="block">Volume da música durante a fala: {Math.round(duckDepth*100)}%
        <input aria-label="Volume da música durante a fala" className="mt-2 w-full accent-amber-500" type="range" min="0" max="100" step="5" value={Math.round(duckDepth*100)} disabled={!duckMusic}
          onChange={e=>updateDuck({duckDepth:Number(e.target.value)/100})}/>
      </label>
      <p className="text-[10px] text-muted-foreground">0% praticamente silencia as músicas enquanto alguém fala; 100% mantém o volume original. Atua localmente nas músicas e faixas de ambientação do Soundpad. YouTube permite ajuste; o player incorporado do Spotify não oferece controle de volume por esta API.</p>
    </section>
  </div>
}
