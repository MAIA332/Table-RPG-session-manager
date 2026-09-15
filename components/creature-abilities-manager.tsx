"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AbilityEditor } from "./creature-combat-editor"
import {
  newAbility,
  validateCombat,
  defaultAttack,
  type Ability,
} from "@/lib/combat-model"
import type { CombatCreature } from "@/lib/combat-types"
import type { useCombat } from "@/lib/use-combat"
export function CreatureAbilitiesManager({
  creature,
  controller,
  onClose,
  onSaved,
}: {
  creature: CombatCreature
  controller: ReturnType<typeof useCombat>
  onClose: () => void
  onSaved?: () => void | Promise<void>
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [])
  useEffect(() => {
    if (mounted) panelRef.current?.focus()
  }, [mounted])
  const [abilities, setAbilities] = useState<Ability[]>(() =>
    structuredClone(creature.abilities || []),
  )
  const [saveForFuture, setSaveForFuture] = useState(true)
  const [error, setError] = useState("")
  const [focusId, setFocusId] = useState<string>()
  const btn =
    "rounded-lg border border-amber-300/30 px-4 py-2 font-semibold text-amber-100 disabled:opacity-40"
  const addQte = (legacy?: string) => {
    const id = crypto.randomUUID(),
      qte = newAbility("qte", id)
    if (qte.kind !== "qte") return
    setAbilities([
      ...abilities,
      {
        ...qte,
        name: legacy ? legacy.split(":")[0].slice(0, 150) : "Novo QTE",
        failureDamage: "",
        failureEffect: legacy || "",
      },
    ])
    setFocusId(id)
  }
  if (!mounted) return null
  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape" && !controller.pending) {
          e.preventDefault()
          onClose()
        }
        if (e.key === "Tab") {
          const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          )
          const visible = Array.from(nodes || []).filter(
            (el) => el.getClientRects().length,
          )
          const first = visible[0],
            last = visible[visible.length - 1]
          if (!first) {
            e.preventDefault()
            return
          }
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panelRef.current)
          ) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }}
      style={{ zIndex: 20000 }}
      className="fixed inset-0 overflow-y-auto bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Habilidades de ${creature.name}`}
    >
      <section className="mx-auto max-w-4xl space-y-5 rounded-2xl border border-amber-300/30 bg-zinc-950 p-6 text-white">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">
              Habilidades de {creature.name}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Configure ataques especiais, passivas e reações de área sem
              recriar a criatura.
            </p>
          </div>
          <button
            autoFocus
            className={btn}
            disabled={controller.pending}
            onClick={onClose}
          >
            Fechar
          </button>
        </header>
        <button
          className={`${btn} border-red-400 bg-red-950`}
          disabled={controller.pending}
          onClick={() => addQte()}
        >
          + Adicionar QTE
        </button>
        <fieldset disabled={controller.pending} className="min-w-0">
          <AbilityEditor
            value={abilities}
            onChange={setAbilities}
            focusId={focusId}
          />
        </fieldset>
        {!!creature.spells?.length && (
          <details className="rounded-xl border border-white/15 p-4">
            <summary className="cursor-pointer font-semibold">
              Poderes antigos em texto ({creature.spells.length})
            </summary>
            <p className="my-3 text-sm text-zinc-400">
              O texto é preservado. Ao transformar um poder em QTE, confirme o
              teste, o prazo e os danos antes de salvar.
            </p>
            {creature.spells.map((spell, i) => (
              <div className="mb-3 rounded-lg bg-zinc-900 p-3" key={i}>
                <p className="mb-3 whitespace-pre-wrap text-sm">{spell}</p>
                <button
                  className={btn}
                  disabled={controller.pending}
                  onClick={() => addQte(spell)}
                >
                  Criar QTE deste poder
                </button>
              </div>
            ))}
          </details>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={saveForFuture}
            onChange={(e) => setSaveForFuture(e.target.checked)}
            disabled={controller.pending}
          />
          <span>
            Salvar também no bestiário desta campanha para os próximos combates.
            A instância selecionada será atualizada agora; outras instâncias já
            em cena mantêm suas habilidades.
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-100">
            {error}
          </p>
        )}
        <footer className="flex justify-end gap-3">
          <button
            className={btn}
            disabled={controller.pending}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className={`${btn} bg-amber-300 text-zinc-950`}
            disabled={controller.pending}
            onClick={async () => {
              setError("")
              const issue = validateCombat(
                creature.basicAttacksV2?.length
                  ? creature.basicAttacksV2
                  : [defaultAttack()],
                abilities,
              )
              if (issue) {
                setError(issue)
                return
              }
              try {
                await controller.send({
                  type: "save-creature-abilities",
                  instanceId: creature.instanceId,
                  abilities,
                  saveForFuture,
                })
                try {
                  await onSaved?.()
                } catch {
                  /* The save is confirmed; catalogue reload can be retried on open. */
                }
                onClose()
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Não foi possível salvar",
                )
              }
            }}
          >
            {controller.pending ? "Salvando…" : "Salvar habilidades"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
