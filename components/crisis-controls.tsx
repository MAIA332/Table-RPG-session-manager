"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity, ArrowRight, Check, ChevronRight, Clock3,
  Droplets, HeartPulse, Layers3, Minus, Plus, Search,
  ShieldOff, SlidersHorizontal, Sparkles, Target, Trash2, TrendingDown,
  Waves, X, Zap,
} from "lucide-react"
import { PRESET_CHECKS } from "@/lib/combat-checks"
import {
  CRISIS_ATTRIBUTES, crisisModifierLabel, defaultCrisisConfig, parseCrisisConfig,
  type CrisisCondition, type CrisisConfig, type CrisisPublicState,
  type CrisisProgression,
} from "@/lib/crisis-model"
import type { useCombat } from "@/lib/use-combat"

type Tab = "overview" | "conditions" | "manual"
type TargetType = "character" | "creature"
const checkIds = PRESET_CHECKS.map(check => check.id)
const builtins = new Set(["adrenaline", "bleeding", "poison", "paralysis", "stun"])
const inputClass = "w-full min-w-0 rounded-xl border border-border/70 bg-background/80 px-3.5 py-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20"
const labelClass = "mb-2 block text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground"
const tileClass = "rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur-xl"
const join = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ")

function EffectIcon({ kind, className = "size-5" }: {
  kind: CrisisCondition["kind"]
  className?: string
}) {
  if (kind === "adrenaline") return <Zap className={className} />
  if (kind === "dot") return <Droplets className={className} />
  if (kind === "paralysis") return <ShieldOff className={className} />
  if (kind === "stun") return <Waves className={className} />
  return <TrendingDown className={className} />
}

function Switch({ checked, onChange, disabled = false, label }: {
  checked: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
  label: string
}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked}
    disabled={disabled} onClick={() => onChange(!checked)}
    className={join("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-40",
      checked ? "border-primary bg-primary shadow-sm" : "border-border bg-muted")}>
    <span className={join("h-[18px] w-[18px] rounded-full shadow-sm transition-transform duration-200",
      checked ? "translate-x-[19px] bg-primary-foreground" : "translate-x-0 bg-muted-foreground/75")} />
  </button>
}

