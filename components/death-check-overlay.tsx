"use client"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { useCombat } from "@/lib/use-combat"
import { DEATH_TABLE } from "@/lib/death-model"
import { visibleDeathChecks } from "@/lib/death-overlay-model"

type Props = {
  controller: ReturnType<typeof useCombat>
  viewerId: string
  isGm: boolean
  campaignId: string
  characters?: ReadonlyArray<{ id: string; ownerId: string; resources?: { hp: number } }>
}

// showModal promotes the dialog to the browser top layer, outside page stacking contexts.
function DeathDialog({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])
  return createPortal(<>
    <style>{`
      dialog[data-death-modal] {
        position: fixed !important; inset: 0 !important; margin: auto !important;
        width: min(32rem, calc(100vw - 2rem)) !important;
        max-width: none !important; max-height: calc(100dvh - 2rem) !important;
        padding: 24px !important; overflow: auto !important;
        background: #09090b !important; color: #ffffff !important;
        border: 1px solid #b91c1c !important; border-radius: 16px !important;
        opacity: 1 !important; visibility: visible !important;
        transform: none !important; filter: none !important;
        pointer-events: auto !important; box-shadow: 0 24px 100px #000 !important;
      }
      dialog[data-death-modal]::backdrop { background: rgba(0,0,0,.82) !important; }
    `}</style>
    <dialog ref={ref} data-death-modal aria-labelledby="death-title"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onDismiss() }}
      onKeyDown={event => event.stopPropagation()}>
      {children}
    </dialog>
  </>, document.body)
}

// Remount the local acknowledgement state when the viewer or campaign changes.
export function DeathCheckOverlay(props: Props) {
  return <DeathCheckSession key={`${props.campaignId}:${props.viewerId}`} {...props} />
}

function DeathCheckSession({ controller, viewerId, isGm, campaignId, characters = [] }: Props) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(`death-dismissed:owner-v3:${campaignId}:${viewerId}`) || "[]")
      setDismissed(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string").slice(-300) : [])
    }
    catch { setDismissed([]) }
    setLoaded(true)
  }, [campaignId, viewerId])
  const hpSignature = JSON.stringify(characters
    .filter(character => isGm || character.ownerId === viewerId)
    .map(character => [character.id, character.resources?.hp])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  useEffect(() => {
    let active = true, busy = false
    const refresh = async () => {
      if (busy) return
      busy = true
      try { await controller.refresh(); if (active) setRefreshError("") }
      catch (e) { if (active) setRefreshError(e instanceof Error ? e.message : "Falha ao conferir os testes de morte") }
      finally { busy = false }
    }
    // Also covers HP changes from the sheet and other endpoints outside combat.
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh() }, 3000)
    const onVisible = () => { if (document.visibilityState === "visible") void refresh() }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [controller.refresh, hpSignature])
  const check = visibleDeathChecks(controller.combat, characters, viewerId, isGm)
    .find(entry => !dismissed.includes(entry.id))
  if (!loaded || typeof document === "undefined") return null
  if (!check) return refreshError ? createPortal(
    <p role="alert" className="fixed bottom-24 right-4 z-[11000] max-w-sm rounded bg-red-950 p-3 text-sm text-red-100">Teste de morte: {refreshError}</p>, document.body) : null
  const close = () => {
    const next = [...dismissed, check.id].slice(-300)
    setDismissed(next)
    try { sessionStorage.setItem(`death-dismissed:owner-v3:${campaignId}:${viewerId}`, JSON.stringify(next)) } catch {}
  }
  return <DeathDialog key={check.id} onDismiss={close}>
      <p className="text-xs uppercase tracking-widest text-red-300">0 HP · Teste de Vigor</p>
      <h2 id="death-title" className="mt-2 text-2xl font-bold">{check.characterName}: {check.label}</h2>
      <div className="my-5 flex justify-center gap-3" aria-label={`Três dados de MIG: ${check.rolls.join(', ')}`}>
        {check.rolls.map((roll, i) => <div key={i} className="rounded-lg border border-red-500/50 px-5 py-3 text-center"><strong className="block text-3xl">{roll}</strong><span className="text-xs text-zinc-400">{check.die}</span></div>)}
      </div>
      <p className="text-center text-xl font-bold">Total: {check.total}</p>
      <p className="my-4 text-zinc-300">{check.effect}</p>
      <table className="w-full text-left text-sm"><caption className="mb-2 text-left font-semibold">Tabela de morte — 3 dados de MIG</caption>
        <thead><tr><th className="py-2">Total</th><th>Resultado</th></tr></thead>
        <tbody>{DEATH_TABLE.map(row => <tr key={row.status} className={row.status === check.status ? "bg-red-900/40" : "border-t border-zinc-800"}><td className="p-2">{row.min}–{Number.isFinite(row.max) ? row.max : "mais"}</td><td className="p-2">{row.label}</td></tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-zinc-400">Uma rolagem por queda a 0 HP. O resultado foi salvo e registrado no histórico. Fechar este aviso afeta apenas a sua tela.</p>
      <button autoFocus className="mt-5 w-full rounded-lg bg-red-800 py-3 font-semibold" onClick={close}>Entendido</button>
  </DeathDialog>
}
