"use client"

import { useEffect, useRef } from "react"

/**
 * Reconciliacao de emergencia para lacunas temporarias do SSE.
 * A rota de campanha ja realiza autorizacao e filtra dados por permissao;
 * este hook nao introduz outra rota ou expõe informações novas.
 *
 * Atenção: se a rota GET também ler um cache por worker, o resultado poderá
 * ficar desatualizado; Redis/barramento distribuído é necessario para SSE
 * realmente instantâneo em multiplas instancias.
 */
export function useCampaignRecovery<T extends { id: string; updatedAt?: unknown }>(
  campaignId: string,
  onCharacters: (characters: T[]) => void,
  intervalMs = 4500,
): void {
  const callback = useRef(onCharacters)
  useEffect(() => { callback.current = onCharacters }, [onCharacters])

  useEffect(() => {
    if (!campaignId) return
    let active = true
    let inFlight = false
    let request: AbortController | null = null
    const load = async () => {
      if (!active || inFlight || document.visibilityState !== "visible") return
      inFlight = true
      const controller = new AbortController()
      request = controller
      try {
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })
        if (!response.ok) return
        const body: unknown = await response.json()
        if (!active || !body || typeof body !== "object" || !Array.isArray((body as any).characters)) return
        const records = (body as any).characters.filter(
          (c: unknown) => c && typeof c === "object" && typeof (c as any).id === "string",
        ) as T[]
        callback.current(records)
      } catch (error) {
        if (active && !controller.signal.aborted) console.warn("[realtime-recovery] Sem resposta da campanha", error)
      } finally {
        if (request === controller) request = null
        inFlight = false
      }
    }
    const onFocus = () => { void load() }
    const onVisibility = () => { if (document.visibilityState === "visible") void load() }
    const poll = window.setInterval(() => { void load() }, Math.max(3000, intervalMs))
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    // Executar apos a montagem; SSE continua primario para atualizacoes instantaneas.
    void load()
    return () => {
      active = false
      request?.abort()
      window.clearInterval(poll)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [campaignId, intervalMs])
}
