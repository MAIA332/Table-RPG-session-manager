"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft, ArrowRight, BookOpenText, Check, Coins, Crown, Dices,
  Eye, Heart, Loader2, Package, Save, Shield, Skull, Sparkles,
  Swords, WandSparkles, X, Zap, GitBranch,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CLASSES, EQUIPMENT, STARTING_ZENIT, type GameClass } from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import { baseGameClasses, getCampaignClassCatalog } from "@/lib/class-catalog"
import { ELEMENT_NAMES, availableClassElements, classElement, readElementalSelection, type ElementId } from "@/lib/elemental-affinities"
import { publicPortraitUrl, validateAlternatePortraits, type AlternatePortrait } from "@/lib/portrait-gallery"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import { EssenceStep, ClassesStep, EquipmentStep } from "./creator-steps"
import { CreatorPortraitSlots } from "./creator-portrait-slots"
import { CreatorAffinityStep } from "./creator-affinity-step"
import { SkillEvolutionTree, hasEvolutionBonuses, type EvolutionSkill } from "./skill-evolution-tree"
import type { NPCDraft } from "./character-sheet"
import { NpcSpecialAttacksStep, type NpcAttackTemplate } from "./npc-special-attacks-step"
import { playerAttackDefenseLabel, validatePlayerSpecialAttacks, type PlayerSpecialAttack, type PlayerSpecialAttackCharacter } from "@/lib/player-special-attacks"

const STAGES = ["Essência", "Classes", "Atributos", "Afinidades", "Golpes Especiais", "Equipamento"] as const
const STAGE_META = [
  { label: "I · IDENTIDADE", title: "Uma nova presença no mundo", subtitle: "Dê rosto, nome e história à figura que entrará em sua campanha.", icon: Sparkles },
  { label: "II · DESTINO", title: "Forje suas disciplinas", subtitle: "Como Mestre, distribua quantos níveis e classes forem necessários.", icon: Swords },
  { label: "III · PODER", title: "Molde seus atributos", subtitle: "Configure cada dado livremente, de d6 a d20, sem orçamento compartilhado.", icon: Shield },
  { label: "IV · ESSÊNCIA", title: "Determine suas afinidades", subtitle: "Escolha apenas elementos presentes nas classes deste NPC.", icon: WandSparkles },
  { label: "V · TÉCNICAS", title: "Arsenal de golpes especiais", subtitle: "Prepare técnicas inéditas ou copie as já cadastradas. Esta etapa é opcional.", icon: Swords },
  { label: "VI · ARSENAL", title: "Prepare sua invocação", subtitle: "Escolha os itens que estarão disponíveis quando o NPC ganhar vida.", icon: Package },
] as const
const ATTRS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const ATTR_LABELS: Record<AttributeKey, string> = { dex: "Destreza", ins: "Intuição", mig: "Vigor", wlp: "Vontade" }
const NPC_DICE = ["d6", "d8", "d10", "d12", "d14", "d16", "d18", "d20"] as const
const DEFAULT_DICE: Record<AttributeKey, DieSize> = { dex: "d8", ins: "d8", mig: "d8", wlp: "d8" }

type EquipmentEntry = { id: string; name: string; cost?: number; detail?: string; purchasable?: boolean }
type Props = {
  onCreated: (npc: NPCDraft) => void | Promise<void>
  onCancel: () => void
  initialNpc?: NPCDraft
  customClasses?: GameClass[]
  campaignCharacters?: Character[]
  nurseryNPCs?: NPCDraft[]
  customEquipment?: EquipmentEntry[]
}

