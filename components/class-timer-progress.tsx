"use client"

import { useEffect, useState } from "react"

/** Sem setTimeout de expiração: relógio absoluto, reidratação/reload segura. */
export function ClassTimerProgress({
  startedAt,
  endsAt,
  label,
  compact = false,
}: {
  startedAt: number
  endsAt: number
  label: string
  compact?: boolean
}) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [endsAt])
  if (!now || !Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return null
  const remaining = Math.max(0, endsAt - now)
  if (remaining === 0) return null
  const total = endsAt - startedAt
  const percentage = Math.max(0, Math.min(100, remaining / total * 100))
  const seconds = Math.ceil(remaining / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const time = h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
  return <div className={compact ? "mt-1 w-full space-y-1" : "mt-3 w-full space-y-1.5"}>
    <div className="flex justify-between gap-2 text-[11px] text-amber-200" aria-live="off">
      <span>{label}</span><span className="font-mono tabular-nums">{time}</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={label} aria-valuenow={Math.round(percentage)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-amber-400 transition-[width] duration-200" style={{ width: `${percentage}%` }} />
    </div>
  </div>
}
