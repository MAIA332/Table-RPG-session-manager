
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

    const connectionId = createConnectionId()

    const url =
      `/api/realtime/${campaignId}` +
      `?connectionId=${encodeURIComponent(connectionId)}`

    const source = new EventSource(url)

    let released = false

    const release = () => {
      if (released) return

      released = true

      source.close()

      void fetch(url, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {})
    }

    source.onopen = () => {
      if (released) return

      setStatus("live")
    }

    source.onmessage = (e) => {
      if (released) return

      try {
        const data = JSON.parse(e.data)

        if (
          data &&
          typeof data.type === "string" &&
          data.type !== "ready" &&
          data.type !== "combat:invalidate"
        ) {
          callback.current(data as RealtimeEvent)
        }
      } catch {
        // Ignora mensagens inválidas sem interromper o SSE.
      }
    }

    source.onerror = () => {
      if (released) return

      setStatus((current) =>
        current === "live"
          ? "reconnecting"
          : "connecting",
      )
    }

    window.addEventListener("pagehide", release)

    return () => {
      window.removeEventListener("pagehide", release)
      release()
    }
  }, [campaignId])

  return status
}