function NpcAttributes({ attributes, onChange }: {
  attributes: Record<AttributeKey, DieSize>
  onChange: (next: Record<AttributeKey, DieSize>) => void
}) {
  return <section className="space-y-5">
    <div className="border-l-2 border-primary pl-4"><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Dados de um NPC</p><h3 className="mt-1 font-serif text-xl font-bold">Potencial sem limites</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Os quatro atributos são independentes. O Mestre pode escolher até d20 para cada um.</p></div>
    <div className="grid min-w-0 grid-cols-2 gap-3">
      {ATTRS.map(key => <label key={key} className="flex min-w-0 flex-col items-center gap-3 border border-primary/25 bg-card/60 p-3 text-center sm:p-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{key.toUpperCase()}</span>
        <strong className="font-serif text-3xl font-black text-primary sm:text-4xl">{attributes[key]}</strong>
        <select aria-label={`Dado de ${ATTR_LABELS[key]}`} value={attributes[key]}
          onChange={event => onChange({ ...attributes, [key]: event.target.value as DieSize })}
          className="w-full min-w-0 border border-primary/30 bg-background px-2 py-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary">
          {NPC_DICE.map(die => <option key={die} value={die}>{die.toUpperCase()}</option>)}
        </select>
        <span className="text-[11px] text-muted-foreground">{ATTR_LABELS[key]}</span>
      </label>)}
    </div>
    <p className="border-l-2 border-primary/40 pl-3 text-[11px] leading-relaxed text-muted-foreground">Diferentemente dos viajantes, NPCs não gastam pontos para aumentar os dados.</p>
  </section>
}

