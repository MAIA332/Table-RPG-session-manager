import { healthLabel } from "@/lib/combat-model"
export function CreatureVitals({
  current,
  max,
  mana = false,
}: {
  current: number
  max: number
  mana?: boolean
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0
  const label = mana
    ? ratio <= 0
      ? "Exaurido"
      : ratio < 0.3
        ? "Energia baixa"
        : "Energia presente"
    : healthLabel(current, max)
  return (
    <div className="min-w-24 flex-1 space-y-1">
      <span
        className={`text-xs font-semibold ${mana ? "text-violet-300" : "text-red-300"}`}
      >
        {label}
      </span>
      <div
        aria-hidden="true"
        className="h-2 overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          style={{ width: `${ratio * 100}%` }}
          className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${mana ? "bg-violet-400" : "bg-red-500"}`}
        />
      </div>
    </div>
  )
}
