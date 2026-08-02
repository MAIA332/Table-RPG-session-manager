"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ATTRIBUTE_PROFILES, CLASSES, getEquipment, STARTING_ZENIT } from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import type { AttributeKey, Creature, ClassLevel, DieSize } from "@/lib/types"
import { ArrowLeft, ArrowRight, Check, Coins, Heart, Loader2, Sparkles, Swords, Zap, Target } from "lucide-react"

// Importa os mesmos steps dos jogadores!
import { EssenceStep, ClassesStep, EquipmentStep } from "./creator-steps"
import { AttributesStep } from "./attributes-step"

const STEPS = ["Essência", "Classes", "Atributos", "Equipamento"] as const

interface NPCCreatorProps {
  onCreated: (npc: Creature) => void
  onCancel: () => void
}

export function NPCCreator({ onCreated, onCancel }: NPCCreatorProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 1: Essencia (Reaproveitado para o NPC)
  const [name, setName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [origin, setOrigin] = useState("Monstro") // Usado como "Espécie"
  const [identity, setIdentity] = useState("")
  const [theme, setTheme] = useState("")

  // Step 2: Classes
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})

  // Step 3: Atributos
  const [profileId, setProfileId] = useState<string>(ATTRIBUTE_PROFILES[0].id)
  const [customAttributes, setCustomAttributes] = useState<Record<AttributeKey, DieSize>>({
    dex: "d8", ins: "d8", mig: "d8", wlp: "d8"
  })

  // Step 4: Equipamento
  const [equipment, setEquipment] = useState<string[]>([])

  // --- Derivações ---
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
    (step === 1 && chosenClassCount >= 1 && totalLevels > 0) || // NPCs podem ser mais flexíveis que heróis
    (step === 2 && (profileId !== "custom" || customPoints === 8)) ||
    step === 3

  async function submit() {
    setSaving(true)
    
    // Transforma as skills selecionadas em texto para renderizar na ficha da criatura
    const generatedSpells = Object.entries(skillLevels).map(([skillId, lvl]) => {
        const classObj = CLASSES.find(c => c.skills.some((s: any) => s.id === skillId));
        const skillObj = classObj?.skills.find((s: any) => s.id === skillId);
        return `[${classObj?.name}] ${skillObj?.name} (Nv.${lvl})`;
    });

    const npc: Creature = {
      id: "npc-" + Math.random().toString(36).substring(2, 9),
      name: name,
      level: Math.max(5, totalLevels), // Nível base 5 ou a soma das classes
      species: origin || "Monstro",
      imageUrl: avatarUrl || "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=400&auto=format&fit=crop",
      maxHp: preview.maxHp,
      maxMp: preview.maxMp,
      def: parseInt(attributes.dex.replace('d', '')), // Defesa baseada na Destreza
      mdef: parseInt(attributes.ins.replace('d', '')), // Defesa Mágica baseada em Intuição
      attributes: attributes as any,
      equipment: equipment,
      affinities: { physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "none", ice: "none", light: "none", poison: "none" },
      basicAttacks: [{ name: "Ataque Básico", attributes: ["dex", "mig"], damage: 5, type: "físico" }],
      spells: generatedSpells,
    }

    setTimeout(() => {
      onCreated(npc)
      setSaving(false)
    }, 500) // Pequeno delay para sensação de forja
  }

  return (
    <div className="mx-auto max-w-3xl w-full">
      {/* Stepper com tema Destructive para diferenciar do jogador */}
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${i < step ? "border-destructive bg-destructive text-destructive-foreground" : i === step ? "border-destructive bg-destructive/15 text-destructive" : "border-border text-muted-foreground"}`}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={`ml-2 hidden text-sm sm:inline ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`mx-2 h-px flex-1 ${i < step ? "bg-destructive" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <div className="panel border-glow min-h-[360px] rounded-xl border border-destructive/30 p-6 relative">
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

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
        <span className="text-xs font-semibold uppercase tracking-widest text-destructive">Ficha do NPC</span>
        <span className="flex items-center gap-1.5 text-[color:var(--hp)]"><Heart className="size-4" /> {preview.maxHp} HP</span>
        <span className="flex items-center gap-1.5 text-[color:var(--mp)]"><Zap className="size-4" /> {preview.maxMp} MP</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><Swords className="size-4" /> Lv. {Math.max(5, totalLevels)}</span>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" /> {step === 0 ? "Cancelar" : "Voltar"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Próximo <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={saving || !canNext} className="gap-1.5 font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />} Concluir NPC
          </Button>
        )}
      </div>
    </div>
  )
}