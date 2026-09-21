"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { PendingMonsterAttack } from "@/lib/combat-types"

export function MonsterAttackOverlay({ attack, characterName, onAnswer }: {
  attack: PendingMonsterAttack
  characterName: string
  onAnswer: (choice: "react" | "pass") => Promise<void>
}) {
  const initialAttack = useRef(attack).current
  const [ready, setReady] = useState(false)
  const [faces, setFaces] = useState(attack.rolls)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const locked = useRef(false)
  const reactButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const interval = window.setInterval(() => {
      setFaces(initialAttack.dice.map(die => {
        const size = Number(die.replace(/^d/i, "")) || 6
        return Math.floor(Math.random() * size) + 1
      }))
    }, 80)
    const timer = window.setTimeout(() => {
      clearInterval(interval)
      setFaces(initialAttack.rolls)
      setReady(true)
    }, 4400)
    return () => { clearInterval(interval); clearTimeout(timer); previous?.focus() }
  }, [initialAttack])
  useEffect(() => { if (ready) reactButton.current?.focus() }, [ready])
  const answer = async (choice: "react" | "pass") => {
    if (!ready || locked.current) return
    locked.current = true
    setBusy(true)
    setError("")
    try { await onAnswer(choice) }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível confirmar. Tente novamente.") }
    finally { locked.current = false; setBusy(false) }
  }
  if (typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="monster-attack-title"
        aria-describedby="monster-attack-description"
        onKeyDown={event => {
          if (event.key === "Escape") { event.stopPropagation(); return }
          if (event.key !== "Tab") return
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
          if (!buttons.length) { event.preventDefault(); return }
          const first = buttons[0], last = buttons[buttons.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }}
        className="w-full max-w-md rounded-2xl border border-amber-500/50 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
        <p className="mb-2 text-xs uppercase tracking-widest text-amber-400">{characterName} · Ataque inimigo</p>
        <h2 id="monster-attack-title" className="font-serif text-2xl font-bold">
          {ready ? `${attack.creatureName} acertou!` : `${attack.creatureName} está atacando…`}
        </h2>
        <p className="mt-2 text-zinc-400">{attack.attackName}</p>
        <div className="my-6 flex justify-center gap-4" aria-hidden="true">
          {faces.map((face, index) => (
            <div key={index} className={`grid h-20 w-20 place-content-center rounded-xl border border-amber-400/60 bg-amber-500/10 text-center ${ready ? "" : "animate-pulse"}`}>
              <span className="text-3xl font-bold text-amber-300">{face}</span>
              <span className="text-xs text-zinc-400">{attack.dice[index]}</span>
            </div>
          ))}
        </div>
        <div id="monster-attack-description" aria-live="polite">
          {ready ? <><p className="text-center text-xl font-bold">Acerto: {attack.total}</p>
            <p className="mt-4 text-sm text-zinc-300">Reaja com Reflexos (DEX + INS). Um resultado de {attack.total} ou mais evita todo o dano. Se falhar ou deixar passar, você recebe o golpe.</p></>
            : <p className="text-center text-zinc-400">Rolando os dados de acerto…</p>}
        </div>
        {ready && <div className="mt-6 flex gap-3">
          <button ref={reactButton} disabled={busy} onClick={() => void answer("react")}
            className="flex-1 rounded-lg bg-amber-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50">Reagir</button>
          <button disabled={busy} onClick={() => void answer("pass")}
            className="flex-1 rounded-lg border border-zinc-600 px-4 py-3 disabled:opacity-50">Deixar passar</button>
        </div>}
        {busy && <p role="status" className="mt-4 text-sm text-amber-300">Confirmando sua decisão…</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      </div>
    </div>, document.body)
}
