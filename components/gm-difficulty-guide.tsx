"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { BookOpen, ChevronDown, Dices, Loader2, Save, Settings2, Target, TrendingUp } from "lucide-react"
import {
  DEFAULT_DIFFICULTY_SETTINGS, DIFFICULTY_REFERENCES, analyzeDifficulty,
  diceMoments, difficultyTargets, worldBaseDice,
  type DifficultySettings, type DifficultyTargets, type DifficultyTier,
} from "@/lib/dynamic-difficulty"
import { DifficultyRulebook } from "./difficulty-rulebook"

/** result é o TOTAL FINAL publicado no evento, já com modificadores. */
export interface DiceRollResult {
  id: string
  diceCount: number
  result: number
  diceSides?: number[]
  characterName?: string
  playerName?: string
  attribute?: string
  /** Configuração vigente quando o evento foi capturado. Não recalcula rolagens passadas. */
  difficultySettings?: DifficultySettings
}

interface DifficultyGuideProps {
  latestRoll?: DiceRollResult | null
  viewer?: "gm" | "player"
  settings?: DifficultySettings
  settingsRevision?: number
  settingsLoading?: boolean
  settingsError?: string
  onSaveSettings?: (value: DifficultySettings) => Promise<void>
}

const LEVELS = [
  { id: "critical", name: "F. crítica", probability: "≈ 8% inferiores" },
  { id: "easy", name: "Fácil", probability: "≈ 75% de sucesso" },
  { id: "medium", name: "Médio", probability: "≈ 50% de sucesso" },
  { id: "hard", name: "Difícil", probability: "≈ 25% de sucesso" },
  { id: "extreme", name: "Extremo", probability: "≈ 10% de sucesso" },
] as const

const TIERS: Record<DifficultyTier, { label: string; text: string }> = {
  critical: { label: "Falha crítica", text: "text-red-400" },
  failure: { label: "Não alcançou Fácil", text: "text-rose-400" },
  easy: { label: "Superou Fácil", text: "text-emerald-400" },
  medium: { label: "Superou Médio", text: "text-sky-400" },
  hard: { label: "Superou Difícil", text: "text-amber-400" },
  extreme: { label: "Superou Extremo", text: "text-violet-400" },
}

const validPool = (roll: DiceRollResult | null | undefined) =>
  roll?.diceSides && roll.diceSides.length > 0 && roll.diceSides.length <= 24 &&
  roll.diceSides.every(f => Number.isSafeInteger(f) && f >= 2 && f <= 1000)
    ? roll.diceSides : null

const poolText = (sides: readonly number[]) => sides.map(f => `d${f}`).join(" + ")

function Thresholds({ targets, activeTier, total, emphasized = false }: {
  targets: DifficultyTargets
  activeTier?: DifficultyTier
  total?: number
  emphasized?: boolean
}) {
  return <div className="grid grid-cols-5 gap-1.5">
    {LEVELS.map(level => {
      const reached = total !== undefined && (level.id === "critical"
        ? total <= targets.critical : total >= targets[level.id])
      const best = activeTier === level.id
      const critical = level.id === "critical"
      return <div key={level.id} title={level.probability}
        className={`min-w-0 rounded-lg border px-1 py-2 text-center transition-all ${best && emphasized
          ? critical ? "border-red-400/70 bg-red-500/15 ring-1 ring-red-400/40" : "border-primary/70 bg-primary/15 ring-1 ring-primary/40"
          : reached && emphasized ? "border-primary/35 bg-primary/[.07]" : "border-border/60 bg-background/45"}`}>
        <span className={`block font-mono text-base font-black tabular-nums ${critical ? "text-red-400" : best && emphasized ? "text-primary" : "text-foreground"}`}>
          {critical ? `≤${targets.critical}` : targets[level.id]}{level.id === "extreme" ? "+" : ""}
        </span>
        <span className={`mt-0.5 block text-[9px] font-semibold leading-tight ${best && emphasized ? "text-foreground" : "text-muted-foreground"}`}>
          {level.name}
        </span>
      </div>
    })}
  </div>
}

