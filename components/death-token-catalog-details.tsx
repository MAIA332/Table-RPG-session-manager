"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  BookOpenText, Coins, Crown, GitBranch, Info, Package, Shield,
  Sparkles, Swords, WandSparkles, X,
} from "lucide-react"
import type { GameClass, GameSkill } from "@/lib/game-data"
import { isClassPublished } from "@/lib/class-visibility"
import { itemImageUrl } from "@/lib/item-image"
import { ItemArtwork } from "./item-artwork"
import { hasEvolutionBonuses, SkillEvolutionTree } from "./skill-evolution-tree"

/** Campos opcionais refletem tanto o catálogo do sistema quanto itens forjados pelo Mestre. */
export type DeathTokenCatalogItem = {
  id: string
  name: string
  cost?: number
  category?: string
  type?: string
  detail?: string
  imageUrl?: string
  damage?: string | number
  defense?: string | number
  mdef?: string | number
  bonus?: string
  effect?: string
  weight?: number
  weightUnit?: string
  consumable?: boolean
  purchasable?: boolean
  actions?: unknown[]
  passiveBonuses?: unknown[]
}

export type DeathTokenCatalogSelection =
  | { kind: "class"; value: GameClass; source: "system" | "custom" }
  | { kind: "item"; value: DeathTokenCatalogItem; source: "system" | "custom" }

const ATTRIBUTE_NAMES: Record<string, string> = {
  mig: "Vigor", dex: "Destreza", ins: "Intuição", wlp: "Vontade",
}
const CATEGORY_NAMES: Record<string, string> = {
  weapon: "Arma", armor: "Armadura", shield: "Escudo", accessory: "Acessório", misc: "Diversos",
}

function show(value: unknown): string {
  return value == null ? "" : String(value).trim()
}

function namedEntry(entry: unknown, fallback: string): { title: string; text: string } {
  if (!entry || typeof entry !== "object") return { title: fallback, text: show(entry) }
  const record = entry as Record<string, unknown>
  return {
    title: show(record.name || record.label || record.title) || fallback,
    text: show(record.description || record.detail || record.effect || record.bonus),
  }
}

