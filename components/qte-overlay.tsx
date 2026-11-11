"use client"
import { useEffect, useState } from "react"
import type { QteState } from "@/lib/qte-model"
import { QTE_CHECKS } from "@/lib/combat-checks"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { useController } from "@/components/controller/controller-provider"
// onReact sends intent; the parent/authority rolls and applies HP exactly once.
export function QteOverlay({
  qte,
  playerId,
  characterName,
  onReact,
  serverOffset = 0,
}: {
  qte: QteState | null
  characterName?: string
  playerId: string
  serverOffset?: number
  onReact: (qteId: string, playerId: string) => void | Promise<void>
}) {
  const [now, setNow] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    setSending(false)
    setError("")
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [qte?.id, playerId])
  const {active: controllerActive} = useController()
  const eligible = !!qte && qte.targets.includes(playerId) && !qte.outcomes[playerId]
    && Date.now() + serverOffset < qte.deadline && !sending
  const reactNow = async () => {
    if (!qte || sending || Date.now() + serverOffset >= qte.deadline || qte.outcomes[playerId]) return
    setSending(true)
    try { await onReact(qte.id, playerId) }
    catch { setError('Não foi possível enviar a reação. Tente novamente.'); setSending(false) }
  }
  useControllerActions({
    'ui.confirm': () => { if (!eligible) return true; void reactNow(); return true },
    'qte.react': () => { if (!eligible) return true; void reactNow(); return true },
    'ui.back': () => true,
  }, {enabled: controllerActive && !!qte && qte.targets.includes(playerId), priority: 1100, captureAll:true})
  if (!qte || !qte.targets.includes(playerId)) return null
  const outcome = qte.outcomes[playerId]
  const remaining = Math.max(
    0,
    Math.ceil((qte.deadline - (now + serverOffset)) / 1000),
  )
  const check = QTE_CHECKS.find((c) => c.id === qte.ability.checkId)
  return (
    <section
      data-controller-layer={controllerActive ? "active" : undefined}
      aria-label="Reação rápida"
      className="fixed inset-x-3 bottom-3 z-[10001] mx-auto max-w-lg rounded-2xl border-2 border-red-400 bg-red-950 p-6 text-center text-white shadow-[0_0_80px_rgba(239,68,68,0.45)]"
    >
      {characterName && (
        <p className="mb-2 font-bold text-red-200">{characterName}</p>
      )}
      <h2 className="text-xl font-bold" role="alert">
        {qte.ability.name}
      </h2>
      {outcome ? (
        <p role="status" className="mt-3">
          {outcome.total === null
            ? "Tempo esgotado"
            : outcome.success
              ? "Reação bem-sucedida"
              : "Falha na reação"}
          : {outcome.damage} de dano. {outcome.effect}
        </p>
      ) : (
        <>
          <p
            aria-hidden="true"
            className="my-3 text-5xl font-black tabular-nums"
          >
            {remaining}s
          </p>
          <p className="sr-only">
            Reaja em até {qte.ability.seconds} segundos.
          </p>
          <button
            type="button"
            autoFocus
            disabled={!remaining || sending}
            className="w-full rounded-xl bg-red-500 px-5 py-4 text-lg font-black motion-safe:animate-pulse disabled:animate-none disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-white"
            onClick={() => void reactNow()}
          >
            {sending
              ? "Reação enviada"
              : !remaining
                ? "Tempo esgotado"
                : `${check?.name || "Teste"} para reagir!`}
          </button>
          {controllerActive && <p className="mt-2 text-sm">Pressione A no controle para reagir</p>}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  )
}
