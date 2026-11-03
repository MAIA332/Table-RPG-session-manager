"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowRight, BookOpenText, Check, ChevronRight, CircleDot, Crown,
  GitBranch, LockKeyhole, Shield, Sparkles, Swords, WandSparkles, X, Zap,
} from "lucide-react"

/** Árvore somente de leitura: usa os mesmos bônus das classes oficiais e personalizadas. */
export type EvolutionSkill = {
  id: string
  name: string
  description?: string
  maxLevel?: number
  bonuses?: Record<number, Array<{ id?: string; name: string; description?: string }>>
}

type EvolutionOption = { id: string; name: string; description: string }
type Tier = { level: number; options: EvolutionOption[] }
type Selection = { level: number; id: string }

const ICONS = [Sparkles, Swords, Shield, Zap, WandSparkles, Crown] as const

function validLevel(raw: unknown): number {
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(0, Math.min(50, Math.floor(value))) : 0
}

function evolutionTiers(skill: EvolutionSkill): Tier[] {
  const provided = (skill?.bonuses || {}) as Record<string, unknown>
  const stages = new Map<number, EvolutionOption[]>()
  for (const [key, raw] of Object.entries(provided)) {
    const level = Number(key)
    if (!Number.isSafeInteger(level) || level < 1 || level > 50 || !Array.isArray(raw)) continue
    stages.set(level, raw.flatMap((entry: unknown, index: number) => {
      if (!entry || typeof entry !== "object") return []
      const option = entry as Record<string, unknown>
      const name = String(option.name || "").trim()
      if (!name) return []
      return [{
        id: String(option.id || `${level}-${index}`),
        name,
        description: String(option.description || "").trim(),
      }]
    }))
  }
  const declared = validLevel(skill?.maxLevel)
  const highest = Math.max(1, declared, ...stages.keys())
  return Array.from({ length: highest }, (_, index) => ({
    level: index + 1,
    options: stages.get(index + 1) || [],
  }))
}

export function hasEvolutionBonuses(bonuses: EvolutionSkill["bonuses"] | undefined): boolean {
  return !!bonuses && Object.values(bonuses).some(value =>
    Array.isArray(value) && value.some(option => option && typeof option.name === "string" && option.name.trim()),
  )
}

function tierState(level: number, currentLevel: number) {
  return level < currentLevel ? "past" : level === currentLevel ? "current" : "locked"
}

function tierLabel(level: number, currentLevel: number) {
  if (level < currentLevel) return "Alcançado"
  if (level === currentLevel) return "Nível atual"
  return level === currentLevel + 1 ? "Próximo · bloqueado" : "Bloqueado"
}

