"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Activity, ArrowRight, Check, Clock3, Dumbbell, LockKeyhole, ShieldAlert, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/client"
import { ClassTimerProgress } from "./class-timer-progress"
import type { Character } from "@/lib/types"
import {
  TRAINING_ATTRIBUTES, TRAINING_OPTIONS,
  nextAttributeDie, normalizeTraining, trainingGoal, type TrainingAttribute, type TrainingHours, type TrainingState,
} from "@/lib/training-model"

const LABELS: Record<TrainingAttribute, string> = { mig: "MIG", wlp: "WLP", dex: "DEX", ins: "INS" }
type TrainedCharacter = Character & { training?: TrainingState }

function TrainingRadar({ state, large = false, selected }: {
  state: TrainingState
  large?: boolean
  selected?: TrainingAttribute
}) {
  const center = 160
  const radius = 105
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + index * Math.PI / 2
    return [center + radius * scale * Math.cos(angle), center + radius * scale * Math.sin(angle)] as const
  }
  const pathAt = (scale: number) => TRAINING_ATTRIBUTES.map((_, index) => point(index, scale).join(",")).join(" ")
  const vertices = TRAINING_ATTRIBUTES.map((key, index) => point(index, Math.min(1, state.points[key] / trainingGoal(state, key))).join(",")).join(" ")
  const labels = [
    { x: 160, y: 31, anchor: "middle" as const },
    { x: 294, y: 164, anchor: "middle" as const },
    { x: 160, y: 299, anchor: "middle" as const },
    { x: 26, y: 164, anchor: "middle" as const },
  ]

  return (
    <svg viewBox="0 0 320 320" className={`mx-auto w-full text-primary ${large ? "max-w-[490px]" : "max-w-[218px]"}`} role="img" aria-label={`Radar de treinamento: ${TRAINING_ATTRIBUTES.map(key => `${LABELS[key]} ${state.points[key]} de ${trainingGoal(state, key)}`).join(", ")}`}>
      <defs>
        <radialGradient id={large ? "training-radar-hero-fill" : "training-radar-small-fill"}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.05" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.33" />
        </radialGradient>
      </defs>
      <circle cx={center} cy={center} r="116" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="1 7" />
      {[0.2, 0.4, 0.6, 0.8, 1].map(scale =>
        <polygon key={scale} points={pathAt(scale)} fill="none" stroke="currentColor" strokeOpacity={scale === 1 ? 0.42 : 0.19} strokeWidth={scale === 1 ? 1.4 : 0.8} />)}
      {TRAINING_ATTRIBUTES.map((key, index) => {
        const [x, y] = point(index, 1)
        return <line key={key} x1={center} y1={center} x2={x} y2={y} stroke="currentColor" strokeOpacity={key === selected ? 0.7 : 0.23} strokeDasharray="3 5" />
      })}
      <polygon points={vertices} fill={`url(#${large ? "training-radar-hero-fill" : "training-radar-small-fill"})`} stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {TRAINING_ATTRIBUTES.map((key, index) => {
        const [x, y] = point(index, Math.min(1, state.points[key] / trainingGoal(state, key)))
        return <g key={key}><circle cx={x} cy={y} r={selected === key ? 7 : 4.5} fill="currentColor" stroke="#15100c" strokeWidth="2" />
          {selected === key && <circle cx={x} cy={y} r="12" fill="none" stroke="currentColor" strokeOpacity=".48" strokeWidth="1" />}</g>
      })}
      {TRAINING_ATTRIBUTES.map((key, index) => <g key={key}>
        <text x={labels[index].x} y={labels[index].y} textAnchor={labels[index].anchor} fontSize={large ? 12 : 14} fontWeight="800" letterSpacing="1.8" fill="currentColor">{LABELS[key]}</text>
        {large && <text x={labels[index].x} y={labels[index].y + 13} textAnchor="middle" fontSize="9" fill="#a1a1aa">{state.points[key].toLocaleString("pt-BR")} / {trainingGoal(state, key)}</text>}
      </g>)}
      <circle cx={center} cy={center} r="3" fill="currentColor" />
      <text x="166" y="152" fontSize="9" fill="#8b8173">0</text>
    </svg>
  )
}

/** Contador visível mesmo com a ficha recolhida. */
export function TrainingCompactBar({ character }: { character: TrainedCharacter }) {
  const state = normalizeTraining(character.training)
  const active = state.active
  const fatigue = state.fatigue
  if (!active && !fatigue) return null
  return (
    <div className="w-full space-y-1.5">
      {active && <ClassTimerProgress compact label={`Treinando ${LABELS[active.attribute]}`} startedAt={active.startedAt} endsAt={active.endsAt} />}
      {fatigue && <ClassTimerProgress compact label={`Cansado · DEX -${fatigue.dexPenalty}`} startedAt={fatigue.startedAt} endsAt={fatigue.endsAt} />}
    </div>
  )
}

