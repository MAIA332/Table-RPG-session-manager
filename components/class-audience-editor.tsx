"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Check, EyeOff, Globe2, Loader2, Search, ShieldCheck, UserRound, Users, X } from "lucide-react"
import type { GameClass } from "@/lib/game-data"
import type { Character } from "@/lib/types"
import { isClassPublished } from "@/lib/class-visibility"
import { allowedPlayerIds, allowedCharacterIds } from "@/lib/class-audience"

type Member = { userId: string; name: string; role?: string }
export type AudienceMode = "all" | "selected" | "hidden"

/** Seleção por conta ou por ficha; ambas as listas são inclusivas (OU). */
export function ClassAudienceEditor({ cls, members, characters, onSave, onClose }: {
  cls: GameClass
  members: Member[]
  characters: Character[]
  onSave: (mode: AudienceMode, userIds: string[], characterIds: string[]) => Promise<void>
  onClose: () => void
}) {
  const initialUsers = allowedPlayerIds(cls)
  const initialCharacters = allowedCharacterIds(cls)
  const [mode, setMode] = useState<AudienceMode>(!isClassPublished(cls) ? "hidden" : initialUsers !== null || initialCharacters !== null ? "selected" : "all")
  const [selectedUsers, setSelectedUsers] = useState<string[]>(initialUsers || [])
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(initialCharacters || [])
  const [tab, setTab] = useState<"players" | "characters">("players")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const players = useMemo(() => members.filter(member => member.role === "player"), [members])
  const playerIds = useMemo(() => new Set(players.map(player => player.userId)), [players])
  const eligibleCharacters = useMemo(() => characters.filter(character => playerIds.has(character.ownerId)), [characters, playerIds])
  const validCharacters = useMemo(() => new Set(eligibleCharacters.map(character => character.id)), [eligibleCharacters])
  const cleanUsers = selectedUsers.filter(id => playerIds.has(id))
  const cleanCharacters = selectedCharacters.filter(id => validCharacters.has(id))
  const invalidSelection = mode === "selected" && cleanUsers.length + cleanCharacters.length === 0
  const query = search.trim().toLocaleLowerCase("pt-BR")
  const matchingPlayers = players.filter(player => player.name.toLocaleLowerCase("pt-BR").includes(query))
  const matchingCharacters = eligibleCharacters.filter(character =>
    `${character.name} ${players.find(player => player.userId === character.ownerId)?.name || ""}`.toLocaleLowerCase("pt-BR").includes(query))

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); if (!busy) onClose() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, busy])

  const save = async () => {
    if (busy || invalidSelection) return
    setBusy(true); setError("")
    try {
      await onSave(mode, cleanUsers, cleanCharacters)
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar a visibilidade da classe.")
    } finally { setBusy(false) }
  }
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={`Visibilidade da classe ${cls.name}`}
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background text-foreground shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/75 bg-card/65 p-4 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Users className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.19em] text-primary">Grimório do Mestre · Permissões</p>
              <h2 className="truncate font-serif text-xl font-bold">Quem pode adquirir {cls.name}?</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Classes publicadas podem ser consultadas por todos. Restrinja a aquisição por conta ou ficha.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar permissões" className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/70 hover:border-primary/50"><X className="size-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div role="radiogroup" aria-label="Modo de visibilidade" className="grid gap-2 sm:grid-cols-3">
            {([
              { id: "all" as const, icon: Globe2, label: "Todos", description: "Todos podem ver e adquirir." },
              { id: "selected" as const, icon: Users, label: "Selecionados", description: "Todos podem ver; só os selecionados podem adquirir." },
              { id: "hidden" as const, icon: EyeOff, label: "Oculta", description: "Apenas o Mestre." },
            ]).map(option => {
              const Icon = option.icon
              const active = option.id === mode
              return <button key={option.id} type="button" role="radio" aria-checked={active} disabled={busy} onClick={() => setMode(option.id)}
                className={`flex min-w-0 flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "border-primary/70 bg-primary/10" : "border-border/70 bg-card/40 hover:border-primary/35"}`}>
                <span className="flex w-full items-center justify-between text-primary"><Icon className="size-4" />{active && <Check className="size-4" />}</span>
                <strong className="text-sm">{option.label}</strong>
                <span className="text-[11px] leading-relaxed text-muted-foreground">{option.description}</span>
              </button>
            })}
          </div>

          {mode === "selected" && <div className="overflow-hidden rounded-xl border border-border/75 bg-card/35">
            <div className="flex border-b border-border/65 p-2" role="tablist" aria-label="Tipo de destinatário">
              {([
                { id: "players" as const, label: "Jogadores", icon: Users, count: cleanUsers.length },
                { id: "characters" as const, label: "Personagens", icon: UserRound, count: cleanCharacters.length },
              ]).map(item => { const Icon = item.icon; return <button type="button" role="tab" aria-selected={tab === item.id} key={item.id}
                onClick={() => { setTab(item.id); setSearch("") }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${tab === item.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-4" /> {item.label} <span className="font-mono text-[10px]">{item.count}</span>
              </button> })}
            </div>
            <div className="space-y-3 border-b border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="text-sm font-bold">{tab === "players" ? "Contas autorizadas" : "Fichas autorizadas"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{tab === "players" ? `${cleanUsers.length} de ${players.length} contas` : `${cleanCharacters.length} de ${eligibleCharacters.length} personagens`}</p></div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => tab === "players" ? setSelectedUsers(players.map(player => player.userId)) : setSelectedCharacters(eligibleCharacters.map(character => character.id))} className="rounded-md border border-primary/35 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/10">Todos</button>
                  <button type="button" disabled={busy} onClick={() => tab === "players" ? setSelectedUsers([]) : setSelectedCharacters([])} className="rounded-md border border-border/75 px-3 py-1.5 text-[11px] font-semibold hover:bg-foreground/[0.05]">Limpar</button>
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3"><Search className="size-4 text-muted-foreground" /><input type="search" aria-label={tab === "players" ? "Buscar jogador" : "Buscar personagem"} value={search} onChange={event => setSearch(event.target.value)} placeholder={tab === "players" ? "Buscar jogador..." : "Buscar personagem ou dono..."} className="min-w-0 w-full bg-transparent py-2.5 text-xs outline-none" /></label>
            </div>
            <div className="grid max-h-64 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
              {tab === "players" ? matchingPlayers.map(player => <label key={player.userId} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-xs transition-colors ${cleanUsers.includes(player.userId) ? "border-primary/45 bg-primary/[.08]" : "border-border/65 bg-background/65 hover:border-primary/30"}`}>
                <input disabled={busy} type="checkbox" checked={cleanUsers.includes(player.userId)} onChange={() => setSelectedUsers(previous => previous.includes(player.userId) ? previous.filter(id => id !== player.userId) : [...previous, player.userId])} className="size-4 accent-primary" />
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{player.name.trim().slice(0, 1).toUpperCase() || "?"}</span>
                <span className="min-w-0 truncate font-semibold">{player.name}</span>
              </label>) : matchingCharacters.map(character => <label key={character.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-xs transition-colors ${cleanCharacters.includes(character.id) ? "border-primary/45 bg-primary/[.08]" : "border-border/65 bg-background/65 hover:border-primary/30"}`}>
                <input disabled={busy} type="checkbox" checked={cleanCharacters.includes(character.id)} onChange={() => setSelectedCharacters(previous => previous.includes(character.id) ? previous.filter(id => id !== character.id) : [...previous, character.id])} className="size-4 accent-primary" />
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{character.name.trim().slice(0, 1).toUpperCase() || "?"}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate">{character.name}</strong><small className="block truncate text-muted-foreground">{players.find(player => player.userId === character.ownerId)?.name || "Jogador"}</small></span>
              </label>)}
              {!(tab === "players" ? matchingPlayers.length : matchingCharacters.length) && <p className="col-span-full py-6 text-center text-xs text-muted-foreground">Nenhum resultado encontrado.</p>}
            </div>
            {invalidSelection && <p className="border-t border-border/60 px-4 py-2.5 text-xs text-amber-400">Selecione pelo menos um jogador ou personagem, ou escolha “Oculta”.</p>}
            <p className="border-t border-border/60 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">Um jogador marcado recebe a classe em todas as suas fichas. Um personagem marcado recebe a classe apenas naquela ficha. As listas se somam.</p>
          </div>}

          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[.045] p-3 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>As permissões são validadas pelo servidor. Na criação de uma nova ficha, só contam liberações por conta; liberações por personagem se aplicam a fichas existentes.</p></div>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border/70 bg-card/50 p-4 sm:px-6">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-border/70 px-4 py-2.5 text-xs font-semibold hover:bg-foreground/[0.05]">Cancelar</button>
          <button type="button" disabled={busy || invalidSelection} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Salvar permissões</button>
        </footer>
      </section>
    </div>, document.body,
  )
}
