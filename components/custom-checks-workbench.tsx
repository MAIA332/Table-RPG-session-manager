"use client"

import { useEffect, useState } from "react"
import { Dices, Eye, EyeOff, Plus, Trash2, Save, Pencil, Loader2, ShieldCheck } from "lucide-react"
import { createClientId } from "@/lib/client-id"
import type { CustomCheck, CustomCheckDie, CustomCheckAttribute } from "@/lib/custom-checks"
import { CUSTOM_CHECK_DICE_LIMIT, CUSTOM_CHECK_ATTRIBUTES, dieLabel } from "@/lib/custom-checks"

const input = "min-w-0 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/10"
const action = "inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-foreground/[0.035] px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-foreground/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
const freshCheck = (): CustomCheck => ({
  id: `check_${createClientId().replace(/[^a-zA-Z0-9_-]/g, "")}`,
  name: "",
  description: "",
  dice: [{ kind: "fixed", sides: 6 }],
  isPublic: false,
})

interface Props {
  campaignId: string
  checks: CustomCheck[]
  revision: number
  onRefresh: () => Promise<void>
}

export function CustomChecksWorkbench({ campaignId, checks, revision, onRefresh }: Props) {
  const [draft, setDraft] = useState<CustomCheck | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  // O editor em andamento não é sobrescrito quando chega atualização SSE.
  useEffect(() => { if (error) setError("") }, [draft?.id])

  async function mutate(payload: Record<string, unknown>): Promise<boolean> {
    if (saving) return false
    setSaving(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/custom-checks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, revision }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o teste.")
      await onRefresh()
      setNotice("Alteração salva e sincronizada com os jogadores.")
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar os testes.")
      return false
    } finally { setSaving(false) }
  }
  const updateDie = (index: number, die: CustomCheckDie) => setDraft(prev => prev && ({
    ...prev, dice: prev.dice.map((item, i) => i === index ? die : item),
  }))
  const current = checks.find(check => check.id === draft?.id)

  return <section className="space-y-5">
    <div className="relative overflow-hidden rounded-[24px] border border-accent/25 bg-accent/[0.06] p-5 sm:p-7">
      <div className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full border-[32px] border-accent/[0.08]" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.19em] text-accent"><Dices className="size-4"/> Laboratório de rolagens</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Testes personalizados<span className="text-accent">.</span></h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">Combine até dez dados por teste, com faces fixas ou dados dos atributos do personagem. Oculte e revele testes em tempo real.</p>
        </div>
        <button type="button" className={`${action} border-accent/40 bg-accent text-accent-foreground hover:bg-accent/90`} onClick={() => { setDraft(freshCheck()); setNotice(""); setError("") }}><Plus className="size-4"/> Novo teste</button>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">{checks.length} criados</span>
        <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">{checks.filter(check => check.isPublic).length} revelados</span>
        <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">{checks.filter(check => !check.isPublic).length} ocultos</span>
      </div>
    </div>

    {error && <p role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/5 p-3 text-xs text-foreground"><ShieldCheck className="size-4 text-accent"/>{notice}</p>}

    <div className="grid gap-5 lg:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.4fr)]">
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground"><span>Biblioteca da campanha</span><span>{checks.length} / 100</span></div>
        {checks.length === 0 && <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">Nenhum teste criado. Comece pelo botão <strong>Novo teste</strong>.</p>}
        {checks.map(check => <div key={check.id} className={`rounded-2xl border p-3 transition ${draft?.id === check.id ? "border-accent/60 bg-accent/[0.07]" : "border-border/70 bg-foreground/[0.025]"}`}>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent"><Dices className="size-5"/></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-foreground">{check.name}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{check.dice.map(dieLabel).join(" + ")}</p></div>
            <button type="button" title={check.isPublic ? "Ocultar de todos os jogadores" : "Revelar aos jogadores"} aria-label={check.isPublic ? `Ocultar ${check.name}` : `Revelar ${check.name}`} disabled={saving} onClick={() => void mutate({ action: "visibility", id: check.id, isPublic: !check.isPublic })} className={`rounded-lg border p-2 ${check.isPublic ? "border-accent/35 bg-accent/10 text-accent" : "border-border/70 text-muted-foreground"}`}>
              {check.isPublic ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
            <span className={`text-[10px] font-semibold ${check.isPublic ? "text-accent" : "text-muted-foreground"}`}>{check.isPublic ? "Visível aos jogadores" : "Oculto dos jogadores"}</span>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:text-accent" onClick={() => { setDraft(structuredClone(check)); setNotice("") }}><Pencil className="size-3"/> Editar</button>
          </div>
        </div>)}
      </div>

      <div className="min-w-0">
        {!draft ? <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-border/75 bg-foreground/[0.015] p-6 text-center"><Dices className="size-11 text-accent/55"/><p className="mt-4 text-sm font-semibold text-foreground">Selecione um teste para editar</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">Você também pode criar uma composição de dados inteiramente nova.</p></div> :
          <div className="space-y-5 rounded-[24px] border border-border/70 bg-foreground/[0.025] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-widest text-accent">Editor de testes</p><h4 className="mt-1 text-xl font-bold text-foreground">{current ? "Editar composição" : "Novo teste"}</h4></div>
              <button type="button" className={action} onClick={() => setDraft(null)}>Fechar editor</button></div>
            <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">Nome do teste<input className={input} maxLength={100} placeholder="Ex.: Ritual da Tempestade" value={draft.name} onChange={event => setDraft(prev => prev && { ...prev, name: event.target.value })}/></label>
            <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">Descrição / instruções<textarea className={input} maxLength={1000} rows={3} placeholder="Explique quando e por que realizar esta rolagem..." value={draft.description} onChange={event => setDraft(prev => prev && { ...prev, description: event.target.value })}/></label>
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-foreground">Composição dos dados</p><p className="mt-0.5 text-xs text-muted-foreground">{draft.dice.length}/{CUSTOM_CHECK_DICE_LIMIT} dados configurados</p></div>
                <button type="button" className={action} disabled={draft.dice.length >= CUSTOM_CHECK_DICE_LIMIT} onClick={() => setDraft(prev => prev && { ...prev, dice: [...prev.dice, { kind: "fixed", sides: 6 }] })}><Plus className="size-4"/> Dado</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">{draft.dice.map((die, index) => <div key={index} className="rounded-xl border border-border/70 bg-background/75 p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-accent"><span>Dado {index + 1}</span><button type="button" title="Remover dado" aria-label={`Remover dado ${index + 1}`} disabled={draft.dice.length <= 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30" onClick={() => setDraft(prev => prev && { ...prev, dice: prev.dice.filter((_, i) => i !== index) })}><Trash2 className="size-4"/></button></div>
                <select aria-label={`Tipo do dado ${index + 1}`} className={input} value={die.kind} onChange={event => updateDie(index, event.target.value === "fixed" ? { kind: "fixed", sides: 6 } : { kind: "attribute", attribute: "dex" })}><option value="fixed">Dado de faces fixas</option><option value="attribute">Dado de atributo</option></select>
                <div className="mt-2">{die.kind === "fixed" ? <label className="block space-y-1 text-[11px] text-muted-foreground">Faces (d2 a d1000)<input aria-label={`Faces do dado ${index + 1}`} type="number" min={2} max={1000} step={1} className={input} value={die.sides} onChange={event => updateDie(index, { kind: "fixed", sides: Number(event.target.value) })}/></label> : <label className="block space-y-1 text-[11px] text-muted-foreground">Atributo da ficha<select aria-label={`Atributo do dado ${index + 1}`} className={input} value={die.attribute} onChange={event => updateDie(index, { kind: "attribute", attribute: event.target.value as CustomCheckAttribute })}>{CUSTOM_CHECK_ATTRIBUTES.map(attr => <option key={attr} value={attr}>{attr.toUpperCase()}</option>)}</select></label>}</div>
              </div>)}</div>
              <div className="rounded-xl border border-accent/20 bg-accent/[0.055] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-accent">Prévia da rolagem</p><p className="mt-1 break-words font-mono text-lg font-black text-foreground">{draft.dice.map(dieLabel).join(" + ")}</p></div>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.isPublic} onChange={event => setDraft(prev => prev && { ...prev, isPublic: event.target.checked })}/><span className="flex-1 text-xs text-foreground"><strong>Revelar aos jogadores</strong><span className="mt-1 block text-muted-foreground">Desmarcado: o teste fica oculto inclusive na API dos jogadores.</span></span>{draft.isPublic ? <Eye className="size-4 text-accent"/> : <EyeOff className="size-4 text-muted-foreground"/>}</label>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <div>{current && <button type="button" disabled={saving} onClick={() => { if (window.confirm(`Excluir permanentemente o teste ${current.name}?`)) void mutate({ action: "delete", id: current.id }).then(ok => { if (ok) setDraft(null) }) }} className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="size-4"/> Excluir</button>}</div>
              <button type="button" disabled={saving || !draft.name.trim() || draft.dice.length === 0 || draft.dice.length > CUSTOM_CHECK_DICE_LIMIT || draft.dice.some(d => d.kind === "fixed" && (!Number.isSafeInteger(d.sides) || d.sides < 2 || d.sides > 1000))} onClick={() => void mutate({ action: "save", check: draft }).then(ok => { if (ok) setDraft(null) })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-xs font-black text-accent-foreground transition hover:bg-accent/90 disabled:opacity-40">{saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>} Salvar teste</button>
            </div>
          </div>}
      </div>
    </div>
  </section>
}
