"use client"
import { controllerAlert } from '@/lib/input/dialogs'
import { useController } from '@/components/controller/controller-provider'
import { useControllerActions } from '@/lib/input/use-controller-actions'
import { controllerFocus, focusControllerElement } from '@/lib/input/focus'
import { useControllerModalReturn } from '@/lib/input/modal-focus-return'
import { creatorStepTransition } from '@/lib/input/creator-step-navigation' 

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { ATTRIBUTE_PROFILES, CLASSES, getEquipment, STARTING_ZENIT, type GameClass } from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import { baseGameClasses, classLevelsFromSkills, subclassesFor } from "@/lib/class-catalog"
import type { DeathToken } from "@/lib/death-tokens"
import { validateAlternatePortraits, publicPortraitUrl, type AlternatePortrait } from "@/lib/portrait-gallery"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import { ArrowLeft, ArrowRight, BookOpenText, Check, Coins, Crown, Eye, Heart, Images, Loader2, Lock, Package, Shield, Sparkles, Swords, WandSparkles, GitBranch, Skull, Gift, X, Zap } from "lucide-react"
import { EssenceStep, ClassesStep, EquipmentStep } from "./creator-steps"
import { CreatorAttributesStep } from "./creator-attributes-step"
import { CreatorAffinityStep } from "./creator-affinity-step"
import { availableClassElements, ELEMENT_NAMES, type ElementId } from "@/lib/elemental-affinities"
import { SkillEvolutionTree, hasEvolutionBonuses, type EvolutionSkill } from "./skill-evolution-tree"
import { CreatorPortraitSlots } from "./creator-portrait-slots"

const STEPS = ["Essência", "Classes", "Atributos", "Afinidades", "Equipamento"] as const
const STEP_INFO = [
  { eyebrow: "I · IDENTIDADE", title: "Toda lenda tem um início", desc: "Dê um nome, uma origem e um rosto à história que está prestes a nascer.", icon: Sparkles },
  { eyebrow: "II · VOCAÇÃO", title: "Escolha seu caminho", desc: "Combine classes, descubra especializações e invista até cinco níveis iniciais.", icon: Swords },
  { eyebrow: "III · POTENCIAL", title: "Forje seus atributos", desc: "Determine a essência de seu poder e a maneira como enfrenta o desconhecido.", icon: Shield },
  { eyebrow: "IV · ELEMENTOS", title: "Desperte sua essência", desc: "Escolha a afinidade principal e secundária de suas classes.", icon: Sparkles },
  { eyebrow: "V · PREPARAÇÃO", title: "Prepare sua jornada", desc: "Escolha o equipamento inicial antes de atravessar os portões da aventura.", icon: Package },
] as const

interface Props {
  campaignId: string
  campaignCharacters?: Character[]
  customClasses?: GameClass[]
  onCreated: (character: Character) => void
  onCancel: () => void
}

