"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Check, Clock3, Dices, ImageIcon, Loader2, Plus, Save, Shield, ShieldCheck, Sparkles, Swords, Trash2, WandSparkles, X } from "lucide-react"
import { apiFetch } from "@/lib/client"
import { controllerConfirm } from "@/lib/input/dialogs"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { controllerFocus, focusControllerElement } from "@/lib/input/focus"
import { useControllerModalReturn } from '@/lib/input/modal-focus-return'
import { useController } from "@/components/controller/controller-provider"
import { loreBonusDice, loreBonusLabel, MAX_LORE_BONUS_LEVEL } from "@/lib/special-attack-lore"
import { createClientId } from "@/lib/client-id"
import { DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS } from "@/lib/combat-model"
import {
  mostUsedPlayerAttacks, playerAttackCheckLabel, playerAttackDefenseLabel,
  type PlayerSpecialAttack, type PlayerSpecialAttackCharacter,
} from "@/lib/player-special-attacks"
import type { Character, AttributeKey } from "@/lib/types"
import { readNpcExtraDice, writeNpcExtraDice, readNpcFixedDice, writeNpcFixedDice, npcAttackDescription, MAX_NPC_EXTRA_DICE } from "@/lib/npc-special-dice"

const field = "w-full rounded-sm border border-border/65 bg-background/80 px-3 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
const sub = "text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground"
type SpecialCharacter = Character & PlayerSpecialAttackCharacter

function newAttack(): PlayerSpecialAttack {
  const now = Date.now()
  return { id: createClientId(), name: "Novo golpe", targetDefense: "physical", checkId: "c64", description: "", previewDurationSeconds: DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS, createdAt: now, updatedAt: now }
}

async function compactImage(file: File): Promise<string> {
  if (file.size > 12_000_000) throw new Error("Imagem acima de 12 MB.")
  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, 1280 / bitmap.width, 900 / bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Compactação de imagem indisponível.")
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  let data = canvas.toDataURL("image/webp", 0.76)
  if (data.length > 650_000) data = canvas.toDataURL("image/webp", 0.45)
  if (data.length > 650_000) throw new Error("Imagem ainda grande. Use uma URL HTTPS para garantir qualidade.")
  return data
}

