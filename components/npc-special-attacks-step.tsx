"use client"

import { useMemo, useState } from "react"
import { BookOpenText, Check, Clock3, Copy, ImageIcon, Plus, Search, ShieldCheck, Swords, Trash2, WandSparkles } from "lucide-react"
import { createClientId } from "@/lib/client-id"
import { DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS } from "@/lib/combat-model"
import {
  playerAttackCheckLabel, playerAttackDefenseLabel, validatePlayerSpecialAttacks,
  type PlayerSpecialAttack,
} from "@/lib/player-special-attacks"

export type NpcAttackTemplate = { attack: PlayerSpecialAttack; source: string }

type Props = {
  attacks: PlayerSpecialAttack[]
  onChange: (next: PlayerSpecialAttack[]) => void
  templates?: NpcAttackTemplate[]
}

const input = "w-full min-w-0 rounded-md border border-border/70 bg-background/80 px-3 py-2.5 text-xs text-foreground outline-none transition focus:border-primary/70"

function copyAttack(attack: PlayerSpecialAttack): PlayerSpecialAttack {
  const now = Date.now()
  return { ...attack, id: createClientId(), createdAt: now, updatedAt: now }
}

/** Golpes preparados na ficha, não executados nem transmitidos durante a Forja. */
export function NpcSpecialAttacksStep({ attacks, onChange, templates = [] }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const selected = attacks.find(attack => attack.id === selectedId) || attacks[0] || null
  const filtered = useMemo(() => templates.filter(item =>
    `${item.source} ${item.attack.name} ${item.attack.description}`.toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR")),
  ), [templates, search])

  function update(value: Partial<PlayerSpecialAttack>) {
    if (!selected) return
    onChange(attacks.map(attack => attack.id === selected.id ? { ...attack, ...value, updatedAt: Date.now() } : attack))
    setError("")
  }
  function add(source?: PlayerSpecialAttack) {
    if (attacks.length >= 30) { setError("O limite da ficha é de 30 golpes especiais."); return }
    const now = Date.now()
    const next: PlayerSpecialAttack = source ? copyAttack(source) : {
      id: createClientId(), name: "Novo golpe", targetDefense: "physical", checkId: "c64",
      description: "", previewDurationSeconds: DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS,
      createdAt: now, updatedAt: now,
    }
    onChange([...attacks, next]); setSelectedId(next.id); setError("")
  }
  async function upload(file: File) {
    setUploading(true); setError("")
    try {
      if (file.size > 12_000_000 || !/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
        throw new Error("Escolha uma imagem PNG, JPEG, WebP, GIF ou AVIF de até 12 MB.")
      }
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, 1280 / bitmap.width, 900 / bitmap.height)
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.")
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        let image = canvas.toDataURL("image/webp", .76)
        if (image.length > 650_000) image = canvas.toDataURL("image/webp", .45)
        if (image.length > 650_000) throw new Error("A imagem continua grande. Use um endereço HTTPS.")
        update({ previewImageUrl: image })
      } finally { bitmap.close() }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao preparar imagem.") }
    finally { setUploading(false) }
  }

  let validation = ""
  try { validatePlayerSpecialAttacks(attacks) }
  catch (cause) { validation = cause instanceof Error ? cause.message : "Confira seus golpes." }

  return <div className="space-y-5">
    <div className="border-l-2 border-primary pl-4">
      <p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Arsenal do Mestre · opcional</p>
      <h3 className="mt-1 font-serif text-xl font-bold">Golpes Especiais</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Cadastre as técnicas deste NPC antes de invocá-lo, ou copie golpes já preparados em outras fichas. A definição é opcional: nenhum golpe será executado durante a criação.</p>
    </div>
    <div className="flex items-center justify-between gap-3 border border-primary/25 bg-primary/[.06] px-3 py-3">
      <span className="flex items-center gap-2 text-xs font-semibold"><Swords className="size-4 text-primary" /> {attacks.length} / 30 golpes</span>
      <button type="button" onClick={() => add()} disabled={attacks.length >= 30} className="inline-flex items-center gap-1.5 rounded border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-bold text-primary disabled:opacity-40"><Plus className="size-3.5" /> Novo golpe</button>
    </div>

    {attacks.length === 0 && <p className="border border-dashed border-border/70 bg-card/30 p-4 text-xs leading-relaxed text-muted-foreground">Nenhum golpe selecionado. Você pode avançar sem ataques especiais e cadastrá-los posteriormente pela ficha do NPC.</p>}

    {attacks.length > 0 && <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap gap-2">{attacks.map(attack => <button key={attack.id} type="button" aria-pressed={selected?.id === attack.id} onClick={() => setSelectedId(attack.id)} className={`min-w-0 max-w-full rounded border px-3 py-2 text-left text-xs ${selected?.id === attack.id ? "border-primary bg-primary/15 text-primary" : "border-border/70 bg-card/40 hover:border-primary/40"}`}><strong className="block max-w-[175px] truncate">{attack.name}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{playerAttackCheckLabel(attack.targetDefense)}</span></button>)}</div>
      {selected && <section className="min-w-0 space-y-4 rounded-lg border border-primary/25 bg-card/45 p-4" aria-label={`Editar golpe: ${selected.name}`}>
        <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-bold text-primary"><BookOpenText className="size-4" /> Configuração da técnica</p><button type="button" onClick={() => { onChange(attacks.filter(attack => attack.id !== selected.id)); setSelectedId(null) }} className="flex items-center gap-1.5 text-[11px] text-destructive hover:underline"><Trash2 className="size-3.5" /> Excluir</button></div>
        <label className="block space-y-1.5"><span className="text-xs font-semibold">Nome da técnica</span><input value={selected.name} maxLength={100} onChange={event => update({ name: event.target.value })} className={input} placeholder="Ex.: Corte do Eclipse" /></label>
        <div className="grid grid-cols-2 gap-2">{(["physical", "magical"] as const).map(defense => <button key={defense} type="button" onClick={() => update({ targetDefense: defense, checkId: defense === "magical" ? "c65" : "c64" })} aria-pressed={selected.targetDefense === defense} className={`min-w-0 rounded-md border p-3 text-left transition ${selected.targetDefense === defense ? "border-primary bg-primary/15" : "border-border/60 bg-background/45 hover:border-primary/35"}`}>
          {defense === "physical" ? <ShieldCheck className="mb-2 size-4 text-primary" /> : <WandSparkles className="mb-2 size-4 text-primary" />}<strong className="block text-[11px]">{playerAttackDefenseLabel(defense)}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{playerAttackCheckLabel(defense)}</span></button>)}</div>
        <label className="block space-y-1.5"><span className="text-xs font-semibold">Descrição do golpe</span><textarea rows={4} maxLength={4000} value={selected.description} onChange={event => update({ description: event.target.value })} className={`${input} resize-y`} placeholder="Como a técnica é executada e quais são seus efeitos narrativos..." /></label>
        <label className="block space-y-1.5"><span className="flex items-center gap-2 text-xs font-semibold"><ImageIcon className="size-4 text-primary" /> Imagem para apresentar ao usar o golpe</span><input value={selected.previewImageUrl || ""} onChange={event => update({ previewImageUrl: event.target.value })} className={input} placeholder="https://.../golpe.webp" /></label>
        <label className="block cursor-pointer rounded border border-dashed border-primary/35 p-3 text-center text-[11px] font-bold text-primary hover:bg-primary/5">{uploading ? "Preparando imagem..." : "Ou selecionar imagem do computador"}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={uploading} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file) }} /></label>
        {selected.previewImageUrl && <div className="relative grid min-h-[120px] place-items-center overflow-hidden rounded border border-primary/20 bg-background/65"><img src={selected.previewImageUrl} alt={`Prévia de ${selected.name}`} className="max-h-[205px] w-full object-contain" /></div>}
        <label className="block space-y-1.5"><span className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-4 text-primary" /> Tempo de exibição (segundos)</span><input type="number" min={1} max={86400} step={1} value={selected.previewDurationSeconds} onChange={event => update({ previewDurationSeconds: Number(event.target.value) })} className={input} /></label>
      </section>}
    </div>}

    {templates.length > 0 && <section className="space-y-3 rounded-lg border border-border/60 bg-card/25 p-4">
      <div><p className="text-[10px] font-black uppercase tracking-[.17em] text-primary">Biblioteca de golpes previamente cadastrados</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Copie técnicas de outros NPCs ou personagens da campanha. A cópia fica independente da ficha de origem.</p></div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar golpe ou ficha de origem" className={`${input} pl-9`} /></div>
      <div className="max-h-[285px] space-y-2 overflow-y-auto pr-1">{filtered.slice(0, 80).map((entry, index) => <div key={`${entry.source}:${entry.attack.id}:${index}`} className="flex items-center justify-between gap-3 border border-border/60 bg-background/50 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold">{entry.attack.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{entry.source} · {playerAttackDefenseLabel(entry.attack.targetDefense)}</p></div><button type="button" disabled={attacks.length >= 30} onClick={() => add(entry.attack)} className="flex shrink-0 items-center gap-1.5 rounded border border-primary/35 px-2.5 py-2 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:opacity-40"><Copy className="size-3.5" /> Copiar</button></div>)}{filtered.length === 0 && <p className="text-xs italic text-muted-foreground">Nenhum golpe cadastrado corresponde à busca.</p>}</div>
    </section>}
    {validation && <p role="alert" className="rounded border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">{validation}</p>}
    {error && <p role="alert" className="rounded border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
    {attacks.length > 0 && !validation && <p className="flex items-center gap-2 text-[11px] text-primary"><Check className="size-4" /> Os golpes estão prontos para serem salvos com o NPC.</p>}
  </div>
}