export function CharacterTraining({ character, isGm, isOwner, onUpdated }: {
  character: TrainedCharacter
  isGm: boolean
  isOwner: boolean
  onUpdated: (character: Character) => void
}) {
  const [open, setOpen] = useState(false)
  const [attribute, setAttribute] = useState<TrainingAttribute>("mig")
  const [hours, setHours] = useState<TrainingHours>(12)
  const [gmAmount, setGmAmount] = useState(0.5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(0)
  const syncRef = useRef(false)
  const dialogRef = useRef<HTMLElement | null>(null)
  const state = normalizeTraining(character.training)
  const active = state.active
  const completedInBackground = Boolean(active && now && now >= active.endsAt)
  const pendingUpgrade = TRAINING_ATTRIBUTES.filter(key => state.points[key] >= trainingGoal(state, key) && nextAttributeDie(character.attributes[key]))

  async function sync() {
    if (syncRef.current) return
    syncRef.current = true
    try {
      const response = await apiFetch<{ character: Character }>(`/api/characters/${encodeURIComponent(character.id)}/training`, { cache: "no-store" })
      if (response.character) onUpdated(response.character)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar treinamento.")
    } finally { syncRef.current = false }
  }

  useEffect(() => {
    setNow(Date.now())
    if (isOwner || isGm) void sync()
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => window.clearInterval(interval)
  }, [character.id, isOwner, isGm])

  useEffect(() => {
    if (!active) return
    if ((isOwner || isGm) && now >= active.endsAt) void sync()
  }, [now, active?.endsAt, isOwner, isGm])

  // Modal própria em tela cheia: ESC, foco inicial e trava do scroll da página.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement as HTMLElement | null
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return }
      if (event.key !== "Tab" || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [href], [tabindex="0"]'))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", handleKeyboard)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyboard)
      previouslyFocused?.focus()
    }
  }, [open])

  async function execute(action: "start" | "finish" | "award" | "upgrade", data: Record<string, unknown> = {}) {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const response = await apiFetch<{ character: Character }>(`/api/characters/${encodeURIComponent(character.id)}/training`, {
        method: "POST", body: JSON.stringify({ action, ...data }),
      })
      onUpdated(response.character)
      if (action === "start") setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao processar treinamento.")
    } finally { setBusy(false) }
  }

  const canTrain = (isOwner || isGm) && !active && !completedInBackground && !(state.fatigue && state.fatigue.endsAt > now)
  const selectedOption = TRAINING_OPTIONS[hours]
  const selectedGoal = trainingGoal(state, attribute)
  const selectedProgress = Math.min(100, Math.round(state.points[attribute] / selectedGoal * 100))
  const selectedProjected = Math.min(selectedGoal, state.points[attribute] + selectedOption.points)
  const totalPoints = TRAINING_ATTRIBUTES.reduce((total, key) => total + state.points[key], 0)
  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="fixed inset-0 z-[11000] h-[100dvh] w-screen overflow-hidden bg-[#090909] text-foreground" style={{ backgroundImage: "radial-gradient(ellipse 70% 45% at 50% 38%, rgba(150,103,33,.1), transparent 76%), linear-gradient(rgba(214,172,104,.026) 1px,transparent 1px),linear-gradient(90deg,rgba(214,172,104,.026) 1px,transparent 1px)", backgroundSize: "auto, 36px 36px, 36px 36px" }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Central de treinamento" className="relative flex h-full min-h-0 w-full flex-col outline-none">
        <header className="relative z-20 shrink-0 border-b border-primary/20 bg-[#0c0b09]/95 px-4 py-3 shadow-[0_1px_25px_rgba(0,0,0,.5)] sm:px-8 lg:px-12 lg:py-4">
          <div className="mx-auto flex w-full max-w-[1520px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="grid size-11 shrink-0 place-items-center border border-primary/50 bg-primary/10 text-primary sm:size-12"><Dumbbell className="size-6" /></div>
              <div className="min-w-0">
                <p className="hidden text-[9px] font-black uppercase tracking-[.33em] text-primary/65 sm:block">Morte Mágica <span className="mx-2 text-muted-foreground/50">/</span> Sistema de evolução</p>
                <h2 className="truncate font-serif text-lg font-black tracking-wide text-foreground sm:text-2xl lg:text-3xl">Central de Treinamento</h2>
              </div>
            </div>
            <div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/75 md:flex"><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Protocolo de evolução <span className="font-mono text-muted-foreground/60">01/02</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar central de treinamento" className="grid size-10 shrink-0 place-items-center rounded-sm border border-border/70 bg-background/75 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X className="size-5" /></button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-color:rgba(170,128,68,.5)_transparent] sm:px-8 sm:py-7 lg:px-12 lg:py-8">
          <div className="mx-auto grid w-full max-w-[1520px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,.85fr)] lg:gap-7 xl:gap-9">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3 border-l-2 border-primary/70 pl-4">
                <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-primary/65">01 · Análise de personagem</p><h3 className="mt-1 font-serif text-xl font-bold sm:text-2xl">Seu potencial em treinamento</h3><p className="mt-1 text-xs text-muted-foreground">Distribuição individual dos quatro atributos.</p></div>
                <span className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 font-mono text-xs tracking-widest text-primary">DADOS / <span className="text-foreground">04</span></span>
              </div>

              <div className="relative overflow-hidden rounded-sm border border-primary/25 bg-[#110f0c]/90 shadow-[inset_0_0_80px_rgba(0,0,0,.5)]">
                <div className="pointer-events-none absolute left-4 top-4 size-5 border-l border-t border-primary/45" /><div className="pointer-events-none absolute bottom-4 right-4 size-5 border-b border-r border-primary/45" />
                <div className="flex items-center justify-between border-b border-primary/10 px-5 py-3 text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground"><span>Radar de proficiência</span><span className="font-mono text-primary/70">ATUALIZAÇÃO · TEMPO REAL</span></div>
                <div className="grid grid-cols-1 items-center gap-1 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:px-6 sm:py-5 xl:grid-cols-[minmax(0,1fr)_205px]">
                  <div className="mx-auto w-full max-w-[480px]"><TrainingRadar state={state} large selected={attribute} /></div>
                  <div className="grid grid-cols-2 gap-2 border-t border-primary/10 pt-3 sm:grid-cols-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <div className="sm:pb-4"><p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Pontos acumulados</p><strong className="font-serif text-2xl font-black text-primary sm:text-3xl">{totalPoints.toLocaleString("pt-BR")}</strong><span className="ml-1 text-[10px] text-muted-foreground">PT</span></div>
                    <div className="sm:border-t sm:border-primary/10 sm:pt-4"><p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Atributo selecionado</p><strong className="font-serif text-2xl font-black text-foreground sm:text-3xl">{LABELS[attribute]}</strong><span className="ml-2 font-mono text-[11px] text-primary">{character.attributes[attribute]}</span></div>
                    <div className="col-span-2 sm:col-span-1 sm:border-t sm:border-primary/10 sm:pt-4"><p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Progresso atual</p><strong className="font-serif text-2xl font-black text-primary sm:text-3xl">{selectedProgress}<span className="text-base">%</span></strong><p className="text-[10px] text-muted-foreground">Meta de {selectedGoal} pontos · nível {state.upgrades[attribute] + 1}</p></div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-[11px] font-black uppercase tracking-[.18em] text-primary">Selecionar atributo</h4><span className="text-[10px] text-muted-foreground">01 de 02</span></div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                  {TRAINING_ATTRIBUTES.map((key, index) => {
                    const selected = key === attribute
                    return <button key={key} type="button" aria-pressed={selected} onClick={() => setAttribute(key)} className={`group relative min-w-0 rounded-sm border p-3 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-4 ${selected ? "border-primary bg-primary/[.12] shadow-[inset_0_1px_25px_rgba(184,134,49,.12)]" : "border-border/50 bg-card/25 hover:border-primary/50 hover:bg-card/60"}`}>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-muted-foreground"><span>ATTR. 0{index + 1}</span>{selected ? <Check className="size-4 text-primary" /> : <span className="size-2 border border-primary/35" />}</div>
                      <p className={`mt-2 font-serif text-2xl font-black ${selected ? "text-primary" : "text-foreground"}`}>{LABELS[key]}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{character.attributes[key]} · {state.points[key].toLocaleString("pt-BR")}/{trainingGoal(state, key)} pts</p>
                      <div className="mt-3 flex gap-[2px]" role="meter" aria-label={`Progresso ${LABELS[key]}`} aria-valuenow={Math.min(state.points[key], trainingGoal(state, key))} aria-valuemin={0} aria-valuemax={trainingGoal(state, key)}>
                        {Array.from({ length: trainingGoal(state, key) * 2 }, (_, i) => <span key={i} className={`h-[5px] min-w-0 flex-1 ${state.points[key] * 2 > i ? "bg-primary" : "bg-border/80"}`} />)}
                      </div>
                    </button>
                  })}
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
              <div className="border-l-2 border-primary/70 pl-4"><p className="text-[10px] font-black uppercase tracking-[.22em] text-primary/65">02 · Configuração da sessão</p><h3 className="mt-1 font-serif text-xl font-bold sm:text-2xl">Defina sua jornada</h3><p className="mt-1 text-xs text-muted-foreground">O relógio é baseado no horário real, inclusive fora do jogo.</p></div>
              <div className="rounded-sm border border-primary/25 bg-[#110f0c]/90 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between"><h4 className="text-[11px] font-black uppercase tracking-[.18em] text-primary">Duração do treinamento</h4><Clock3 className="size-4 text-primary/70" /></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {(Object.entries(TRAINING_OPTIONS) as Array<[string, (typeof TRAINING_OPTIONS)[TrainingHours]]>).map(([key, choice]) => {
                    const selected = Number(key) === hours
                    return <button key={key} type="button" aria-pressed={selected} onClick={() => setHours(Number(key) as TrainingHours)} className={`group flex w-full items-center justify-between gap-3 rounded-sm border p-3 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-4 ${selected ? "border-primary bg-primary/10" : "border-border/50 bg-black/20 hover:border-primary/40 hover:bg-card/30"}`}>
                      <div className="flex min-w-0 items-center gap-3"><div className={`grid size-8 shrink-0 place-items-center rounded-full border ${selected ? "border-primary bg-primary/20 text-primary" : "border-border bg-background text-muted-foreground"}`}>{selected ? <Check className="size-4" /> : <Clock3 className="size-3.5" />}</div><div className="min-w-0"><p className={`text-sm font-black ${selected ? "text-primary" : "text-foreground"}`}>{key} horas <span className="text-[10px] font-normal text-muted-foreground">na campanha</span></p><p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{choice.realMinutes / 60}h reais · +{choice.points.toLocaleString("pt-BR")} PT</p></div></div>
                      <span className={`shrink-0 rounded-sm border px-2 py-1 font-mono text-xs font-bold ${selected ? "border-primary/35 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"}`}>+{choice.points.toLocaleString("pt-BR")}</span>
                    </button>
                  })}
                </div>
              </div>

              <div className="rounded-sm border border-primary/20 bg-primary/[.04] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Projeção do treinamento</span><span className="font-mono text-[10px] text-muted-foreground">PREVIEW</span></div>
                <div className="flex items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">{LABELS[attribute]} após a sessão</p><p className="mt-1 font-serif text-3xl font-black text-primary">{selectedProjected.toLocaleString("pt-BR")} <span className="text-base font-normal text-muted-foreground">/ {selectedGoal} pt</span></p></div><span className="font-mono text-sm font-bold text-emerald-400">+{selectedOption.points.toLocaleString("pt-BR")}</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border/60"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(100, selectedProjected / selectedGoal * 100)}%` }} /></div>
                <div className="mt-4 flex gap-2 border-t border-primary/15 pt-3 text-[11px] text-rose-300"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>Ao terminar: <strong>Cansado</strong>, -{selectedOption.dexPenalty} nos testes de DEX por {selectedOption.fatigueMinutes} minutos.</p></div>
              </div>
              {active && <p className="rounded-sm border border-primary/30 bg-primary/10 p-3 text-xs text-primary">Já existe um treinamento em andamento. Aguarde a conclusão antes de iniciar outro.</p>}
              {state.fatigue && state.fatigue.endsAt > now && <p className="rounded-sm border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">Seu personagem está Cansado e precisa se recuperar antes do próximo treinamento.</p>}
              {error && <p role="alert" className="rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
            </aside>
          </div>
        </div>

        <footer className="relative z-20 shrink-0 border-t border-primary/25 bg-[#0c0b09]/95 px-4 py-3 shadow-[0_-18px_60px_rgba(0,0,0,.58)] sm:px-8 lg:px-12 lg:py-4">
          <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="hidden text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground sm:block"><LockKeyhole className="mr-1 inline size-3" /> Configuração salva no personagem</p><p className="truncate text-xs font-semibold text-foreground sm:mt-1 sm:text-sm"><span className="text-primary">{LABELS[attribute]}</span> <span className="mx-2 text-muted-foreground/50">/</span> {hours}h na campanha <span className="mx-2 text-muted-foreground/50">/</span> {selectedOption.realMinutes / 60}h real</p></div>
            <div className="flex shrink-0 gap-2 sm:gap-3"><Button variant="outline" onClick={() => setOpen(false)} className="h-11 flex-1 border-border/60 bg-card/30 px-5 text-xs sm:flex-none sm:px-7">Voltar</Button><Button disabled={busy || !canTrain} onClick={() => void execute("start", { attribute, hours })} className="h-11 flex-[2] gap-2 bg-primary px-5 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-[0_0_24px_rgba(186,139,56,.18)] hover:bg-primary/90 sm:flex-none sm:px-8">{busy ? "Iniciando..." : "Iniciar treinamento"}<ArrowRight className="size-4" /></Button></div>
          </div>
        </footer>
      </section>
    </div>, document.body) : null

  return <section className="mt-4 rounded-lg border border-amber-700/30 bg-[#100d0a]/65 p-3 sm:p-4" aria-label="Barra de treinamento">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-amber-200"><Activity className="size-4" /> Treinamento</p>
      <div className="flex items-center gap-2">
        {pendingUpgrade.length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300"><Sparkles className="mr-1 inline size-3" />Evolução disponível</span>}
        {(isOwner || isGm) && <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-7 border-amber-500/40 text-xs text-amber-200"><Dumbbell className="mr-1 size-3" /> Treinar</Button>}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,220px)_1fr]">
      <TrainingRadar state={state} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TRAINING_ATTRIBUTES.map(key => <div key={key} className="rounded-md border border-amber-500/15 bg-black/30 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"><strong className="text-amber-100">{LABELS[key]}</strong><span className="font-mono text-amber-300">{state.points[key].toLocaleString("pt-BR")}/{trainingGoal(state, key)}</span></div>
          <div className="flex gap-0.5" aria-label={`Progresso de ${LABELS[key]}`} role="meter" aria-valuenow={Math.min(trainingGoal(state, key), state.points[key])} aria-valuemin={0} aria-valuemax={trainingGoal(state, key)}>
            {Array.from({ length: trainingGoal(state, key) * 2 }, (_, i) => <span key={i} className={`h-2.5 min-w-0 flex-1 rounded-[1px] ${state.points[key] * 2 > i ? "bg-amber-400" : "bg-zinc-800"}`} />)}
          </div>
          {(isOwner || isGm) && state.points[key] >= trainingGoal(state, key) && <Button size="sm" variant="outline" disabled={busy || !nextAttributeDie(character.attributes[key]) || Boolean(active)} onClick={() => void execute("upgrade", { attribute: key })} className="mt-2 h-7 w-full border-emerald-500/40 text-[11px] text-emerald-300">Evoluir {character.attributes[key]} → {nextAttributeDie(character.attributes[key]) || "Máximo"}</Button>}
          {isGm && <div className="mt-2 flex gap-1"><select aria-label={`Pontos de ${LABELS[key]}`} value={gmAmount} onChange={event => setGmAmount(Number(event.target.value))} className="min-w-0 flex-1 rounded bg-black px-1 py-1 text-[11px] text-amber-200">{[0.5, 1, 1.5, 2, 2.5].map(n => <option key={n} value={n}>+{n.toLocaleString("pt-BR")}</option>)}</select><Button disabled={busy} size="sm" variant="outline" className="h-7 border-amber-500/40 px-2 text-[11px]" onClick={() => void execute("award", { attribute: key, points: gmAmount })}>Atribuir</Button></div>}
        </div>)}
      </div>
    </div>
    {active && <div className="mt-3 rounded-md border border-amber-600/30 bg-amber-800/10 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-amber-200"><Clock3 className="size-4" /> Treinando {LABELS[active.attribute]} · {active.hours}h de sessão</p><ClassTimerProgress startedAt={active.startedAt} endsAt={active.endsAt} label="Tempo real restante" />{isGm && <Button disabled={busy} onClick={() => void execute("finish")} size="sm" variant="outline" className="mt-2 border-amber-500/40 text-xs">Concluir treinamento agora</Button>}</div>}
    {state.fatigue && state.fatigue.endsAt > now && <div className="mt-3 rounded-md border border-rose-700/30 bg-rose-950/20 p-3"><p className="text-xs font-bold text-rose-300">Cansado · -{state.fatigue.dexPenalty} em testes com DEX</p><ClassTimerProgress compact startedAt={state.fatigue.startedAt} endsAt={state.fatigue.endsAt} label="Recuperação" /></div>}
    {completedInBackground && <p className="mt-2 text-xs text-amber-300">Treino concluído; sincronizando a recompensa...</p>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    {modal}
  </section>
}
