"use client"

import { Minus, Plus } from "lucide-react"

interface Props {
  label: string
  short: string
  icon: React.ReactNode
  current: number
  max: number
  colorVar: string // ex: "--hp"
  editable: boolean
  onChange: (delta: number) => void
  step?: number
}

// Barra de recurso (HP/MP/IP) com botoes +/- e transicao suave para o realtime.
export function ResourceBar({
  label,
  short,
  icon,
  current,
  max,
  colorVar,
  editable,
  onChange,
  step = 1,
}: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium" style={{ color: `var(${colorVar})` }}>
          {icon}
          {label}
        </span>
        <span className="font-mono tabular-nums text-foreground">
          {current}
          <span className="text-muted-foreground"> / {max}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        {editable && (
          <StepBtn label={`Diminuir ${short}`} onClick={() => onChange(-step)}>
            <Minus className="size-3.5" />
          </StepBtn>
        )}

        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: `var(${colorVar})`,
              boxShadow: `0 0 12px var(${colorVar})`,
            }}
          />
        </div>

        {editable && (
          <StepBtn label={`Aumentar ${short}`} onClick={() => onChange(step)}>
            <Plus className="size-3.5" />
          </StepBtn>
        )}
      </div>
    </div>
  )
}

function StepBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </button>
  )
}
