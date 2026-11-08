"use client"

import { useMemo, useState } from "react"
import {
  Activity, BookOpenText, Coins, Dices, Eye, Ghost, Heart, Images,
  Package, Shield, Sparkles, Swords, WandSparkles, Zap, ScrollText,
  Backpack, Lock, Info,
} from "lucide-react"
import { CLASSES, EQUIPMENT, type GameClass } from "@/lib/game-data"
import { ELEMENT_NAMES, availableClassElements, classElement, readElementalSelection, tieredElements } from "@/lib/elemental-affinities"
import type { Character } from "@/lib/types"
import type { NPCDraft } from "./character-sheet"
import { playerAttackCheckLabel, playerAttackDefenseLabel } from "@/lib/player-special-attacks"
import { npcAttackDescription, readNpcExtraDice } from "@/lib/npc-special-dice"

type Gear = { id: string; name: string; detail?: string; cost?: number; category?: string }
type Props = { npc: NPCDraft; classes: GameClass[]; customEquipment?: Gear[] }
const ATTRS = [{ id: "dex", label: "Destreza" }, { id: "ins", label: "Intuição" }, { id: "mig", label: "Vigor" }, { id: "wlp", label: "Vontade" }] as const
const tag = "rounded-md border border-primary/20 bg-primary/[.055] px-2.5 py-1 text-[10px] font-bold text-primary"
const panel = "min-w-0 overflow-hidden rounded-xl border border-border/65 bg-card/45 p-4 sm:p-5"
const panelTitle = "mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-primary"
const nil = "text-xs italic text-muted-foreground"
const getSafePhoto = (url: string) => /^(https?:\/\/|\/|data:image\/)/i.test(url)

function ResourceTile({ label, value, detail, tone }: { label: string; value: string | number; detail?: string; tone?: string }) {
  return <div className="min-w-0 rounded-lg border border-border/60 bg-background/60 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p><p className={`mt-1 break-all font-mono text-lg font-black sm:text-xl ${tone || "text-foreground"}`}>{value}</p>{detail && <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>}</div>
}

