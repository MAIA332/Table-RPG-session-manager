"use client"

import { ImagePlus, Images, Link2, Plus, Sparkles, Trash2, Check, AlertCircle, ArrowUpRight } from "lucide-react"
import { createClientId } from "@/lib/client-id"
import { DEFAULT_CHARACTER_PORTRAITS, validPortraitImage as publicPortraitUrl, type AlternatePortrait } from "@/lib/portrait-gallery"

type Props = {
  avatarUrl: string
  portraitLabel: string
  onAvatarUrl: (url: string) => void
  onPortraitLabel: (label: string) => void
  portraits: AlternatePortrait[]
  onPortraits: (next: AlternatePortrait[]) => void
  onSelect: (id: string) => void
  selectedId: string
}

/** As imagens extras são exclusivamente URLs HTTPS. O avatar principal usa o campo Foto já existente. */
export function CreatorPortraitSlots({ avatarUrl, portraitLabel, onAvatarUrl, onPortraitLabel, portraits, onPortraits, onSelect, selectedId }: Props) {
  const add = () => {
    if (portraits.length >= (DEFAULT_CHARACTER_PORTRAITS - 1)) return
    const newId = `portrait_${createClientId()}`
    onPortraits([...portraits, { id: newId, label: "Nova expressão", url: "" }])
    onSelect(newId)
  }
  const update = (id: string, update: Partial<AlternatePortrait>) =>
    onPortraits(portraits.map(entry => entry.id === id ? { ...entry, ...update } : entry))
  const makePrimary = (id: string) => {
    const chosen = portraits.find(entry => entry.id === id)
    if (!chosen || !publicPortraitUrl(chosen.url)) return
    const oldMain = avatarUrl.trim()
    onAvatarUrl(chosen.url)
    onPortraitLabel(chosen.label.trim() || "Normal")
    onPortraits(publicPortraitUrl(oldMain)
      ? portraits.map(entry => entry.id === id ? { ...entry, url: oldMain, label: portraitLabel.trim() || "Normal" } : entry)
      : portraits.filter(entry => entry.id !== id))
    onSelect("__primary__")
  }
  const remove = (id: string) => {
    onPortraits(portraits.filter(entry => entry.id !== id))
    if (selectedId === id) onSelect("__primary__")
  }

  return (
    <section className="mt-7 space-y-3 border-t border-primary/20 pt-5" aria-label="Retratos e expressões do personagem">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-primary"><Images className="size-4" /> Retratos do viajante</p>
          <h4 className="mt-1 font-serif text-lg font-semibold text-foreground">Suas cinco faces</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Uma imagem principal e até quatro expressões, todas com legenda. Use links de imagens públicas.</p>
        </div>
        <span className="shrink-0 border border-primary/35 bg-primary/10 px-2.5 py-1 font-mono text-[11px] text-primary">{portraits.length + 1}/{DEFAULT_CHARACTER_PORTRAITS}</span>
      </div>
      <label className="block space-y-1.5 rounded-sm border border-primary/25 bg-primary/[.06] p-3">
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-primary"><Sparkles className="size-3.5" /> Legenda do avatar principal</span>
        <input aria-label="Legenda do avatar principal" value={portraitLabel} maxLength={60} placeholder="Normal" onChange={event => onPortraitLabel(event.target.value)} className="w-full border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary" />
        <span className="block text-[10px] text-muted-foreground">A URL do principal permanece no campo “Foto” acima.</span>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <button type="button" onClick={() => onSelect("__primary__")} aria-pressed={selectedId === "__primary__"} className={`flex min-h-20 items-center gap-3 border p-3 text-left transition ${selectedId === "__primary__" ? "border-primary bg-primary/10" : "border-border/60 bg-card/35 hover:border-primary/55"}`}>
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden border border-primary/35 bg-primary/10 text-primary">
            {(avatarUrl.startsWith("/") || publicPortraitUrl(avatarUrl)) ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" />}
          </span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-foreground">{portraitLabel || "Normal"}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-primary">01 · Principal</span></span>
          {selectedId === "__primary__" && <Check className="size-4 shrink-0 text-primary" />}
        </button>
        {portraits.map((portrait, index) => {
          const valid = publicPortraitUrl(portrait.url)
          return <div key={portrait.id} className={`min-w-0 space-y-2 border p-3 transition ${selectedId === portrait.id ? "border-primary bg-primary/[.07]" : "border-border/60 bg-card/30"}`}>
            <div className="flex items-center justify-between gap-2">
              <button type="button" aria-pressed={selectedId === portrait.id} onClick={() => onSelect(portrait.id)} className="flex min-w-0 items-center gap-2 text-left text-[10px] font-black uppercase tracking-[.13em] text-primary hover:underline">
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden border border-primary/35 bg-background/60">
                  {valid ? <img src={portrait.url} alt="" className="size-full object-cover" /> : <Images className="size-4" />}
                </span>
                <span className="truncate">{String(index + 2).padStart(2, "0")} · {portrait.label || "Expressão"}</span>
              </button>
              <button type="button" onClick={() => remove(portrait.id)} aria-label={`Remover retrato ${index + 2}`} className="grid size-7 shrink-0 place-items-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
            <input aria-label={`Legenda do retrato ${index + 2}`} value={portrait.label} onChange={event => update(portrait.id, { label: event.target.value })} maxLength={60} placeholder="Ex.: Cansado" className="w-full border border-border/60 bg-background/70 px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary/70" />
            <label className="relative block"><Link2 className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><input aria-label={`Link público HTTPS do retrato ${index + 2}`} value={portrait.url} onFocus={() => onSelect(portrait.id)} onChange={event => update(portrait.id, { url: event.target.value })} placeholder="https://.../imagem.png" className="w-full border border-border/60 bg-background/70 py-2 pl-8 pr-2 text-xs text-foreground outline-none focus:border-primary/70" /></label>
            {portrait.url && !valid && <p className="flex items-center gap-1 text-[10px] text-destructive"><AlertCircle className="size-3" /> Informe uma URL HTTPS pública.</p>}
            <button type="button" disabled={!valid} onClick={() => makePrimary(portrait.id)} className="flex items-center gap-1.5 text-[10px] font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40"><ArrowUpRight className="size-3.5" /> Tornar avatar principal</button>
          </div>
        })}
        {portraits.length < (DEFAULT_CHARACTER_PORTRAITS - 1) && <button type="button" onClick={add} className="flex min-h-20 items-center justify-center gap-2 border border-dashed border-primary/40 bg-primary/[.03] p-3 text-xs font-bold text-primary transition hover:border-primary/80 hover:bg-primary/10"><Plus className="size-4" /> Adicionar expressão</button>}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">Cada expressão pode representar o personagem cansado, ferido, transformado ou em outro estado. Os demais jogadores poderão vê-las depois na ficha, em grade ou carrossel.</p>
    </section>
  )
}
