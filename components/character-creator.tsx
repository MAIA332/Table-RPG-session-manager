"use client"

import { useMemo, useState } from "react"
import { apiFetch } from "@/lib/client"
import { Button } from "@/components/ui/button"
import {
  ATTRIBUTE_META,
  ATTRIBUTE_PROFILES,
  CLASSES,
  EQUIPMENT,
  IDENTITY_SUGGESTIONS,
  ORIGIN_SUGGESTIONS,
  STARTING_ZENIT,
  THEME_SUGGESTIONS,
  getEquipment,
} from "@/lib/game-data"
import { computeMaxResources } from "@/lib/character"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Heart,
  Loader2,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react"

const STEPS = ["Essencia", "Classes", "Atributos", "Equipamento"] as const

interface Props {
  campaignId: string
  onCreated: (character: Character) => void
  onCancel: () => void
}

export function CharacterCreator({ campaignId, onCreated, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Essencia
  const [name, setName] = useState("")
  const [origin, setOrigin] = useState("")
  const [identity, setIdentity] = useState("")
  const [theme, setTheme] = useState("")

  // Classes: mapa classId -> nivel
  const [classLevels, setClassLevels] = useState<Record<string, number>>({})

  // Atributos
  const [profileId, setProfileId] = useState<string>(ATTRIBUTE_PROFILES[0].id)

  // Equipamento
  const [equipment, setEquipment] = useState<string[]>([])

  const totalLevels = useMemo(
    () => Object.values(classLevels).reduce((s, n) => s + n, 0),
    [classLevels],
  )
  const chosenClassCount = useMemo(
    () => Object.values(classLevels).filter((n) => n > 0).length,
    [classLevels],
  )

  const attributes = useMemo<Record<AttributeKey, DieSize>>(
    () => ATTRIBUTE_PROFILES.find((p) => p.id === profileId)!.dice,
    [profileId],
  )

  const spent = useMemo(
    () => equipment.reduce((s, id) => s + (getEquipment(id)?.cost ?? 0), 0),
    [equipment],
  )
  const remaining = STARTING_ZENIT - spent

  const classesPayload: ClassLevel[] = useMemo(
    () =>
      Object.entries(classLevels)
        .filter(([, lvl]) => lvl > 0)
        .map(([classId, level]) => ({ classId, level })),
    [classLevels],
  )

  const preview = useMemo(
    () => computeMaxResources(classesPayload, attributes),
    [classesPayload, attributes],
  )

  function setClassLevel(classId: string, level: number) {
    setClassLevels((prev) => {
      const next = { ...prev, [classId]: level }
      if (level === 0) delete next[classId]
      return next
    })
  }

  function toggleEquipment(id: string) {
    setEquipment((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && chosenClassCount >= 2 && chosenClassCount <= 3 && totalLevels === 5) ||
    step === 2 ||
    step === 3

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const { character } = await apiFetch<{ character: Character }>("/api/characters", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          name,
          origin,
          identity,
          theme,
          classes: classesPayload,
          attributes,
          equipment,
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
      {/* Stepper */}
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${
                i < step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i === step
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span
              className={`ml-2 hidden text-sm sm:inline ${
                i === step ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`mx-2 h-px flex-1 ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="panel border-glow min-h-[360px] rounded-xl border p-6">
        {step === 0 && (
          <EssenceStep
            name={name}
            setName={setName}
            origin={origin}
            setOrigin={setOrigin}
            identity={identity}
            setIdentity={setIdentity}
            theme={theme}
            setTheme={setTheme}
          />
        )}

        {step === 1 && (
          <ClassesStep
            classLevels={classLevels}
            setClassLevel={setClassLevel}
            totalLevels={totalLevels}
            chosenCount={chosenClassCount}
          />
        )}

        {step === 2 && (
          <AttributesStep profileId={profileId} setProfileId={setProfileId} attributes={attributes} />
        )}

        {step === 3 && (
          <EquipmentStep
            equipment={equipment}
            toggle={toggleEquipment}
            remaining={remaining}
            spent={spent}
          />
        )}
      </div>

      {/* Preview de recursos */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Previsao
        </span>
        <span className="flex items-center gap-1.5 text-[color:var(--hp)]">
          <Heart className="size-4" /> {preview.maxHp} HP
        </span>
        <span className="flex items-center gap-1.5 text-[color:var(--mp)]">
          <Zap className="size-4" /> {preview.maxMp} MP
        </span>
        <span className="flex items-center gap-1.5 text-[color:var(--ip)]">
          <Swords className="size-4" /> {preview.maxIp} IP
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-accent">
          <Coins className="size-4" /> {remaining} zenit
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Navegacao */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          {step === 0 ? "Cancelar" : "Voltar"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1.5">
            Proximo <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={saving} className="gap-1.5 font-semibold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Forjar Heroi
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- Passo 1: Essencia ---------- */
function EssenceStep(props: {
  name: string
  setName: (v: string) => void
  origin: string
  setOrigin: (v: string) => void
  identity: string
  setIdentity: (v: string) => void
  theme: string
  setTheme: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <h3 className="font-serif text-xl font-bold text-foreground">Sua Essencia</h3>
      <TextField label="Nome do Heroi" value={props.name} onChange={props.setName} placeholder="Ex: Aria Ventoluz" />
      <SuggestField
        label="Origem"
        hint="De onde voce vem"
        value={props.origin}
        onChange={props.setOrigin}
        suggestions={ORIGIN_SUGGESTIONS}
      />
      <SuggestField
        label="Identidade"
        hint="O que voce e hoje"
        value={props.identity}
        onChange={props.setIdentity}
        suggestions={IDENTITY_SUGGESTIONS}
      />
      <SuggestField
        label="Tema"
        hint="A emocao que te move"
        value={props.theme}
        onChange={props.setTheme}
        suggestions={THEME_SUGGESTIONS}
      />
    </div>
  )
}

/* ---------- Passo 2: Classes ---------- */
function ClassesStep({
  classLevels,
  setClassLevel,
  totalLevels,
  chosenCount,
}: {
  classLevels: Record<string, number>
  setClassLevel: (id: string, lvl: number) => void
  totalLevels: number
  chosenCount: number
}) {
  const remaining = 5 - totalLevels
  const valid = chosenCount >= 2 && chosenCount <= 3 && totalLevels === 5

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-bold text-foreground">Escolha 2 a 3 Classes</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            valid ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {totalLevels}/5 niveis
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Distribua exatamente 5 niveis. {remaining > 0 ? `Faltam ${remaining}.` : "Pronto!"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CLASSES.map((c) => {
          const lvl = classLevels[c.id] ?? 0
          const active = lvl > 0
          const canIncrease = remaining > 0 && (active || chosenCount < 3)
          return (
            <div
              key={c.id}
              className={`rounded-lg border p-3 transition-colors ${
                active ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-serif font-bold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.archetype}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <StepButton disabled={lvl === 0} onClick={() => setClassLevel(c.id, lvl - 1)}>
                    −
                  </StepButton>
                  <span className="w-5 text-center font-mono font-bold text-foreground">{lvl}</span>
                  <StepButton disabled={!canIncrease} onClick={() => setClassLevel(c.id, lvl + 1)}>
                    +
                  </StepButton>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.description}</p>
              {active && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <li
                      key={s.id}
                      className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                    >
                      {s.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Passo 3: Atributos ---------- */
function AttributesStep({
  profileId,
  setProfileId,
  attributes,
}: {
  profileId: string
  setProfileId: (id: string) => void
  attributes: Record<AttributeKey, DieSize>
}) {
  const keys: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-serif text-xl font-bold text-foreground">Distribuicao de Atributos</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {ATTRIBUTE_PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => setProfileId(p.id)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              profileId === p.id ? "border-primary bg-primary/10 border-glow" : "border-border/60 bg-card/40"
            }`}
          >
            <p className="font-serif font-bold text-foreground">{p.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
            <p className="mt-2 font-mono text-xs text-primary">
              {keys.map((k) => p.dice[k]).join(" · ")}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {keys.map((k) => (
          <div key={k} className="rounded-lg border border-border/60 bg-card/40 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ATTRIBUTE_META[k].short}
            </p>
            <p className="mt-1 font-serif text-3xl font-black text-primary text-glow">
              {attributes[k]}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{ATTRIBUTE_META[k].label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Passo 4: Equipamento ---------- */
function EquipmentStep({
  equipment,
  toggle,
  remaining,
  spent,
}: {
  equipment: string[]
  toggle: (id: string) => void
  remaining: number
  spent: number
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-bold text-foreground">Equipamento inicial</h3>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            remaining < 0 ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent"
          }`}
        >
          <Coins className="size-3.5" /> {remaining} / {STARTING_ZENIT} zenit
        </span>
      </div>
      {remaining < 0 && (
        <p className="text-sm text-destructive">Voce ultrapassou o orcamento. Remova algum item.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {EQUIPMENT.map((item) => {
          const selected = equipment.includes(item.id)
          const affordable = selected || spent + item.cost <= STARTING_ZENIT
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              disabled={!affordable}
              className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors disabled:opacity-40 ${
                selected ? "border-primary bg-primary/10" : "border-border/60 bg-card/40"
              }`}
            >
              <div>
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="ml-3 flex items-center gap-2">
                <span className="font-mono text-sm text-accent">{item.cost}</span>
                {selected ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <span className="size-4" />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Campos reutilizaveis ---------- */
function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  )
}

function SuggestField({
  label,
  hint,
  value,
  onChange,
  suggestions,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  suggestions: string[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground/70">{hint}</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="rounded-full border border-border/60 bg-card/40 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </label>
  )
}

function StepButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-lg leading-none text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
    >
      {children}
    </button>
  )
}
