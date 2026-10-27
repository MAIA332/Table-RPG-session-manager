"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import type { MonsterAttributeRoll } from "@/lib/monster-dice"
import type { MonsterCheckRoll } from "@/lib/monster-checks"

/** Números intermediários são animação; o resultado real sempre vem do servidor. */
export function MonsterAttributeRollOverlay({ roll }: {
  roll: MonsterAttributeRoll | MonsterCheckRoll | null
}) {
  const [face, setFace] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (!roll) return
    setFinished(false)
    setFace(null)
    const dice = "dice" in roll ? roll.dice : [roll.die]
    const sizes = dice.length ? dice.map(die => Number(die.slice(1)) || 6) : [20]
    const interval = window.setInterval(() => {
      setFace(sizes.reduce((sum, sides) => sum + Math.floor(Math.random() * sides) + 1, 0))
    }, 75)
    const settle = window.setTimeout(() => {
      window.clearInterval(interval)
      setFace(roll.result)
      setFinished(true)
    }, 1150)
    return () => { window.clearInterval(interval); window.clearTimeout(settle) }
  }, [roll?.id])

  if (typeof document === "undefined") return null
  const isCheck = roll != null && "checkName" in roll
  const dice = roll ? ("dice" in roll ? roll.dice : [roll.die]) : []
  const label = roll ? ("checkName" in roll ? roll.checkName : roll.attribute.toUpperCase()) : ""
  const breakdown = roll && "breakdown" in roll && roll.breakdown
    ? roll.breakdown
    : roll && "rolls" in roll && roll.rolls.length ? roll.rolls.join(" + ") : null

  return createPortal(
    <AnimatePresence>
      {roll && (
        <motion.div key={roll.id}
          initial={{ opacity: 0, y: -25, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ duration: 0.23 }}
          className="pointer-events-none fixed inset-x-0 top-[10vh] z-[10005] flex justify-center px-4"
          role="status" aria-live="polite"
        >
          <div className="flex max-w-[95vw] flex-col items-center rounded-2xl border border-amber-400/60 bg-zinc-950/95 px-8 py-5 text-amber-100 shadow-[0_0_70px_rgba(217,119,6,0.2)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
              {isCheck ? "Teste de criatura" : "Rolagem de criatura"}
            </p>
            <h3 className="mt-1 max-w-sm truncate font-serif text-lg font-bold">{roll.creatureName}</h3>
            <motion.div
              animate={finished ? { rotate: 0, scale: 1.12 } : { rotate: [0, -8, 9, -5, 0] }}
              transition={finished ? { duration: 0.2 } : { repeat: Infinity, duration: 0.43 }}
              className="my-5 grid size-28 place-content-center rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-950/80 to-zinc-900 text-center shadow-[0_0_35px_rgba(251,191,36,0.2)]"
            >
              <span aria-hidden="true" className="text-5xl font-black tabular-nums">{face ?? "?"}</span>
              {dice.length > 0 && <span className="max-w-24 break-words text-[10px] font-bold text-amber-300">{dice.join(" + ")}</span>}
            </motion.div>
            <p className="max-w-sm text-center font-bold tracking-widest">{label}</p>
            {finished && <>
              {breakdown && <p className="mt-2 text-sm text-amber-200">Dados: {breakdown}</p>}
              <p className="mt-1 text-lg font-bold">Resultado: {roll.result}</p>
            </>}
            <p className="mt-1 text-[10px] text-zinc-400">
              {roll.shared ? "Compartilhada com os jogadores" : "Somente o Mestre"}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>, document.body,
  )
}
