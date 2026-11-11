
"use client"

import { useEffect, useRef, useState } from "react"
import type { RealtimeEvent } from "./types"

/**
 * Gera um UUID v4 compatível com navegadores que não
 * disponibilizam crypto.randomUUID(), inclusive em HTTP.
 *
 * Utiliza crypto.getRandomValues() como fallback seguro.
 */
function createConnectionId(): string {
  const cryptoAPI = globalThis.crypto

  if (typeof cryptoAPI?.randomUUID === "function") {
    return cryptoAPI.randomUUID()
  }

  if (typeof cryptoAPI?.getRandomValues !== "function") {
    throw new Error(
      "O navegador não suporta a geração segura de identificadores.",
    )
  }

  const bytes = new Uint8Array(16)
  cryptoAPI.getRandomValues(bytes)

  // UUID versão 4
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40

  // Variante RFC 4122
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-")
}

export function useRealtime(
  campaignId: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  const callback = useRef(onEvent)

  useEffect(() => {
    callback.current = onEvent
  }, [onEvent])

  const [status, setStatus] = useState<
    "connecting" | "live" | "reconnecting"
  >("connecting")

  useEffect(() => {
    if (!campaignId) return

    setStatus("connecting")

    // Um EventSource é reconectado automaticamente pelo navegador, mas após
    // restauração de uma página pelo BFCache a conexão anterior pode ter sido
    // finalizada por pagehide. Reabrimos com um novo connectionId.
    let stream: EventSource | null = null
    let currentUrl = ''
    let disposed = false

    const connect = () => {
      if (disposed || stream) return
      const connectionId = createConnectionId()
      currentUrl = `/api/realtime/${encodeURIComponent(campaignId)}` +
        `?connectionId=${encodeURIComponent(connectionId)}`
      const next = new EventSource(currentUrl)
      stream = next
      setStatus('connecting')
      next.onopen = () => { if (!disposed && stream === next) setStatus('live') }
      next.onmessage = (event) => {
        if (disposed || stream !== next) return
        try {
          const data = JSON.parse(event.data)
          if (data && typeof data.type === 'string' &&
              data.type !== 'ready' && data.type !== 'combat:invalidate') {
            callback.current(data as RealtimeEvent)
          }
        } catch { /* evento malformado não derruba SSE */ }
      }
      next.onerror = () => {
        if (disposed || stream !== next) return
        setStatus(current => current === 'live' ? 'reconnecting' : 'connecting')
      }
    }
    const disconnect = () => {
      if (!stream) return
      stream.close()
      stream = null
      // DELETE libera a presença antiga no servidor, até em navegação normal.
      void fetch(currentUrl, {method: 'DELETE', keepalive: true}).catch(() => {})
    }
    const onPageHide = () => disconnect()
    const onPageShow = () => connect()
    const onOnline = () => {
      if (!stream || stream.readyState === EventSource.CLOSED) {
        disconnect(); connect()
      }
    }
    connect()
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    return () => {
      disposed = true
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      disconnect()
    }
  }, [campaignId])

  return status
}
