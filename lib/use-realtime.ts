"use client"

import { useEffect } from "react"
import type { RealtimeEvent } from "./types"

// Conecta ao stream SSE da campanha e chama o callback a cada evento recebido.
export function useRealtime(
  campaignId: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  useEffect(() => {
    if (!campaignId) return
    const source = new EventSource(`/api/realtime/${campaignId}`)

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
      // o navegador reconecta automaticamente
    }

    return () => source.close()
  }, [campaignId, onEvent])
}
