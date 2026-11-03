"use client"

import { Shield, Sparkles, Check, Info } from "lucide-react"
import { ELEMENT_NAMES, classElement, availableClassElements, type ElementId } from "@/lib/elemental-affinities"

export function CreatorAffinityStep({ classes, primary, secondary, onPrimary, onSecondary }: {
  classes: Array<{ id: string; name: string; affinity?: unknown; element?: unknown }>
  primary: ElementId | null
  secondary: ElementId | null
  onPrimary: (value: ElementId) => void
  onSecondary: (value: ElementId | null) => void
}) {
  const options = availableClassElements(classes)
  return <section className="space-y-5">
    <div className="border-l-2 border-primary pl-4"><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Marca de nascimento</p><h3 className="mt-2 font-serif text-xl font-black">Sua essência elemental</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">As afinidades provêm das classes que você escolheu. Defina sua principal e uma secundária. Todas as outras serão complementares.</p></div>
    <div className="grid grid-cols-2 gap-2">{[
      { label: "Principal", value: primary, description: "Eficácia completa" },
      { label: "Secundária", value: secondary, description: "Reduz 1 nível" },
    ].map(entry => <div key={entry.label} className="rounded-xl border border-primary/25 bg-primary/[.06] p-4"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{entry.label}</span><p className="mt-2 min-h-[2rem] font-serif text-xl font-bold text-primary">{entry.value ? ELEMENT_NAMES[entry.value] : "Não definido"}</p><span className="mt-1 block text-[11px] text-muted-foreground">{entry.description}</span></div>)}</div>
    <div className="space-y-2"><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary"><Sparkles className="size-4" /> Elementos das suas classes</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{options.map(element => <div key={element} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/60 p-3"><span className="min-w-0"><strong className="block text-sm font-semibold">{ELEMENT_NAMES[element]}</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">{classes.filter(cls => classElement(cls) === element).map(cls => cls.name).join(" · ")}</span></span><div className="flex gap-1"><button type="button" title="Afinidade principal" aria-label={`Definir ${ELEMENT_NAMES[element]} como principal`} aria-pressed={primary === element} onClick={() => { onPrimary(element); if (secondary === element) onSecondary(null) }} className={`rounded-md border px-2.5 py-1.5 text-xs font-bold ${primary === element ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/60"}`}>P {primary === element && <Check className="inline size-3" />}</button><button type="button" title="Afinidade secundária" disabled={primary === element} aria-label={`Definir ${ELEMENT_NAMES[element]} como secundária`} aria-pressed={secondary === element} onClick={() => onSecondary(secondary === element ? null : element)} className={`rounded-md border px-2.5 py-1.5 text-xs font-bold disabled:opacity-30 ${secondary === element ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/60"}`}>S {secondary === element && <Check className="inline size-3" />}</button></div></div>)}</div>
    </div>
    <div className="rounded-xl border border-border/65 bg-background/50 p-4"><p className="flex items-center gap-2 text-xs font-bold"><Shield className="size-4 text-primary" /> Afinidades complementares</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{options.filter(e => e !== primary && e !== secondary).map(e => ELEMENT_NAMES[e]).join(" · ") || "Nenhuma"}</p><p className="mt-2 text-[11px] text-muted-foreground">Têm dois níveis de redução. As afinidades escolhidas ficam fixadas depois da criação e precisam de 1 ponto de Lore para serem alteradas.</p></div>
    <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-primary" /> Se suas classes oferecem apenas um elemento, apenas a afinidade principal é necessária.</p>
  </section>
}