export function PlayerSpecialAttacks({ character, isGm, npcOnly = false, editable, disabled, onUpdated, onRollCheck, externalOpenRequest = null, onExternalOpened }: {
  character: SpecialCharacter
  externalOpenRequest?: string | null
  onExternalOpened?: () => void
  isGm: boolean
  /** Só NPCs criados/gerenciados pelo Mestre podem adicionar dados ao teste. */
  npcOnly?: boolean
  editable: boolean
  disabled: boolean
  onUpdated: (character: Character) => void
  onRollCheck: (attack: PlayerSpecialAttack) => void
}) {
  const { active: controllerActive } = useController()
  // Se veio de um atalho, montar diretamente o arsenal (sem mostrar primeiro a ficha).
  const [open, setOpen] = useState(() => Boolean(externalOpenRequest?.startsWith('special.')))
  useControllerModalReturn(open)
  const [attacks, setAttacks] = useState<PlayerSpecialAttack[]>(character.specialAttacks || [])
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    externalOpenRequest?.startsWith('special.open.') ? externalOpenRequest.slice('special.open.'.length) : null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmation, setConfirmation] = useState<PlayerSpecialAttack | null>(null)
  const [now, setNow] = useState(0)
  const dialog = useRef<HTMLElement>(null)
  const confirmationRef = useRef<HTMLElement>(null)
  const loreInvestRef = useRef<HTMLButtonElement>(null)
  // Modal fullscreen: nenhuma outra ficha ou atalho da campanha pode
  // disputar as setas, A/B ou os botões de ombro enquanto ele estiver aberto.
  // Os diálogos globais do controle (prioridade 3000) continuam por cima.
  useControllerActions({
    'ui.up': () => controllerFocus('ui.up', confirmation ? confirmationRef.current : dialog.current),
    'ui.down': () => controllerFocus('ui.down', confirmation ? confirmationRef.current : dialog.current),
    'ui.left': () => controllerFocus('ui.left', confirmation ? confirmationRef.current : dialog.current),
    'ui.right': () => controllerFocus('ui.right', confirmation ? confirmationRef.current : dialog.current),
    'ui.confirm': () => controllerFocus('ui.confirm', confirmation ? confirmationRef.current : dialog.current),
    'ui.next': () => {
      if (confirmation) return controllerFocus('ui.right', confirmationRef.current)
      if (!npcOnly && loreInvestRef.current && !loreInvestRef.current.disabled) {
        focusControllerElement(loreInvestRef.current)
        return true
      }
      return controllerFocus('ui.right',dialog.current)
    },
    'ui.previous': () => {
      if (confirmation) return controllerFocus('ui.left', confirmationRef.current)
      const first = dialog.current?.querySelector<HTMLButtonElement>('aside button')
      if (first && focusControllerElement(first)) return true
      return controllerFocus('ui.left',dialog.current)
    },
    'ui.back': () => { if (confirmation) setConfirmation(null); else setOpen(false); return true },
  }, { enabled: controllerActive && open, priority: 320, captureAll: true })

  useEffect(() => {
    if (open && dirty) return
    setAttacks(character.specialAttacks || [])
  }, [character.specialAttacks, open, dirty])
  useEffect(() => { if (open) setNow(Date.now()) }, [open])
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const focused = document.activeElement as HTMLElement | null
    document.body.style.overflow = "hidden"
    dialog.current?.focus({ preventScroll: true })
    const initialFocus = window.requestAnimationFrame(() => {
      if (controllerActive) {
        const layer = confirmation ? confirmationRef.current : dialog.current
        if (layer) controllerFocus('ui.down', layer)
      }
    })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        if (confirmation) setConfirmation(null)
        else setOpen(false)
        return
      }
      if (event.key === "Tab" && dialog.current && !confirmation) {
        const all = [...dialog.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
        )]
        if (all.length) {
          const first = all[0], last = all[all.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
      }
    }
    window.addEventListener("keydown", keydown)
    return () => { window.cancelAnimationFrame(initialFocus); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keydown); if (!controllerActive && focused?.isConnected) focused.focus({preventScroll:true}) }
  }, [open, confirmation, controllerActive])

  const selected = attacks.find(attack => attack.id === selectedId) || attacks[0] || null
  const useCounts = character.specialAttackUseCounts || {}
  const quickAttacks = mostUsedPlayerAttacks(character.specialAttacks || [], useCounts)

  function openAt(attackId?: string) {
    setSelectedId(attackId ?? null)
    setError("")
    setConfirmation(null)
    setOpen(true)
  }
  useEffect(() => {
    if (!externalOpenRequest) return
    if (externalOpenRequest === 'special.manager') openAt()
    else if (externalOpenRequest.startsWith('special.open.')) {
      const id = externalOpenRequest.slice('special.open.'.length)
      if ((character.specialAttacks || []).some(attack => attack.id === id)) openAt(id)
    }
    onExternalOpened?.()
  }, [externalOpenRequest])
  function patch(updates: Partial<PlayerSpecialAttack>) {
    if (!selected) return
    setAttacks(list => list.map(attack => attack.id === selected.id ? { ...attack, ...updates } : attack))
    setDirty(true)
  }
  function add() {
    if (attacks.length >= 30) { setError("Limite de 30 golpes nomeados."); return }
    const created = newAttack()
    setAttacks(list => [...list, created])
    setSelectedId(created.id)
    setDirty(true)
    setError("")
  }
  async function save() {
    if (!editable || busy || !dirty) return
    setBusy(true); setError("")
    try {
      const result = await apiFetch<{ character: Character; attacks: PlayerSpecialAttack[] }>(
        `/api/characters/${encodeURIComponent(character.id)}/special-attacks`,
        { method: "POST", body: JSON.stringify({ action: "save", attacks }) },
      )
      if (!result.character || !Array.isArray(result.attacks)) throw new Error("A API não confirmou os golpes.")
      if (npcOnly && attacks.some(attack => {
        const persisted = result.attacks.find(saved => saved.id === attack.id)
        return !persisted || JSON.stringify(readNpcExtraDice(attack.description)) !==
          JSON.stringify(readNpcExtraDice(persisted.description)) ||
          JSON.stringify(readNpcFixedDice(attack.description)) !== JSON.stringify(readNpcFixedDice(persisted.description))
      })) throw new Error("A API descartou os dados extras do NPC. A ficha precisa ser verificada antes de usar os golpes.")
      setAttacks(result.attacks); setDirty(false); onUpdated(result.character)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar os golpes.") }
    finally { setBusy(false) }
  }
  async function upgradeLore(attack: PlayerSpecialAttack) {
    if (!editable || busy || dirty || npcOnly) return
    const level = attack.loreBonusLevel || 0
    if (level >= MAX_LORE_BONUS_LEVEL) return
    if (!await controllerConfirm(`Investir 2 pontos de Lore em ${attack.name}? Novo bônus: ${loreBonusLabel(level + 1)}.`, controllerActive)) return
    setBusy(true); setError("")
    try {
      const result = await apiFetch<{ character: Character; attacks: PlayerSpecialAttack[] }>(
        `/api/characters/${encodeURIComponent(character.id)}/special-attacks`,
        { method: "POST", body: JSON.stringify({ action: "upgrade-lore", attackId: attack.id }) },
      )
      if (!result.character || !Array.isArray(result.attacks)) throw new Error("A evolução não foi confirmada.")
      setAttacks(result.attacks)
      onUpdated(result.character)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível aprimorar o golpe.") }
    finally { setBusy(false) }
  }
  async function use(attack: PlayerSpecialAttack) {
    if (!editable || busy || dirty || disabled) return
    setBusy(true); setError("")
    try {
      const response = await apiFetch<{ success: boolean; duplicate: boolean; character?: Character }>(
        `/api/characters/${encodeURIComponent(character.id)}/special-attacks`,
        { method: "POST", body: JSON.stringify({ action: "use", attackId: attack.id, requestId: createClientId() }) },
      )
      if (!response.success) throw new Error("Uso não confirmado.")
      if (response.character) onUpdated(response.character)
      // Fechar o arsenal antes da animação da rolagem (a ficha calcula após 800ms).
      setConfirmation(null)
      setOpen(false)
      setNow(Date.now())
      if (!response.duplicate) onRollCheck(attack)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao executar o golpe.") }
    finally { setBusy(false) }
  }

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div data-controller-scroll-root="special-attacks" className="fixed inset-0 z-[11000] flex h-[100dvh] max-h-[100dvh] w-screen flex-col overflow-clip bg-background text-foreground" style={{ backgroundImage: "radial-gradient(ellipse 75% 55% at 50% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 75%), linear-gradient(color-mix(in srgb, var(--primary) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--primary) 4%, transparent) 1px, transparent 1px)", backgroundSize: "auto, 42px 42px, 42px 42px" }}>
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Arsenal de golpes nomeados" className="flex min-h-0 flex-1 flex-col overflow-clip outline-none">
        <header className="shrink-0 border-b border-primary/25 bg-card/90 px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid size-11 shrink-0 place-items-center border border-primary/35 bg-primary/10 text-primary"><Swords className="size-6" /></span>
              <div><p className={sub}>Morte Mágica / {isGm ? "Arsenal do Mestre" : "Artes de combate"}</p><h2 className="font-serif text-xl font-black sm:text-3xl">Arsenal de Golpes</h2></div>
            </div>
            <div className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:inline">{attacks.length}/30 técnicas</span><button type="button" aria-label="Fechar arsenal" onClick={() => setOpen(false)} className="grid size-10 place-items-center border border-border bg-card hover:border-primary/60"><X className="size-5" /></button></div>
          </div>
        </header>
        <div data-controller-scrollport="true" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 lg:overflow-hidden lg:px-12">
          <div className="mx-auto grid w-full max-w-[1560px] gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="min-w-0 space-y-3 lg:flex lg:min-h-0 lg:flex-col lg:gap-3 lg:overflow-hidden lg:space-y-0">
              <div className="flex items-center justify-between"><span className={sub}>Técnicas registradas</span><span className="font-mono text-xs text-primary">{String(attacks.length).padStart(2,"0")}</span></div>
              <div data-controller-scrollport="true" role="region" aria-label="Lista de golpes especiais" tabIndex={-1} className="max-h-[min(42dvh,440px)] min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable] lg:max-h-none lg:flex-1">{attacks.map((attack, index) => <button key={attack.id} type="button" data-controller-initial={selected?.id===attack.id ? 'true' : undefined} onClick={() => setSelectedId(attack.id)} className={`flex w-full items-center gap-3 border p-3 text-left transition ${selected?.id === attack.id ? "border-primary/70 bg-primary/10" : "border-border/60 bg-card/65 hover:border-primary/35"}`}>
                <span className="font-mono text-xs text-primary/75">{String(index+1).padStart(2,"0")}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{attack.name || "Sem nome"}</strong><small className="text-[10px] text-muted-foreground">{playerAttackCheckLabel(attack.targetDefense)}</small></span>{attack.targetDefense === "magical" ? <WandSparkles className="size-4 shrink-0 text-primary"/> : <Shield className="size-4 shrink-0 text-primary"/>}</button>)}</div>
              {editable && <button type="button" onClick={add} disabled={busy || attacks.length>=30} className="flex w-full items-center justify-center gap-2 border border-dashed border-primary/55 px-4 py-3 text-sm text-primary transition hover:bg-primary/10 disabled:opacity-40"><Plus className="size-4"/> Forjar novo golpe</button>}
              <div className="border-l-2 border-primary/50 bg-card/35 p-4 text-xs leading-relaxed text-muted-foreground">Cada golpe usa o teste padrão correspondente à defesa. O uso publica a rolagem no histórico da campanha, dentro ou fora do combate. Limite: <strong className="text-foreground">3 usos por 60 segundos</strong>.</div>
            </aside>
            <main data-controller-scrollport="true" aria-label="Detalhes do golpe selecionado" className="min-w-0 space-y-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-3 [scrollbar-gutter:stable]">
              {!selected ? <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-primary/30 bg-card/40 p-10 text-center"><Swords className="mb-3 size-11 text-primary/60"/><h3 className="font-serif text-xl">Seu arsenal está vazio</h3><p className="mt-2 text-sm text-muted-foreground">Crie um golpe para registrar seu estilo de combate.</p></div> : <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-l-2 border-primary pl-4"><div><p className={sub}>Registro de combate / {selected.id.slice(0,8)}</p><h3 className="mt-1 font-serif text-2xl font-black sm:text-4xl">{selected.name}</h3><p className="mt-1 text-xs text-muted-foreground">{playerAttackDefenseLabel(selected.targetDefense)} · {playerAttackCheckLabel(selected.targetDefense)}</p></div><span className="border border-primary/35 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">{selected.previewImageUrl ? "IMAGEM VINCULADA" : "SEM IMAGEM"}</span></div>
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(310px,.8fr)]">
                  <div className="min-w-0 space-y-5">
                    <div className="space-y-4 border border-border/70 bg-card/65 p-5"><h4 className={sub}>01 / Identidade do golpe</h4>
                      <label className="block space-y-2"><span className="text-xs font-semibold">Nome da técnica</span><input className={field} disabled={!editable} maxLength={100} value={selected.name} onChange={e=>patch({name:e.target.value})}/></label>
                      <div className="grid gap-3 sm:grid-cols-2">{(["physical","magical"] as const).map(defense => <button key={defense} type="button" disabled={!editable} onClick={()=>patch({targetDefense:defense,checkId:defense==="physical"?"c64":"c65"})} className={`flex items-center gap-3 border p-4 text-left transition ${selected.targetDefense===defense?"border-primary bg-primary/10":"border-border bg-background/60 hover:border-primary/40"}`}>{defense==="physical"?<ShieldCheck className="size-5 text-primary"/>:<WandSparkles className="size-5 text-primary"/>}<span className="min-w-0"><strong className="block text-sm">{playerAttackDefenseLabel(defense)}</strong><small className="text-[11px] text-muted-foreground">Teste: {playerAttackCheckLabel(defense)}</small></span>{selected.targetDefense===defense&&<Check className="ml-auto size-4 text-primary"/>}</button>)}</div>
                      <label className="block space-y-2"><span className="text-xs font-semibold">Descrição e narrativa</span><textarea disabled={!editable} rows={5} maxLength={4000} className={`${field} resize-y`} value={npcAttackDescription(selected.description)} onChange={e=>{try{patch({description:writeNpcExtraDice(e.target.value, readNpcExtraDice(selected.description))});setError("")}catch(cause){setError(cause instanceof Error?cause.message:"Descrição muito longa.")}}}/></label>
                      {npcOnly && isGm && <div className="mt-4 rounded-lg border border-primary/35 bg-background/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-primary">Dados extras exclusivos de NPC</strong><span className="font-mono text-xs">{readNpcExtraDice(selected.description).length}/{MAX_NPC_EXTRA_DICE}</span></div>
                        <p className="mt-2 text-xs text-muted-foreground">São rolados junto ao teste padrão de Luta ou Magia e Arcanismo. Pode repetir o mesmo atributo.</p>
                        <div className="mt-3 flex flex-wrap gap-2">{(["dex", "ins", "mig", "wlp"] as AttributeKey[]).map(key => <button key={key} type="button" disabled={!editable || readNpcExtraDice(selected.description).length >= MAX_NPC_EXTRA_DICE} onClick={() => patch({description:writeNpcExtraDice(selected.description, [...readNpcExtraDice(selected.description), key])})} className="rounded border border-primary/35 px-3 py-2 text-xs font-bold uppercase disabled:opacity-35">+ {key}</button>)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">{readNpcExtraDice(selected.description).map((key,index) => <button key={`${key}-${index}`} type="button" disabled={!editable} title="Retirar este dado" onClick={() => patch({description:writeNpcExtraDice(selected.description, readNpcExtraDice(selected.description).filter((_,i)=>i!==index))})} className="rounded border border-border bg-card px-2 py-1 text-xs">{key.toUpperCase()} ×</button>)}</div>
                        <div className="mt-4 border-t border-primary/15 pt-3">
                          <strong className="text-xs text-primary">Dados fixos do NPC (sem custo de Lore)</strong>
                          <p className="mt-1 text-xs text-muted-foreground">Adicione qualquer combinação de dados fixos à rolagem, além dos dados de atributo.</p>
                          <div className="mt-2 flex flex-wrap gap-2">{([6,8,10,12,14,18,20] as const).map(sides => <button key={sides} type="button" disabled={!editable || readNpcFixedDice(selected.description).length >= MAX_NPC_EXTRA_DICE} onClick={() => patch({description:writeNpcFixedDice(selected.description,[...readNpcFixedDice(selected.description),sides])})} className="rounded border border-primary/35 px-3 py-2 text-xs font-bold disabled:opacity-35">+ d{sides}</button>)}</div>
                          <div className="mt-2 flex flex-wrap gap-2">{readNpcFixedDice(selected.description).map((sides,index) => <button key={`${sides}-${index}`} type="button" disabled={!editable} onClick={() => patch({description:writeNpcFixedDice(selected.description,readNpcFixedDice(selected.description).filter((_,i)=>i!==index))})} className="rounded border border-border bg-card px-2 py-1 text-xs">d{sides} ×</button>)}</div>
                        </div>
                      </div>}
                      {!npcOnly && <div className="rounded-lg border border-primary/30 bg-primary/5 p-4" aria-label="Evolução do golpe com Lore">
                        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-primary">Dados bônus de Lore</strong><span className="font-mono text-xs">{loreBonusLabel(selected.loreBonusLevel || 0)}</span></div>
                        <p className="mt-2 text-xs text-muted-foreground">Cada evolução custa 2 LP, por golpe. O bônus atual será somado aos dados do teste de acerto. Limite: 2d20.</p>
                        {controllerActive && <p className="mt-2 text-xs font-semibold text-primary/90">RB: ir ao investimento · A: selecionar/confirmar · B: voltar</p>}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs">Lore disponível: <strong>{Number(character.resources?.lp || 0)} LP</strong> · Próximo: {selected.loreBonusLevel === MAX_LORE_BONUS_LEVEL ? "Máximo" : loreBonusLabel((selected.loreBonusLevel || 0) + 1)}</span><button ref={loreInvestRef} type="button" disabled={!editable || busy || dirty || (selected.loreBonusLevel || 0) >= MAX_LORE_BONUS_LEVEL || Number(character.resources?.lp || 0) < 2} onClick={() => void upgradeLore(selected)} className="border border-primary/40 bg-primary/15 px-4 py-2.5 text-xs font-bold text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">Investir 2 LP</button></div>
                      </div>}
                    </div>
                    <div className="border border-primary/25 bg-card/65 p-5"><h4 className={sub}>02 / Configuração da visualização</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground">A imagem fica acessível para os participantes da campanha apenas durante o prazo configurado. O Mestre pode encerrá-la antecipadamente.</p>
                      <label className="mt-4 block space-y-2"><span className="text-xs">URL da imagem (HTTPS) ou data:image compacta</span><input disabled={!editable} className={field} value={selected.previewImageUrl || ""} onChange={e=>patch({previewImageUrl:e.target.value})} placeholder="https://.../golpe.webp"/></label>
                      {editable && <label className="mt-3 block cursor-pointer border border-dashed border-primary/40 px-4 py-3 text-center text-xs text-primary hover:bg-primary/10">Escolher imagem do computador (compactação automática)<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;try{patch({previewImageUrl:await compactImage(file)})}catch(error){setError(error instanceof Error?error.message:"Imagem inválida.")}}}/></label>}
                      <label className="mt-4 block space-y-2"><span className="flex items-center gap-2 text-xs"><Clock3 className="size-3 text-primary"/> Duração (segundos)</span><input disabled={!editable} type="number" min={1} max={86400} step={1} className={field} value={selected.previewDurationSeconds} onChange={e=>patch({previewDurationSeconds:Number(e.target.value)})}/></label>
                    </div>
                  </div>
                  <div className="min-w-0 space-y-5"><div className="border border-primary/30 bg-card/65 p-4"><div className="flex items-center justify-between"><span className={sub}>Visualização da técnica</span><ImageIcon className="size-4 text-primary"/></div>
                    <div className="relative mt-4 grid min-h-[260px] place-items-center overflow-hidden border border-primary/20 bg-black/50">{selected.previewImageUrl?<img alt={`Ilustração de ${selected.name}`} src={selected.previewImageUrl} className="max-h-[400px] w-full object-contain"/>:<div className="text-center text-muted-foreground"><Sparkles className="mx-auto mb-3 size-10 text-primary/30"/><span className="text-xs">Nenhuma imagem vinculada</span></div>}</div>
                    {selected.previewImageUrl && editable && <button type="button" className="mt-2 text-xs text-destructive" onClick={()=>patch({previewImageUrl:""})}>Remover imagem</button>}
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-primary/15 pt-4"><div><p className={sub}>Ataque direcionado</p><strong className="mt-1 block text-sm text-primary">{playerAttackDefenseLabel(selected.targetDefense)}</strong></div><div><p className={sub}>Teste do sistema</p><strong className="mt-1 block text-sm text-foreground">{playerAttackCheckLabel(selected.targetDefense)}</strong></div></div>
                  </div>
                  <div className="border-l-2 border-primary/40 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">O teste de acerto mantém os dados, bônus de itens, modificadores, penalidades e condições da ficha.</div></div>
                </div>
                {editable&&<div className="flex flex-wrap gap-2 border-t border-border/50 pt-4"><button type="button" disabled={busy} onClick={()=>{setAttacks(list=>list.filter(item=>item.id!==selected.id));setSelectedId(null);setDirty(true)}} className="inline-flex items-center gap-2 border border-destructive/30 px-4 py-2 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5"/> Excluir golpe</button><span className="ml-auto text-[11px] text-muted-foreground">{dirty ? "Alterações não salvas" : "Dados salvos no personagem"}</span></div>}
              </>}
            </main>
          </div>
        </div>
        <footer className="shrink-0 border-t border-primary/25 bg-card/90 px-4 py-3 sm:px-8"><div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{dirty ? "Salve as alterações antes de executar." : `Sincronizado · ${new Date(now||Date.now()).toLocaleDateString("pt-BR")}`}</p><div className="flex gap-2"><button type="button" onClick={()=>setOpen(false)} className="border border-border px-4 py-2.5 text-xs">Voltar</button>{editable&&<><button type="button" disabled={!dirty||busy} onClick={()=>void save()} className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs text-primary disabled:opacity-40"><Save className="size-4"/>{busy?"Salvando...":"Salvar golpes"}</button><button type="button" disabled={!selected||dirty||disabled||busy} onClick={()=>setConfirmation(selected)} className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground disabled:opacity-40"><Dices className="size-4"/> Usar golpe <ArrowRight className="size-4"/></button></>}</div></div>{error&&<p role="alert" className="mx-auto mt-2 max-w-[1560px] text-xs text-destructive">{error}</p>}{disabled&&<p className="mx-auto mt-2 max-w-[1560px] text-xs text-destructive">Rolagens bloqueadas durante o treinamento ou por uma condição ativa.</p>}</footer>
      </section>
      <AnimatePresence>{confirmation&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm"><motion.section ref={confirmationRef} initial={{y:18,scale:.96}} animate={{y:0,scale:1}} role="alertdialog" aria-modal="true" aria-label="Confirmar uso do golpe" className="w-full max-w-lg border border-primary/40 bg-card p-6 shadow-2xl"><div className="mb-4 grid size-12 place-items-center border border-primary/40 bg-primary/10 text-primary"><Dices className="size-6"/></div><p className={sub}>Confirmar invocação</p><h3 className="mt-2 font-serif text-2xl font-black">{confirmation.name}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Este golpe utiliza <strong className="text-foreground">{playerAttackCheckLabel(confirmation.targetDefense)}</strong> e confronta a <strong className="text-primary">{playerAttackDefenseLabel(confirmation.targetDefense)}</strong>. A rolagem será publicada para a sessão.</p><p className="mt-3 text-xs text-muted-foreground">{confirmation.previewImageUrl ? `Imagem exibida por ${confirmation.previewDurationSeconds} segundos.` : "Nenhuma imagem associada."}</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setConfirmation(null)} className="border border-border px-4 py-2 text-xs">Cancelar</button><button type="button" disabled={busy} onClick={()=>void use(confirmation)} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">{busy?<Loader2 className="size-4 animate-spin"/>:<Dices className="size-4"/>}Confirmar e rolar</button></div></motion.section></motion.div>}</AnimatePresence>
    </div>,document.body) : null

  return <section className="mt-4 border border-primary/25 bg-card/45 p-3 sm:p-4" aria-label="Golpes especiais"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center border border-primary/30 bg-primary/10 text-primary"><Swords className="size-5"/></span><div><strong className="block text-sm">Golpes especiais</strong><p className="text-[11px] text-muted-foreground">{(character.specialAttacks||[]).length} técnica(s) registrada(s) · Luta / Magia e Arcanismo</p></div></div><button type="button" onClick={() => openAt()} className="flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"><Swords className="size-3.5"/> Abrir arsenal</button></div>
    {quickAttacks.length > 0 && <div className="mt-3 border-t border-primary/15 pt-3">
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">Acesso rápido às suas 3 técnicas mais usadas. Selecione um golpe para abrir diretamente seus detalhes e rolar. Enquanto ainda não houver usos, aparecem os primeiros cadastrados.</p>
      <div className="grid gap-2 sm:grid-cols-3">{quickAttacks.map((attack, index) => <button
        type="button" key={attack.id} onClick={() => openAt(attack.id)}
        className="group min-w-0 rounded-lg border border-border/65 bg-background/45 px-3 py-3 text-left transition hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={`Abrir ${attack.name} para rolar`}>
        <span className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary/80"><Swords className="size-3"/> Técnica {index+1}</span>
        <strong className="block truncate text-sm text-foreground group-hover:text-primary" title={attack.name}>{attack.name}</strong>
        <span className="mt-1 block text-[10px] text-muted-foreground">{playerAttackDefenseLabel(attack.targetDefense)} · {useCounts[attack.id] || 0} {useCounts[attack.id] === 1 ? "uso" : "usos"}</span>
        {npcAttackDescription(attack.description) && <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/80">{npcAttackDescription(attack.description)}</span>}
      </button>)}</div>
    </div>}
    {modal}</section>
}