/** O Mestre vê as três faixas e a referência completa; o jogador só a parada recente. */
export function GmDifficultyGuide({ latestRoll, viewer = "gm", settings = DEFAULT_DIFFICULTY_SETTINGS,
  settingsRevision = 0, settingsLoading = false, settingsError = "", onSaveSettings }: DifficultyGuideProps) {
  const [open, setOpen] = useState(true)
  const [bookOpen, setBookOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<DifficultySettings>({ ...settings })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const isGm = viewer === "gm"
  const closeBook = useCallback(() => setBookOpen(false), [])
  useEffect(() => { setDraft({ ...settings }); setSaveError("") }, [settings.lambda, settings.sigmaMultiplier, settingsRevision])
  const hasChanges = draft.lambda !== settings.lambda || draft.sigmaMultiplier !== settings.sigmaMultiplier
  const validDraft = Number.isFinite(draft.lambda) && draft.lambda >= 0 && draft.lambda <= 1 &&
    Number.isFinite(draft.sigmaMultiplier) && draft.sigmaMultiplier >= 0.5 && draft.sigmaMultiplier <= 2
  async function saveDifficulty() {
    if (!isGm || !onSaveSettings || saving || !hasChanges || !validDraft || settingsLoading) return
    setSaving(true); setSaveError("")
    try { await onSaveSettings(draft) }
    catch (error) { setSaveError(error instanceof Error ? error.message : "Não foi possível salvar as configurações.") }
    finally { setSaving(false) }
  }
  const sides = validPool(latestRoll)
  const analysis = useMemo(() => sides && latestRoll
    ? analyzeDifficulty(sides, latestRoll.result, latestRoll.difficultySettings ?? settings) : null,
    // O evento tem id imutável e cada nova rolagem cria outro id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latestRoll?.id, latestRoll?.result, latestRoll?.diceSides, latestRoll?.difficultySettings, settings.lambda, settings.sigmaMultiplier])

  useEffect(() => {
    if (latestRoll?.id) setOpen(true)
  }, [latestRoll?.id])

  const gmRows = [
    { count: 2, title: "Ação comum", subtitle: "1–2 dados · base 2d8" },
    { count: 3, title: "Alta tensão", subtitle: "3 dados · base 3d8" },
    { count: 4, title: "Lendário", subtitle: "4+ dados · base 4d10" },
  ].map(row => {
    const matches = !!analysis && (row.count === 2 ? analysis.sides.length <= 2 : row.count === 4 ? analysis.sides.length >= 4 : analysis.sides.length === 3)
    const base = worldBaseDice(row.count)
    return {
      ...row,
      matches,
      sides: matches ? analysis!.sides : base,
      targets: matches ? analysis!.targets : analyzeDifficulty(base, 0, settings).targets,
      tier: matches ? analysis!.tier : undefined,
      total: matches ? analysis!.result : undefined,
    }
  })

  const preview = analysis || analyzeDifficulty([8, 8], 9, settings)
  const outcome = analysis ? TIERS[analysis.tier] : null

  return <section aria-label="Guia de Dificuldade Dinâmica"
    className="panel mt-4 shrink-0 overflow-hidden rounded-xl border border-primary/35 bg-card/65 shadow-lg">
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
      className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-primary/5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Target className="size-4" /></span>
        <span className="min-w-0">
          <span className="block font-serif text-sm font-bold text-foreground">Guia de Dificuldade</span>
          <span className="block text-[10px] text-muted-foreground">Gaussiano · escala elástica λ = {settings.lambda.toFixed(2).replace(".", ",")} · σ × {settings.sigmaMultiplier.toFixed(2).replace(".", ",")}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">{isGm ? "Tabela do Mestre" : "Minha rolagem"}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </span>
    </button>
    <AnimatePresence initial={false}>
      {open && <motion.div key="difficulty-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .18 }} className="overflow-hidden">
        <div className="border-t border-border/55 px-4 py-3">
          {latestRoll ? <div className="rounded-xl border border-primary/30 bg-primary/[.06] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Dices className="size-3.5 text-primary" /> Última rolagem</span>
              <span className="rounded-md border border-primary/25 bg-background/60 px-2 py-1 font-mono text-xs font-bold tabular-nums text-primary">Total final: {latestRoll.result}</span>
            </div>
            {(latestRoll.characterName || latestRoll.attribute) && <p className="mt-2 break-words text-[11px] text-foreground"><strong>{latestRoll.characterName || "Jogador"}</strong>{latestRoll.attribute ? ` · ${latestRoll.attribute}` : ""}</p>}
            {analysis ? <>
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{poolText(analysis.sides)} · μ efetiva {analysis.effective.mean.toFixed(2).replace(".", ",")} · σ efetivo {analysis.effective.deviation.toFixed(2).replace(".", ",")}</p>
              <p role="status" className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${outcome?.text}`}>
                <TrendingUp className="size-3.5" /> {outcome?.label}
              </p>
              {latestRoll.difficultySettings &&
                (latestRoll.difficultySettings.lambda !== settings.lambda || latestRoll.difficultySettings.sigmaMultiplier !== settings.sigmaMultiplier) &&
                <p className="mt-1 text-[10px] text-muted-foreground">Esta rolagem mantém os parâmetros anteriores. Os novos valores serão usados na próxima.</p>}
            </> : <p className="mt-2 text-[11px] text-muted-foreground">Dados não identificados no evento. O total foi registrado, mas não é possível calcular uma dificuldade confiável sem saber as faces roladas.</p>}
          </div> : <p className="text-[11px] leading-relaxed text-muted-foreground">Aguardando uma rolagem. A tabela será recalculada usando os tamanhos reais dos dados e o resultado final, incluindo modificadores.</p>}
        </div>

        {isGm ? <div className="space-y-4 px-4 pb-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-[10px] font-black uppercase tracking-[.12em] text-primary">Tabela completa</h3><span className="text-[10px] text-muted-foreground">Alvos por parada</span></div>
          {gmRows.map(row => <div key={row.count} className={`space-y-2 rounded-xl border p-2.5 ${row.matches ? "border-primary/45 bg-primary/[.055]" : "border-border/50 bg-background/20"}`}>
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-foreground">{row.title}</span>
              <span className="text-[9px] text-muted-foreground">{row.matches ? `Atual: ${poolText(row.sides)}` : row.subtitle}</span>
            </div>
            <Thresholds targets={row.targets} activeTier={row.tier} total={row.total} emphasized={row.matches} />
          </div>)}
          <details className="group overflow-hidden rounded-lg border border-border/60 bg-background/35">
            <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 text-[11px] font-bold text-foreground marker:content-none">
              Referência por estágio · Gauss puro (λ = 1)
              <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="overflow-x-auto border-t border-border/45 px-2 pb-2">
              <table className="w-full min-w-[360px] text-center text-[10px] tabular-nums">
                <thead><tr className="text-muted-foreground"><th className="py-2 text-left font-semibold">Dados</th><th>F. Crít.</th><th>Fácil</th><th>Médio</th><th>Difícil</th><th>Extremo</th></tr></thead>
                <tbody>{DIFFICULTY_REFERENCES.map(ref => {
                  const t = difficultyTargets(diceMoments(ref.sides))
                  return <tr key={ref.label} className="border-t border-border/35"><th className="py-1.5 text-left font-mono font-medium text-foreground">{ref.label}</th><td className="text-red-400">≤{t.critical}</td><td>{t.easy}</td><td>{t.medium}</td><td>{t.hard}</td><td className="text-primary">{t.extreme}+</td></tr>
                })}</tbody>
              </table>
            </div>
          </details>
        </div> : <div className="space-y-2 px-4 pb-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-[11px] font-bold text-primary">{analysis ? `Parada de ${analysis.sides.length} dado(s)` : "Referência inicial · 2d8"}</h3><span className="text-[10px] text-muted-foreground">Resultado ≥ alvo</span></div>
          <Thresholds targets={preview.targets} activeTier={analysis?.tier} total={analysis?.result} emphasized={!!analysis} />
          <p className="text-[10px] text-muted-foreground">{analysis ? "Limites desta rolagem; serão atualizados na próxima." : "Valores ilustrativos até você rolar dados."}</p>
        </div>}

        {(settingsLoading || settingsError) && <div role="status" className="border-t border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[10px] text-amber-500">{settingsLoading ? "Sincronizando os parâmetros com o servidor..." : `Configuração não confirmada: ${settingsError}`}</div>}
        {isGm && <div className="border-t border-border/50 px-4 py-3">
          <button type="button" aria-expanded={editorOpen} onClick={() => setEditorOpen(v => !v)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/[.06] p-2.5 text-left text-[11px] font-bold text-primary hover:bg-primary/10"><span className="flex items-center gap-2"><Settings2 className="size-4"/> Ajustar parâmetros da campanha</span><ChevronDown className={`size-4 transition-transform ${editorOpen ? "rotate-180" : ""}`}/></button>
          {editorOpen && <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">Os novos parâmetros ficam no MongoDB e valem <strong>nas próximas rolagens</strong>. Não alteram dados lançados ou resultados anteriores.</p>
            <label className="block"><span className="mb-1 flex items-center justify-between text-[11px] font-bold"><span>Elasticidade λ</span><input type="number" min={0} max={1} step={0.05} value={draft.lambda} onChange={e=>setDraft(v=>({...v,lambda:Number(e.target.value)}))} disabled={saving || settingsLoading} className="w-20 rounded-md border border-border/60 bg-background px-2 py-1 text-right font-mono"/></span><input className="w-full accent-primary" type="range" min={0} max={1} step={0.05} value={Math.max(0,Math.min(1,draft.lambda || 0))} onChange={e=>setDraft(v=>({...v,lambda:Number(e.target.value)}))} disabled={saving || settingsLoading}/><span className="block text-[10px] text-muted-foreground">0 = referência fixa; 1 = escalonamento completo. Padrão 0,6.</span></label>
            <label className="block"><span className="mb-1 flex items-center justify-between text-[11px] font-bold"><span>Influência de σ (multiplicador)</span><input type="number" min={0.5} max={2} step={0.05} value={draft.sigmaMultiplier} onChange={e=>setDraft(v=>({...v,sigmaMultiplier:Number(e.target.value)}))} disabled={saving || settingsLoading} className="w-20 rounded-md border border-border/60 bg-background px-2 py-1 text-right font-mono"/></span><input className="w-full accent-primary" type="range" min={0.5} max={2} step={0.05} value={Math.max(0.5,Math.min(2,draft.sigmaMultiplier || 1))} onChange={e=>setDraft(v=>({...v,sigmaMultiplier:Number(e.target.value)}))} disabled={saving || settingsLoading}/><span className="block text-[10px] text-muted-foreground">O σ é calculado pelos dados reais. Este fator só amplia/reduz a distância dos limites; padrão 1×.</span></label>
            {(saveError || settingsError) && <p role="alert" className="text-[11px] text-destructive">{saveError || settingsError}</p>}
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-muted-foreground">Revisão {settingsRevision}</span><button type="button" onClick={()=>void saveDifficulty()} disabled={!onSaveSettings || !hasChanges || !validDraft || saving || settingsLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin"/> : <Save className="size-3.5"/>}Salvar no MongoDB</button></div>
          </div>}
        </div>}
        <div className="border-t border-border/50 bg-background/30 p-3">
          <button type="button" onClick={()=>setBookOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[.07] px-3 py-2.5 text-left text-xs font-bold text-primary hover:bg-primary/15"><span className="flex items-center gap-2"><BookOpen className="size-4"/> Conheça o método · Livro interativo</span><span className="text-[10px] font-normal">6 páginas</span></button>
        </div>
      </motion.div>}
    </AnimatePresence>
    {bookOpen && typeof document !== "undefined" && createPortal(
      <DifficultyRulebook settings={settings} isGm={isGm} onClose={closeBook}/>, document.body)}
  </section>
}