/** Ferramenta de GM: comandos do servidor continuam sendo a autoridade. */
export function CrisisControls({ controller }: { controller: ReturnType<typeof useCombat> }) {
  const { combat, pending, send } = controller
  const gmView = combat as (typeof combat & { crisisConfig?: CrisisConfig; crisis?: CrisisPublicState }) | null
  const current = gmView?.crisisConfig || defaultCrisisConfig()
  const live = gmView?.crisis
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("overview")
  const [draft, setDraft] = useState<CrisisConfig>(current)
  const [selectedConditionId, setSelectedConditionId] = useState("adrenaline")
  const [conditionSearch, setConditionSearch] = useState("")
  const [subjectType, setSubjectType] = useState<TargetType>("character")
  const [subjectId, setSubjectId] = useState("")
  const [conditionId, setConditionId] = useState("adrenaline")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const targetType: TargetType = subjectType === "creature" && !combat?.enabled ? "character" : subjectType
  const subjects = targetType === "creature"
    ? (combat?.creatures || []).map(c => ({
      id: c.instanceId, name: c.name, hp: c.currentHp, maxHp: c.maxHp,
    }))
    : (combat?.characters || []).map(c => ({
      id: c.id, name: c.name, hp: c.resources.hp, maxHp: c.resources.maxHp,
    }))
  const selectedSubjectId = subjects.some(s => s.id === subjectId) ? subjectId : (subjects[0]?.id || "")
  const subject = subjects.find(s => s.id === selectedSubjectId)
  const targetStatus = targetType === "character"
    ? live?.players?.[selectedSubjectId] : live?.creatures?.[selectedSubjectId]
  const manualEffects = targetStatus?.manualApplied || []
  const savedConditionId = current.conditions.some(c => c.id === conditionId)
    ? conditionId : (current.conditions[0]?.id || "")
  const savedCondition = current.conditions.find(c => c.id === savedConditionId)
  const chosenCondition = draft.conditions.find(c => c.id === selectedConditionId) || draft.conditions[0]
  const enabledCount = draft.conditions.filter(c => c.enabled).length
  const assignedCount = Object.values(live?.players || {}).filter(s => s.conditions.length > 0).length
    + Object.values(live?.creatures || {}).filter(s => s.conditions.length > 0).length
  const pendingChanges = JSON.stringify(draft) !== JSON.stringify(current)
  const matches = useMemo(() => draft.conditions.filter(c =>
    (c.name + " " + c.kind + " " + c.description).toLocaleLowerCase("pt-BR")
      .includes(conditionSearch.trim().toLocaleLowerCase("pt-BR"))
  ), [draft.conditions, conditionSearch])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onEscape)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onEscape)
    }
  }, [open])

  function openModal(nextTab: Tab = "overview") {
    setDraft(structuredClone(current))
    setSelectedConditionId(current.conditions[0]?.id || "")
    setError("")
    setConditionSearch("")
    setTab(nextTab)
    setOpen(true)
  }
  function change(id: string, patch: Partial<CrisisCondition>) {
    setDraft(state => ({
      ...state,
      conditions: state.conditions.map(c => c.id === id ? { ...c, ...patch } : c),
    }))
  }
  function addCondition() {
    if (draft.conditions.length >= 30) return
    const id = "custom_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8)
    setDraft(state => ({
      ...state,
      conditions: [...state.conditions, {
        id, name: "Nova condição", description: "Descreva o efeito dessa condição.",
        kind: "modifier", enabled: true, target: "mig", modifier: -1,
      }],
    }))
    setSelectedConditionId(id)
    setConditionSearch("")
    setTab("conditions")
  }
  function removeCondition(id: string) {
    if (builtins.has(id)) return
    setDraft(state => ({
      ...state,
      conditions: state.conditions.filter(c => c.id !== id).map(c => {
        if (c.progression?.addConditionId !== id) return c
        return { ...c, progression: { ...c.progression, enabled: false, addConditionId: undefined } }
      }),
    }))
    setSelectedConditionId("adrenaline")
  }
  function updateProgression(condition: CrisisCondition, patch: Partial<CrisisProgression>) {
    const fallback: CrisisProgression = {
      enabled: false, hpLossStep: 5,
      mode: condition.kind === "modifier" || condition.kind === "dot" ? "intensity" : "new_condition",
      modifierPerStep: -1,
      addConditionId: draft.conditions.find(c => c.id !== condition.id)?.id,
    }
    change(condition.id, { progression: { ...fallback, ...condition.progression, ...patch } })
  }
  async function toggle(enabled: boolean) {
    if (!combat || busy || pending) return
    setBusy(true)
    setError("")
    try { await send({ type: "set-crisis-enabled", enabled }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alternar desgaste.") }
    finally { setBusy(false) }
  }
  async function save() {
    if (!combat || busy || pending) return
    if (!pendingChanges) { setOpen(false); return }
    setBusy(true)
    setError("")
    try {
      const config = parseCrisisConfig(draft, checkIds)
      await send({ type: "set-crisis-config", config })
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as condições.")
    } finally { setBusy(false) }
  }
  async function manageEffect(type: "apply-crisis-effect" | "remove-crisis-effect", applicationId?: string) {
    if (!combat || !selectedSubjectId || busy || pending) return
    setBusy(true)
    setError("")
    try {
      await send({
        type, subjectType: targetType, subjectId: selectedSubjectId,
        ...(type === "apply-crisis-effect" ? { conditionId: savedConditionId } : { applicationId }),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar efeito manual.")
    } finally { setBusy(false) }
  }

  const tabs: Array<{ id: Tab; title: string; subtitle: string; icon: typeof Activity }> = [
    { id: "overview", title: "Visão geral", subtitle: "Regra e atividade", icon: Activity },
    { id: "conditions", title: "Condições", subtitle: "Templates e progressão", icon: Layers3 },
    { id: "manual", title: "Aplicação manual", subtitle: "Escolha e controle", icon: Target },
  ]

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="fixed inset-0 z-[11060] flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground" role="dialog" aria-modal="true" aria-labelledby="crisis-modal-title">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[12%] -top-[42%] h-[90vw] max-h-[900px] w-[90vw] max-w-[900px] rounded-full bg-primary/[.065] blur-[100px]" />
        <div className="absolute -bottom-[55%] -left-[10%] h-[80vw] max-h-[900px] w-[80vw] max-w-[900px] rounded-full bg-primary/[.045] blur-[110px]" />
        <div className="absolute inset-0 opacity-[.035]" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      </div>

      <header className="relative z-10 shrink-0 border-b border-border/60 bg-background/75 px-4 py-3 backdrop-blur-2xl sm:px-7 lg:px-12">
        <div className="mx-auto flex max-w-[1660px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary sm:size-12"><HeartPulse className="size-5 sm:size-6" /></div>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.23em] text-primary sm:text-[10px]">
                <span>Morte Mágica</span><ChevronRight className="size-3 opacity-60" /><span className="truncate text-muted-foreground">Ferramentas do Mestre</span>
              </div>
              <h2 id="crisis-modal-title" className="truncate font-serif text-lg font-bold tracking-tight sm:text-2xl lg:text-[28px]">Central de desgaste</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className={join("hidden items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.14em] sm:inline-flex",
              draft.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-border bg-muted/50 text-muted-foreground")}>
              <span className={join("size-1.5 rounded-full", draft.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
              {draft.enabled ? "Protocolo ativo" : "Protocolo em espera"}
            </span>
            <button type="button" aria-label="Fechar central de desgaste" onClick={() => setOpen(false)}
              className="grid size-10 place-items-center rounded-xl border border-border/70 bg-card/75 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <X className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1660px] flex-1 flex-col lg:flex-row">
        <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-border/60 bg-card/30 p-3 lg:w-[240px] lg:flex-col lg:gap-2 lg:border-b-0 lg:border-r lg:bg-background/35 lg:p-6" role="tablist" aria-label="Áreas da central de desgaste">
          <div className="mb-6 hidden px-3 pt-2 lg:block">
            <span className="text-[10px] font-bold uppercase tracking-[.22em] text-muted-foreground">Painel de controle</span>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Configure situações de crise e acompanhe os efeitos sobre o mundo.</p>
          </div>
          {tabs.map(entry => {
            const Icon = entry.icon
            const active = tab === entry.id
            return <button key={entry.id} type="button" role="tab" aria-selected={active} onClick={() => { setTab(entry.id); setError("") }}
              className={join("flex min-w-max items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:min-w-0 lg:w-full lg:px-4",
                active ? "border-primary/40 bg-primary/10 text-primary shadow-sm" : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-foreground")}>
              <Icon className="size-4 shrink-0" />
              <span><span className="block text-xs font-bold sm:text-sm">{entry.title}</span><span className="mt-0.5 hidden text-[10px] opacity-65 lg:block">{entry.subtitle}</span></span>
              {active && <span className="ml-auto hidden size-1.5 rounded-full bg-primary lg:block" />}
            </button>
          })}
          <div className="mt-auto hidden rounded-2xl border border-border/60 bg-card/65 p-4 lg:block">
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Limiar atual</span><Activity className="size-4 text-primary" /></div>
            <p className="mt-2 font-serif text-3xl font-black tabular-nums">{draft.thresholdPercent}<span className="ml-1 text-sm text-muted-foreground">%</span></p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: String(draft.thresholdPercent) + "%" }} /></div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Da vida máxima do alvo.</p>
          </div>
        </nav>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
          <AnimatePresence mode="wait" initial={false}>
            {tab === "overview" && <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .17 }} className="mx-auto max-w-[1200px] space-y-6 pb-8">
              <div className="relative overflow-hidden rounded-[28px] border border-primary/25 bg-gradient-to-br from-primary/[.12] via-card/90 to-card/75 p-6 shadow-lg sm:p-9">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-80 rounded-full border border-primary/10 sm:size-[460px]"><div className="absolute inset-8 rounded-full border border-primary/15" /><div className="absolute inset-20 rounded-full border border-primary/15" /></div>
                <div className="relative grid gap-8 md:grid-cols-[1fr_210px] md:items-center">
                  <div className="max-w-[720px]">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-primary"><Activity className="size-3.5" /> Sistema de consequências</div>
                    <h3 className="mt-5 font-serif text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[46px]">O perigo deixa marcas.</h3>
                    <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">Quando a vida cai abaixo do limite, a crise transforma o desempenho de cada personagem. Defina a intensidade, os efeitos e como eles evoluem.</p>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <span className="text-xs font-bold">Aplicação automática</span>
                      <Switch checked={draft.enabled} onChange={value => setDraft(d => ({ ...d, enabled: value }))} label="Ativar aplicação automática" />
                      <span className={join("text-xs", draft.enabled ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground")}>{draft.enabled ? "Habilitada" : "Desabilitada"}</span>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <div className="relative grid size-[190px] place-items-center rounded-full border border-primary/20 bg-background/65 shadow-[0_25px_70px_-25px_rgba(0,0,0,.35)]">
                      <svg viewBox="0 0 164 164" className="absolute inset-0 size-full -rotate-90 text-primary" aria-hidden="true">
                        <circle cx="82" cy="82" r="68" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="5" />
                        <circle cx="82" cy="82" r="68" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={String(draft.thresholdPercent * 4.27256) + " 427.256"} className="transition-all duration-300" />
                      </svg>
                      <div className="text-center"><span className="block text-[10px] font-extrabold uppercase tracking-[.25em] text-muted-foreground">Gatilho</span><span className="mt-1 block font-serif text-5xl font-bold tabular-nums">{draft.thresholdPercent}<span className="text-xl text-primary">%</span></span><span className="mt-1 block text-[10px] text-muted-foreground">da vida máxima</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Condições habilitadas", value: enabledCount, detail: "De " + draft.conditions.length + " cadastradas", icon: Layers3 },
                  { label: "Alvos afetados agora", value: assignedCount, detail: "Fichas e criaturas", icon: HeartPulse },
                  { label: "Condições personalizadas", value: draft.conditions.filter(c => !builtins.has(c.id)).length, detail: "Modelos exclusivos", icon: Sparkles },
                ].map(metric => {
                  const Icon = metric.icon
                  return <div key={metric.label} className={join(tileClass, "p-5 sm:p-6")}>
                    <div className="mb-5 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">{metric.label}</span><Icon className="size-4 text-primary" /></div>
                    <p className="font-serif text-4xl font-bold tabular-nums">{metric.value.toLocaleString("pt-BR")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                  </div>
                })}
              </div>

              <div className={join(tileClass, "p-5 sm:p-7")}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={labelClass}>Sensibilidade</p><h4 className="font-serif text-xl font-bold">Quando a crise começa?</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground">O desgaste automático inicia quando o HP atual for igual ou inferior ao percentual configurado.</p></div><span className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 font-mono text-lg font-bold tabular-nums text-primary">{draft.thresholdPercent}%</span></div>
                <div className="mt-7 grid items-center gap-4 sm:grid-cols-[1fr_100px]">
                  <input aria-label="Percentual para início da crise" type="range" min={1} max={100} step={1} value={draft.thresholdPercent} onChange={e => setDraft(d => ({ ...d, thresholdPercent: Number(e.target.value) }))} className="h-2 w-full cursor-pointer accent-primary" />
                  <label className="sr-only" htmlFor="crisis-threshold-number">Percentual de crise</label>
                  <input id="crisis-threshold-number" type="number" min={1} max={100} step={1} value={draft.thresholdPercent} onChange={e => setDraft(d => ({ ...d, thresholdPercent: Number(e.target.value) }))} className={join(inputClass, "text-center font-mono font-bold")} />
                </div>
                <div className="mt-3 flex justify-between text-[10px] font-semibold text-muted-foreground"><span>1% · Crítico</span><span>50% · Moderado</span><span>100% · Imediato</span></div>
              </div>

              <div className={join(tileClass, "p-5 sm:p-7")}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className={labelClass}>Biblioteca</p><h4 className="font-serif text-xl font-bold">Efeitos do protocolo</h4></div><button type="button" onClick={() => setTab("conditions")} className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline">Editar condições <ArrowRight className="size-4" /></button></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {draft.conditions.slice(0, 6).map(c => <button key={c.id} type="button" onClick={() => { setSelectedConditionId(c.id); setTab("conditions") }} className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-3.5 text-left transition-all hover:border-primary/40 hover:bg-primary/5">
                    <span className={join("grid size-10 shrink-0 place-items-center rounded-lg border", c.enabled ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground")}><EffectIcon kind={c.kind} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{c.name}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{c.description || "Sem descrição"}</span></span>
                    <span className={join("size-1.5 shrink-0 rounded-full", c.enabled ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </button>)}
                </div>
              </div>
            </motion.div>}

            {tab === "conditions" && <motion.div key="conditions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .17 }} className="mx-auto max-w-[1270px] space-y-6 pb-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className={labelClass}>Editor de efeitos</p><h3 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">Biblioteca de condições</h3><p className="mt-2 text-sm text-muted-foreground">Crie, ajuste e combine os efeitos que moldam uma situação de crise.</p></div>
                <button type="button" onClick={addCondition} disabled={draft.conditions.length >= 30} className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary px-4 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"><Plus className="size-4" /> Nova condição</button>
              </div>
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,.74fr)_minmax(0,1.65fr)]">
                <aside className={join(tileClass, "min-w-0 self-start overflow-hidden lg:sticky lg:top-0")}>
                  <div className="border-b border-border/50 p-4 sm:p-5"><label className={labelClass}>Localizar efeito</label><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={conditionSearch} onChange={e => setConditionSearch(e.target.value)} placeholder="Buscar nome ou efeito..." className={join(inputClass, "pl-10")} /></div></div>
                  <div className="max-h-[44dvh] space-y-1.5 overflow-y-auto p-3 lg:max-h-[65dvh]">
                    {matches.map(c => {
                      const active = chosenCondition?.id === c.id
                      return <button key={c.id} type="button" aria-pressed={active} onClick={() => setSelectedConditionId(c.id)}
                        className={join("group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors", active ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border/70 hover:bg-muted/40")}>
                        <span className={join("grid size-10 shrink-0 place-items-center rounded-xl border", active ? "border-primary/30 bg-primary/15 text-primary" : "border-border/60 bg-background/70 text-muted-foreground")}><EffectIcon kind={c.kind} /></span>
                        <span className="min-w-0 flex-1"><span className={join("block truncate text-xs font-bold sm:text-sm", active && "text-primary")}>{c.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{builtins.has(c.id) ? "Template original" : "Personalizada"} {c.progression?.enabled ? "· Progressiva" : ""}</span></span>
                        <span className={join("size-1.5 rounded-full", c.enabled ? "bg-emerald-500" : "bg-border")} />
                      </button>
                    })}
                    {matches.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma condição encontrada.</p>}
                  </div>
                  <div className="border-t border-border/50 px-5 py-3 text-[10px] text-muted-foreground">{draft.conditions.length} de 30 modelos possíveis</div>
                </aside>

                {chosenCondition && <section className={join(tileClass, "min-w-0 overflow-hidden")} aria-label="Propriedades da condição selecionada">
                  <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-r from-primary/[.09] via-card/80 to-transparent p-5 sm:p-7">
                    <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><EffectIcon kind={chosenCondition.kind} className="size-7" /></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">{builtins.has(chosenCondition.id) ? "Efeito predefinido" : "Condição personalizada"}</p><h4 className="mt-1 truncate font-serif text-2xl font-bold sm:text-3xl">{chosenCondition.name}</h4></div></div><Switch checked={chosenCondition.enabled} onChange={enabled => change(chosenCondition.id, { enabled })} label="Habilitar condição automaticamente" /></div>
                    <p className="mt-5 max-w-xl text-xs leading-relaxed text-muted-foreground">{chosenCondition.description || "Adicione uma descrição que ajude todos a compreender o efeito desta condição."}</p>
                    <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-border/70 bg-background/65 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{chosenCondition.kind}</span><span className={join("rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide", chosenCondition.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground")}>{chosenCondition.enabled ? "Aplicação automática ativa" : "Aplicação automática desligada"}</span></div>
                  </div>
                  <div className="space-y-6 p-5 sm:p-7">
                    {chosenCondition.kind === "adrenaline" ? <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-background/60 p-5"><p className={labelClass}>Vigor · MIG</p><p className="font-serif text-4xl font-bold text-primary">+2</p><p className="mt-1 text-xs text-muted-foreground">Modificador fixo</p></div>
                      <div className="rounded-xl border border-border/60 bg-background/60 p-5"><p className={labelClass}>Intuição · INS</p><p className="font-serif text-4xl font-bold text-primary">+1</p><p className="mt-1 text-xs text-muted-foreground">Modificador fixo</p></div>
                    </div> : <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label><span className={labelClass}>Nome da condição</span><input maxLength={80} value={chosenCondition.name} onChange={e => change(chosenCondition.id, { name: e.target.value })} className={inputClass} /></label>
                        {!builtins.has(chosenCondition.id) && <label><span className={labelClass}>Categoria</span><select value={chosenCondition.kind} onChange={e => change(chosenCondition.id, { kind: e.target.value as CrisisCondition["kind"], target: "mig", modifier: -1, damage: 1, intervalSeconds: 60, progression: undefined })} className={inputClass}><option value="modifier">Bônus / penalidade</option><option value="dot">Dano periódico</option><option value="paralysis">Paralisia</option><option value="stun">Atordoamento</option></select></label>}
                        <label className="sm:col-span-2"><span className={labelClass}>Descrição e narrativa</span><textarea rows={3} maxLength={500} value={chosenCondition.description} onChange={e => change(chosenCondition.id, { description: e.target.value })} className={join(inputClass, "resize-y")} /></label>
                      </div>
                      {chosenCondition.kind === "modifier" && <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-2 sm:p-5">
                        <label><span className={labelClass}>Atributo ou teste afetado</span><select value={chosenCondition.target || "mig"} onChange={e => change(chosenCondition.id, { target: e.target.value })} className={inputClass}>{CRISIS_ATTRIBUTES.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}{PRESET_CHECKS.map(check => <option key={check.id} value={"check:" + check.id}>{check.name}</option>)}</select></label>
                        <label><span className={labelClass}>Modificador da rolagem</span><input type="number" step={1} min={-100} max={100} value={chosenCondition.modifier ?? 0} onChange={e => change(chosenCondition.id, { modifier: Number(e.target.value) })} className={inputClass} /></label>
                      </div>}
                      {chosenCondition.kind === "dot" && <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-2 sm:p-5">
                        <label><span className={labelClass}>Dano em HP a cada pulso</span><input type="number" min={1} max={100000} step={1} value={chosenCondition.damage ?? 1} onChange={e => change(chosenCondition.id, { damage: Number(e.target.value) })} className={inputClass} /></label>
                        <label><span className={labelClass}>Intervalo em segundos</span><input type="number" min={5} max={86400} step={1} value={chosenCondition.intervalSeconds ?? 60} onChange={e => change(chosenCondition.id, { intervalSeconds: Number(e.target.value) })} className={inputClass} /></label>
                        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2"><Clock3 className="size-4 text-primary" /> O timer é persistido e continua fora de combate.</p>
                      </div>}
                      {(chosenCondition.kind === "stun" || chosenCondition.kind === "paralysis") && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="flex items-center gap-2 text-sm font-bold"><ShieldOff className="size-4 text-primary" /> Regra fixa do efeito</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{chosenCondition.kind === "stun" ? "Toda rolagem de dados causa 1 ponto de dano ao próprio autor." : "Bloqueia rolagens de atributos, testes, ataques e reações."}</p></div>}
                      {!builtins.has(chosenCondition.id) && <div className="space-y-4 rounded-2xl border border-primary/25 bg-primary/[.045] p-4 sm:p-6">
                        <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-bold"><TrendingDown className="size-4 text-primary" /> Intensidade progressiva</p><p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">A cada novo intervalo de HP perdido enquanto o alvo estiver em crise, aumente a intensidade, gere outro efeito ou combine ambos.</p></div><Switch label="Habilitar progressão desta condição" checked={chosenCondition.progression?.enabled || false} onChange={enabled => updateProgression(chosenCondition, { enabled })} /></div>
                        {chosenCondition.progression?.enabled && <div className="space-y-4 border-t border-primary/15 pt-4"><div className="grid gap-4 sm:grid-cols-2">
                          <label><span className={labelClass}>A cada HP perdido</span><input type="number" min={1} max={100000} step={1} value={chosenCondition.progression.hpLossStep} onChange={e => updateProgression(chosenCondition, { hpLossStep: Number(e.target.value) })} className={inputClass} /></label>
                          <label><span className={labelClass}>Regra de evolução</span><select value={chosenCondition.progression.mode} onChange={e => updateProgression(chosenCondition, { mode: e.target.value as CrisisProgression["mode"] })} className={inputClass}>{(chosenCondition.kind === "modifier" || chosenCondition.kind === "dot") && <option value="intensity">Aumentar intensidade</option>}<option value="new_condition">Criar outro efeito</option>{(chosenCondition.kind === "modifier" || chosenCondition.kind === "dot") && <option value="both">Aumentar + criar efeito</option>}</select></label>
                          {(chosenCondition.progression.mode === "intensity" || chosenCondition.progression.mode === "both") && <label><span className={labelClass}>Variação por estágio</span><input type="number" min={-100} max={100} step={1} value={chosenCondition.progression.modifierPerStep} onChange={e => updateProgression(chosenCondition, { modifierPerStep: Number(e.target.value) })} className={inputClass} /></label>}
                          {(chosenCondition.progression.mode === "new_condition" || chosenCondition.progression.mode === "both") && <label><span className={labelClass}>Condição criada por estágio</span><select value={chosenCondition.progression.addConditionId || ""} onChange={e => updateProgression(chosenCondition, { addConditionId: e.target.value })} className={inputClass}><option value="">Selecionar condição...</option>{draft.conditions.filter(c => c.id !== chosenCondition.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
                        </div><div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-background/60 p-3"><span className="rounded-lg bg-primary/10 px-2.5 py-1.5 font-mono text-xs font-bold text-primary">-{chosenCondition.progression.hpLossStep} HP</span><ArrowRight className="size-4 text-muted-foreground" /><span className="text-xs font-bold">{chosenCondition.progression.mode === "intensity" ? "Intensificar" : chosenCondition.progression.mode === "both" ? "Intensificar + novo efeito" : "Novo efeito"}</span><span className="ml-auto text-[10px] text-muted-foreground">Máx. 20 estágios</span></div>
                          {(chosenCondition.progression.mode === "intensity" || chosenCondition.progression.mode === "both") && <div className="rounded-xl border border-primary/20 bg-primary/[.045] p-4" aria-label="Exemplo de progressão adicional ao efeito base">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-primary">Prévia cumulativa · além do efeito base</p>
                            <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold">
                              {[0, 1, 2].map(stage => <span key={stage} className="rounded-lg border border-border/70 bg-background/75 px-3 py-2">{stage > 0 ? `Após ${stage * chosenCondition.progression!.hpLossStep} HP: ` : "Base: "}{crisisModifierLabel({ ...chosenCondition, modifier: (chosenCondition.modifier || 0) + stage * chosenCondition.progression!.modifierPerStep }) || `${Math.max(1, (chosenCondition.damage || 1) + stage * chosenCondition.progression!.modifierPerStep)} dano/pulso`}</span>)}
                            </div>
                          </div>}
                          <p className="text-xs leading-relaxed text-muted-foreground">Os estágios são adicionais ao valor inicial, contando o HP perdido após o limiar de crise (inclusive no golpe que atravessa esse limite). A cura não remove estágios já acumulados. Sair da crise reinicia a progressão.</p></div>}
                      </div>}
                    </>}
                    {!builtins.has(chosenCondition.id) && <div className="flex justify-end border-t border-border/60 pt-5"><button type="button" onClick={() => removeCondition(chosenCondition.id)} className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="size-4" /> Excluir condição</button></div>}
                  </div>
                </section>}
              </div>
            </motion.div>}

            {tab === "manual" && <motion.div key="manual" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .17 }} className="mx-auto max-w-[1270px] space-y-6 pb-8">
              <div><p className={labelClass}>Controle individual</p><h3 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">Aplicação direcionada</h3><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Aplique condições independentemente do gatilho de crise ou do switch automático. Durante o combate, criaturas e oponentes também ficam disponíveis.</p></div>
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,.85fr)_minmax(0,1.5fr)]">
                <section className={join(tileClass, "min-w-0 overflow-hidden self-start")}>
                  <div className="border-b border-border/50 p-4 sm:p-5"><p className={labelClass}>01 / Selecionar alvo</p><div className="grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
                    <button type="button" onClick={() => { setSubjectType("character"); setSubjectId("") }} className={join("rounded-lg px-2 py-2.5 text-xs font-bold transition-colors", targetType === "character" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Personagens</button>
                    <button type="button" disabled={!combat?.enabled} onClick={() => { setSubjectType("creature"); setSubjectId("") }} className={join("rounded-lg px-2 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30", targetType === "creature" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Criaturas</button>
                  </div></div>
                  <div className="max-h-[58dvh] space-y-2 overflow-y-auto p-3">
                    {subjects.map(s => {
                      const chosen = selectedSubjectId === s.id
                      const percent = s.maxHp > 0 ? Math.max(0, Math.min(100, s.hp / s.maxHp * 100)) : 0
                      const crisis = percent <= draft.thresholdPercent
                      const statusLabel = s.hp <= 0 ? "Derrotado" : crisis ? "Em crise" : "Estável"
                      return <button key={s.id} type="button" aria-pressed={chosen} onClick={() => setSubjectId(s.id)} className={join("w-full rounded-xl border p-3.5 text-left transition-all", chosen ? "border-primary/45 bg-primary/10" : "border-border/50 bg-background/50 hover:border-primary/30")}>
                        <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-bold">{s.name}</span><span className={join("rounded-full px-2 py-1 text-[9px] font-bold uppercase", crisis ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{statusLabel}</span></span>
                        <span className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Vitalidade</span><span className="font-mono tabular-nums">{Math.round(s.hp)} / {Math.round(s.maxHp)} HP</span></span>
                        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className={join("block h-full rounded-full transition-[width] duration-300", crisis ? "bg-destructive" : "bg-primary")} style={{ width: String(percent) + "%" }} /></span>
                      </button>
                    })}
                    {subjects.length === 0 && <div className="py-12 text-center text-xs leading-relaxed text-muted-foreground">Nenhum alvo disponível para esta categoria.</div>}
                  </div>
                </section>
                <div className="min-w-0 space-y-5">
                  <section className={join(tileClass, "p-4 sm:p-6")}>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><p className={labelClass}>02 / Escolher efeito</p><h4 className="font-serif text-xl font-bold">Modelos disponíveis</h4></div><span className="rounded-full border border-border/70 bg-muted/50 px-3 py-1.5 text-[10px] text-muted-foreground">{current.conditions.length} cadastrados</span></div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {current.conditions.map(c => <button key={c.id} type="button" aria-pressed={savedConditionId === c.id} onClick={() => setConditionId(c.id)} className={join("flex items-center gap-3 rounded-xl border p-3 text-left transition-all", savedConditionId === c.id ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/60 hover:border-primary/30")}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><EffectIcon kind={c.kind} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{c.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{c.enabled ? "Auto disponível" : "Auto desligado · uso manual"}</span></span>{savedConditionId === c.id && <Check className="size-4 shrink-0 text-primary" />}
                      </button>)}
                    </div>
                    {savedCondition && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[.045] px-4 py-3"><p className="text-xs font-bold text-primary">{savedCondition.name}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{savedCondition.description || "Sem descrição."}</p></div>}
                    <button type="button" disabled={busy || pending || !selectedSubjectId || !savedConditionId} onClick={() => void manageEffect("apply-crisis-effect")} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold uppercase tracking-[.12em] text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="size-4" /> {busy ? "Processando..." : "Aplicar ao alvo selecionado"} <ArrowRight className="size-4" /></button>
                  </section>
                  <section className={join(tileClass, "p-4 sm:p-6")}>
                    <div className="mb-4 flex items-center justify-between gap-3"><div><p className={labelClass}>03 / Gerenciar aplicações</p><h4 className="font-serif text-xl font-bold">Efeitos registrados</h4></div><span className="grid size-9 place-items-center rounded-lg border border-border/60 bg-muted/35 font-mono text-sm font-bold">{manualEffects.length}</span></div>
                    {manualEffects.length === 0 ? <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6 text-center"><Layers3 className="mx-auto mb-2 size-6 text-muted-foreground/60" /><p className="text-xs text-muted-foreground">Nenhuma condição manual registrada {subject ? "em " + subject.name : "neste alvo"}.</p></div> : <div className="space-y-2">{manualEffects.map(effect => <div key={effect.applicationId} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/65 p-3.5"><div className="min-w-0"><p className="truncate text-sm font-bold">{effect.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{effect.description || "Aplicada manualmente pelo Mestre"}</p></div><button type="button" disabled={busy || pending} onClick={() => void manageEffect("remove-crisis-effect", effect.applicationId)} aria-label={"Remover " + effect.name} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-destructive/25 px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"><Minus className="size-3.5" /> Remover</button></div>)}</div>}
                    <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Os efeitos manuais permanecem registrados mesmo com o automático desligado. Podem ser removidos inclusive quando o alvo está com 0 HP.</p>
                  </section>
                </div>
              </div>
            </motion.div>}
          </AnimatePresence>
          {error && <div role="alert" className="mx-auto mt-4 max-w-[1270px] rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        </main>
      </div>

      <footer className="relative z-10 shrink-0 border-t border-border/60 bg-background/85 px-4 py-3 backdrop-blur-2xl sm:px-7 lg:px-12">
        <div className="mx-auto flex max-w-[1660px] flex-wrap items-center justify-between gap-3">
          <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
            <span className={join("size-2 rounded-full", pendingChanges ? "bg-amber-500" : "bg-emerald-500")} />
            {pendingChanges ? "Existem alterações aguardando confirmação" : "Configuração sincronizada com a campanha"}
          </div>
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-xl border border-border/70 bg-card/60 px-5 text-xs font-bold text-foreground transition-colors hover:bg-muted/70 sm:flex-none">Fechar</button>
            <button type="button" disabled={!combat || busy || pending} onClick={() => void save()} className="inline-flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-extrabold uppercase tracking-widest text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
              <Check className="size-4" />{busy ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  ) : null

  return <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[.10] via-card/80 to-background p-3.5 shadow-sm sm:p-4" aria-label="Controle rápido de desgaste">
    <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full border border-primary/10"><div className="absolute inset-5 rounded-full border border-primary/15" /></div>
    <div className="relative flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Activity className="size-5" /></span><div className="min-w-0"><p className="truncate text-xs font-black">Desgaste automático</p><p className="mt-0.5 text-[10px] text-muted-foreground">{current.enabled ? "Monitorando vida e consequências" : "Protocolo em espera"}</p></div></div>
      <Switch checked={current.enabled} onChange={value => void toggle(value)} disabled={busy || pending || !combat} label={current.enabled ? "Desativar desgaste automático" : "Ativar desgaste automático"} />
    </div>
    <div className="relative my-3 flex items-center gap-3 rounded-xl border border-border/55 bg-background/60 px-3 py-2.5"><Target className="size-4 text-primary" /><span className="text-[11px] text-muted-foreground">Gatilho de crise</span><span className="ml-auto font-mono text-sm font-black tabular-nums text-primary">{current.thresholdPercent}% HP</span></div>
    <button type="button" onClick={() => openModal()} className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-3 text-xs font-bold text-primary transition-all hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><span className="inline-flex items-center gap-2"><SlidersHorizontal className="size-4" /> Abrir central de desgaste</span><ArrowRight className="size-4" /></button>
    {error && !open && <p role="alert" className="relative mt-2 text-xs text-destructive">{error}</p>}
    {modal}
  </section>
}
