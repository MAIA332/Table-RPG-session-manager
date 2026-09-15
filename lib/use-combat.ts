"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CombatCommand, CombatSnapshot } from "./combat-types"
export function useCombat(campaignId: string) {
  const [combat, setCombat] = useState<CombatSnapshot | null>(null)
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  )
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const current = useRef<CombatSnapshot | null>(null),
    busy = useRef(false),
    generation = useRef(0),
    clock = useRef(0)
  const accept = useCallback((value: CombatSnapshot) => {
    if (current.current && value.revision < current.current.revision) return
    if (
      current.current &&
      value.revision === current.current.revision &&
      value.serverNow < current.current.serverNow
    )
      return
    clock.current = value.serverNow - Date.now()
    current.current = value
    setCombat(value)
  }, [])
  const refresh = useCallback(async () => {
    const version = generation.current
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/combat`,
      { cache: "no-store" },
    )
    const body = await response.json()
    if (!response.ok)
      throw new Error(body.error || "Não foi possível carregar o combate")
    if (version === generation.current) accept(body.combat)
    return body.combat as CombatSnapshot
  }, [campaignId, accept])
  useEffect(() => {
    generation.current++
    let active = true
    current.current = null
    setCombat(null)
    setStatus("connecting")
    setError("")
    void refresh().catch((e) => {
      if (active) setError(e.message)
    })
    const source = new EventSource(
      `/api/campaigns/${encodeURIComponent(campaignId)}/combat/events`,
    )
    source.onopen = () => {
      if (active) setStatus("live")
    }
    source.onmessage = (e) => {
      try {
        const value = JSON.parse(e.data)
        if (active && value && Number.isSafeInteger(value.revision)) {
          accept(value)
          setError("")
        }
      } catch {}
    }
    source.onerror = () => {
      if (active) setStatus("reconnecting")
    }
    const onFocus = () => {
      void refresh().catch((e) => {
        if (active) setError(e.message)
      })
    }
    window.addEventListener("focus", onFocus)
    // A failed SSE connection still gets fresh state and deadline outcomes.
    const poll = window.setInterval(() => {
      if (source.readyState !== EventSource.OPEN) onFocus()
    }, 3000)
    return () => {
      active = false
      generation.current++
      source.close()
      clearInterval(poll)
      window.removeEventListener("focus", onFocus)
    }
  }, [campaignId, refresh, accept])
  const send = useCallback(
    async (command: Omit<CombatCommand, "commandId" | "expectedRevision">) => {
      if (busy.current)
        throw new Error("Aguarde a ação anterior ser confirmada")
      if (!current.current) throw new Error("O combate ainda está carregando")
      busy.current = true
      setPending(true)
      setError("")
      const version = generation.current
      const payload = {
        ...command,
        commandId: crypto.randomUUID(),
        expectedRevision: current.current.revision,
      }
      try {
        // Retry once with the SAME id only on transport failure. The server deduplicates the command.
        let response: Response
        try {
          response = await fetch(
            `/api/campaigns/${encodeURIComponent(campaignId)}/combat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          )
        } catch {
          response = await fetch(
            `/api/campaigns/${encodeURIComponent(campaignId)}/combat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          )
        }
        const body = await response.json()
        if (!response.ok) {
          if (response.status === 409) await refresh()
          throw new Error(body.error || "Ação não confirmada")
        }
        if (version === generation.current) accept(body.combat)
        return body.combat as CombatSnapshot
      } catch (e) {
        const message = e instanceof Error ? e.message : "Ação não confirmada"
        if (version === generation.current) setError(message)
        throw new Error(message)
      } finally {
        busy.current = false
        if (version === generation.current) setPending(false)
      }
    },
    [campaignId, accept, refresh],
  )
  return {
    combat,
    status,
    error,
    pending,
    send,
    refresh,
    serverOffset: clock.current,
  }
}
