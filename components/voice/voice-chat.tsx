"use client"
import { useCallback, useEffect, useRef, useState, type FormEvent, type ClipboardEvent as ReactClipboardEvent } from "react"
import { FileUp, ImageIcon, LoaderCircle, Send, Download, MessageSquareText } from "lucide-react"
import { VOICE_FILE_MAX_BYTES, type VoiceChatMessage, type VoiceChatPage } from "@/lib/voice/types"

type Props = { campaignId: string; active: boolean; meId: string; canModerate: boolean; onUnreadChange?: (value: number) => void }

const urlFor = (campaignId: string, id: string) =>
  `/api/campaigns/${encodeURIComponent(campaignId)}/voice/chat/attachments/${encodeURIComponent(id)}`

/** Redimensiona imagens grandes antes do upload. A compressão gzip/base64 final é no servidor. */
async function prepareFile(file: File): Promise<{ name: string; mime: string; dataBase64: string }> {
  let blob: Blob = file
  let mime = file.type || "application/octet-stream"
  if (file.size > VOICE_FILE_MAX_BYTES && !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new Error("O arquivo deve ter até 2 MiB; imagens podem ser reduzidas antes do envio.")
  }
  let name = file.name || "arquivo"
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const factor = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(bitmap.width * factor))
        canvas.height = Math.max(1, Math.round(bitmap.height * factor))
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        const optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78))
        if (optimized && optimized.size < blob.size) {
          blob = optimized
          mime = "image/webp"
          name = name.replace(/\.[^.]+$/, "") + ".webp"
        }
        // Capturas de tela maiores que 2 MiB continuam sendo aceitas se a
        // redução preservar uma versão compatível com o limite do servidor.
        if (blob.size > VOICE_FILE_MAX_BYTES) {
          const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
          canvas.width = Math.max(1, Math.round(bitmap.width * scale))
          canvas.height = Math.max(1, Math.round(bitmap.height * scale))
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          const compact = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.62))
          if (compact && compact.size < blob.size) {
            blob = compact
            mime = "image/webp"
            name = name.replace(/\.[^.]+$/, "") + ".webp"
          }
        }
      } finally { bitmap.close() }
    } catch { /* Envia a imagem original se o decoder/canvas não estiver disponível. */ }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!bytes.length || bytes.length > VOICE_FILE_MAX_BYTES) throw new Error("Arquivo vazio ou maior que 2 MiB.")
  // Btoa por blocos evita overflow em arquivos de 2 MiB.
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 0x4000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x4000)))
  }
  return { name, mime, dataBase64: btoa(chunks.join("")) }
}

function mergeMessages(previous: VoiceChatMessage[], incoming: VoiceChatMessage[]) {
  const map = new Map(previous.map(m => [m.id, m]))
  for (const m of incoming) map.set(m.id, m)
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(-250)
}

