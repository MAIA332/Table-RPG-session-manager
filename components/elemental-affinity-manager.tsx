"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowRightLeft, BookOpen, Check, CircleHelp, Coins, LockKeyhole, Shield, Sparkles, X } from "lucide-react"
import { apiFetch } from "@/lib/client"
import type { Character } from "@/lib/types"
import {
  ELEMENTS, ELEMENT_NAMES, AFFINITY_LEVELS, availableClassElements,
  characterEffectiveness, effectiveness, readElementalSelection, tieredElements,
  type ElementId,
} from "@/lib/elemental-affinities"

const buttonBase = "rounded-lg border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-40"

type Props = {
  character: Character
  classDefinitions: Array<{ id: string; name: string; affinity?: unknown; element?: unknown }>
  editable: boolean
  onUpdated?: (updated: Character) => void
  onClose: () => void
}

export function ElementalAffinityManager({ character, classDefinitions, editable, onUpdated, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const assigned = readElementalSelection((character as Character & { elementalAffinities?: unknown }).elementalAffinities)
  const ownedIds = new Set(character.classes.filter(cls => cls.level > 0).map(cls => cls.classId))
  const ownedClasses = classDefinitions.filter(cls => ownedIds.has(cls.id))
  const localAvailable = useMemo(() => availableClassElements(ownedClasses), [classDefinitions, character.classes])
  const [authoritativeAvailable, setAuthoritativeAvailable] = useState<ElementId[] | null>(null)
  const available = authoritativeAvailable ?? localAvailable
  const initial = tieredElements(available, assigned)
  const [primary, setPrimary] = useState<ElementId | null>(initial.primary)
  const [secondary, setSecondary] = useState<ElementId | null>(initial.secondary)
  const [attacker, setAttacker] = useState<ElementId>("luz")
  const [defender, setDefender] = useState<ElementId>(initial.primary || "trevas")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [changedCharacter, setChangedCharacter] = useState<Character>(character)
  const saved = readElementalSelection((changedCharacter as Character & { elementalAffinities?: unknown }).elementalAffinities)
  const locked = saved.locked
  const lore = Number(changedCharacter.resources.lp) || 0
  const canChange = editable && !locked
  const tiers = tieredElements(available, { primary, secondary })
  // Um elemento de demonstração que não pertence à ficha usa o valor-base.
  // Somente afinidades realmente escolhidas/pertencentes ao personagem têm redução.
  const simulatedRank = defender === tiers.primary ? "principal"
    : defender === tiers.secondary ? "secundaria"
      : (primary || secondary) && tiers.complementary.includes(defender) ? "complementar" : "principal"
  const sim = effectiveness(attacker, defender, simulatedRank)
  const currentSim = characterEffectiveness(attacker, available, { primary, secondary })

  useEffect(() => { setMounted(true); const old = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = old } }, [])
  useEffect(() => {
    let active = true
    setAuthoritativeAvailable(null)
    void apiFetch<{ available?: ElementId[] }>(`/api/characters/${encodeURIComponent(character.id)}/affinities`, { cache: "no-store" })
      .then(result => { if (active && Array.isArray(result.available)) setAuthoritativeAvailable(result.available.filter(element => ELEMENTS.includes(element))) })
      .catch(() => { /* Em falha de rede, a confirmação ainda será validada na API. */ })
    return () => { active = false }
  }, [character.id])
  useEffect(() => {
    const selection = readElementalSelection((character as Character & { elementalAffinities?: unknown }).elementalAffinities)
    setChangedCharacter(character)
    setPrimary(selection.primary)
    setSecondary(selection.secondary)
  }, [character])
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function mutate(action: "unlock" | "assign") {
    if (busy) return
    setBusy(true); setError("")
    try {
      const result = await apiFetch<{ character: Character }>(`/api/characters/${encodeURIComponent(character.id)}/affinities`, {
        method: "PATCH", body: JSON.stringify(action === "unlock" ? { action } : { action, primary, secondary }),
      })
      if (!result.character) throw new Error("A resposta não confirmou o salvamento.")
      setChangedCharacter(result.character)
      onUpdated?.(result.character)
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar afinidades.") }
    finally { setBusy(false) }
  }

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[21000] flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground" role="dialog" aria-modal="true" aria-label="Gerenciar afinidades elementais">
      <div className="pointer-events-none absolute inset-0 opacity-[.035]" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px),linear-gradient(90deg,currentColor 1px, transparent 1px)", backgroundSize: "52px 52px" }} />
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-primary/30 bg-card/80 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 place-items-center rounded-xl border border-primary/40 bg-primary/15 text-primary"><Sparkles className="size-6" /></span><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Códice elemental • Morte Mágica</p><h2 className="font-serif text-xl font-black sm:text-2xl">Gerenciar afinidades</h2></div></div>
        <button type="button" onClick={onClose} className="rounded-full border border-border/70 p-2 hover:border-primary/60" aria-label="Fechar"><X className="size-5" /></button>
      </header>
      <div className="relative z-10 mx-auto grid w-full max-w-[1480px] flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 md:grid-cols-[minmax(300px,1fr)_minmax(340px,1.2fr)] md:p-8">
        <section className="space-y-5">
          <div className="border-l-2 border-primary pl-4"><p className="text-[10px] font-black uppercase tracking-widest text-primary">01 • Essência da classe</p><h3 className="mt-2 font-serif text-2xl font-bold">Sua natureza elemental</h3><p className="mt-2 text-sm text-muted-foreground">Escolha a afinidade principal e a secundária entre os elementos das suas classes. As demais serão complementares.</p></div>
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "Principal", value: tiers.primary || "Não definido", hint: "Regra integral" }, { label: "Secundária", value: tiers.secondary || "Não definido", hint: "−1 nível" }, { label: "Complementares", value: primary || secondary ? String(tiers.complementary.length) : "Não definido", hint: "−2 níveis" }].map(card => <div key={card.label} className="min-w-0 rounded-xl border border-primary/20 bg-card/70 p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{card.label}</p><p className="mt-2 truncate font-serif font-bold text-primary">{ELEMENT_NAMES[card.value as ElementId] || card.value}</p><p className="mt-1 text-[10px] text-muted-foreground">{card.hint}</p></div>)}
          </div>
          {locked && <div className="rounded-xl border border-primary/30 bg-primary/[.06] p-4"><div className="flex items-center gap-2 text-sm font-bold"><LockKeyhole className="size-4 text-primary" /> Afinidades fixadas</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Uma mudança exige 1 Ponto de Lore. Liberar edição desconta o ponto imediatamente; a próxima confirmação fixa novamente a escolha.</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-1 text-xs"><Coins className="size-4 text-primary" /> {lore} Lore disponível(is)</span>{editable && <button disabled={busy || lore < 1} onClick={() => void mutate("unlock")} className={`${buttonBase} border-primary/50 bg-primary/15 text-primary hover:bg-primary/25`}>Desbloquear edição · 1 Lore</button>}</div></div>}
          {!editable && <p className="rounded-lg border border-border/70 bg-card p-3 text-xs text-muted-foreground">Você pode consultar as afinidades, mas somente o dono da ficha ou o Mestre pode editá-las.</p>}
          <div className="space-y-2"><h4 className="text-xs font-black uppercase tracking-widest text-primary">Afinidades disponíveis ({available.length})</h4>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{ownedClasses.length ? ownedClasses.map(cls => `${cls.name}: ${ELEMENT_NAMES[availableClassElements([cls])[0]]}`).join(" · ") : "Nenhuma classe com nível adquirido."}</p>
            {available.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-xs text-muted-foreground">Nenhum elemento de classe encontrado. A ficha permanece neutra (1×) até obter uma classe.</p> :
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{available.map(element => <div key={element} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/65 p-3"><span className="text-xs font-bold">{ELEMENT_NAMES[element]}</span><div className="flex gap-1"><button type="button" disabled={!canChange} title="Definir como principal" onClick={() => { setPrimary(element); if (secondary === element) setSecondary(null) }} className={`${buttonBase} ${primary === element ? "border-primary bg-primary/20 text-primary" : "border-border/60 text-muted-foreground hover:text-primary"}`}>P</button><button type="button" disabled={!canChange || primary === element} title="Definir como secundária" onClick={() => setSecondary(secondary === element ? null : element)} className={`${buttonBase} ${secondary === element ? "border-primary bg-primary/20 text-primary" : "border-border/60 text-muted-foreground hover:text-primary"}`}>S</button></div></div>)}</div>}
          </div>
          {canChange && <button type="button" disabled={busy || !primary || (available.length > 1 && !secondary) || primary === secondary} onClick={() => void mutate("assign")} className={`${buttonBase} w-full border-primary bg-primary px-5 py-3 text-primary-foreground hover:opacity-90`}><Check className="mr-1 inline size-4" /> Confirmar afinidades</button>}
          {error && <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
          <p className="text-[11px] text-muted-foreground">Classes sem elemento explícito recebem o elemento base do sistema. As afinidades complementares não são removidas quando ficam fora das duas escolhas.</p>
        </section>
        <section className="space-y-5">
          <div className="border-l-2 border-primary pl-4"><p className="text-[10px] font-black uppercase tracking-widest text-primary">02 • Laboratório de confronto</p><h3 className="mt-2 font-serif text-2xl font-bold">Simulador de eficácia</h3><p className="mt-2 text-sm text-muted-foreground">Escolha um elemento atacante e outro defensor. A simulação não altera HP, MP ou a ficha.</p></div>
          <div className="grid gap-4 rounded-xl border border-primary/20 bg-card/65 p-4 sm:grid-cols-2">
            {[{ label: "Atacante", selected: attacker, change: setAttacker }, { label: "Defensor", selected: defender, change: setDefender }].map(field => <div key={field.label}><p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-primary">{field.label}</p><div className="grid grid-cols-3 gap-1.5">{ELEMENTS.map(element => <button key={element} type="button" title={ELEMENT_NAMES[element]} aria-pressed={field.selected === element} onClick={() => field.change(element)} className={`min-w-0 rounded-md border p-2 text-[10px] font-bold transition ${field.selected === element ? "border-primary bg-primary/20 text-primary" : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/50"}`}>{ELEMENT_NAMES[element]}</button>)}</div></div>)}
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/[.07] p-5 text-center"><p className="text-xs font-semibold text-muted-foreground">{ELEMENT_NAMES[attacker]} contra {ELEMENT_NAMES[defender]}</p><div className="my-3 flex items-center justify-center gap-4"><span className="font-serif text-3xl font-bold">{ELEMENT_NAMES[attacker]}</span><ArrowRightLeft className="size-5 text-primary" /><span className="font-serif text-3xl font-bold">{ELEMENT_NAMES[defender]}</span></div><p className="font-mono text-5xl font-black text-primary">{sim.multiplier.toLocaleString("pt-BR")}×</p><p className="mt-2 text-xs text-muted-foreground">{AFFINITY_LEVELS[sim.level].name} · {sim.specified ? "Combinação cadastrada" : "Combinação neutra"}</p></div>
          <div className="grid grid-cols-3 gap-2">{(["principal", "secundaria", "complementar"] as const).map(rank => { const result = effectiveness(attacker, defender, rank); return <div key={rank} className="rounded-lg border border-border/60 bg-card/50 p-3 text-center"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{rank}</p><p className="mt-2 font-mono text-xl font-black text-primary">{result.multiplier.toLocaleString("pt-BR")}×</p></div> })}</div>
          <div className="rounded-lg border border-border/60 bg-card/35 p-4 text-xs leading-relaxed text-muted-foreground"><p className="flex items-center gap-2 font-bold text-foreground"><BookOpen className="size-4 text-primary" /> Simulação na ficha</p><p className="mt-2">Contra as afinidades selecionadas do personagem: <strong className="text-primary">{currentSim.multiplier.toLocaleString("pt-BR")}×</strong> {currentSim.element ? `(prevalece ${ELEMENT_NAMES[currentSim.element]})` : "(neutro)"}.</p><p className="mt-2">Pares não descritos na tabela ofensiva permanecem em 1×. Uma ficha ainda não definida também recebe sempre 1×.</p><p className="mt-2 flex items-center gap-2"><CircleHelp className="size-4" /> Os valores de dano são arredondados para baixo após o multiplicador.</p></div>
        </section>
      </div>
    </div>, document.body)
}
