"use client"

import { useEffect, useState } from "react"

export function useCampaignPresence() {
  const [presence, setPresence] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    const source = new EventSource("/api/realtime/presence")
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data?.type === "presence:snapshot" && data.campaigns) setPresence(data.campaigns)
      } catch {}
    }
    return () => source.close()
  }, [])

  return presence
}