export function VoiceChat({ campaignId, active, meId, canModerate, onUnreadChange }: Props) {
  const [messages, setMessages] = useState<VoiceChatMessage[]>([])
  const [before, setBefore] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState("")
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState("")
  const [unread, setUnread] = useState(0)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const fetchBusy = useRef(false)
  const newestId = useRef("")
  const historyInitialized = useRef(false)

  const load = useCallback(async (older = false) => {
    if (fetchBusy.current) return
    fetchBusy.current = true
    if (older) setFetching(true)
    try {
      const query = older && before ? `?before=${encodeURIComponent(before)}` : ""
      if (older && !before) return
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/chat${query}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Não foi possível atualizar o chat.")
      const page = (await response.json()) as VoiceChatPage
      if (older) {
        setMessages(current => mergeMessages(current, page.messages))
        setBefore(page.nextCursor)
      } else {
        const latest = page.messages.at(-1)?.id || ""
        if (loadedRef.current && latest && latest !== newestId.current && !activeRef.current) {
          setUnread(current => current + page.messages.filter(m => m.id > newestId.current).length)
        }
        newestId.current = latest || newestId.current
        loadedRef.current = true
        setMessages(current => {
          if (!page.messages.length) return []
          const oldest = page.messages[0].id
          const ids = new Set(page.messages.map(m => m.id))
          return mergeMessages(current.filter(m => m.id < oldest || ids.has(m.id)), page.messages)
        })
        if (!historyInitialized.current) { setBefore(page.nextCursor); historyInitialized.current = true }
      }
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na rede.")
    } finally { fetchBusy.current = false; setFetching(false) }
  }, [campaignId, before])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, active ? 5500 : 15000)
    const changed = () => { void load() }
    const online = () => { void load() }
    window.addEventListener("otms.voice.chat-update", changed)
    window.addEventListener("online", online)
    return () => { clearInterval(timer); window.removeEventListener("otms.voice.chat-update", changed); window.removeEventListener("online", online) }
  }, [load, active])

  useEffect(() => {
    if (active) {
      setUnread(0)
      window.setTimeout(() => chatBottomRef.current?.scrollIntoView({ block: "end" }), 40)
    }
  }, [active])
  useEffect(() => { onUnreadChange?.(unread) }, [unread, onUnreadChange])
  useEffect(() => {
    if (active) chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, active])

  const pasteImage = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    // Preserve ordinary Ctrl+V text, URLs and keyboard shortcuts.
    const files = [
      ...Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => !!file),
      ...Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/")),
    ]
    const image = files[0]
    if (!image) return
    event.preventDefault()
    if (sending) return
    const supported = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(image.type)
    if (!supported) { setError("Cole uma imagem PNG, JPG, WebP ou GIF."); return }
    if (image.size > 30 * 1024 * 1024) { setError("Imagem muito grande para processar (máximo 30 MiB antes da redução)."); return }
    const suffix = ({"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif"} as Record<string,string>)[image.type]
    const name = image.name && !/^image\.(?:png|jpe?g|webp|gif)$/i.test(image.name)
      ? image.name : `imagem-colada-${new Date().toISOString().replace(/[:.]/g,"-")}.${suffix}`
    setAttachment(new File([image], name, {type: image.type, lastModified: Date.now()}))
    setError("")
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (sending || (!text.trim() && !attachment)) return
    setSending(true)
    setError("")
    try {
      const prepared = attachment ? await prepareFile(attachment) : null
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), attachment: prepared }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Falha ao enviar.")
      setMessages(current => mergeMessages(current, [body.message as VoiceChatMessage]))
      newestId.current = body.message.id
      setText("")
      setAttachment(null)
      void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao enviar.")
    } finally { setSending(false) }
  }

  const removeMessage = async (id: string) => {
    if (!window.confirm("Excluir esta mensagem e seu anexo permanentemente?")) return
    setDeleting(id)
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/voice/chat/${encodeURIComponent(id)}`, {method: "DELETE"})
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir.")
      setMessages(current => current.filter(message => message.id !== id))
      void load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao excluir.") }
    finally { setDeleting("") }
  }

  return <section className="otms-voice-chat flex min-h-0 flex-1 flex-col" aria-label="Chat da chamada">
    <div className="otms-voice-messages min-h-[120px] flex-1 space-y-3 overflow-y-auto px-1 py-3" role="log" aria-label="Mensagens de voz" aria-live="polite">
      {before && <button type="button" className="otms-voice-link mx-auto block" onClick={() => void load(true)} disabled={fetching}>
        {fetching ? "Carregando..." : "Carregar mensagens anteriores"}
      </button>}
      {!messages.length && <div className="py-10 text-center text-xs text-muted-foreground"><MessageSquareText className="mx-auto mb-2 size-7 opacity-60"/>Comece a conversa da mesa.</div>}
      {messages.map(message => <article key={message.id} className={`otms-voice-msg ${message.userId === meId ? "otms-voice-msg-own" : ""}`}>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <strong className="max-w-[75%] truncate text-xs">{message.userId === meId ? "Você" : message.userName}</strong>
          <time className="shrink-0 text-[10px] text-muted-foreground" dateTime={new Date(message.createdAt).toISOString()}>
            {new Date(message.createdAt).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}
          </time>
        </div>
        {message.text && <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{message.text}</p>}
        {message.attachment && <div className="mt-2">
          {message.attachment.kind === "image" ?
            <a href={urlFor(campaignId, message.attachment.id)} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Abrir imagem ${message.attachment.name}`}>
              {/* Imagens locais autenticadas; não são URLs externas. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFor(campaignId, message.attachment.id)} alt={message.attachment.name} loading="lazy" className="max-h-48 w-auto max-w-full rounded-md border border-amber-600/20 object-contain"/>
            </a> : null}
          <a className="otms-voice-link mt-1 inline-flex max-w-full items-center gap-1.5 truncate" href={urlFor(campaignId, message.attachment.id)} download={message.attachment.name}>
            <Download className="size-3 shrink-0"/> {message.attachment.name} ({Math.round(message.attachment.originalSize / 1024)} KB)
          </a>
        </div>}
        {(message.userId === meId || canModerate) && <button type="button" className="otms-voice-link mt-1 opacity-75" disabled={deleting === message.id} onClick={() => void removeMessage(message.id)}>Excluir</button>}
      </article>)}
      <div ref={chatBottomRef}/>
    </div>
    <form onSubmit={send} className="shrink-0 border-t border-amber-600/20 pt-3">
      {attachment && <div className="mb-2 flex items-center justify-between gap-2 rounded bg-amber-900/15 px-2 py-1.5 text-[11px]">
        <span className="min-w-0 truncate">{attachment.name}</span>
        <button className="otms-voice-link shrink-0" type="button" onClick={() => setAttachment(null)}>Remover</button>
      </div>}
      <label className="sr-only" htmlFor="otms-voice-message">Mensagem da chamada</label>
      <textarea id="otms-voice-message" value={text} onChange={e => setText(e.target.value.slice(0, 2000))} onPaste={pasteImage}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
        className="otms-voice-field w-full resize-none px-2.5 py-2 text-xs" rows={2} maxLength={2000}
        placeholder="Mensagem para a mesa... (Ctrl+V cola imagens · Enter envia)" />
      <div className="mt-2 flex items-center gap-2">
        <label className="otms-voice-action cursor-pointer" title="Anexar imagem ou arquivo até 2 MiB">
          <FileUp className="size-4"/><ImageIcon className="size-3"/>
          <input className="sr-only" type="file" onChange={event => {
            const file = event.target.files?.[0] || null
            const resizable = file && ["image/png", "image/jpeg", "image/webp"].includes(file.type)
            if (file && file.size > VOICE_FILE_MAX_BYTES && !(resizable && file.size <= 30 * 1024 * 1024)) {
              setError("Arquivo maior que o limite. Imagens de até 30 MiB podem ser reduzidas antes do envio.")
            } else { setAttachment(file); setError("") }
            event.target.value = ""
          }} />
        </label>
        <span className="flex-1 text-[10px] text-muted-foreground">Ctrl+V para imagens · até 2 MiB após otimização</span>
        <button className="otms-voice-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs" type="submit" disabled={sending || (!text.trim() && !attachment)}>
          {sending ? <LoaderCircle className="size-3.5 animate-spin"/> : <Send className="size-3.5"/>} Enviar
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  </section>
}
