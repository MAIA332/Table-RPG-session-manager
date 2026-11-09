"use client"

import { useEffect, useMemo, useState } from "react"
import { advanceSkillModifiers, skillRuntime, type SkillModifier } from "@/lib/class-skill-effects"
import { Sparkles, AlertTriangle } from "lucide-react"

function useSkillClock(modifiers: SkillModifier[]) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!modifiers.some(mod => ["class_skill_duration", "class_skill_cooldown", "class_skill_aftermath"].includes(mod.type || "") && typeof mod.expiresAt === "number")) return
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [modifiers])
  return now
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const seconds = total % 60
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`
}

function SkillTimeBar({ entry, label, tone, now }: {
  entry: SkillModifier; label: string; tone: "active" | "cooldown" | "aftermath"; now: number
}) {
  if (typeof entry.expiresAt !== "number") return (
    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <span>{label}</span><span className="font-semibold text-foreground/80">{tone === "active" ? "Até encerrar" : "Permanente"}</span>
    </div>
  )
  const remaining = Math.max(0, entry.expiresAt - now)
  if (remaining === 0) return null
  const duration = Number(entry.durationMs || entry.expiresAt - Number(entry.startedAt || now))
  const percent = duration > 0 ? Math.max(0, Math.min(100, remaining / duration * 100)) : 0
  const color = tone === "cooldown" ? "bg-amber-400/80" : tone === "aftermath" ? "bg-rose-400/80" : "bg-sky-400/80"
  return (
    <div className="space-y-1" title={label}>
      <div className="flex items-center justify-between gap-2 text-[10px] leading-tight">
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-foreground/90">{formatTime(remaining)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar"
        aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${color} transition-[width] duration-500 ease-linear`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/** Sempre aparece imediatamente abaixo da habilidade, até com a descrição recolhida. */
export function ClassSkillInline({ modifiers, skillId }: { modifiers: SkillModifier[]; skillId: string }) {
  const entries = useMemo(() => modifiers.filter(mod => mod.skillId === skillId), [modifiers, skillId])
  const now = useSkillClock(entries)
  const state = skillRuntime(entries, skillId, now)
  if (!state.duration && !state.cooldown && !state.aftermath.length) return null
  return (
    <div className="space-y-2 border-t border-primary/10 bg-background/40 px-3 py-2.5" aria-label="Temporizadores da habilidade">
      {state.duration && <SkillTimeBar entry={state.duration} label="Habilidade ativa" tone="active" now={now} />}
      {state.cooldown && <SkillTimeBar entry={state.cooldown} label="Recarga da habilidade" tone="cooldown" now={now} />}
      {state.aftermath.map(mod => <SkillTimeBar key={mod.id} entry={mod} label={`Revés: ${mod.name || "Condição"}`} tone="aftermath" now={now} />)}
    </div>
  )
}

/** Etiquetas discretas junto aos status da ficha, também fora do combate. */
export function ClassSkillSummary({ modifiers }: { modifiers: SkillModifier[] }) {
  const now = useSkillClock(modifiers)
  const active = advanceSkillModifiers(modifiers, now).filter(mod =>
    mod.type === "class_skill_duration" || mod.type === "class_skill_aftermath")
  if (!active.length) return null
  // Apenas o indicador da habilidade ativa recebe respiro antes do retrato.
  const hasActiveSkill = active.some(mod => mod.type === "class_skill_duration")
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${hasActiveSkill ? "mb-5 sm:mb-6" : ""}`} aria-label="Resumo de habilidades ativas">
      {active.map(mod => (
        <span key={mod.id} title={`${mod.name || "Habilidade"}${mod.expiresAt ? ` · ${formatTime(mod.expiresAt - now)}` : " · permanente"}`}
          className={`inline-flex max-w-[190px] items-center gap-1 border text-[10px] font-medium ${mod.type === "class_skill_aftermath"
            ? "rounded-full border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-rose-300"
            : "rounded-none border-zinc-700 bg-black px-2.5 py-1.5 leading-none text-zinc-200 shadow-none"}`}>
          {mod.type === "class_skill_aftermath" ? <AlertTriangle className="size-2.5 shrink-0" /> : <Sparkles className="size-2.5 shrink-0" />}
          <span className="truncate">{mod.name || "Habilidade"}</span>
          {typeof mod.expiresAt === "number" && <span className="shrink-0 font-mono tabular-nums opacity-75">{formatTime(mod.expiresAt - now)}</span>}
        </span>
      ))}
    </div>
  )
}