/** Inspeção somente de leitura, sem alterar as seleções ou as regras do token. */
export function DeathTokenCatalogDetails({ selection, onClose }: {
  selection: DeathTokenCatalogSelection
  onClose: () => void
}) {
  const [treeSkill, setTreeSkill] = useState<GameSkill | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const isClass = selection.kind === "class"

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => { previousFocus?.focus() }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A árvore intercepta ESC por conta própria e deve permanecer acima deste painel.
      if (event.key === "Escape" && !treeSkill) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
      if (event.key !== "Tab" || treeSkill || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex="0"]',
      )).filter(node => node.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      const target = document.activeElement as HTMLElement | null
      if (event.shiftKey && target === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && target === last) { event.preventDefault(); first.focus() }
      else if (!target || !dialogRef.current.contains(target)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKey, true)
    return () => { window.removeEventListener("keydown", onKey, true) }
  }, [onClose, treeSkill])

  if (typeof document === "undefined") return null

  const overlay = <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-black/85 p-2 backdrop-blur-lg sm:p-5">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Detalhes de ${selection.value.name}`}
      className="flex h-[min(95dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background text-foreground shadow-[0_30px_120px_rgba(0,0,0,.7)]">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-primary/20 bg-card/60 px-5 py-4 sm:px-8 sm:py-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary sm:size-14">
            {isClass ? <Crown className="size-6" /> : <Package className="size-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.22em] text-primary">Grimório do Mestre / {isClass ? "Compêndio das classes" : "Acervo de equipamentos"}</p>
            <h2 className="mt-1 truncate font-serif text-xl font-black sm:text-3xl">{selection.value.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                {selection.source === "system" ? (isClass ? "Classe do sistema" : "Item do sistema") : "Criado pelo Mestre"}
              </span>
              {selection.kind === "class" && selection.source === "custom" && <span className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground">
                {isClassPublished(selection.value) ? "Publicada" : "Oculta · disponível por autorização do token"}
              </span>}
            </div>
          </div>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar detalhes"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background/70 text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <X className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-7">
        {selection.kind === "class" ? (() => {
          const cls = selection.value
          return <>
            <section className="grid gap-4 lg:grid-cols-[1fr_265px]">
              <div className="rounded-xl border border-border/70 bg-card/30 p-5">
                <div className="flex items-center gap-2 text-primary"><BookOpenText className="size-4" /><span className="text-[10px] font-black uppercase tracking-widest">Identidade da classe</span></div>
                <h3 className="mt-3 font-serif text-xl font-bold">{cls.archetype || "Sem arquétipo"}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{cls.description || "Nenhuma descrição cadastrada."}</p>
              </div>
              <aside className="grid grid-cols-2 gap-2 rounded-xl border border-primary/25 bg-primary/[.035] p-4">
                <div className="rounded-lg border border-border/70 bg-background/60 p-3"><p className="text-[10px] text-muted-foreground">Vida / nível</p><strong className="mt-1 block font-mono text-lg text-primary">+{cls.hpPerLevel} PV</strong></div>
                <div className="rounded-lg border border-border/70 bg-background/60 p-3"><p className="text-[10px] text-muted-foreground">Mana / nível</p><strong className="mt-1 block font-mono text-lg text-primary">+{cls.mpPerLevel} PM</strong></div>
                <div className="col-span-2 rounded-lg border border-border/70 bg-background/60 p-3"><p className="text-[10px] text-muted-foreground">Atributo principal</p><strong className="mt-1 block text-sm">{ATTRIBUTE_NAMES[cls.primaryAttribute] || cls.primaryAttribute.toUpperCase()} ({cls.primaryAttribute.toUpperCase()})</strong></div>
              </aside>
            </section>
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Habilidades e progressão</p><h3 className="mt-1 font-serif text-xl font-bold">Perícias da classe</h3></div><span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{cls.skills.length} cadastradas</span></div>
              <div className="grid gap-3 md:grid-cols-2">
                {cls.skills.map(skill => {
                  const hasTree = hasEvolutionBonuses(skill.bonuses)
                  const levels = Object.keys(skill.bonuses || {}).map(Number).filter(level => Number.isSafeInteger(level) && (skill.bonuses?.[level]?.length || 0) > 0).sort((a, b) => a - b)
                  return <article key={skill.id} className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-card/35 p-4">
                    <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><WandSparkles className="size-4" /></span><h4 className="break-words font-semibold">{skill.name}</h4></div><span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">Nv. máx {skill.maxLevel}</span></div>
                    <p className="mt-3 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{skill.description || "Sem descrição."}</p>
                    {skill.action && <p className="mt-3 text-xs text-primary"><Sparkles className="mr-1 inline size-3.5" />Custo de uso: {skill.action.cost} {String(skill.action.resource || "mp").toUpperCase()}</p>}
                    {hasTree && <div className="mt-3 border-t border-border/65 pt-3"><p className="mb-2 text-[10px] text-muted-foreground">Bônus cadastrados nos níveis: {levels.join(", ")}</p><button type="button" onClick={() => setTreeSkill(skill)}
                      className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><GitBranch className="size-4" /> Ver árvore de evolução</button></div>}
                  </article>
                })}
                {cls.skills.length === 0 && <p className="text-sm text-muted-foreground">Esta classe não tem habilidades cadastradas.</p>}
              </div>
            </section>
          </>
        })() : (() => {
          const item = selection.value
          const details = [
            ["Dano", item.damage], ["Defesa", item.defense], ["Defesa mágica", item.mdef],
            ["Bônus", item.bonus], ["Efeito", item.effect], ["Tipo", item.type],
          ].filter((entry): entry is [string, string | number] => entry[1] != null && show(entry[1]) !== "")
          return <>
            <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
              <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-card via-background to-primary/10 p-4">
                {itemImageUrl(item.imageUrl) ? <ItemArtwork name={item.name} imageUrl={item.imageUrl || ""} className="size-56" expandable /> : <Package className="size-20 text-primary/70" strokeWidth={1.1} />}
              </div>
              <section className="rounded-xl border border-border/70 bg-card/30 p-5">
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Ficha do equipamento</p>
                <h3 className="mt-2 font-serif text-xl font-bold">{CATEGORY_NAMES[item.category || ""] || item.category || "Equipamento"}</h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 font-semibold text-primary"><Coins className="size-3.5" />{Number(item.cost || 0).toLocaleString("pt-BR")} Zenits</span>
                  {item.consumable && <span className="rounded-full border border-border px-3 py-1.5">Consumível</span>}
                  {item.purchasable === false && <span className="rounded-full border border-border px-3 py-1.5">Fora da loja</span>}
                  {item.weight != null && <span className="rounded-full border border-border px-3 py-1.5">Peso: {item.weight} {item.weightUnit || "g"}</span>}
                </div>
                <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.detail || "Este item não possui descrição cadastrada."}</p>
              </section>
            </div>
            {details.length > 0 && <section className="rounded-xl border border-border/70 bg-card/30 p-5"><p className="mb-3 text-[10px] font-black uppercase tracking-[.2em] text-primary">Atributos e efeitos</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{details.map(([label, value]) => <div key={label} className="rounded-lg border border-border/60 bg-background/60 p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}</div></section>}
            {(item.actions?.length || 0) > 0 && <section className="rounded-xl border border-border/70 bg-card/30 p-5"><div className="mb-3 flex items-center gap-2 text-primary"><Swords className="size-4" /><h3 className="text-sm font-bold">Ações do equipamento</h3></div><div className="grid gap-2 sm:grid-cols-2">{item.actions!.map((entry, index) => {
              const action = namedEntry(entry, `Ação ${index + 1}`)
              return <div key={index} className="rounded-lg border border-border/70 bg-background/60 p-3"><p className="text-sm font-semibold">{action.title}</p>{action.text && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{action.text}</p>}</div>
            })}</div></section>}
            {(item.passiveBonuses?.length || 0) > 0 && <section className="rounded-xl border border-border/70 bg-card/30 p-5"><div className="mb-3 flex items-center gap-2 text-primary"><Shield className="size-4" /><h3 className="text-sm font-bold">Bônus passivos</h3></div><div className="grid gap-2 sm:grid-cols-2">{item.passiveBonuses!.map((entry, index) => {
              const bonus = namedEntry(entry, `Bônus ${index + 1}`)
              return <div key={index} className="rounded-lg border border-border/70 bg-background/60 p-3"><p className="text-sm font-semibold">{bonus.title}</p>{bonus.text && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{bonus.text}</p>}</div>
            })}</div></section>}
          </>
        })()}
        <div className="flex items-start gap-2 border border-primary/20 bg-primary/[.04] p-3 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-primary" />Esta é uma prévia de consulta do Mestre. Abrir os detalhes ou a árvore não concede classes, habilidades ou itens.</div>
      </div>
      <footer className="flex shrink-0 justify-end border-t border-border/70 bg-card/35 px-5 py-3 sm:px-8"><button type="button" onClick={onClose} className="rounded-lg border border-primary/40 px-5 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10">Voltar aos tokens</button></footer>
    </section>
    {isClass && treeSkill && <SkillEvolutionTree skill={treeSkill} className={selection.value.name} level={0} onClose={() => setTreeSkill(null)} />}
  </div>

  return createPortal(overlay, document.body)
}
