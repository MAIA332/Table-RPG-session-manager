"use client"

import { useMemo, useState } from "react"
import { apiFetch } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { ATTRIBUTE_PROFILES, CLASSES, getEquipment, STARTING_ZENIT } from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import { ArrowLeft, ArrowRight, Check, Coins, Heart, Loader2, Sparkles, Swords, Zap } from "lucide-react"

import { EssenceStep, ClassesStep, EquipmentStep } from "./creator-steps"
import { AttributesStep } from "./attributes-step"

const STEPS = ["Essência", "Classes", "Atributos", "Equipamento"] as const

interface Props {
  campaignId: string
  onCreated: (character: Character) => void
  onCancel: () => void
}

export function CharacterCreator({ campaignId, onCreated, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [origin, setOrigin] = useState("")
  const [identity, setIdentity] = useState("")
  const [theme, setTheme] = useState("")

  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})

  const [profileId, setProfileId] = useState<string>(ATTRIBUTE_PROFILES[0].id)
  const [customAttributes, setCustomAttributes] = useState<Record<AttributeKey, DieSize>>({
    dex: "d8", ins: "d8", mig: "d8", wlp: "d8"
  })

  const [equipment, setEquipment] = useState<string[]>([])

  const totalLevels = useMemo(() => Object.values(skillLevels).reduce((s, n) => s + n, 0), [skillLevels])
  
  const classLevels = useMemo(() => {
    const cl: Record<string, number> = {}
    CLASSES.forEach(c => {
      let classLvl = 0
      c.skills.forEach(s => { classLvl += (skillLevels[s.id] || 0) })
      if (classLvl > 0) cl[c.id] = classLvl
    })
    return cl
  }, [skillLevels])

  const chosenClassCount = Object.keys(classLevels).length

  const attributes = useMemo<Record<AttributeKey, DieSize>>(() => {
    if (profileId === "custom") return customAttributes;
    return ATTRIBUTE_PROFILES.find((p) => p.id === profileId)?.dice || customAttributes;
  }, [profileId, customAttributes])

  const customPoints = useMemo(() => Object.values(customAttributes).reduce((acc, die) => {
      return acc + (die === "d6" ? 1 : die === "d8" ? 2 : die === "d10" ? 3 : 4);
  }, 0), [customAttributes])

  const spent = useMemo(() => equipment.reduce((s, id) => s + (getEquipment(id)?.cost ?? 0), 0), [equipment])
  const remaining = STARTING_ZENIT - spent
  const classesPayload: ClassLevel[] = useMemo(() => Object.entries(classLevels).map(([classId, level]) => ({ classId, level })), [classLevels])
  const preview = useMemo(() => computeMaxResources(classesPayload, attributes), [classesPayload, attributes])

  function setSkillLvl(skillId: string, level: number, max: number) {
    if (level < 0 || level > max) return
    setSkillLevels((prev) => {
      const next = { ...prev, [skillId]: level }
      if (level === 0) delete next[skillId]
      return next
    })
  }

  function toggleEquipment(id: string) {
    setEquipment((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && chosenClassCount >= 2 && chosenClassCount <= 3 && totalLevels === 5) ||
    (step === 2 && (profileId !== "custom" || customPoints === 8)) ||
    step === 3

  async function submit() {
    setSaving(true)
    setError(null)

    // ===============================================
    // INJEÇÃO AUTOMÁTICA DE ITENS BASEADOS NA CLASSE
    // ===============================================
    const initialCustomItems: any[] = [];
    
    // Injeta o BlueprintApp silenciosamente na mochila caso possua a classe Inventor!
    if (classesPayload.some(c => c.classId === "tinkerer")) {
      initialCustomItems.push({
        id: "item-" + Math.random().toString(36).substring(2, 9),
        name: "Almanaque de Projetos Magitech",
        type: "app-blueprints", // <-- O Type mágico que ativa o render customizado
        content: "" 
      });
    }

    try {
      const { character } = await apiFetch<{ character: Character }>("/api/characters", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          name,
          avatarUrl,
          origin,
          identity,
          theme,
          classes: classesPayload,
          skills: skillLevels,
          attributes,
          equipment,
          customItems: initialCustomItems,
        }),
      })
      onCreated(character)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar personagem.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={`ml-2 hidden text-sm sm:inline ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`mx-2 h-px flex-1 ${i < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <div className="panel border-glow relative min-h-[360px] rounded-md border p-5 sm:p-6">
        {step === 0 && (
          <EssenceStep name={name} setName={setName} avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl} origin={origin} setOrigin={setOrigin} identity={identity} setIdentity={setIdentity} theme={theme} setTheme={setTheme} />
        )}
        {step === 1 && (
          <ClassesStep skillLevels={skillLevels} setSkillLvl={setSkillLvl} classLevels={classLevels} totalLevels={totalLevels} chosenCount={chosenClassCount} />
        )}
        {step === 2 && (
          <AttributesStep profileId={profileId} setProfileId={setProfileId} attributes={attributes} customAttributes={customAttributes} setCustomAttributes={setCustomAttributes} />
        )}
        {step === 3 && (
          <EquipmentStep equipment={equipment} toggle={toggleEquipment} remaining={remaining} spent={spent} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-sm border border-border/60 bg-card/60 px-4 py-3 text-sm shadow-inner">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Previsao</span>
        <span className="flex items-center gap-1.5 text-[color:var(--hp)]"><Heart className="size-4" /> {preview.maxHp} HP</span>
        <span className="flex items-center gap-1.5 text-[color:var(--mp)]"><Zap className="size-4" /> {preview.maxMp} MP</span>
        <span className="flex items-center gap-1.5 text-[color:var(--ip)]"><Swords className="size-4" /> {preview.maxIp} IP</span>
        <span className="ml-auto flex items-center gap-1.5 text-accent"><Coins className="size-4" /> {remaining} zenit</span>
      </div>

      {error && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" /> {step === 0 ? "Cancelar" : "Voltar"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1.5">
            Proximo <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={saving || !canNext} className="gap-1.5 font-semibold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Forjar Heroi
          </Button>
        )}
      </div>
    </div>
  )
}
