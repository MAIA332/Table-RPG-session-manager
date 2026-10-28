"use client"

import { useEffect, useState } from "react"
import { Activity, Clock3 } from "lucide-react"
import { crisisModifierLabel, type CrisisPublicState } from "@/lib/crisis-model"

export function CrisisStatus({ crisis, names }: {
  crisis?: CrisisPublicState
  names: Record<string, string>
}) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  if (!crisis?.enabled) return null
  const entries = [
    ...Object.entries(crisis.players).map(([id, status]) => ({ id, status, type: "Personagem" })),
    ...Object.entries(crisis.creatures).map(([id, status]) => ({ id, status, type: "Criatura" })),
  ].filter(entry => entry.status.conditions.length > 0)

  return <section className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 sm:p-4" aria-label="Condições automáticas de desgaste">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-rose-200"><Activity className="size-4" /> Desgaste · situação de crise</h3><span className="text-[11px] text-rose-300">Gatilho: {crisis.thresholdPercent}% HP ou menos</span></div>
    {entries.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum combatente apresenta condições de crise ativas.</p> : <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(({ id, status, type }) => <div key={`${type}:${id}`} className="rounded-lg border border-rose-500/25 bg-background/65 p-2.5">
        <p className="mb-1 text-xs font-bold text-foreground">{names[id] || "Participante"} <span className="font-normal text-muted-foreground">· {type}</span></p>
        <div className="flex flex-wrap gap-1.5">{status.conditions.map(condition => <span key={condition.applicationId} title={condition.description} className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
          {condition.name}{crisisModifierLabel(condition) ? ` · ${crisisModifierLabel(condition)}` : ""}{condition.stage ? ` · estágio ${condition.stage}` : ""}
          {condition.nextTickAt && now > 0 && <span className="ml-1.5 inline-flex items-center gap-1 font-mono text-amber-200"><Clock3 className="size-3" />{Math.max(0, Math.ceil((condition.nextTickAt - now) / 1000))}s</span>}
        </span>)}</div>
      </div>)}
    </div>}
  </section>
}
  