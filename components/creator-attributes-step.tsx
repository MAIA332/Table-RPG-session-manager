"use client"

import { Check, Dices, Info, Shield, Sparkles, WandSparkles } from "lucide-react"
import { ATTRIBUTE_PROFILES } from "@/lib/game-data"
import type { AttributeKey, DieSize } from "@/lib/types"

const KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const NAMES: Record<AttributeKey, string> = {
  dex: "Destreza", ins: "Intuição", mig: "Vigor", wlp: "Vontade",
}
const DICE = ["d6", "d8", "d10", "d12"] as const
const COST: Record<(typeof DICE)[number], number> = { d6: 1, d8: 2, d10: 3, d12: 4 }

interface Props {
  profileId: string
  setProfileId: (id: string) => void
  attributes: Record<AttributeKey, DieSize>
  customAttributes: Record<AttributeKey, DieSize>
  setCustomAttributes: (attributes: Record<AttributeKey, DieSize>) => void
}

/** Layout da criação: a coluna do formulário pode ter só 330–500 px no desktop. */
export function CreatorAttributesStep({ profileId, setProfileId, attributes, customAttributes, setCustomAttributes }: Props) {
  const points = KEYS.reduce((sum, key) => sum + (COST[customAttributes[key] as keyof typeof COST] ?? 0), 0)
  const isCustom = profileId === "custom"
  const profiles = ATTRIBUTE_PROFILES.filter(profile => profile.id !== "custom")
  const icons = [Shield, WandSparkles, Sparkles]

  return <section className="min-w-0 space-y-5">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-bold sm:text-xl">Distribuição de atributos</h3>
        <span className="shrink-0 border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">4 atributos</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Escolha um perfil ou personalize os quatro dados da sua ficha.</p>
    </div>

    <div className="grid min-w-0 grid-cols-2 gap-2" role="radiogroup" aria-label="Perfil de atributos">
      {profiles.map((profile, index) => {
        const active = profileId === profile.id
        const icon = icons[index % icons.length]
        const Icon = icon
        const meta = profile as typeof profile & { name?: string; label?: string; description?: string; detail?: string }
        return <button key={profile.id} role="radio" aria-checked={active} type="button" onClick={() => setProfileId(profile.id)}
          className={`group flex min-h-[125px] min-w-0 flex-col items-start gap-2 overflow-hidden border p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? "border-primary/75 bg-primary/[.12]" : "border-border/55 bg-card/45 hover:border-primary/50 hover:bg-card/75"}`}>
          <span className="flex w-full items-center justify-between gap-1 text-primary"><Icon className="size-4 shrink-0" />{active && <Check className="size-3.5 shrink-0" />}</span>
          <strong className="max-w-full break-words font-serif text-sm font-bold leading-tight text-foreground sm:text-base">{meta.name || meta.label || profile.id}</strong>
          <span className="block max-w-full break-words text-[11px] leading-relaxed text-muted-foreground">{meta.description || meta.detail || "Distribuição predefinida de dados."}</span>
        </button>
      })}
      <button role="radio" aria-checked={isCustom} type="button" onClick={() => setProfileId("custom")}
        className={`group flex min-h-[125px] min-w-0 flex-col items-start gap-2 overflow-hidden border p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${isCustom ? "border-primary/75 bg-primary/[.12]" : "border-border/55 bg-card/45 hover:border-primary/50 hover:bg-card/75"}`}>
        <span className="flex w-full items-center justify-between gap-1 text-primary"><Dices className="size-4 shrink-0" />{isCustom && <Check className="size-3.5 shrink-0" />}</span>
        <strong className="max-w-full break-words font-serif text-sm font-bold leading-tight text-foreground sm:text-base">Personalizado</strong>
        <span className="block max-w-full break-words text-[11px] leading-relaxed text-muted-foreground">Distribua 8 pontos entre seus quatro dados.</span>
      </button>
    </div>

    {isCustom && <div className={`flex flex-wrap items-center justify-between gap-2 border px-3 py-2 text-xs ${points === 8 ? "border-primary/35 bg-primary/[.07]" : "border-amber-500/35 bg-amber-500/[.06]"}`}>
      <span className="font-semibold">Orçamento de atributos</span>
      <span className={`font-mono font-bold ${points === 8 ? "text-primary" : "text-amber-400"}`}>{points} / 8 pontos</span>
      <p className="w-full text-[11px] text-muted-foreground">d6 = 1 · d8 = 2 · d10 = 3 · d12 = 4. Use exatamente 8 pontos para continuar.</p>
    </div>}

    <div className="grid min-w-0 grid-cols-2 gap-2.5" aria-label="Dados dos atributos">
      {KEYS.map(key => <div key={key} className="flex min-w-0 flex-col items-center justify-between gap-2 overflow-hidden border border-primary/20 bg-background/60 px-2 py-4 text-center sm:px-3">
        <span className="text-[10px] font-black uppercase tracking-[.15em] text-primary/80">{key.toUpperCase()}</span>
        {isCustom ? <select value={customAttributes[key]}
          aria-label={`Dado de ${NAMES[key]}`}
          onChange={event => setCustomAttributes({ ...customAttributes, [key]: event.target.value as DieSize })}
          className="w-full min-w-0 cursor-pointer border border-primary/30 bg-card/70 px-1 py-2 text-center font-serif text-2xl font-bold text-primary outline-none focus:border-primary sm:text-3xl">
          {DICE.map(die => <option value={die} key={die}>{die.toUpperCase()}</option>)}
        </select> : <strong className="font-serif text-3xl font-black uppercase text-primary sm:text-4xl">{attributes[key]}</strong>}
        <span className="text-[10px] font-bold text-muted-foreground sm:text-xs">{NAMES[key]}</span>
        {isCustom && <span className="text-[10px] text-muted-foreground">{COST[customAttributes[key] as keyof typeof COST] ?? 0} pontos</span>}
      </div>)}
    </div>
    <p className="flex items-start gap-2 border-l-2 border-primary/40 pl-3 text-[11px] leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0 text-primary" />Os dados exibidos são os mesmos usados nos testes e no cálculo dos recursos do personagem.</p>
  </section>
}