export function CharacterCreator({ campaignId, campaignCharacters = [], customClasses = [], onCreated, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverClasses, setServerClasses] = useState<GameClass[]>([])
  const [catalogEquipment, setCatalogEquipment] = useState<Array<{ id: string; name: string; cost: number; purchasable?: boolean; detail?: string }>>([])
  const [deathTokens, setDeathTokens] = useState<DeathToken[]>([])
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null)
  const creationRequestId = useRef(`forge_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  const [name, setName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [origin, setOrigin] = useState("")
  const [identity, setIdentity] = useState("")
  const [theme, setTheme] = useState("")
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [chosenSubclassIds, setChosenSubclassIds] = useState<Record<string, string>>({})
  const [profileId, setProfileId] = useState<string>(ATTRIBUTE_PROFILES[0].id)
  const [customAttributes, setCustomAttributes] = useState<Record<AttributeKey, DieSize>>({ dex: "d8", ins: "d8", mig: "d8", wlp: "d8" })
  const [equipment, setEquipment] = useState<string[]>([])
  const [primaryElement, setPrimaryElement] = useState<ElementId | null>(null)
  const [secondaryElement, setSecondaryElement] = useState<ElementId | null>(null)
  // Os cinco retratos são parte do mesmo personagem: 1 principal + até 4 alternativos.
  const [portraitLabel, setPortraitLabel] = useState("Normal")
  const [portraitGallery, setPortraitGallery] = useState<AlternatePortrait[]>([])
  const [selectedPortraitId, setSelectedPortraitId] = useState("__primary__")
  const [evolutionView, setEvolutionView] = useState<{ skill: EvolutionSkill; className: string; level: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const { active: controllerActive } = useController()
  const creatorRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const footerCancelRef = useRef<HTMLButtonElement>(null)
  const footerNextRef = useRef<HTMLButtonElement>(null)
  useControllerModalReturn(mounted)

  useEffect(() => {
    setMounted(true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  // Catálogo público ou autorizado especificamente pelo token, sempre fornecido pela API.
  useEffect(() => {
    let alive = true
    setLoadingCatalog(true)
    setError(null)
    const suffix = activeTokenId ? `?tokenId=${encodeURIComponent(activeTokenId)}` : ""
    void Promise.all([
      apiFetch<{ classes: GameClass[]; equipment: typeof catalogEquipment }>(
        `/api/campaigns/${encodeURIComponent(campaignId)}/creator-catalog${suffix}`, { cache: "no-store" }),
      apiFetch<{ myTokens: DeathToken[] }>(
        `/api/campaigns/${encodeURIComponent(campaignId)}/death-tokens`, { cache: "no-store" }),
    ]).then(([catalog, response]) => {
      if (!alive) return
      setServerClasses(Array.isArray(catalog.classes) ? catalog.classes : [])
      setCatalogEquipment(Array.isArray(catalog.equipment) ? catalog.equipment : [])
      const available = Array.isArray(response.myTokens) ? response.myTokens : []
      setDeathTokens(available)
      if (activeTokenId && !available.some(token => token.id === activeTokenId)) setActiveTokenId(null)
    }).catch(() => {
      if (alive) setError("Não foi possível carregar o catálogo de classes ou os tokens. Verifique a conexão.")
    }).finally(() => { if (alive) setLoadingCatalog(false) })
    return () => { alive = false }
  }, [campaignId, activeTokenId])

  const activeToken = deathTokens.find(token => token.id === activeTokenId)
  const maxInitialLevels = activeToken?.maxLevels ?? 5
  const initialZenit = activeToken?.startingZenit ?? STARTING_ZENIT
  const classes = useMemo(() => {
    if (!activeToken?.allowedClassIds.length) return serverClasses
    const permitted = new Set(activeToken.allowedClassIds)
    return serverClasses.filter(cls => permitted.has(cls.id) || (cls.parentClassId && permitted.has(cls.parentClassId)))
  }, [serverClasses, activeToken])
  const equipmentLookup = useMemo(() => new Map(catalogEquipment.map(item => [item.id, item])), [catalogEquipment])
  function selectDeathToken(id: string | null) {
    setActiveTokenId(id)
    setSkillLevels({})
    setChosenSubclassIds({})
    setEquipment([])
    creationRequestId.current = `forge_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }

  const baseClasses = useMemo(() => baseGameClasses(classes), [classes])
  const totalLevels = useMemo(() => Object.values(skillLevels).reduce((sum, level) => sum + level, 0), [skillLevels])
  const classLevels = useMemo(() => classLevelsFromSkills(skillLevels, baseClasses), [skillLevels, baseClasses])
  const chosenClassCount = Object.keys(classLevels).length
  const selectedSubclasses = useMemo(() =>
    Object.entries(chosenSubclassIds)
      .filter(([parentId, subclassId]) => classLevels[parentId] > 0 && subclassesFor(classes, parentId).some(cls => cls.id === subclassId))
      .map(([, subclassId]) => subclassId),
    [chosenSubclassIds, classLevels, classes],
  )
  const attributes = useMemo<Record<AttributeKey, DieSize>>(() =>
    profileId === "custom" ? customAttributes : (ATTRIBUTE_PROFILES.find(p => p.id === profileId)?.dice || customAttributes),
    [profileId, customAttributes],
  )
  const customPoints = useMemo(() => Object.values(customAttributes).reduce((sum, die) =>
    sum + (die === "d6" ? 1 : die === "d8" ? 2 : die === "d10" ? 3 : 4), 0), [customAttributes])
  const spent = useMemo(() => equipment.reduce((sum, id) => sum + (equipmentLookup.get(id)?.cost ?? getEquipment(id)?.cost ?? 0), 0), [equipment, equipmentLookup])
  const remaining = initialZenit - spent
  const classesPayload: ClassLevel[] = useMemo(() => Object.entries(classLevels).map(([classId, level]) => ({ classId, level })), [classLevels])
  const resourcePreviewSupported = classesPayload.every(value => CLASSES.some(cls => cls.id === value.classId))
  const preview = useMemo(() => resourcePreviewSupported ? computeMaxResources(classesPayload, attributes) : null, [classesPayload, attributes, resourcePreviewSupported])

  const portraitError = useMemo(() => {
    if (!portraitLabel.trim() || portraitLabel.trim().length > 60) return "A legenda do avatar principal deve ter de 1 a 60 caracteres."
    if (avatarUrl.trim() && !publicPortraitUrl(avatarUrl.trim())) return "A imagem principal precisa ser um link HTTPS público direto para a imagem."
    if (portraitGallery.length === 0) return null
    if (!publicPortraitUrl(avatarUrl.trim())) return "Para cadastrar expressões, informe um link HTTPS público no campo Foto do avatar principal."
    try {
      const validated = validateAlternatePortraits(portraitGallery)
      if (validated.some(item => item.url === avatarUrl.trim())) return "O avatar principal não pode se repetir nas outras expressões."
    } catch (cause) { return cause instanceof Error ? cause.message : "Verifique os links e legendas dos retratos." }
    return null
  }, [avatarUrl, portraitGallery, portraitLabel])

  // Mudar a prévia central não altera o avatar que será salvo como principal.
  const selectedPortrait = portraitGallery.find(item => item.id === selectedPortraitId)
  const activePortraitUrl = selectedPortrait
    ? (publicPortraitUrl(selectedPortrait.url) ? selectedPortrait.url : "/mystic-adventurer-portrait.png")
    : (avatarUrl.startsWith("/") || /^https?:\/\//i.test(avatarUrl) ? avatarUrl : "/mystic-adventurer-portrait.png")
  const activePortraitLabel = selectedPortrait ? selectedPortrait.label : portraitLabel
  const actualPortraitCount = 1 + portraitGallery.length
  const avatarChoice = [{ id: "__primary__", url: avatarUrl, label: portraitLabel }, ...portraitGallery]
  const selectedClassEntries = baseClasses.filter(cls => classLevels[cls.id] > 0).map(cls => {
    const exact = classes.find(definition => definition.id === cls.id) || CLASSES.find(definition => definition.id === cls.id)
    return { ...cls, affinity: exact?.affinity ?? "fisico" }
  })
  const affinityOptions = availableClassElements(selectedClassEntries)
  const validPrimaryElement = primaryElement && affinityOptions.includes(primaryElement) ? primaryElement : null
  const validSecondaryElement = secondaryElement && secondaryElement !== validPrimaryElement && affinityOptions.includes(secondaryElement) ? secondaryElement : null
  const currentStep = STEP_INFO[step]
  const StageIcon = currentStep.icon

  function setSkillLvl(skillId: string, level: number, max: number) {
    if (level < 0 || level > max) return
    setSkillLevels(prev => { const next = { ...prev, [skillId]: level }; if (level === 0) delete next[skillId]; return next })
  }
  function toggleEquipment(id: string) { setEquipment(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function chooseSubclass(parentClassId: string, subclassId: string) { setChosenSubclassIds(current => ({ ...current, [parentClassId]: subclassId })) }

  const canNext = !loadingCatalog && !error && (
    (step === 0 && name.trim().length > 0 && !portraitError) ||
    (step === 1 && chosenClassCount >= 1 && totalLevels > 0 && totalLevels <= maxInitialLevels) ||
    (step === 2 && (profileId !== "custom" || customPoints === 8)) ||
    (step === 3 && Boolean(validPrimaryElement) && (affinityOptions.length < 2 || Boolean(validSecondaryElement))) ||
    (step === 4 && remaining >= 0)
  )

  // A Forja é uma única camada fullscreen. Seu rodapé precisa participar
  // do MESMO foco que o cabeçalho e os formulários, inclusive pelo controle.
  const activeCreatorLayer = () => evolutionView
    ? document.querySelector<HTMLElement>('[aria-labelledby="skill-evolution-title"]')
    : creatorRef.current

  function changeCreatorStep(direction: -1 | 1) {
    if (saving) return
    const next = creatorStepTransition(step, direction, canNext, STEPS.length)
    if (next !== step) {
      setStep(next)
      return
    }
    // Se ainda falta preencher algum requisito, o avanço permanece desabilitado,
    // mas o botão do rodapé continua descobrível pelo direcional.
    focusControllerElement(direction > 0 ? footerNextRef.current : footerCancelRef.current)
  }

  useControllerActions({
    'ui.up': () => controllerFocus('ui.up', activeCreatorLayer()),
    'ui.down': () => {
      const before = document.activeElement
      const handled = controllerFocus('ui.down', activeCreatorLayer())
      if (!evolutionView && before === document.activeElement &&
          creatorRef.current?.contains(before)) {
        focusControllerElement(footerNextRef.current?.disabled ? footerCancelRef.current : footerNextRef.current)
      }
      return handled
    },
    'ui.left': () => controllerFocus('ui.left', activeCreatorLayer()),
    'ui.right': () => controllerFocus('ui.right', activeCreatorLayer()),
    'ui.confirm': () => controllerFocus('ui.confirm', activeCreatorLayer()),
    'ui.previous': () => {
      if (evolutionView) return controllerFocus('ui.left', activeCreatorLayer())
      changeCreatorStep(-1)
      return true
    },
    'ui.next': () => {
      if (evolutionView) return controllerFocus('ui.right', activeCreatorLayer())
      changeCreatorStep(1)
      return true
    },
    'ui.back': () => {
      if (evolutionView) { setEvolutionView(null); return true }
      if (!saving) onCancel()
      return true
    },
  }, { enabled: controllerActive && mounted, priority: 360, captureAll: true })

  useEffect(() => {
    if (!controllerActive || !mounted || evolutionView) return
    // Na troca de etapa, iniciar na primeira escolha real daquela etapa,
    // em vez de perder o foco em um botão desmontado da etapa anterior.
    const frame = requestAnimationFrame(() => {
      const container = creatorRef.current?.querySelector<HTMLElement>('[data-creator-step-content]')
      const first = container?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]),button:not([disabled]),select:not([disabled]),textarea:not([disabled])',
      )
      if (first) focusControllerElement(first)
    })
    return () => cancelAnimationFrame(frame)
  }, [step, controllerActive, mounted, evolutionView])

  async function submit() {
    if (!canNext || saving) return
    setSaving(true)
    setError(null)
    try {
      // A criação especial grava personagem+consumo numa única operação do servidor.
      const response = await apiFetch<{ character: Character }>(activeToken
        ? `/api/campaigns/${encodeURIComponent(campaignId)}/death-tokens/forge`
        : "/api/characters", {
        method: "POST",
        body: JSON.stringify({
          campaignId, name, avatarUrl, origin, identity, theme,
          classes: classesPayload,
          skills: skillLevels,
          attributes,
          equipment,
          customItems: [],
          ...(activeToken ? { tokenId: activeToken.id, requestId: creationRequestId.current } : {}),
        }),
      })
      let created = response.character
      if (!created?.id) throw new Error("A criação do personagem não retornou um ID válido.")

      // A partir daqui a criação JÁ foi confirmada. Se a segunda operação falhar,
      // nunca oferecer um novo POST que duplicaria o personagem.
      const warnings: string[] = []
      // Confirmar na API após a criação: a rota normal antiga não conhece afinidades.
      // Se falhar, não criar outra ficha. A escolha poderá ser concluída pela ficha.
      if (validPrimaryElement) {
        try {
          const updated = await apiFetch<{ character: Character }>(`/api/characters/${encodeURIComponent(created.id)}/affinities`, {
            method: "PATCH",
            body: JSON.stringify({ action: "assign", primary: validPrimaryElement, secondary: validSecondaryElement }),
          })
          if (!updated.character?.id) throw new Error("A API não confirmou a afinidade.")
          created = updated.character
        } catch (cause) {
          warnings.push(`Afinidades: ${cause instanceof Error ? cause.message : "não foi possível salvar"}. Defina-as pelo gerenciador da ficha; o personagem já foi criado.`)
        }
      }
      if (portraitGallery.length > 0 || portraitLabel.trim() !== "Normal") {
        try {
          const updated = await apiFetch<{ character: Character }>(`/api/characters/${encodeURIComponent(created.id)}/portraits`, {
            method: "PATCH",
            body: JSON.stringify({
              avatarUrl: created.avatarUrl || avatarUrl || "/mystic-adventurer-portrait.png",
              portraitCrop: (created as Character & { portraitCrop?: unknown }).portraitCrop,
              portraitLabel: portraitLabel.trim(),
              portraitGallery: validateAlternatePortraits(portraitGallery),
            }),
          })
          if (!updated.character?.id) throw new Error("A API não confirmou os retratos.")
          created = updated.character
        } catch (cause) {
          warnings.push(`Retratos: ${cause instanceof Error ? cause.message : "não foi possível salvar"}. Use o editor de retratos da ficha para tentar novamente.`)
        }
      }
      for (const subclassId of selectedSubclasses) {
        try {
          await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/class-books`, {
            method: "POST", body: JSON.stringify({ action: "select-subclass", characterId: created.id, subclassId }),
          })
        } catch (cause) { warnings.push(`Subclasse ${subclassId}: ${cause instanceof Error ? cause.message : "erro"}`) }
      }
      onCreated(created)
      if (warnings.length) controllerAlert(`O personagem foi criado e salvo, mas alguns detalhes não foram concluídos. Não crie outra ficha.\n${warnings.join("\n")}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao criar personagem.") }
    finally { setSaving(false) }
  }

  const ui = (
    <div ref={creatorRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Forja de personagem" data-controller-creator="active" data-controller-scroll-root="character-creator" className="fixed inset-0 z-[11000] flex h-[100dvh] w-screen flex-col overflow-clip bg-background text-foreground" style={{ backgroundImage: "radial-gradient(ellipse at 53% 38%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 62%), linear-gradient(color-mix(in srgb, var(--foreground) 3%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 3%, transparent) 1px, transparent 1px)", backgroundSize: "auto, 52px 52px, 52px 52px" }}>
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-background/80 via-transparent to-background/80" />
      <header className="relative z-10 shrink-0 border-b border-primary/25 bg-background/90 px-3 py-3 shadow-lg backdrop-blur-xl sm:px-6 xl:px-10">
        <div className="mx-auto flex max-w-[1750px] items-center justify-between gap-3">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center border border-primary/50 bg-primary/10 text-primary sm:size-12"><Crown className="size-6" /></span>
            <div className="min-w-0"><p className="hidden text-[9px] font-bold uppercase tracking-[.28em] text-primary/80 sm:block">Morte Mágica · Criação de herói</p><h1 className="truncate font-serif text-base font-black sm:text-xl">A Forja do Viajante</h1></div>
          </div>
          <nav aria-label="Passos da criação" className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-1 sm:gap-2">
            {STEPS.map((label, index) => {
              const Icon = STEP_INFO[index].icon
              const current = index === step
              const complete = index < step
              return <button key={label} type="button" disabled={index > step || saving} aria-current={current ? "step" : undefined} onClick={() => { if (index < step) setStep(index) }} className={`flex min-w-0 shrink-0 items-center gap-2 border px-2 py-2 text-left transition sm:px-3 lg:px-4 ${current ? "border-primary/60 bg-primary/15 text-primary" : complete ? "border-primary/20 bg-primary/[.045] text-foreground hover:border-primary/50" : "border-transparent text-muted-foreground/60"}`}>
                <span className={`grid size-6 shrink-0 place-items-center border text-[10px] font-black ${current ? "border-primary bg-primary/15 text-primary" : complete ? "border-primary/50 text-primary" : "border-border/60"}`}>{complete ? <Check className="size-3" /> : <Icon className="size-3.5" />}</span>
                <span className="hidden text-[10px] font-black uppercase tracking-wider md:block">{label}</span>
                <span className="font-mono text-[10px] md:hidden">{index + 1}</span>
              </button>
            })}
          </nav>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Fechar criação do personagem" className="grid size-9 shrink-0 place-items-center border border-border/70 bg-card/40 text-muted-foreground transition hover:border-primary/50 hover:text-primary sm:size-10"><X className="size-5" /></button>
        </div>
      </header>

      <main ref={dialogRef} tabIndex={-1} data-controller-scrollport="true" className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none xl:overflow-hidden">
        <div className="mx-auto grid min-h-full w-full max-w-[1750px] grid-cols-1 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(330px,500px)_minmax(330px,1fr)_minmax(240px,315px)]">
          {/* Todas as escolhas originais permanecem no painel à esquerda. */}
          <section data-creator-step-content="true" data-controller-scrollport="true" className="relative min-w-0 border-b border-primary/15 bg-card/35 px-4 py-6 sm:px-7 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-8 xl:py-8" aria-label={`Configuração: ${STEPS[step]}`}>
            {deathTokens.length > 0 && <div className={`mb-5 overflow-hidden rounded-xl border p-4 ${activeToken ? "border-primary/70 bg-primary/[.14]" : "border-primary/45 bg-primary/[.065]"}`} aria-label="Tokens de morte disponíveis">
              <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/50 bg-primary/15 text-primary"><Skull className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Renascimento concedido</p><h3 className="mt-1 font-serif text-lg font-bold">Você tem um token de morte</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeToken ? `${activeToken.maxLevels} níveis · ${activeToken.startingZenit} Zenits · ${activeToken.startingItemIds.length + (activeToken.startingRelics?.length || 0)} presentes` : `${deathTokens.length} token(s) disponível(is) nesta campanha`}</p></div></div>
              {deathTokens.length > 1 && <label className="mt-3 block text-[11px] font-semibold">Escolha o token<select value={activeTokenId || ""} onChange={event => selectDeathToken(event.target.value || null)} className="mt-1 w-full rounded-md border border-primary/30 bg-background p-2 text-xs text-foreground"><option value="">Criação normal</option>{deathTokens.map(token => <option key={token.id} value={token.id}>{token.maxLevels} níveis · {token.startingZenit} Zenits · {new Date(token.createdAt).toLocaleDateString("pt-BR")}</option>)}</select></label>}
              <button type="button" disabled={saving} onClick={() => selectDeathToken(activeToken ? null : deathTokens[0].id)} className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold transition ${activeToken ? "border-border bg-background/65 text-foreground hover:border-primary/40" : "border-primary bg-primary text-primary-foreground hover:opacity-90"}`}><Gift className="size-4" />{activeToken ? "Voltar à criação normal" : "Usar token de morte"}</button>
              {activeToken && <p className="mt-2 text-center text-[10px] text-muted-foreground">O token só será consumido ao concluir a ficha. Fechar a Forja não o gasta.</p>}
            </div>}
            <div className="mb-6 border-l-2 border-primary pl-4">
              <p className="text-[10px] font-black uppercase tracking-[.24em] text-primary">{currentStep.eyebrow}</p>
              <h2 className="mt-2 font-serif text-2xl font-black leading-tight text-foreground sm:text-3xl">{currentStep.title}</h2>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">{currentStep.desc}</p>
            </div>
            <div className="[&_input]:accent-primary [&_button]:focus-visible:outline-primary [&_textarea]:focus-visible:outline-primary">
              {step === 0 && <>
                <EssenceStep name={name} setName={setName} avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} origin={origin} setOrigin={setOrigin} identity={identity} setIdentity={setIdentity} theme={theme} setTheme={setTheme} immersive />
                <CreatorPortraitSlots avatarUrl={avatarUrl} onAvatarUrl={setAvatarUrl} portraitLabel={portraitLabel} onPortraitLabel={setPortraitLabel} portraits={portraitGallery} onPortraits={setPortraitGallery} onSelect={setSelectedPortraitId} selectedId={selectedPortraitId} />
                {portraitError && <p role="alert" className="mt-3 border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">{portraitError}</p>}
              </>}
              {step === 1 && (loadingCatalog ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando classes da campanha...</div> :
                <ClassesStep classes={baseClasses} subclasses={classes.filter(cls => !!cls.parentClassId)} chosenSubclassIds={chosenSubclassIds} onChooseSubclass={chooseSubclass} skillLevels={skillLevels} setSkillLvl={setSkillLvl} classLevels={classLevels} totalLevels={totalLevels} chosenCount={chosenClassCount} maxLevels={maxInitialLevels} onPreviewSkill={(skill: EvolutionSkill, className: string, level: number) => setEvolutionView({ skill, className, level })} immersive />)}
              {step === 2 && <CreatorAttributesStep profileId={profileId} setProfileId={setProfileId} attributes={attributes} customAttributes={customAttributes} setCustomAttributes={setCustomAttributes} />}
              {step === 3 && <CreatorAffinityStep classes={selectedClassEntries} primary={validPrimaryElement} secondary={validSecondaryElement} onPrimary={setPrimaryElement} onSecondary={setSecondaryElement} />}
              {step === 4 && <EquipmentStep equipment={equipment} toggle={toggleEquipment} remaining={remaining} spent={spent} immersive budget={initialZenit} extraEquipment={catalogEquipment.filter(item => !getEquipment(item.id))} freeItemIds={activeToken?.startingItemIds || []} />}
            </div>
          </section>

          {/* Palco visual: retratos são reais URLs selecionadas pelo usuário, não arte gerada. */}
          <section className="relative flex min-h-[450px] min-w-0 flex-col items-center justify-center overflow-hidden border-b border-primary/15 bg-primary/[.025] px-4 py-6 lg:min-h-[530px] xl:min-h-0 xl:border-b-0 xl:border-r xl:px-7" aria-label="Prévia do personagem">
            <div className="pointer-events-none absolute inset-x-0 top-[12%] mx-auto aspect-square w-[min(70vw,520px)] rounded-full border border-primary/20 shadow-[0_0_120px_40px_color-mix(in_srgb,var(--primary)_9%,transparent)]" />
            <div className="pointer-events-none absolute inset-x-0 top-[18%] mx-auto aspect-square w-[min(57vw,400px)] rounded-full border border-dashed border-primary/30" />
            <div className="relative z-10 flex w-full max-w-[580px] flex-col items-center gap-4">
              <div className="mb-1 flex w-full items-center justify-between gap-3 border-b border-primary/20 pb-3 text-[10px] font-bold uppercase tracking-[.2em] text-primary/80"><span className="inline-flex items-center gap-2"><StageIcon className="size-4" /> Prévia do herói</span><span className="font-mono">{String(step + 1).padStart(2, "0")} / 04</span></div>
              <div className="relative w-full max-w-[450px] overflow-hidden border border-primary/30 bg-card/55 p-2 shadow-[0_20px_80px_color-mix(in_srgb,var(--background)_70%,transparent)]">
                <div className="absolute left-0 top-0 z-10 size-6 border-l-2 border-t-2 border-primary"/><div className="absolute bottom-0 right-0 z-10 size-6 border-b-2 border-r-2 border-primary"/>
                <div className="relative aspect-[4/4.35] w-full overflow-hidden bg-background/80">
                  <img key={activePortraitUrl} src={activePortraitUrl} alt={`Retrato de ${name.trim() || "seu herói"}: ${activePortraitLabel || "Normal"}`} className="size-full object-contain transition-opacity duration-300" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/90 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 text-center"><span className="text-[9px] font-bold uppercase tracking-[.25em] text-primary">{selectedPortrait ? "Expressão alternativa" : "Retrato principal"}</span><p className="mt-1 truncate font-serif text-xl font-semibold text-foreground">{activePortraitLabel || "Normal"}</p></div>
                </div>
              </div>
              <div className="text-center"><h3 className="font-serif text-2xl font-bold tracking-wide text-foreground sm:text-3xl">{name.trim() || "Herói sem nome"}</h3><p className="mt-1 text-xs italic text-muted-foreground">{identity.trim() || origin.trim() || "Sua história começa aqui"}</p></div>
              <div className="flex w-full flex-wrap items-center justify-center gap-2" aria-label="Selecionar expressão para prévia">
                {avatarChoice.map((portrait, index) => {
                  const url = portrait.id === "__primary__" ? (portrait.url.startsWith("/") || publicPortraitUrl(portrait.url) ? portrait.url : "") : (publicPortraitUrl(portrait.url) ? portrait.url : "")
                  return <button key={portrait.id} type="button" onClick={() => setSelectedPortraitId(portrait.id)} aria-pressed={selectedPortraitId === portrait.id} title={portrait.label || `Retrato ${index + 1}`} className={`group relative grid size-12 place-items-center overflow-hidden border p-0.5 transition sm:size-14 ${selectedPortraitId === portrait.id ? "border-primary bg-primary/20 shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_20%,transparent)]" : "border-border/65 bg-card/50 hover:border-primary/50"}`}>
                    {url ? <img src={url} alt={`Prévia ${portrait.label || index + 1}`} className="size-full object-cover"/> : <span className="font-serif text-lg text-primary/60">{index + 1}</span>}
                    {index === 0 && <Crown className="absolute right-0 top-0 size-3.5 bg-background/90 p-0.5 text-primary" />}
                  </button>
                })}
              </div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"><Eye className="size-3.5" /> {actualPortraitCount} retrato(s) · prévia visual</p>
            </div>
          </section>

          {/* Resumo dinâmico: apresenta dados existentes sem alterar cálculos. */}
          <aside data-controller-scrollport="true" className="min-w-0 bg-card/25 px-4 py-6 sm:px-7 xl:min-h-0 xl:overflow-y-auto xl:px-6 xl:py-8" aria-label="Resumo do personagem">
            <div className="flex items-center gap-3 border-b border-primary/25 pb-4"><span className="grid size-10 place-items-center border border-primary/35 bg-primary/10 text-primary"><BookOpenText className="size-5" /></span><div><p className="text-[9px] font-black uppercase tracking-[.22em] text-primary">Códice do herói</p><h3 className="font-serif text-lg font-bold">Sua jornada</h3></div></div>
            <div className="mt-5 space-y-5">
              <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">Identidade</p><p className="mt-1 break-words font-serif text-xl font-bold">{name.trim() || "Desconhecido"}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{origin.trim() || "Origem não definida"}</p></div>
              <div className="border-t border-border/60 pt-4"><div className="mb-3 flex items-center justify-between"><h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-primary"><Swords className="size-4" /> Classes</h4><span className="font-mono text-xs text-muted-foreground">{totalLevels}/{maxInitialLevels} NV</span></div>
                {selectedClassEntries.length ? <div className="space-y-2.5">{selectedClassEntries.map(cls => {
                    const learnedSkills = cls.skills.filter(skill => (skillLevels[skill.id] || 0) > 0)
                    return <div key={cls.id} className="min-w-0 overflow-hidden border border-border/50 bg-background/45">
                      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5 text-xs">
                        <span className="min-w-0 break-words font-semibold text-foreground">{cls.name}</span>
                        <span className="shrink-0 whitespace-nowrap font-mono text-primary">NV {classLevels[cls.id]}</span>
                      </div>
                      {learnedSkills.length > 0 && <div className="space-y-1.5 p-2">
                        {learnedSkills.map(skill => <div key={skill.id} className="min-w-0 border border-border/30 bg-card/25 px-2.5 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="min-w-0 break-words text-[11px] font-medium text-foreground/90">{skill.name}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{skillLevels[skill.id]}/{skill.maxLevel}</span>
                          </div>
                          {hasEvolutionBonuses(skill.bonuses) && <button type="button"
                            onClick={() => setEvolutionView({ skill: skill as EvolutionSkill, className: cls.name, level: skillLevels[skill.id] || 0 })}
                            className="mt-2 inline-flex max-w-full items-center gap-1.5 border border-primary/30 bg-primary/[.07] px-2.5 py-1.5 text-[10px] font-semibold text-primary transition-colors hover:border-primary/70 hover:bg-primary/[.15]"
                            aria-label={`Ver árvore de evolução de ${skill.name}`}>
                            <GitBranch className="size-3.5 shrink-0" /> Árvore de evolução
                          </button>}
                        </div>)}
                      </div>}
                    </div>
                  })}</div> : <p className="text-xs italic text-muted-foreground">Nenhuma classe escolhida.</p>}
                {selectedSubclasses.length > 0 && <p className="mt-2 text-[10px] leading-relaxed text-primary/85">{selectedSubclasses.map(id => classes.find(cls => cls.id === id)?.name || id).join(" · ")}</p>}
              </div>
              <div className="border-t border-border/60 pt-4"><h4 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-primary"><Sparkles className="size-4" /> Afinidades</h4><p className="text-xs text-muted-foreground">Principal: <strong className="text-primary">{validPrimaryElement ? ELEMENT_NAMES[validPrimaryElement] : "Não definido"}</strong></p><p className="mt-1 text-xs text-muted-foreground">Secundária: <strong className="text-primary">{validSecondaryElement ? ELEMENT_NAMES[validSecondaryElement] : "Não definido"}</strong></p><p className="mt-1 text-xs text-muted-foreground">Complementares: {affinityOptions.filter(e => e !== validPrimaryElement && e !== validSecondaryElement).map(e => ELEMENT_NAMES[e]).join(" · ") || "Nenhuma"}</p></div>

              <div className="border-t border-border/60 pt-4"><h4 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-primary"><WandSparkles className="size-4" /> Atributos</h4><div className="grid grid-cols-2 gap-2">{(["mig", "dex", "ins", "wlp"] as const).map(key => <div key={key} className="flex items-center justify-between border-b border-border/50 py-1.5 text-xs"><span className="font-mono text-muted-foreground">{key.toUpperCase()}</span><span className="font-mono font-bold text-foreground">{attributes[key]}</span></div>)}</div></div>
              <div className="border-t border-border/60 pt-4"><h4 className="mb-3 text-[10px] font-black uppercase tracking-[.17em] text-primary">Recursos previstos</h4>{preview ? <div className="grid grid-cols-3 gap-2">{[
                { key: "HP", value: preview.maxHp, Icon: Heart, tone: "text-[color:var(--hp)]" },
                { key: "MP", value: preview.maxMp, Icon: Zap, tone: "text-[color:var(--mp)]" },
                { key: "IP", value: preview.maxIp, Icon: Shield, tone: "text-[color:var(--ip)]" },
              ].map(({ key, value, Icon, tone }) => <div key={key} className="border border-border/60 bg-background/45 p-2 text-center"><Icon className={`mx-auto size-4 ${tone}`} /><p className="mt-1 font-serif text-xl font-black">{value}</p><span className="text-[10px] text-muted-foreground">{key}</span></div>)}</div> : <p className="text-[11px] leading-relaxed text-muted-foreground">Classes personalizadas: recursos calculados pelo sistema após criar a ficha.</p>}</div>
              <div className="border-t border-border/60 pt-4"><div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-primary"><Package className="size-4" /> Equipamento</h4><span className="font-mono text-xs text-primary">{equipment.length + (activeToken?.startingItemIds.length || 0) + (activeToken?.startingRelics?.length || 0)}</span></div>{equipment.length > 0 ? <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{equipment.map(id => equipmentLookup.get(id)?.name || getEquipment(id)?.name || id).join(" · ")}</p> : <p className="mt-2 text-xs italic text-muted-foreground">Nada comprado ainda.</p>}{activeToken && (activeToken.startingItemIds.length > 0 || (activeToken.startingRelics || []).length > 0) && <p className="mt-2 text-[11px] text-primary">Presentes: {[...activeToken.startingItemIds.map(id => equipmentLookup.get(id)?.name || id), ...(activeToken.startingRelics || []).map(item => item.name)].join(" · ")}</p>}<p className={`mt-3 flex items-center gap-1.5 font-mono text-sm ${remaining < 0 ? "text-destructive" : "text-primary"}`}><Coins className="size-4" /> {remaining} zenit restantes</p></div>
              <p className="flex items-start gap-2 border border-primary/15 bg-primary/[.04] p-3 text-[11px] leading-relaxed text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0 text-primary" /> Suas escolhas são registradas somente ao concluir a forja.</p>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 shrink-0 border-t border-primary/25 bg-background/95 px-4 py-3 backdrop-blur-xl sm:px-7 xl:px-10">
        <div className="mx-auto flex max-w-[1750px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.21em] text-primary">Passo {step + 1} de {STEPS.length} · {STEPS[step]}</p><p className="mt-1 text-xs text-muted-foreground">{step === 0 ? `${actualPortraitCount} retrato(s) preparados` : step === 1 ? `${totalLevels} de ${maxInitialLevels} níveis · ${chosenClassCount} classe(s)` : step === 2 ? (profileId === "custom" ? `${customPoints} de 8 pontos atribuídos` : "Perfil de atributos selecionado") : step === 3 ? `Principal: ${validPrimaryElement ? ELEMENT_NAMES[validPrimaryElement] : "Não definido"} · Secundária: ${validSecondaryElement ? ELEMENT_NAMES[validSecondaryElement] : "Não definido"}` : `${remaining} zenit disponíveis`}</p></div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3"><Button ref={footerCancelRef} type="button" variant="outline" onClick={() => step === 0 ? onCancel() : setStep(step - 1)} disabled={saving} className="h-11 min-w-0 flex-1 gap-2 border-border/70 bg-card/40 text-xs sm:flex-none sm:px-5"><ArrowLeft className="size-4" /> {step === 0 ? "Cancelar" : "Voltar"}</Button>
            {step < STEPS.length - 1 ? <Button ref={footerNextRef} type="button" onClick={() => setStep(step + 1)} disabled={!canNext} className="h-11 min-w-0 flex-[2] gap-2 rounded-sm px-5 text-xs font-black uppercase tracking-wider sm:flex-none sm:px-7">Avançar <ArrowRight className="size-4" /></Button> :
              <Button ref={footerNextRef} type="button" onClick={() => void submit()} disabled={saving || !canNext} className="h-11 min-w-0 flex-[2] gap-2 rounded-sm px-5 text-xs font-black uppercase tracking-wider sm:flex-none sm:px-7">{saving ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />} {saving ? "Forjando..." : activeToken ? "Forjar com token" : "Forjar herói"}</Button>}
          </div>
        </div>
        {controllerActive && <p className="mx-auto mt-2 max-w-[1750px] text-[10px] font-semibold text-primary/85" aria-live="off">
          LB: etapa anterior · RB: próxima etapa (quando disponível) · A: selecionar · B: fechar a Forja
        </p>}
        {error && <p role="alert" className="mx-auto mt-2 max-w-[1750px] border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      </footer>
      {evolutionView && <SkillEvolutionTree
          skill={evolutionView.skill}
          className={evolutionView.className}
          level={evolutionView.level}
          onClose={() => setEvolutionView(null)}
        />}
      </div>
    )

  // O portal escapa do container antigo de 4xl na CampaignRoom, ocupando toda a tela
  // sem exigir alteração em rotas, regras, no seletor de NPC ou no modal da sala.
  return mounted && typeof document !== "undefined" ? createPortal(ui, document.body) : null
}