export function SkillEvolutionTree({
  skill, className, level, onClose,
}: {
  skill: EvolutionSkill
  className: string
  level: number
  onClose: () => void
}) {
  const tiers = useMemo(() => evolutionTiers(skill), [skill])
  const currentLevel = validLevel(level)
  const maxLevel = tiers.length
  const initial = tiers.find(tier => tier.level === currentLevel && tier.options.length) ||
    tiers.find(tier => tier.level > currentLevel && tier.options.length) ||
    tiers.find(tier => tier.options.length)
  const [selected, setSelected] = useState<Selection | null>(() =>
    initial ? { level: initial.level, id: initial.options[0].id } : null,
  )
  const selectedTier = tiers.find(tier => tier.level === selected?.level)
  const selectedBonus = selectedTier?.options.find(option => option.id === selected?.id)
  const selectedStatus = selectedTier ? tierState(selectedTier.level, currentLevel) : "locked"
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
        return
      }
      if (event.key !== "Tab" || !dialogRef.current) return
      // A árvore pode estar sobre a modal de conceder habilidades: só ela recebe Tab.
      event.stopImmediatePropagation()
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]',
      )).filter(element => element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const focused = document.activeElement as HTMLElement | null
      if (!focused || !dialogRef.current.contains(focused)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && focused === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
    // A modal só é montada ao abrir; o callback é estável durante esta sessão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[12050] h-[100dvh] w-screen overflow-hidden bg-background text-foreground" role="presentation">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-20 top-[-20%] size-[45vw] rounded-full bg-primary/[.055] blur-[100px]" />
        <div className="absolute -right-32 bottom-[-40%] size-[55vw] rounded-full bg-accent/[.045] blur-[110px]" />
        <div className="absolute inset-0 opacity-[.025]" style={{ backgroundImage: "linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px)", backgroundSize: "42px 42px" }} />
      </div>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="skill-evolution-title" tabIndex={-1}
        className="relative flex h-full min-h-0 w-full flex-col outline-none">
        <header className="z-10 shrink-0 border-b border-primary/25 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="grid size-11 shrink-0 place-items-center border border-primary/45 bg-primary/10 text-primary sm:size-12"><GitBranch className="size-6" /></div>
              <div className="min-w-0">
                <p className="hidden text-[9px] font-black uppercase tracking-[.25em] text-primary/75 sm:block">MORTE MÁGICA <span className="mx-2 text-muted-foreground">/</span> ATLAS DE EVOLUÇÃO</p>
                <h2 id="skill-evolution-title" className="truncate font-serif text-lg font-black tracking-wide sm:text-2xl lg:text-3xl">{skill.name}</h2>
                <p className="truncate text-xs text-muted-foreground">{className} · Progressão de habilidade</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden border border-primary/25 bg-primary/[.055] px-3 py-2 font-mono text-xs text-primary sm:inline-flex">NV. {currentLevel} / {maxLevel}</span>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar árvore de evolução"
                className="grid size-10 place-items-center border border-border/70 bg-card/40 text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X className="size-5" /></button>
            </div>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1720px] space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-end">
              <div className="min-w-0 border-l-2 border-primary/70 pl-4">
                <p className="text-[10px] font-black uppercase tracking-[.22em] text-primary">01 · Caminho de domínio</p>
                <h3 className="mt-1 font-serif text-xl font-black sm:text-2xl">Conheça o próximo estágio</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Explore cada nível e selecione um símbolo para ler os efeitos. Estágios futuros podem ser visualizados, mas permanecem bloqueados até a habilidade evoluir.</p>
              </div>
              <div className="border border-primary/20 bg-card/35 p-3 sm:p-4">
                <div className="mb-2 flex justify-between gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><span>Domínio da habilidade</span><span className="text-primary">{Math.round(Math.min(100, currentLevel / maxLevel * 100))}%</span></div>
                <div className="flex h-2 gap-1" role="progressbar" aria-label="Progresso de nível da habilidade" aria-valuenow={Math.min(currentLevel, maxLevel)} aria-valuemin={0} aria-valuemax={maxLevel}>
                  {tiers.map(tier => <span key={tier.level} className={`h-full min-w-0 flex-1 ${tier.level <= currentLevel ? "bg-primary" : "bg-border/65"}`} />)}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">{currentLevel >= maxLevel ? "Evolução máxima atingida" : `Próximo nível: ${Math.min(maxLevel, currentLevel + 1)}`}</p>
              </div>
            </div>

            <div className="grid min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <div className="min-w-0 overflow-hidden border border-primary/25 bg-card/30">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 bg-primary/[.035] px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2"><CircleDot className="size-4 text-primary" /><h4 className="text-[10px] font-black uppercase tracking-[.18em]">Mapa de progressão</h4></div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground"><span><Check className="mr-1 inline size-3 text-primary" />Alcançado</span><span><Sparkles className="mr-1 inline size-3 text-primary" />Atual</span><span><LockKeyhole className="mr-1 inline size-3" />Bloqueado</span></div>
                </div>
                <div className="overflow-x-auto overscroll-x-contain px-4 py-6 sm:px-6 sm:py-8">
                  <div className="relative flex min-w-max items-start gap-4 pb-3 sm:gap-6">
                    <div className="pointer-events-none absolute left-10 right-10 top-[31px] h-px bg-primary/25" aria-hidden="true" />
                    {tiers.map(tier => {
                      const status = tierState(tier.level, currentLevel)
                      const isLocked = status === "locked"
                      const isCurrent = status === "current"
                      return <section key={tier.level} className={`relative w-[216px] shrink-0 sm:w-[242px] ${isLocked ? "opacity-85" : ""}`} aria-label={`Nível ${tier.level}: ${tierLabel(tier.level, currentLevel)}`}>
                        <div className="mb-5 flex flex-col items-center">
                          <div className={`relative grid size-[62px] place-items-center rounded-full border-2 bg-background shadow-xl ${isCurrent ? "border-primary text-primary shadow-[0_0_28px_rgba(0,0,0,.25)]" : status === "past" ? "border-primary/60 text-primary" : "border-border text-muted-foreground"}`}>
                            {isLocked ? <LockKeyhole className="size-5" /> : isCurrent ? <Sparkles className="size-5" /> : <Check className="size-5" />}
                          </div>
                          <p className="mt-3 font-serif text-lg font-bold">Nível {tier.level}</p>
                          <p className={`mt-1 min-h-4 text-center text-[9px] font-black uppercase tracking-[.12em] ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>{tierLabel(tier.level, currentLevel)}</p>
                        </div>
                        <div className="mx-auto mb-3 h-5 w-px bg-primary/25" aria-hidden="true" />
                        <div className={`space-y-2 rounded-xl border p-2.5 ${isCurrent ? "border-primary/45 bg-primary/[.065]" : "border-border/60 bg-background/40"}`}>
                          {tier.options.length ? tier.options.map((option, index) => {
                            const Icon = ICONS[index % ICONS.length]
                            const active = selected?.level === tier.level && selected.id === option.id
                            return <button key={`${tier.level}-${option.id}-${index}`} type="button" aria-pressed={active}
                              aria-label={`${option.name}, nível ${tier.level}, ${tierLabel(tier.level, currentLevel)}`}
                              onClick={() => setSelected({ level: tier.level, id: option.id })}
                              className={`group flex w-full items-center gap-3 rounded-md border px-2.5 py-3 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? "border-primary bg-primary/15" : "border-border/45 bg-card/40 hover:border-primary/55 hover:bg-primary/[.055]"}`}>
                              <span className={`relative grid size-10 shrink-0 place-items-center rounded-full border ${active ? "border-primary bg-primary/20 text-primary" : isLocked ? "border-border/70 bg-background text-muted-foreground" : "border-primary/40 bg-primary/10 text-primary"}`}>
                                <Icon className="size-[19px]" />
                                {isLocked && <LockKeyhole className="absolute -bottom-1 -right-1 size-3.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground" />}
                              </span>
                              <span className="min-w-0 flex-1"><span className={`block break-words text-xs font-bold ${isLocked ? "text-muted-foreground" : "text-foreground"}`}>{option.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{isLocked ? `Requer nível ${tier.level}` : "Inspecionar efeito"}</span></span>
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            </button>
                          }) : <div className="rounded-md border border-dashed border-border/60 px-3 py-5 text-center"><p className="text-xs font-semibold text-muted-foreground">Sem bônus cadastrado</p><p className="mt-1 text-[10px] text-muted-foreground">O nível existe, mas não há opções definidas.</p></div>}
                        </div>
                      </section>
                    })}
                  </div>
                </div>
                <footer className="border-t border-primary/15 px-4 py-3 text-[11px] text-muted-foreground">Os caminhos indicam a sequência dos níveis, não dependências entre bônus. As opções de cada estágio são alternativas conforme a regra da habilidade.</footer>
              </div>

              <aside className="min-w-0 space-y-4 xl:sticky xl:top-5 xl:self-start">
                <div className="border-l-2 border-primary/70 pl-4"><p className="text-[10px] font-black uppercase tracking-[.22em] text-primary">02 · Inspeção de talento</p><h4 className="mt-1 font-serif text-xl font-bold">Detalhes da evolução</h4></div>
                <article aria-live="polite" className="overflow-hidden border border-primary/30 bg-card/50 shadow-lg">
                  <div className="border-b border-primary/20 bg-primary/[.055] p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid size-12 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">{selectedStatus === "locked" ? <LockKeyhole className="size-5" /> : selectedStatus === "current" ? <Sparkles className="size-5" /> : <Check className="size-5" />}</div>
                      <span className={`border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${selectedStatus === "locked" ? "border-border text-muted-foreground" : "border-primary/40 bg-primary/10 text-primary"}`}>{selectedTier ? tierLabel(selectedTier.level, currentLevel) : "Sem seleção"}</span>
                    </div>
                    <h5 className="mt-4 font-serif text-xl font-black leading-snug">{selectedBonus?.name || "Selecione um bônus"}</h5>
                    <p className="mt-1 text-[11px] text-muted-foreground">{selectedTier ? `Estágio de nível ${selectedTier.level}` : "Toque em um talento no mapa"}</p>
                  </div>
                  <div className="space-y-4 p-4 sm:p-5">
                    <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-primary">Efeito do bônus</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{selectedBonus?.description || "Selecione uma opção de evolução para visualizar o efeito cadastrado."}</p></div>
                    {selectedTier && selectedTier.level > currentLevel ?
                      <div className="flex gap-2 border border-border/70 bg-background/45 p-3 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" /><span><strong className="text-foreground">Bloqueado.</strong> Evolua esta habilidade até o nível {selectedTier.level}. Faltam {selectedTier.level - currentLevel} nível(is).</span></div>
                      : selectedTier ? <div className="flex gap-2 border border-primary/25 bg-primary/[.045] p-3 text-xs text-foreground/85"><Check className="mt-0.5 size-4 shrink-0 text-primary" /><span>{selectedTier.level === currentLevel ? "Estágio atual. Consulte as regras da habilidade para escolher seu bônus ao ativá-la." : "Estágio já alcançado. Consulte as regras da habilidade para saber quais opções podem ser usadas."}</span></div> : null}
                  </div>
                </article>
                <div className="border border-border/60 bg-card/25 p-4"><div className="flex items-center gap-2 text-primary"><BookOpenText className="size-4" /><p className="text-[10px] font-black uppercase tracking-[.16em]">Regra original</p></div><p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{skill.description || "Nenhuma descrição informada."}</p><p className="mt-3 border-t border-border/50 pt-3 text-[10px] text-muted-foreground">Visualização apenas informativa. Nenhum nível ou bônus é concedido por esta tela.</p></div>
              </aside>
            </div>
          </div>
        </div>
        <footer className="z-10 shrink-0 border-t border-primary/20 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1720px] items-center justify-between gap-3"><span className="hidden text-[11px] text-muted-foreground sm:block">Evolua suas habilidades pela ficha ou pelo sistema de concessão.</span><button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 border border-primary/35 bg-primary/10 px-5 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"><ArrowRight className="size-4 rotate-180" /> Voltar à ficha</button></div></footer>
      </section>
    </div>, document.body,
  )
}