/** Mesmos cinco passos e mesma composição visual da Forja do Viajante, sem trocar as regras do Mestre. */
export function NPCForge({ onCreated, onCancel, initialNpc, customClasses = [], campaignCharacters = [], nurseryNPCs = [], customEquipment = [] }: Props) {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(initialNpc?.name ?? "")
  const [avatarUrl, setAvatarUrl] = useState(initialNpc?.avatarUrl ?? "")
  const [origin, setOrigin] = useState(initialNpc?.origin ?? "")
  const [identity, setIdentity] = useState(initialNpc?.identity ?? "")
  const [theme, setTheme] = useState(initialNpc?.theme ?? "")
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({ ...(initialNpc?.skills || {}) })
  const [skillsEdited, setSkillsEdited] = useState(false)
  const [attributes, setAttributes] = useState<Record<AttributeKey, DieSize>>({ ...DEFAULT_DICE, ...(initialNpc?.attributes || {}) })
  const [equipment, setEquipment] = useState<string[]>([...(initialNpc?.equipment || [])])
  const [resourceOverride, setResourceOverride] = useState(initialNpc?.resources ?? initialNpc?.archivedSnapshot?.resources)
  const inheritedSpecialAttacks = initialNpc?.specialAttacks ?? (initialNpc?.archivedSnapshot as (Character & PlayerSpecialAttackCharacter) | undefined)?.specialAttacks ?? []
  const [specialAttacks, setSpecialAttacks] = useState<PlayerSpecialAttack[]>([...inheritedSpecialAttacks])
  const oldAffinity = readElementalSelection(initialNpc?.elementalAffinities ?? (initialNpc?.archivedSnapshot as (Character & { elementalAffinities?: unknown }) | undefined)?.elementalAffinities)
  const [primary, setPrimary] = useState<ElementId | null>(oldAffinity.primary)
  const [secondary, setSecondary] = useState<ElementId | null>(oldAffinity.secondary)
  const [portraitLabel, setPortraitLabel] = useState(initialNpc?.portraitLabel || (initialNpc?.archivedSnapshot as Character & { portraitLabel?: string } | undefined)?.portraitLabel || "Normal")
  const [portraitGallery, setPortraitGallery] = useState<AlternatePortrait[]>(initialNpc?.portraitGallery ?? (initialNpc?.archivedSnapshot as Character & { portraitGallery?: AlternatePortrait[] } | undefined)?.portraitGallery ?? [])
  const [selectedPortraitId, setSelectedPortraitId] = useState("__primary__")
  const [evolution, setEvolution] = useState<{ skill: EvolutionSkill; className: string; level: number } | null>(null)

  useEffect(() => {
    setMounted(true)
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = original }
  }, [])

  const catalog = useMemo(() => getCampaignClassCatalog(
    [...campaignCharacters, ...nurseryNPCs], customClasses,
    (initialNpc?.classes || []).map(cls => cls.classId),
  ), [campaignCharacters, nurseryNPCs, customClasses, initialNpc])
  const classes = useMemo(() => baseGameClasses(catalog), [catalog])
  const totalLevels = useMemo(() => Object.values(skillLevels).reduce((sum, value) => sum + value, 0), [skillLevels])
  const classLevels = useMemo(() => {
    if (initialNpc && !skillsEdited) return Object.fromEntries((initialNpc.classes || []).map(cls => [cls.classId, cls.level]))
    const next: Record<string, number> = {}
    for (const cls of classes) {
      const level = cls.skills.reduce((sum, skill) => sum + (skillLevels[skill.id] || 0), 0)
      if (level > 0) next[cls.id] = level
    }
    for (const old of initialNpc?.classes || []) {
      const definition = classes.find(cls => cls.id === old.classId)
      const previouslyLeveled = definition?.skills.some(skill => (initialNpc?.skills?.[skill.id] ?? 0) > 0) ?? false
      if (!Object.prototype.hasOwnProperty.call(next, old.classId) && !previouslyLeveled) next[old.classId] = old.level
    }
    return next
  }, [classes, initialNpc, skillLevels, skillsEdited])
  const classesPayload = useMemo<ClassLevel[]>(() => Object.entries(classLevels).filter(([, level]) => level > 0).map(([classId, level]) => ({ classId, level })), [classLevels])
  const selectedClasses = useMemo(() => classes.filter(cls => (classLevels[cls.id] || 0) > 0).map(cls => {
    const exact = customClasses.find(item => item.id === cls.id) || CLASSES.find(item => item.id === cls.id) || cls
    return { ...cls, affinity: classElement(exact) }
  }), [classes, classLevels, customClasses])
  const options = useMemo(() => availableClassElements(selectedClasses), [selectedClasses])
  const selectedPrimary = primary && options.includes(primary) ? primary : null
  const selectedSecondary = secondary && secondary !== selectedPrimary && options.includes(secondary) ? secondary : null
  const itemMap = useMemo(() => new Map<string, EquipmentEntry>(
    [...EQUIPMENT, ...customEquipment].map((item): [string, EquipmentEntry] => [item.id, item]),
  ), [customEquipment])
  const spent = equipment.reduce((sum, id) => sum + (itemMap.get(id)?.cost || 0), 0)
  const portraitChoices = [{ id: "__primary__", label: portraitLabel, url: avatarUrl }, ...portraitGallery]
  const shownPortrait = portraitChoices.find(item => item.id === selectedPortraitId) || portraitChoices[0]
  const shownUrl = shownPortrait.url && (shownPortrait.url.startsWith("/") || shownPortrait.url.startsWith("data:image/") || publicPortraitUrl(shownPortrait.url)) ? shownPortrait.url : "/mystic-adventurer-portrait.png"
  const preview = useMemo(() => {
    try { return computeMaxResources(classesPayload, attributes, classes) } catch { return null }
  }, [classesPayload, attributes, classes])
  const archivedResources = initialNpc?.archivedSnapshot?.resources
  const existingAttackTemplates = useMemo<NpcAttackTemplate[]>(() => {
    const templates: NpcAttackTemplate[] = []
    for (const npc of nurseryNPCs) {
      if (npc.id === initialNpc?.id) continue
      const previous = (npc.archivedSnapshot as (Character & PlayerSpecialAttackCharacter) | undefined)?.specialAttacks
      for (const attack of npc.specialAttacks ?? previous ?? []) templates.push({ attack, source: `NPC · ${npc.name}` })
    }
    for (const character of campaignCharacters) {
      for (const attack of (character as Character & PlayerSpecialAttackCharacter).specialAttacks ?? []) {
        templates.push({ attack, source: `Ficha · ${character.name}` })
      }
    }
    return templates
  }, [nurseryNPCs, campaignCharacters, initialNpc?.id])
  const attackValidation = useMemo(() => {
    try { validatePlayerSpecialAttacks(specialAttacks); return null }
    catch (cause) { return cause instanceof Error ? cause.message : "Verifique os golpes especiais." }
  }, [specialAttacks])
  const portraitError = useMemo(() => {
    if (!portraitLabel.trim() || portraitLabel.length > 60) return "A legenda principal deve ter entre 1 e 60 caracteres."
    try {
      const checked = validateAlternatePortraits(portraitGallery)
      if (checked.some(item => item.url === avatarUrl.trim())) return "Não repita o avatar principal nas imagens alternativas."
    } catch (cause) { return cause instanceof Error ? cause.message : "Verifique os links de retrato." }
    return null
  }, [portraitGallery, portraitLabel, avatarUrl])

  function updateSkill(id: string, value: number, max: number) {
    if (value < 0 || value > max) return
    setSkillsEdited(true)
    setSkillLevels(prev => {
      const next = { ...prev, [id]: value }
      if (value === 0) delete next[id]
      return next
    })
  }
  function toggleEquipment(id: string) { setEquipment(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]) }
  const canContinue = step === 0 ? !!name.trim() && !portraitError : step === 4 ? !attackValidation : true

  async function submit() {
    if (saving || !name.trim() || portraitError || attackValidation) return
    setSaving(true); setError(null)
    try {
      const savedGallery = validateAlternatePortraits(portraitGallery)
      const savedAttacks = validatePlayerSpecialAttacks(specialAttacks)
      const hasAffinity = !!selectedPrimary
      const draft: NPCDraft = {
        ...(initialNpc || {}),
        id: initialNpc?.id || `npc-${newNpcId()}`,
        name: name.trim(), avatarUrl: avatarUrl.trim(), origin, identity, theme,
        classes: classesPayload, skills: skillLevels, attributes, equipment, specialAttacks: savedAttacks,
        npcLevel: initialNpc?.sourceBestiaryId && !skillsEdited ? initialNpc.npcLevel : Math.max(1, classesPayload.reduce((sum, entry) => sum + entry.level, 0)),
        resources: resourceOverride,
        portraitLabel: portraitLabel.trim(), portraitGallery: savedGallery,
        ...(hasAffinity
          ? { elementalAffinities: { primary: selectedPrimary, secondary: selectedSecondary, locked: true } }
          : initialNpc?.elementalAffinities
            ? { elementalAffinities: { primary: null, secondary: null, locked: false } }
            : {}),
      }
      await onCreated(draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar NPC no Berçário.")
    } finally { setSaving(false) }
  }

  if (!mounted) return null
  const stage = STAGE_META[step]
  const StageIcon = stage.icon
  return createPortal(<div onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className="fixed inset-0 z-[11000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground" style={{ backgroundImage: "radial-gradient(ellipse at 53% 38%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 62%), linear-gradient(color-mix(in srgb, var(--foreground) 3%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 3%, transparent) 1px, transparent 1px)", backgroundSize: "auto, 52px 52px, 52px 52px" }}>
    <header className="relative z-10 shrink-0 border-b border-primary/25 bg-background/90 px-3 py-3 shadow-lg backdrop-blur-xl sm:px-6 xl:px-10">
      <div className="mx-auto flex max-w-[1750px] items-center justify-between gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center border border-primary/50 bg-primary/10 text-primary sm:size-12"><Skull className="size-6" /></span><div className="min-w-0"><p className="hidden text-[9px] font-bold uppercase tracking-[.28em] text-primary/80 sm:block">Morte Mágica · Criação do Mestre</p><h1 className="truncate font-serif text-base font-black sm:text-xl">A Forja das Almas</h1></div></div>
        <nav aria-label="Passos de Forjar NPC" className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-1 sm:gap-2">
          {STAGES.map((label, index) => { const Icon = STAGE_META[index].icon; const active = step === index; return <button key={label} type="button" disabled={index > step || saving} onClick={() => { if (index < step) setStep(index) }} aria-current={active ? "step" : undefined} className={`flex shrink-0 items-center gap-2 border px-2 py-2 transition sm:px-3 lg:px-4 ${active ? "border-primary/60 bg-primary/15 text-primary" : index < step ? "border-primary/25 bg-primary/[.04] hover:border-primary/50" : "border-transparent text-muted-foreground/60"}`}><span className="grid size-6 place-items-center border border-current/30"><Icon className="size-3.5" /></span><span className="hidden text-[10px] font-black uppercase tracking-wider md:block">{label}</span><span className="text-[10px] md:hidden">{index + 1}</span></button> })}
        </nav>
        <button type="button" disabled={saving} onClick={onCancel} aria-label="Fechar Forja de NPC" className="grid size-10 shrink-0 place-items-center border border-border/70 bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-primary"><X className="size-5" /></button>
      </div>
    </header>
    <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain xl:overflow-hidden" role="dialog" aria-modal="true" aria-label="Forja de NPC">
      <div className="mx-auto grid min-h-full w-full max-w-[1750px] grid-cols-1 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(330px,500px)_minmax(330px,1fr)_minmax(240px,315px)]">
        <section className="relative min-w-0 border-b border-primary/15 bg-card/35 px-4 py-6 sm:px-7 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-8 xl:py-8" aria-label={`Configuração: ${STAGES[step]}`}>
          <div className="mb-6 border-l-2 border-primary pl-4"><p className="text-[10px] font-black uppercase tracking-[.24em] text-primary">{stage.label}</p><h2 className="mt-2 font-serif text-2xl font-black leading-tight sm:text-3xl">{stage.title}</h2><p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">{stage.subtitle}</p></div>
          {initialNpc?.archivedSnapshot && <p className="mb-4 flex items-center gap-2 border border-primary/25 bg-primary/[.05] p-3 text-[11px] text-muted-foreground"><Shield className="size-4 text-primary" /> Editando uma ficha arquivada: recursos, estados e vínculos continuam preservados.</p>}
          {step === 0 && <><EssenceStep name={name} setName={setName} avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} origin={origin} setOrigin={setOrigin} identity={identity} setIdentity={setIdentity} theme={theme} setTheme={setTheme} immersive /><CreatorPortraitSlots avatarUrl={avatarUrl} onAvatarUrl={setAvatarUrl} portraitLabel={portraitLabel} onPortraitLabel={setPortraitLabel} portraits={portraitGallery} onPortraits={setPortraitGallery} selectedId={selectedPortraitId} onSelect={setSelectedPortraitId} />{portraitError && <p role="alert" className="mt-3 border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">{portraitError}</p>}</>}
          {step === 1 && <ClassesStep classes={classes} skillLevels={skillLevels} setSkillLvl={updateSkill} classLevels={classLevels} totalLevels={totalLevels} chosenCount={classesPayload.length} isNpc immersive onPreviewSkill={(skill: EvolutionSkill, className: string, level: number) => setEvolution({ skill, className, level })} />}
          {step === 2 && <NpcAttributes attributes={attributes} onChange={setAttributes} />}
          {step === 2 && <div className="mt-5 space-y-3 rounded border border-primary/30 p-3"><p className="text-xs text-primary">Recursos na invocação (HP e MP)</p><div className="grid grid-cols-2 gap-3">{(["maxHp", "maxMp"] as const).map(key => <label key={key} className="text-xs">{key === "maxHp" ? "Vida máxima" : "Mana máxima"}<input type="number" min={key === "maxHp" ? 1 : 0} value={resourceOverride?.[key] ?? preview?.[key] ?? 0} onChange={event => {
            const value = Number(event.target.value)
            const base = resourceOverride ?? { hp: preview?.maxHp ?? 1, maxHp: preview?.maxHp ?? 1, mp: preview?.maxMp ?? 0, maxMp: preview?.maxMp ?? 0, ip: 6, maxIp: 6, xp: 0, fp: 0 }
            setResourceOverride({ ...base, [key]: value, [key === "maxHp" ? "hp" : "mp"]: value })
          }} className="mt-1 w-full border border-border/60 bg-background p-2" /></label>)}</div><Button variant="outline" size="sm" onClick={() => setResourceOverride(undefined)}>Recalcular pelas classes</Button></div>}
          {step === 3 && (selectedClasses.length ? <CreatorAffinityStep classes={selectedClasses} primary={selectedPrimary} secondary={selectedSecondary} onPrimary={setPrimary} onSecondary={setSecondary} /> : <div className="border border-dashed border-border/70 bg-card/30 p-5 text-sm leading-relaxed text-muted-foreground">Nenhuma classe com nível foi escolhida. Este NPC poderá permanecer sem afinidade e receberá dano neutro (1×). Você também pode voltar e distribuir níveis.</div>)}
          {step === 4 && <NpcSpecialAttacksStep attacks={specialAttacks} onChange={setSpecialAttacks} templates={existingAttackTemplates} />}
          {step === 5 && <EquipmentStep equipment={equipment} toggle={toggleEquipment} remaining={STARTING_ZENIT - spent} spent={spent} isNpc immersive extraEquipment={customEquipment} />}
        </section>
        <section className="relative flex min-h-[450px] min-w-0 flex-col items-center justify-center overflow-hidden border-b border-primary/15 bg-primary/[.025] px-4 py-6 lg:min-h-[530px] xl:min-h-0 xl:border-b-0 xl:border-r xl:px-7" aria-label="Prévia do NPC">
          <div className="pointer-events-none absolute top-[12%] aspect-square w-[min(70vw,520px)] rounded-full border border-primary/20 shadow-[0_0_120px_40px_color-mix(in_srgb,var(--primary)_9%,transparent)]" /><div className="pointer-events-none absolute top-[18%] aspect-square w-[min(57vw,400px)] rounded-full border border-dashed border-primary/25" />
          <div className="relative z-10 flex w-full max-w-[580px] flex-col items-center gap-4"><div className="mb-1 flex w-full items-center justify-between gap-3 border-b border-primary/20 pb-3 text-[10px] font-bold uppercase tracking-[.2em] text-primary/80"><span className="inline-flex items-center gap-2"><StageIcon className="size-4" /> Prévia da criação</span><span className="font-mono">{String(step + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}</span></div>
            <div className="relative w-full max-w-[450px] overflow-hidden border border-primary/30 bg-card/55 p-2 shadow-2xl"><div className="absolute left-0 top-0 z-10 size-6 border-l-2 border-t-2 border-primary" /><div className="absolute bottom-0 right-0 z-10 size-6 border-b-2 border-r-2 border-primary" /><div className="relative aspect-[4/4.35] w-full overflow-hidden bg-background/80"><img src={shownUrl} alt={`Retrato de ${name || "NPC"}`} className="size-full object-contain" /><div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/90 to-transparent" /><div className="absolute inset-x-3 bottom-3 text-center"><span className="text-[9px] font-bold uppercase tracking-[.25em] text-primary">{selectedPortraitId === "__primary__" ? "Retrato principal" : "Expressão alternativa"}</span><p className="mt-1 truncate font-serif text-xl font-bold">{shownPortrait.label || "Normal"}</p></div></div></div>
            <div className="text-center"><h3 className="font-serif text-2xl font-bold tracking-wide sm:text-3xl">{name.trim() || "NPC sem nome"}</h3><p className="mt-1 text-xs italic text-muted-foreground">{identity.trim() || origin.trim() || "O Mestre ainda escreverá esta história"}</p></div>
            <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Prévia de retratos">{portraitChoices.map((portrait, index) => <button key={portrait.id} type="button" onClick={() => setSelectedPortraitId(portrait.id)} title={portrait.label} aria-pressed={selectedPortraitId === portrait.id} className={`grid size-12 place-items-center overflow-hidden border p-0.5 transition sm:size-14 ${selectedPortraitId === portrait.id ? "border-primary bg-primary/20" : "border-border/60 bg-card/50 hover:border-primary/50"}`}>{portrait.url && (publicPortraitUrl(portrait.url) || portrait.url.startsWith("/") || portrait.url.startsWith("data:image/")) ? <img src={portrait.url} alt={portrait.label} className="size-full object-cover" /> : <span className="font-serif text-lg text-primary/60">{index + 1}</span>}</button>)}</div>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"><Eye className="size-3.5" /> {portraitChoices.length} retrato(s) registrados</p>
          </div>
        </section>
        <aside className="min-w-0 bg-card/25 px-4 py-6 sm:px-7 xl:min-h-0 xl:overflow-y-auto xl:px-6 xl:py-8" aria-label="Códice do NPC">
          <div className="flex items-center gap-3 border-b border-primary/25 pb-4"><span className="grid size-10 place-items-center border border-primary/35 bg-primary/10 text-primary"><BookOpenText className="size-5" /></span><div><p className="text-[9px] font-black uppercase tracking-[.22em] text-primary">Códice do Mestre</p><h3 className="font-serif text-lg font-bold">Ficha em formação</h3></div></div>
          <div className="mt-5 space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">Identidade</p><p className="mt-1 break-words font-serif text-xl font-bold">{name.trim() || "Desconhecido"}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{origin.trim() || "Origem não definida"}</p></div>
            <div className="border-t border-border/60 pt-4"><div className="mb-2 flex justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-primary"><span className="flex gap-1"><Swords className="size-4" /> Classes</span><span>{totalLevels} NV</span></div>{selectedClasses.length ? selectedClasses.map(cls => <div key={cls.id} className="mb-2 border border-border/60 bg-background/45 p-3"><div className="flex justify-between gap-2 text-xs font-semibold"><span>{cls.name}</span><span className="font-mono text-primary">Nv. {classLevels[cls.id]}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{ELEMENT_NAMES[classElement(cls)]} · {cls.skills.filter(skill => (skillLevels[skill.id] || 0) > 0).map(skill => skill.name).join(" · ") || "Sem perícias"}</p>{cls.skills.filter(skill => (skillLevels[skill.id] || 0) > 0 && hasEvolutionBonuses(skill.bonuses)).map(skill => <button key={skill.id} type="button" onClick={() => setEvolution({ skill: skill as EvolutionSkill, className: cls.name, level: skillLevels[skill.id] })} className="mt-2 flex items-center gap-1.5 border border-primary/30 p-1.5 text-[10px] text-primary"><GitBranch className="size-3" /> Árvore: {skill.name}</button>)}</div>) : <p className="text-xs italic text-muted-foreground">Nenhuma classe selecionada.</p>}</div>
            <div className="border-t border-border/60 pt-4"><p className="text-[10px] font-black uppercase tracking-widest text-primary">Afinidades</p><p className="mt-2 text-xs">Principal: <strong className="text-primary">{selectedPrimary ? ELEMENT_NAMES[selectedPrimary] : "Não definido"}</strong></p><p className="mt-1 text-xs">Secundária: <strong className="text-primary">{selectedSecondary ? ELEMENT_NAMES[selectedSecondary] : "Não definido"}</strong></p><p className="mt-1 text-[11px] text-muted-foreground">Complementares: {options.filter(item => item !== selectedPrimary && item !== selectedSecondary).map(item => ELEMENT_NAMES[item]).join(" · ") || "Nenhuma"}</p></div>
            <div className="border-t border-border/60 pt-4"><div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary"><Swords className="size-4" /> Golpes Especiais</p><span className="font-mono text-[10px] text-primary">{specialAttacks.length} / 30</span></div>
              {specialAttacks.length ? <div className="mt-3 space-y-2">{specialAttacks.map(attack => <div key={attack.id} className="rounded border border-border/60 bg-background/50 p-2.5"><strong className="block break-words text-[11px]">{attack.name}</strong><p className="mt-1 text-[10px] text-primary">{playerAttackDefenseLabel(attack.targetDefense)}</p>{attack.description && <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-muted-foreground">{attack.description}</p>}{attack.previewImageUrl && <div className="mt-2 h-20 overflow-hidden border border-primary/20"><img src={attack.previewImageUrl} alt={`Prévia do golpe ${attack.name}`} className="size-full object-contain" /></div>}</div>)}</div> : <p className="mt-2 text-[11px] italic text-muted-foreground">Nenhum golpe pré-cadastrado. Opcional.</p>}
            </div>
            <div className="border-t border-border/60 pt-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary"><Dices className="size-4" /> Atributos</p><div className="mt-2 grid grid-cols-2 gap-2">{ATTRS.map(key => <div key={key} className="flex justify-between border-b border-border/50 py-1.5 text-xs"><span className="font-mono text-muted-foreground">{key.toUpperCase()}</span><strong>{attributes[key]}</strong></div>)}</div></div>
            <div className="border-t border-border/60 pt-4"><p className="text-[10px] font-black uppercase tracking-widest text-primary">Recursos</p>{archivedResources && !skillsEdited ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span><Heart className="mr-1 inline size-3 text-[color:var(--hp)]" /> {archivedResources.hp}/{archivedResources.maxHp} HP</span><span><Zap className="mr-1 inline size-3 text-[color:var(--mp)]" /> {archivedResources.mp}/{archivedResources.maxMp} MP</span></div> : preview ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>HP: <strong>{preview.maxHp}</strong></span><span>MP: <strong>{preview.maxMp}</strong></span></div> : <p className="mt-2 text-[11px] text-muted-foreground">Recursos calculados ao invocar. NPCs homebrew podem usar regras próprias.</p>}</div>
            <div className="border-t border-border/60 pt-4"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-primary"><span className="flex gap-1"><Package className="size-4" /> Inventário</span><span>{equipment.length} itens</span></div><p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-muted-foreground">{equipment.map(id => itemMap.get(id)?.name || id).join(" · ") || "Sem equipamento"}</p><p className="mt-3 flex gap-2 font-mono text-xs text-primary"><Coins className="size-4" /> {initialNpc?.archivedSnapshot?.zenit ?? STARTING_ZENIT} Zenits de referência · Equipamento livre</p></div>
          </div>
        </aside>
      </div>
    </main>
    <footer className="relative z-10 shrink-0 border-t border-primary/25 bg-background/95 px-4 py-3 backdrop-blur-xl sm:px-7 xl:px-10"><div className="mx-auto flex max-w-[1750px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-primary">Passo {step + 1} de {STAGES.length} · {STAGES[step]}</p><p className="mt-1 text-xs text-muted-foreground">{step === 0 ? `${portraitChoices.length} retrato(s)` : step === 1 ? `${totalLevels} níveis · ${classesPayload.length} classe(s)` : step === 2 ? "Atributos livres até d20" : step === 3 ? `${options.length} afinidade(s) proveniente(s) das classes` : step === 4 ? `${specialAttacks.length} técnica(s) preparada(s) · opcional` : `${equipment.length} item(ns) · orçamento ilimitado`}</p></div><div className="flex w-full items-center gap-2 sm:w-auto"><Button type="button" variant="outline" disabled={saving} onClick={() => step === 0 ? onCancel() : setStep(step - 1)} className="h-11 flex-1 gap-2 border-border/70 bg-card/40 text-xs sm:flex-none"><ArrowLeft className="size-4" /> {step === 0 ? "Cancelar" : "Voltar"}</Button>{step < STAGES.length - 1 ? <Button type="button" disabled={!canContinue || saving} onClick={() => setStep(step + 1)} className="h-11 flex-[2] gap-2 rounded-sm px-5 text-xs font-black uppercase sm:flex-none"><span>Avançar</span><ArrowRight className="size-4" /></Button> : <Button type="button" disabled={saving || !name.trim() || !!portraitError || !!attackValidation} onClick={() => void submit()} className="h-11 flex-[2] gap-2 rounded-sm px-5 text-xs font-black uppercase sm:flex-none">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? "Salvando..." : initialNpc ? "Salvar alterações" : "Salvar no Berçário"}</Button>}</div></div>{error && <p role="alert" className="mx-auto mt-3 max-w-[1750px] border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}</footer>
    {evolution && <SkillEvolutionTree skill={evolution.skill} className={evolution.className} level={evolution.level} onClose={() => setEvolution(null)} />}
  </div>, document.body)
}

// Cria uma identidade para o rascunho, sem afetar o ID das fichas arquivadas.
function newNpcId(): string { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}` }
