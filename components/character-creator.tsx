"use client"

import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { ATTRIBUTE_PROFILES, CLASSES, getEquipment, STARTING_ZENIT, type GameClass } from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import { baseGameClasses, classLevelsFromSkills, getCampaignClassCatalog, subclassesFor } from "@/lib/class-catalog"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import { ArrowLeft, ArrowRight, Check, Coins, Heart, Loader2, Sparkles, Swords, Zap } from "lucide-react"
import { EssenceStep, ClassesStep, EquipmentStep } from "./creator-steps"
import { AttributesStep } from "./attributes-step"

const STEPS = ["Essência", "Classes", "Atributos", "Equipamento"] as const

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
  const [serverClasses, setServerClasses] = useState<GameClass[]>(customClasses)
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

  // Catálogo da campanha, não CLASSES global. O servidor é a fonte dos homebrews.
  useEffect(() => {
    let active = true
    setLoadingCatalog(true)
    void apiFetch<{ state: { customClasses?: GameClass[] } }>(`/api/campaigns/${encodeURIComponent(campaignId)}/state`, { cache: "no-store" })
      .then(response => { if (active) setServerClasses(Array.isArray(response.state?.customClasses) ? response.state.customClasses : []) })
      .catch(() => { if (active) setError("Não foi possível atualizar as classes da campanha. Confira a conexão antes de criar a ficha.") })
      .finally(() => { if (active) setLoadingCatalog(false) })
    return () => { active = false }
  }, [campaignId])

  const classes = useMemo(() => getCampaignClassCatalog(campaignCharacters, serverClasses), [campaignCharacters, serverClasses])
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
  const spent = useMemo(() => equipment.reduce((sum, id) => sum + (getEquipment(id)?.cost ?? 0), 0), [equipment])
  const remaining = STARTING_ZENIT - spent
  const classesPayload: ClassLevel[] = useMemo(() => Object.entries(classLevels).map(([classId, level]) => ({ classId, level })), [classLevels])
  // O cálculo do projeto original conhece apenas as classes oficiais.
  // Não exibir números enganosos para classes criadas pelo mestre até integrar lib/character e a API.
  const resourcePreviewSupported = classesPayload.every(value => CLASSES.some(cls => cls.id === value.classId))
  const preview = useMemo(() => resourcePreviewSupported ? computeMaxResources(classesPayload, attributes) : null, [classesPayload, attributes, resourcePreviewSupported])

  function setSkillLvl(skillId: string, level: number, max: number) {
    if (level < 0 || level > max) return
    setSkillLevels(prev => { const next = { ...prev, [skillId]: level }; if (level === 0) delete next[skillId]; return next })
  }
  function toggleEquipment(id: string) {
    setEquipment(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function chooseSubclass(parentClassId: string, subclassId: string) {
    setChosenSubclassIds(current => ({ ...current, [parentClassId]: subclassId }))
  }

  const canNext = !loadingCatalog && !error && (
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && chosenClassCount >= 2 && chosenClassCount <= 3 && totalLevels === 5) ||
    (step === 2 && (profileId !== "custom" || customPoints === 8)) ||
    (step === 3 && remaining >= 0)
  )

  async function submit() {
    if (!canNext || saving) return
    setSaving(true)
    setError(null)
    let created: Character | undefined
    try {
      const response = await apiFetch<{ character: Character }>("/api/characters", {
        method: "POST",
        body: JSON.stringify({
          campaignId, name, avatarUrl, origin, identity, theme,
          classes: classesPayload,
          skills: skillLevels,
          attributes,
          equipment,
          // Livros são vinculados às classes, não injetados como itens mágicos.
          customItems: [],
        }),
      })
      created = response.character
      if (!created?.id) throw new Error("A criação do personagem não retornou um ID válido.")
      const failures: string[] = []
      for (const subclassId of selectedSubclasses) {
        try {
          await apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/class-books`, {
            method: "POST",
            body: JSON.stringify({ action: "select-subclass", characterId: created.id, subclassId }),
          })
        } catch (exception) {
          failures.push(`${subclassId}: ${exception instanceof Error ? exception.message : "erro"}`)
        }
      }
      if (failures.length > 0) {
        // Não tentar criar o personagem novamente: o POST anterior foi confirmado.
        window.alert(`Personagem criado, mas algumas subclasses não foram associadas. Você pode escolhê-las no Grimório/Livros após entrar na sala.\n${failures.join("\n")}`)
      }
      onCreated(created)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Erro ao criar personagem.")
    } finally {
      setSaving(false)
    }
  }

  return <div className="mx-auto max-w-3xl">
    <div className="mb-8 flex items-center justify-between">
      {STEPS.map((label, index) => <div key={label} className="flex flex-1 items-center">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${index < step ? "border-primary bg-primary text-primary-foreground" : index === step ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
          {index < step ? <Check className="size-4" /> : index + 1}
        </div>
        <span className={`ml-2 hidden text-sm sm:inline ${index === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
        {index < STEPS.length - 1 && <div className={`mx-2 h-px flex-1 ${index < step ? "bg-primary" : "bg-border"}`} />}
      </div>)}
    </div>
    <div className="panel border-glow relative min-h-[360px] rounded-md border p-5 sm:p-6">
      {step === 0 && <EssenceStep name={name} setName={setName} avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} origin={origin} setOrigin={setOrigin} identity={identity} setIdentity={setIdentity} theme={theme} setTheme={setTheme} />}
      {step === 1 && (loadingCatalog ? <div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Carregando classes da campanha...</div> :
        <ClassesStep classes={baseClasses} subclasses={classes.filter(cls => !!cls.parentClassId)} chosenSubclassIds={chosenSubclassIds} onChooseSubclass={chooseSubclass}
          skillLevels={skillLevels} setSkillLvl={setSkillLvl} classLevels={classLevels} totalLevels={totalLevels} chosenCount={chosenClassCount} />)}
      {step === 2 && <AttributesStep profileId={profileId} setProfileId={setProfileId} attributes={attributes} customAttributes={customAttributes} setCustomAttributes={setCustomAttributes} />}
      {step === 3 && <EquipmentStep equipment={equipment} toggle={toggleEquipment} remaining={remaining} spent={spent} />}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-sm border border-border/60 bg-card/60 px-4 py-3 text-sm shadow-inner">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Previsão</span>
      {preview ? <>
        <span className="flex items-center gap-1.5 text-[color:var(--hp)]"><Heart className="size-4" /> {preview.maxHp} HP</span>
        <span className="flex items-center gap-1.5 text-[color:var(--mp)]"><Zap className="size-4" /> {preview.maxMp} MP</span>
        <span className="flex items-center gap-1.5 text-[color:var(--ip)]"><Swords className="size-4" /> {preview.maxIp} IP</span>
      </> : <span className="text-xs text-amber-300">Recursos de classes personalizadas: confirmar na ficha após criação (cálculo original ainda precisa de adaptação no servidor).</span>}
      <span className="ml-auto flex items-center gap-1.5 text-accent"><Coins className="size-4" /> {remaining} zenit</span>
    </div>
    {error && <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex items-center justify-between">
      <Button variant="ghost" onClick={() => step === 0 ? onCancel() : setStep(step - 1)} className="gap-1.5 text-muted-foreground"><ArrowLeft className="size-4" /> {step === 0 ? "Cancelar" : "Voltar"}</Button>
      {step < STEPS.length - 1 ? <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1.5">Próximo <ArrowRight className="size-4" /></Button>
        : <Button onClick={submit} disabled={saving || !canNext} className="gap-1.5 font-semibold">{saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Forjar Herói</Button>}
    </div>
  </div>
}
