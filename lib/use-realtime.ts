"use client"
import { useEffect, useRef, useState } from "react"
import type { RealtimeEvent } from "./types"
export function useRealtime(
  campaignId: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  const callback = useRef(onEvent)
  useEffect(() => {
    callback.current = onEvent
  }, [onEvent])
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  )
  useEffect(() => {
    if (!campaignId) return
    setStatus("connecting")
    const connectionId = crypto.randomUUID(),
      url = `/api/realtime/${campaignId}?connectionId=${encodeURIComponent(connectionId)}`
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
        if (
          data &&
          typeof data.type === "string" &&
          data.type !== "ready" &&
          data.type !== "combat:invalidate"
        )
          callback.current(data as RealtimeEvent)
      } catch {}
    }
    source.onerror = () =>
      setStatus((current) =>
        current === "live" ? "reconnecting" : "connecting",
      )
    window.addEventListener("pagehide", release)
    return () => {
      window.removeEventListener("pagehide", release)
      release()
    }
  }, [campaignId])
  return status
}
