"use client"

import { useEffect, useState } from "react"
import type { RealtimeEvent } from "./types"

// Conecta ao stream SSE da campanha e chama o callback a cada evento recebido.
export function useRealtime(
  campaignId: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting")

  useEffect(() => {
    if (!campaignId) return
    setStatus("connecting")
    const connectionId = crypto.randomUUID()
    const url = `/api/realtime/${campaignId}?connectionId=${encodeURIComponent(connectionId)}`
    const source = new EventSource(url)
    let released = false

    const release = () => {
      if (released) return
      released = true
      source.close()
      void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {})
    }

    source.onopen = () => setStatus("live")

    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data && typeof data.type === "string" && data.type !== "ready") {
          onEvent(data as RealtimeEvent)
        }
      } catch {
        // ignora mensagens malformadas
      }
    }

    source.onerror = () => {
      setStatus((current) => current === "live" ? "reconnecting" : "connecting")
    }

    window.addEventListener("pagehide", release)
    return () => {
      window.removeEventListener("pagehide", release)
      release()
    }
  }, [campaignId, onEvent])

  return status
}