/** Apenas leitura: nenhum campo do snapshot é mutado por esta visualização. */
export function NpcArchivePreview({ npc, classes, customEquipment = [] }: Props) {
  const [activeImage, setActiveImage] = useState(0)
  const snapshot = npc.archivedSnapshot
  // Registros legados podem não ter todos os campos normalizados.
  const npcClasses = Array.isArray(npc.classes) ? npc.classes : []
  const npcSkills = npc.skills && typeof npc.skills === "object" ? npc.skills : {}
  const npcEquipment = Array.isArray(npc.equipment) ? npc.equipment : []
  const npcAttributes = npc.attributes || snapshot?.attributes || {} as NPCDraft["attributes"]
  const extended = snapshot as (Character & { customModifiers?: unknown; elementalAffinities?: unknown; portraitGallery?: unknown; portraitLabel?: string }) | undefined
  const byId = useMemo(() => new Map<string, GameClass>(
    [...CLASSES, ...classes].map((cls): [string, GameClass] => [cls.id, cls]),
  ), [classes])
  const catalog = useMemo(() => new Map<string, Gear>(
    [...EQUIPMENT, ...customEquipment].map((item): [string, Gear] => [item.id, item]),
  ), [customEquipment])
  const activeClasses = npcClasses.filter(cls => cls.level > 0).map(cls => ({ ...cls, definition: byId.get(cls.classId) }))
  const affinityOptions = availableClassElements(activeClasses.map(item => item.definition || { id: item.classId, name: item.classId, affinity: "fisico" }))
  const affinity = tieredElements(affinityOptions, readElementalSelection(npc.elementalAffinities ?? extended?.elementalAffinities))
  const savedGallery: Array<{ id: string; label: string; url: string }> = npc.portraitGallery
    ?? (Array.isArray(extended?.portraitGallery) ? extended.portraitGallery : [])
  const gallery = [
    { id: "primary", label: npc.portraitLabel || extended?.portraitLabel || "Normal", url: npc.avatarUrl },
    ...savedGallery.filter(item => !!item && typeof item.url === "string"),
  ]
  const activePortrait = gallery[Math.min(activeImage, gallery.length - 1)] || gallery[0]
  const resources = npc.resources ?? snapshot?.resources
  const effects = Array.isArray(extended?.customModifiers) ? extended.customModifiers as Array<Record<string, unknown>> : []
  const customItems = Array.isArray(snapshot?.customItems) ? snapshot.customItems : []
  const worn = snapshot as unknown as Record<string, unknown> | undefined
  const inheritedBonds = Array.isArray(snapshot?.bonds) ? snapshot.bonds : []
  const assignedSkills = Object.entries(npcSkills).filter(([, level]) => level > 0)
  const otherSkills = assignedSkills.filter(([id]) => !activeClasses.some(cls => cls.definition?.skills.some(skill => skill.id === id)))
  const extras = snapshot as (Character & { specialAttacks?: unknown; training?: unknown }) | undefined
  // Fichas manuais preservam golpes no rascunho; snapshots mantêm o legado.
  // Uma lista explícita vazia no Berçário significa que o Mestre removeu os golpes.
  const specialAttacks: Array<Record<string, unknown>> = Array.isArray(npc.specialAttacks)
    ? npc.specialAttacks as unknown as Array<Record<string, unknown>>
    : Array.isArray(extras?.specialAttacks) ? extras.specialAttacks as Array<Record<string, unknown>> : []
  const training = extras?.training && typeof extras.training === "object" ? extras.training as Record<string, unknown> : null
  const isArchived = !!snapshot

  return <div className="space-y-5 pb-5">
    <div className="relative isolate overflow-hidden rounded-2xl border border-primary/35 bg-primary/[.055]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border-[35px] border-primary/[.08]" />
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[255px_minmax(0,1fr)]">
        <div className="relative aspect-square min-h-[225px] overflow-hidden border-b border-border/50 bg-background/80 md:aspect-auto md:border-b-0 md:border-r">
          <img src={getSafePhoto(activePortrait.url) ? activePortrait.url : "/mystic-adventurer-portrait.png"} alt={`Retrato de ${npc.name}`} className="absolute inset-0 size-full object-contain" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
          <span className="absolute bottom-3 left-3 rounded-md border border-primary/25 bg-background/85 px-2 py-1 text-[10px] font-bold text-primary">{activePortrait.label}</span>
        </div>
        <div className="relative flex min-w-0 flex-col justify-between gap-4 p-5 sm:p-6">
          <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[.2em] text-primary">{isArchived ? "Ficha integral arquivada" : "Criado no Berçário"}</span><span className={tag}>Nv. {npc.npcLevel ?? Math.max(1, npcClasses.reduce((n, cls) => n + cls.level, 0))}</span></div><h2 className="break-words font-serif text-3xl font-black leading-tight sm:text-4xl">{npc.name}</h2><p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">{npc.identity || npc.origin || "Sem identidade definida"}</p></div>
          <div className="flex flex-wrap gap-1.5">{activeClasses.map(cls => <span key={cls.classId} className={tag}>{cls.definition?.name || cls.classId} · Nv. {cls.level}</span>)}{activeClasses.length === 0 && <span className={nil}>Nenhuma classe associada</span>}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Images className="size-4 text-primary" /> {gallery.length} retrato(s) <span className="mx-1 text-border">•</span> {npcEquipment.length} itens <span className="mx-1 text-border">•</span> {assignedSkills.length} perícias <span className="mx-1 text-border">•</span> {specialAttacks.length} golpes especiais</div>
          {gallery.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Retratos arquivados">{gallery.map((portrait, i) => <button key={portrait.id || i} type="button" onClick={() => setActiveImage(i)} aria-pressed={i === activeImage} title={portrait.label} className={`size-11 overflow-hidden border p-0.5 ${i === activeImage ? "border-primary bg-primary/20" : "border-border/70 hover:border-primary/50"}`}>{getSafePhoto(portrait.url) ? <img src={portrait.url} alt={portrait.label} className="size-full object-cover" /> : <span className="text-xs text-muted-foreground">{i + 1}</span>}</button>)}</div>}
        </div>
      </div>
    </div>

    {resources ? <section className={panel}><h3 className={panelTitle}><Heart className="size-4" /> Recursos preservados para invocação</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <ResourceTile label="HP" value={`${resources?.hp ?? "—"}/${resources?.maxHp ?? "—"}`} tone="text-[color:var(--hp)]" />
      <ResourceTile label="MP" value={`${resources?.mp ?? "—"}/${resources?.maxMp ?? "—"}`} tone="text-[color:var(--mp)]" />
      <ResourceTile label="IP" value={`${resources?.ip ?? "—"}/${resources?.maxIp ?? "—"}`} tone="text-[color:var(--ip)]" />
      <ResourceTile label="XP" value={resources?.xp ?? "—"} />
      <ResourceTile label="Lore" value={resources?.lp ?? "—"} />
      <ResourceTile label="Fabula" value={resources?.fp ?? "—"} />
    </div><div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground"><Coins className="size-4 text-primary" /> <strong className="text-foreground">{Number(snapshot?.zenit ?? 0).toLocaleString("pt-BR")} Zenits</strong><span>· As condições com duração retomam na invocação.</span></div></section> : <section className={panel}><div className="flex items-start gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-bold">Ficha manual do Mestre</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Este NPC ainda não possui snapshot de uma ficha ativa. Valores como HP/MP atuais, XP, Lore e estados de uso serão definidos pela ficha criada na invocação; não exibimos números presumidos.</p></div></div></section>}

    <div className="grid gap-5 xl:grid-cols-2">
      <section className={panel}><h3 className={panelTitle}><Dices className="size-4" /> Atributos</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">{ATTRS.map(({ id, label }) => <div key={id} className="rounded-lg border border-primary/20 bg-background/65 p-3 text-center"><span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span><span className="mt-2 block font-serif text-3xl font-black text-primary">{npcAttributes[id] || "—"}</span><span className="mt-1 block text-[10px] font-mono text-muted-foreground">{id.toUpperCase()}</span></div>)}</div></section>
      <section className={panel}><h3 className={panelTitle}><WandSparkles className="size-4" /> Afinidades elementais</h3><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-primary/25 bg-primary/[.06] p-3"><p className="text-[10px] text-muted-foreground">Principal</p><p className="mt-1 font-serif text-xl font-bold text-primary">{affinity.primary ? ELEMENT_NAMES[affinity.primary] : "Não definido"}</p></div><div className="rounded-lg border border-primary/25 bg-primary/[.06] p-3"><p className="text-[10px] text-muted-foreground">Secundária</p><p className="mt-1 font-serif text-xl font-bold text-primary">{affinity.secondary ? ELEMENT_NAMES[affinity.secondary] : "Não definido"}</p></div></div><p className="mt-3 text-[11px] text-muted-foreground">Complementares: {affinity.primary || affinity.secondary ? affinity.complementary.map(id => ELEMENT_NAMES[id]).join(" · ") || "Nenhuma" : "Não definido (1×)"}</p></section>
    </div>

    <section className={panel}><h3 className={panelTitle}><Swords className="size-4" /> Classes e habilidades aprendidas</h3>{activeClasses.length ? <div className="space-y-3">{activeClasses.map(({ classId, level, definition }) => <div key={classId} className="overflow-hidden rounded-lg border border-border/65 bg-background/35"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-primary/[.055] p-3"><div className="min-w-0"><p className="font-serif text-base font-bold">{definition?.name || classId}</p><p className="mt-1 text-[10px] text-muted-foreground">{definition?.archetype || "Classe histórica"} · Afinidade: <strong className="text-primary">{ELEMENT_NAMES[classElement(definition || { affinity: "fisico" })]}</strong></p></div><span className={tag}>Nv. {level}</span></div><div className="space-y-2 p-3">{definition?.skills.filter(skill => (npcSkills[skill.id] || 0) > 0).map(skill => <div key={skill.id} className="border-l-2 border-primary/35 bg-card/50 px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-bold">{skill.name}</h4><span className="font-mono text-[10px] text-primary">Nv. {npcSkills[skill.id]}/{skill.maxLevel}</span></div><p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{skill.description}</p>{skill.action && <p className="mt-2 text-[10px] text-primary">Ação: {skill.action.cost} {skill.action.resource.toUpperCase()}</p>}{skill.bonuses && Object.keys(skill.bonuses).length > 0 && <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-primary">Ver bônus e árvore de evolução</summary><div className="mt-2 space-y-2">{Object.entries(skill.bonuses).sort(([a],[b]) => Number(a) - Number(b)).map(([levelId, bonuses]) => <div key={levelId} className="rounded border border-border/60 bg-background/60 p-2"><p className="font-bold text-foreground">Nível {levelId}</p>{bonuses.map(bonus => <p key={bonus.id} className="mt-1 text-muted-foreground"><strong>{bonus.name}:</strong> {bonus.description}</p>)}</div>)}</div></details>}</div>)}{!definition && <p className="text-xs text-muted-foreground">A definição desta classe não está mais no catálogo. Os níveis registrados foram preservados.</p>}{definition && !definition.skills.some(skill => (npcSkills[skill.id] || 0) > 0) && <p className="text-xs text-muted-foreground">Sem habilidades aprendidas registradas nesta classe.</p>}</div></div>)}{otherSkills.length > 0 && <div className="rounded-lg border border-border/60 p-3"><p className="text-xs font-bold">Habilidades históricas ou avulsas</p><div className="mt-2 flex flex-wrap gap-2">{otherSkills.map(([id, level]) => <span key={id} className={tag}>{id} · Nv.{level}</span>)}</div></div>}</div> : <div>{assignedSkills.length ? <div className="flex flex-wrap gap-2">{assignedSkills.map(([id, level]) => <span key={id} className={tag}>{id} · Nv.{level}</span>)}</div> : <p className={nil}>Nenhuma classe ou habilidade cadastrada.</p>}</div>}</section>

    <section className={panel}>
      <h3 className={panelTitle}><Zap className="size-4" /> Golpes especiais pré-cadastrados ({specialAttacks.length})</h3>
      {specialAttacks.length ? <div className="grid gap-3 md:grid-cols-2">{specialAttacks.map((special, index) => {
        const attack = special.attack && typeof special.attack === "object" ? special.attack as Record<string, unknown> : special
        const name = String(special.name || attack.name || `Golpe ${index + 1}`)
        const target = attack.targetDefense === "magical" || attack.targetDefense === "physical" ? attack.targetDefense : null
        const image = typeof attack.previewImageUrl === "string" ? attack.previewImageUrl : ""
        const formula = Array.isArray(attack.attributes) ? attack.attributes.join(" + ").toUpperCase() : ""
        const rawDescription = typeof special.description === "string" ? special.description : typeof attack.description === "string" ? attack.description : ""
        const description = npcAttackDescription(rawDescription)
        const extraDice = readNpcExtraDice(rawDescription)
        return <article key={String(special.id || index)} className="min-w-0 overflow-hidden rounded-lg border border-primary/20 bg-background/55">
          {image && getSafePhoto(image) && <div className="relative h-36 overflow-hidden border-b border-primary/20 bg-black/45"><img src={image} alt={`Ilustração do golpe ${name}`} className="size-full object-contain" /></div>}
          <div className="space-y-2 p-3">
            <h4 className="break-words font-serif text-base font-bold">{name}</h4>
            {target ? <><p className="text-[11px] font-semibold text-primary">{playerAttackDefenseLabel(target)}</p><p className="text-[10px] text-muted-foreground">Teste de acerto: {playerAttackCheckLabel(target)}</p></> : null}
            {attack.damage != null && <p className="text-xs font-semibold text-primary">Dano: {String(attack.damage)} {formula && `· ${formula}`}</p>}
            {description && <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
            {extraDice.length > 0 && <p className="text-[11px] text-primary">Dados extras: {extraDice.join(" + ").toUpperCase()}</p>}
            {image && Number(attack.previewDurationSeconds) > 0 && <p className="text-[10px] text-muted-foreground">Imagem exibida por {Number(attack.previewDurationSeconds)} segundo(s) ao usar o golpe.</p>}
          </div>
        </article>
      })}</div> : <p className={nil}>Este NPC não possui golpes especiais pré-cadastrados. A etapa é opcional.</p>}
    </section>

    {!!training && <section className={panel}><h3 className={panelTitle}><Activity className="size-4" /> Treinamento preservado</h3><div className="grid gap-2 sm:grid-cols-2">{Object.entries(training).map(([key,value]) => <div key={key} className="rounded-lg border border-border/60 bg-background/50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-primary">{key}</p><p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">{typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)?.slice(0, 450) || "—"}</p></div>)}</div></section>}

    <div className="grid gap-5 xl:grid-cols-2"><section className={panel}><h3 className={panelTitle}><BookOpenText className="size-4" /> Origem e história</h3><div className="space-y-4">{[{ title: "Origem", text: npc.origin }, { title: "Identidade", text: npc.identity }, { title: "Tema", text: npc.theme }].map(item => <div key={item.title} className="border-l-2 border-primary/30 pl-3"><p className="text-[10px] font-black uppercase tracking-[.16em] text-primary">{item.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{item.text || "Não definido"}</p></div>)}</div></section>
      <section className={panel}><h3 className={panelTitle}><Backpack className="size-4" /> Equipamentos ({npcEquipment.length})</h3>{npcEquipment.length ? <div className="space-y-2">{npcEquipment.map((id, index) => { const item = catalog.get(id); return <div key={`${id}-${index}`} className="rounded-lg border border-border/55 bg-background/55 p-3"><div className="flex justify-between gap-2"><p className="text-xs font-bold">{item?.name || id}</p>{item?.cost != null && <span className="shrink-0 font-mono text-[10px] text-primary">{item.cost} Z</span>}</div>{item?.detail && <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>}</div> })}</div> : <p className={nil}>Sem equipamento registrado.</p>}{customItems.length > 0 && <div className="mt-4 border-t border-border/60 pt-4"><p className="mb-2 text-xs font-bold">Relíquias e itens personalizados ({customItems.length})</p>{customItems.map((item: any, index: number) => <div key={String(item?.id || index)} className="mb-2 rounded border border-border/55 bg-background/55 p-3"><p className="text-xs font-semibold">{String(item?.name || "Relíquia sem nome")}</p><p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{typeof item?.content === "string" && !item.content.startsWith("data:") ? item.content.slice(0, 800) : String(item?.type || "Item personalizado")}</p></div>)}</div>}</section></div>

    {isArchived && <section className={panel}><h3 className={panelTitle}><Activity className="size-4" /> Estados, modificadores e condições</h3>{effects.length ? <div className="grid gap-2 sm:grid-cols-2">{effects.map((effect, index) => <div key={String(effect.id || index)} className="rounded-lg border border-border/60 bg-background/60 p-3"><p className="text-xs font-semibold">{String(effect.name || effect.type || "Efeito")}</p><div className="mt-1 space-y-1 text-[11px] text-muted-foreground">{Object.entries(effect).filter(([key,value]) => !["id", "name"].includes(key) && ["string","number","boolean"].includes(typeof value)).slice(0,9).map(([key,value]) => <p key={key} className="break-words"><span className="font-semibold">{key}:</span> {String(value)}</p>)}</div></div>)}</div> : <p className={nil}>Nenhum efeito ou modificador registrado no arquivamento.</p>}{inheritedBonds.length > 0 && <div className="mt-4 border-t border-border/60 pt-3"><p className="mb-2 text-xs font-bold">Laços históricos</p><div className="flex flex-wrap gap-2">{inheritedBonds.map((bond, index) => <span key={bond.id || index} className={tag}>{bond.target} · {bond.type} {bond.value}</span>)}</div></div>}{worn && <details className="mt-4 border-t border-border/60 pt-3"><summary className="cursor-pointer text-xs font-bold text-primary">Outros estados preservados no snapshot</summary><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">O snapshot também mantém propriedades auxiliares da ficha para restauração, sem modificá-las nesta prévia.</p><div className="mt-2 flex flex-wrap gap-1.5">{Object.keys(worn).filter(key => !["id","name","campaignId","ownerId","avatarUrl","portraitGallery","createdAt","updatedAt","origin","identity","theme","classes","skills","attributes","equipment","resources","zenit","customItems","customModifiers","bonds"].includes(key)).map(key => <span key={key} className={tag}>{key}</span>)}</div></details>}</section>}
    {isArchived && <p className="flex items-start gap-2 border-l-2 border-primary/30 pl-3 text-[11px] leading-relaxed text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0 text-primary" /> Esta é uma prévia somente de leitura. O snapshot, os itens guardados/equipados e os modificadores são preservados durante a edição do registro no Berçário. A invocação utiliza o fluxo de restauração existente.</p>}
  </div>
}
