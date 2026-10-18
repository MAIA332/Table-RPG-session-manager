"use client"

import { useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Dices, Sparkles, Trash2, Plus, Zap, Shield, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ItemArtwork } from "./item-artwork"
import { ITEM_EQUIPPED_PREFIX, blankItemAction, buildItemUseUpdates, equippedItemBonuses, getItemActions, hasItemBonuses, itemBonusEntries, parseItemDice, rollItemDice, sumItemBonus, validateItemAction, EQUIPMENT_LIMITS, wearableKind, wearItemUpdates, wornCounts, type ItemAction } from "@/lib/item-mechanics"
import { OVERWEIGHT_MODIFIER_ID } from "@/lib/character"

type Props = {
    character: any
    catalog: any[]
    editable: boolean
    isGm: boolean
    busy: boolean
    onCommit: (updates: any) => Promise<any>
    onRoll?: (label: string, result: number | string, details?: { breakdown?: string; modifier?: number }) => unknown
    renderDetail?: (text: string) => ReactNode
    onRemove: (index: number) => void
    transferTargets?: { id: string; name: string; ownerName?: string }[]
    onTransfer?: (index: number, itemName: string, recipientCharacterId: string) => Promise<void>
}

export function InventoryEquipment({ character, catalog, editable, isGm, busy, onCommit, onRoll, onRemove, onTransfer, transferTargets = [], renderDetail }: Props) {
    const reducedMotion = useReducedMotion()
    const lock = useRef(false)
    const [activeKey, setActiveKey] = useState<string | null>(null)
    const [result, setResult] = useState<{ item: string; name: string; lines: string[]; stamp: number } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [requirements, setRequirements] = useState<Record<string, boolean>>({})
    const [transferTarget, setTransferTarget] = useState<Record<string, string>>({})
    const bonuses = equippedItemBonuses(character, catalog)
    const counts = wornCounts(character, catalog)
    const missingItems = new Map<string, { index: number; count: number }>()
        ; (character.equipment || []).forEach((id: string, index: number) => {
            if (catalog.some(item => item.id === id)) return
            const existing = missingItems.get(id)
            missingItems.set(id, { index: existing?.index ?? index, count: (existing?.count ?? 0) + 1 })
        })
    const missingCount = [...missingItems.values()].reduce((sum, item) => sum + item.count, 0)

    async function toggleBonuses(item: any, key: string) {
        if (!editable || busy || lock.current) return
        lock.current = true; setActiveKey(key); setError(null)
        try {
            const id = ITEM_EQUIPPED_PREFIX + item.id
            const mods = (character.customModifiers || []).filter((mod: any) => mod.id !== id)
            if (!hasItemBonuses(character, item.id)) mods.push({ id, name: `Bônus ativos: ${item.name}`, target: "item_state_hidden", value: 1 })
            const updated = await onCommit({ customModifiers: mods })
            if (hasItemBonuses(updated, item.id) === hasItemBonuses(character, item.id)) throw new Error("A API não confirmou a ativação dos bônus. Recarregue a ficha antes de tentar novamente.")
        } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar os bônus.") }
        finally { lock.current = false; setActiveKey(null) }
    }

    async function toggleWear(item: any, key: string) {
        if (!editable || busy || lock.current) return
        lock.current = true; setActiveKey(key); setError(null)
        try {
            const wasActive = hasItemBonuses(character, item.id)
            const updates = wearItemUpdates(character, catalog, item.id)
            const updated = await onCommit(updates)
            if (hasItemBonuses(updated, item.id) === wasActive)
                throw new Error("A API não confirmou o uso do item. Recarregue a mochila antes de tentar novamente.")
        } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível alterar o uso do item.") }
        finally { lock.current = false; setActiveKey(null) }
    }

    async function useItem(item: any, index: number, action: ItemAction, key: string) {
        if (!editable || busy || lock.current) return
        if (action.requirement && !requirements[key]) return
        lock.current = true; setActiveKey(key); setError(null); setResult(null)
        try {
            validateItemAction(action, character.attributes)
            const updates = buildItemUseUpdates(character, item.id, index, action)
            const dexPenalty = Number((character.customModifiers || []).find((modifier: any) => modifier.id === OVERWEIGHT_MODIFIER_ID)?.value) || 0
            const modifierFor = (expression: string | undefined, labels: string[]) => sumItemBonus(bonuses, labels) + (expression && /\bdex\b/i.test(expression) ? dexPenalty : 0)
            // Gera a rolagem uma vez. Só publica resultados após confirmar custos e consumo.
            const rolls = [
                ...(action.attackDice?.trim() ? [{ kind: "Acerto", roll: rollItemDice(action.attackDice, character.attributes, modifierFor(action.attackDice, ["Acerto", "Ataque", ...(action.attackDice.match(/\b(dex|ins|mig|wlp)\b/gi) || [])])) }] : []),
                ...(action.damageDice?.trim() ? [{ kind: "Dano", roll: rollItemDice(action.damageDice, character.attributes, modifierFor(action.damageDice, ["Dano", ...(action.damageDice.match(/\b(dex|ins|mig|wlp)\b/gi) || [])])) }] : [])
            ]
            if (Object.keys(updates).length) {
                const updated = await onCommit(updates)
                if (Object.entries(updates.resources || {}).some(([resource, value]) => updated.resources?.[resource] !== value) ||
                    (updates.equipment && JSON.stringify(updated.equipment) !== JSON.stringify(updates.equipment))) throw new Error("A API não confirmou o custo ou consumo. Confira a ficha antes de repetir o uso.")
            }
            // Custos, requisitos e efeitos permanecem no cartão; o resultado mostra só os dados.
            const lines = rolls.map(({ kind, roll }) => `${kind}: ${roll.values.join(" + ") || "Dano fixo"}`)
            if (!rolls.length) lines.push("Habilidade utilizada.")
            setResult({ item: item.name, name: action.name, lines, stamp: Date.now() })
            setRequirements(current => ({ ...current, [key]: false }))
            try {
                for (const { kind, roll } of rolls) if (await onRoll?.(`ITEM_ROLL:${item.name} • ${action.name} • ${kind} [${roll.label}]`, roll.total, { breakdown: roll.values.join(" + ") || "0", modifier: roll.modifier || undefined }) === false) throw new Error("Falha no registro da sessão")
                if (!rolls.length && await onRoll?.(`ITEM_USE:${item.name} • ${action.name}`, "Habilidade utilizada.") === false) throw new Error("Falha no registro da sessão")
            } catch { setError("Item utilizado, mas não foi possível publicar o registro na sessão. Não repita o uso para reenviar.") }
        } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível usar o item.") }
        finally { lock.current = false; setActiveKey(null) }
    }

    return <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {result && <motion.div key={result.stamp} role="status" aria-live="polite" initial={{ opacity: reducedMotion ? 1 : 0, scale: reducedMotion ? 1 : 0.98 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-cyan-200"><Sparkles className="size-4" /> {result.item} · {result.name}</p>
            {result.lines.map((line, i) => <p key={i} className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-cyan-100/80">{line}</p>)}
        </motion.div>}
        {missingCount > 0 && (
            <details className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-amber-200">
                    Itens indisponíveis ({missingCount})
                </summary>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Estes itens estão na mochila, mas seus IDs não foram encontrados
                    no catálogo recebido. Isso pode indicar um cadastro removido ou
                    um problema de sincronização.
                </p>

                <div className="mt-4 space-y-3">
                    {[...missingItems.entries()].map(([id, entry]) => {
                        const savedRecord = (character.customModifiers || []).find(
                            (mod: any) =>
                                mod.id === ITEM_EQUIPPED_PREFIX + id &&
                                typeof mod.name === "string"
                        )

                        const savedName = savedRecord?.name
                            ?.replace(/^Bônus ativos:\s*/i, "")
                            .trim()

                        return (
                            <div
                                key={id}
                                className="space-y-3 rounded-lg border border-border/40 bg-background/40 p-3"
                            >
                                <div>
                                    <p className="text-sm font-semibold text-foreground">
                                        {savedName || "Item sem nome recuperável"}
                                    </p>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Quantidade na mochila: {entry.count}
                                    </p>

                                    <div className="mt-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                            ID do cadastro
                                        </span>

                                        <code className="mt-1 block select-all break-all rounded-md border border-border/40 bg-black/20 px-2 py-1.5 text-xs text-amber-200">
                                            {id}
                                        </code>
                                    </div>

                                    {!savedName && (
                                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                            A ficha preservou somente o ID deste item.
                                            O nome original precisa ser consultado no cadastro
                                            ou em um backup da campanha.
                                        </p>
                                    )}
                                </div>

                                <div className="border-t border-border/30 pt-3">
                                    <p className="text-xs font-semibold text-amber-200">
                                        Como corrigir
                                    </p>

                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                        O Mestre deve procurar o ID acima no cadastro da campanha.
                                        Se o cadastro existir, verificar por que ele não está sendo
                                        enviado ao jogador. Se foi excluído, restaurá-lo com o mesmo
                                        ID. Criar outro item com o mesmo nome não recupera este vínculo.
                                    </p>
                                </div>

                                {isGm && (
                                    <div className="flex justify-end">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy || !!activeKey}
                                            onClick={() => onRemove(entry.index)}
                                            className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                                            aria-label={`Remover uma unidade de ${savedName || id}`}
                                        >
                                            <Trash2 className="size-3.5" />
                                            Remover 1 unidade
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </details>
        )}
        {!character.equipment?.length && <p className="rounded-xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">Nenhum equipamento.</p>}
        {(character.equipment || []).map((id: string, index: number) => {
            const item = catalog.find(entry => entry.id === id)
            const itemKey = `${id}:${index}`
            if (!item) return null
            const actions = getItemActions(item)
            const activated = hasItemBonuses(character, id)
            const parsedBonuses = itemBonusEntries(item)
            const kind = wearableKind(item)
            const isFirstCopy = (character.equipment || []).indexOf(id) === index
            const atLimit = kind ? counts[kind] >= EQUIPMENT_LIMITS[kind] : false
            const pulsing = activeKey?.startsWith(itemKey + ":") || (result?.item === item.name)
            return <motion.article key={itemKey} animate={pulsing && !reducedMotion ? { boxShadow: ["0 0 0px transparent", "0 0 18px rgba(34,211,238,.25)", "0 0 0px transparent"] } : { boxShadow: "0 0 0px transparent" }} transition={{ duration: 0.65 }} className="overflow-hidden rounded-xl border border-primary/30 bg-card/70">
                <header className="flex items-start justify-between gap-3 border-b border-primary/15 bg-primary/5 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                        {item.imageUrl && <ItemArtwork name={item.name} imageUrl={item.imageUrl} expandable className="size-14" />}
                        <div className="min-w-0"><h4 className="font-serif text-base font-bold text-primary">{item.name}</h4><div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">{item.type && <span>{item.type}</span>}{item.purchasable === false && <span className="text-purple-300">Loot raro</span>}{activated && <span className="text-emerald-300">Bônus ativos</span>}</div></div></div>
                    <div className="flex shrink-0 items-center gap-1"><span className="rounded border border-primary/20 px-2 py-1 font-mono text-xs text-primary">{item.cost ?? 0}z</span>{isGm && <Button variant="ghost" size="sm" disabled={busy || !!activeKey} onClick={() => onRemove(index)} aria-label={`Remover ${item.name}`} className="h-8 w-8 p-0"><Trash2 className="size-4" /></Button>}</div>
                </header>
                {editable && onTransfer && transferTargets.length > 0 && (
                    <div className="flex flex-col gap-2 border-b border-primary/15 bg-black/20 p-3 sm:flex-row">
                        <select aria-label={`Receptor de ${item.name}`} value={transferTarget[itemKey] || ""} onChange={event => setTransferTarget(current => ({ ...current, [itemKey]: event.target.value }))} className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                            <option value="">Transferir para...</option>
                            {transferTargets.map(target => <option key={target.id} value={target.id}>{target.name}{target.ownerName ? ` — ${target.ownerName}` : ""}</option>)}
                        </select>
                        <Button size="sm" variant="outline" disabled={busy || !!activeKey || !transferTarget[itemKey]} onClick={async () => {
                            const target = transferTarget[itemKey]
                            if (!target) return
                            setActiveKey(`${itemKey}:transfer`)
                            try { await onTransfer(index, item.name, target); setTransferTarget(current => ({ ...current, [itemKey]: "" })) }
                            finally { setActiveKey(null) }
                        }} className="gap-1.5"><Send className="size-3.5" /> Enviar</Button>
                    </div>
                )}
                <div className="space-y-3 p-4">
                    <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{renderDetail ? renderDetail(item.detail || "Sem descrição.") : item.detail || "Sem descrição."}</div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-mono">{[["Dano", item.damage], ["DEF", item.defense], ["M.DEF", item.mdef]].filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) => <span key={String(label)} className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-primary">{label}: {String(value)}</span>)}</div>
                    {item.bonus && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">Bônus: {item.bonus}</p>}
                    {kind && isFirstCopy && <div className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                        <Button type="button" size="sm" variant={activated ? "outline" : "default"} className="gap-2 text-xs" disabled={!editable || busy || !!activeKey || (!activated && atLimit)} onClick={() => void toggleWear(item, itemKey + ":wear")}>
                            <Shield className="size-3.5" />{activeKey === itemKey + ":wear" ? "Salvando..." : activated ? "Retirar" : "Usar"}
                        </Button>
                        <p className="text-[10px] text-muted-foreground">{activated ? "Em uso: bônus e defesas ativos." : atLimit ? `Limite de ${kind === "armor" ? "armaduras" : "acessórios"} alcançado. Retire outro item.` : "Clique em Usar para ativar os bônus."}</p>
                    </div>}
                    {kind && !isFirstCopy && <p className="text-xs text-muted-foreground">Cópia adicional: o uso e os bônus são controlados na primeira unidade desse item.</p>}
                    {!kind && parsedBonuses.length > 0 && <div className="space-y-2"><Button variant="outline" size="sm" disabled={!editable || busy || !!activeKey} onClick={() => toggleBonuses(item, itemKey + ":bonuses")} className="gap-2 text-xs"><Shield className="size-3.5" /> {activated ? "Desativar bônus" : "Ativar bônus"}</Button><p className="text-[10px] leading-relaxed text-muted-foreground">Bônus numéricos usam o nome exato do teste. Acerto/Ataque e Dano são aplicados nas ações dos itens. Cópias do mesmo item não acumulam bônus.</p></div>}
                    {item.effect && <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-200">Efeito: {item.effect}</p>}
                    {actions.length > 0 && <div className="space-y-3 border-t border-border/40 pt-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ações do item</p>
                        {actions.map(action => {
                            const key = `${itemKey}:${action.id}`
                            let validation = ""
                            try { validateItemAction(action, character.attributes) } catch (err) { validation = err instanceof Error ? err.message : "Ação inválida." }
                            const insufficient = character.resources[action.costResource] < action.cost
                            const diceLabel = (expression: string) => { try { return parseItemDice(expression, character.attributes).label } catch { return expression } }
                            return <div key={key} className="space-y-2 rounded-lg border border-border/40 bg-background/40 p-3">
                                <p className="text-sm font-bold text-foreground">{action.name}</p>
                                <div className="flex flex-wrap gap-2 text-[11px] text-primary">{action.attackDice && <span>Acerto: {diceLabel(action.attackDice)}</span>}{action.damageDice && <span>Dano: {diceLabel(action.damageDice)}</span>}<span>{action.cost ? `${action.cost} ${action.costResource.toUpperCase()}` : "Sem custo de recurso"}</span>{action.consume && <span className="text-amber-300">Consome 1 unidade</span>}</div>
                                {action.kind === "heal" && <p className="text-xs text-emerald-300">Recupera até {action.restoreAmount} {action.restoreResource.toUpperCase()}.</p>}
                                {action.effect && <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{action.effect}</p>}
                                {action.requirement && <label className="flex items-start gap-2 text-xs text-amber-200"><input type="checkbox" checked={!!requirements[key]} disabled={!editable || busy || !!activeKey} onChange={event => setRequirements(current => ({ ...current, [key]: event.target.checked }))} className="mt-0.5" /> Confirmo: {action.requirement}</label>}
                                {validation && <p className="text-xs text-amber-300">O Mestre precisa configurar esta ação: {validation}</p>}
                                <Button size="sm" disabled={!editable || busy || !!activeKey || !!validation || insufficient || (!!action.requirement && !requirements[key])} onClick={() => useItem(item, index, action, key)} className="gap-2 text-xs"><Dices className="size-3.5" />{activeKey === key ? "Usando..." : insufficient ? "Recurso insuficiente" : action.kind === "attack" ? "Rolar dados" : "Usar habilidade"}</Button>
                            </div>
                        })}
                    </div>}
                </div>
            </motion.article>
        })}
    </div>
}

/** Resumo sempre visível abaixo da capacidade da mochila. */
export function WornEquipmentSummary({ character, catalog }: { character: any; catalog: any[] }) {
    const counts = wornCounts(character, catalog)
    const unique = new Set<string>()
    const equipment = (character.equipment || []).flatMap((id: string) => {
        if (unique.has(id)) return []
        unique.add(id)
        const item = catalog.find((entry: any) => entry.id === id)
        return item && wearableKind(item) && hasItemBonuses(character, id) ? [item] : []
    })
    return <section className="mt-4 rounded-xl border border-primary/25 bg-card/40 p-4" aria-label="Itens em uso">
        <h6 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><Shield className="size-4" /> Itens em uso</h6>
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded bg-primary/10 px-2 py-1">Armaduras: {counts.armor}/{EQUIPMENT_LIMITS.armor}</span>
            <span className="rounded bg-primary/10 px-2 py-1">Acessórios: {counts.accessory}/{EQUIPMENT_LIMITS.accessory}</span>
        </div>
        {!equipment.length ? <p className="text-xs text-muted-foreground">Nenhuma armadura ou acessório em uso.</p> :
            <ul className="space-y-2">{equipment.map((item: any) => <li key={item.id} className="rounded-md border border-border/40 bg-black/20 px-3 py-2">
                <span className="text-xs font-semibold text-foreground">{item.name}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">({wearableKind(item) === "armor" ? "Armadura" : "Acessório"})</span>
                {!!item.bonus && <p className="mt-1 text-[10px] text-emerald-300">{item.bonus}</p>}
                {(Number(item.defense) || Number(item.mdef)) ? <p className="mt-1 text-[10px] text-primary">{Number(item.defense) ? `DEF ${Number(item.defense) > 0 ? "+" : ""}${item.defense}` : ""} {Number(item.mdef) ? `M.DEF ${Number(item.mdef) > 0 ? "+" : ""}${item.mdef}` : ""}</p> : null}
            </li>)}</ul>}
    </section>
}

export function ItemActionsEditor({ actions, onChange }: { actions: ItemAction[]; onChange: (actions: ItemAction[]) => void }) {
    const input = "w-full rounded-md border border-white/10 bg-background p-2 text-xs text-foreground"
    const update = (index: number, patch: Partial<ItemAction>) => onChange(actions.map((action, i) => i === index ? { ...action, ...patch } : action))
    return <section className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-cyan-200"><Zap className="size-4" /> Habilidades ativas</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">Informe os dados explicitamente: d12, 2d6+3 ou DEX+INS. Efeitos e requisitos são narrativos; custo, recuperação e consumo são automáticos.</p>
        {actions.map((action, index) => <div key={action.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border/40 p-3 sm:grid-cols-2">
            <label className="text-xs">Nome<input className={input} value={action.name} onChange={e => update(index, { name: e.target.value })} /></label>
            <label className="text-xs">Tipo<select className={input} value={action.kind} onChange={e => update(index, { kind: e.target.value as ItemAction["kind"] })}><option value="utility">Utilidade / efeito narrativo</option><option value="attack">Ataque</option><option value="heal">Recuperação</option></select></label>
            <label className="text-xs">Dados de acerto (opcional)<input className={input} value={action.attackDice} placeholder="DEX+INS ou d20+2" onChange={e => update(index, { attackDice: e.target.value })} /></label>
            <label className="text-xs">Dados de dano (opcional)<input className={input} value={action.damageDice} placeholder="d12 ou 2d6+3" onChange={e => update(index, { damageDice: e.target.value })} /></label>
            <label className="text-xs">Custo<input type="number" min="0" step="1" className={input} value={action.cost} onChange={e => update(index, { cost: Number(e.target.value) })} /></label>
            <label className="text-xs">Recurso gasto<select className={input} value={action.costResource} onChange={e => update(index, { costResource: e.target.value as ItemAction["costResource"] })}>{["hp", "mp", "ip"].map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
            {action.kind === "heal" && <><label className="text-xs">Quantidade recuperada<input type="number" min="0" step="1" className={input} value={action.restoreAmount} onChange={e => update(index, { restoreAmount: Number(e.target.value) })} /></label><label className="text-xs">Recurso recuperado<select className={input} value={action.restoreResource} onChange={e => update(index, { restoreResource: e.target.value as ItemAction["restoreResource"] })}>{["hp", "mp", "ip"].map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label></>}
            <label className="text-xs sm:col-span-2">Requisito para confirmar antes do uso<input className={input} value={action.requirement} placeholder="Ex.: estou prendendo a respiração" onChange={e => update(index, { requirement: e.target.value })} /></label>
            <label className="text-xs sm:col-span-2">Descrição do efeito<textarea className={input} rows={2} value={action.effect} onChange={e => update(index, { effect: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={action.consume} onChange={e => update(index, { consume: e.target.checked })} /> Consome uma unidade</label>
            <Button size="sm" variant="outline" onClick={() => onChange(actions.filter((_, i) => i !== index))} className="justify-self-end text-xs"><Trash2 className="mr-2 size-3" /> Remover ação</Button>
        </div>)}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onChange([...actions, blankItemAction()])} className="text-xs"><Plus className="mr-1 size-3" /> Adicionar habilidade</Button><Button size="sm" variant="outline" className="text-xs" onClick={() => onChange([...actions,
        { ...blankItemAction(), name: "Pressão abissal", requirement: "Estou prendendo a respiração (Fôlego do Afogado).", effect: "Manipula a pressão do ar/água para imobilizar inimigos. O Mestre define o teste, a duração e o risco de asfixia/desmaio." },
        { ...blankItemAction(), name: "Jato de água fervente", kind: "attack", damageDice: "d12", requirement: "Estou prendendo a respiração (Fôlego do Afogado).", effect: "Dispara água fervente. O Mestre determina o acerto e o efeito sobre a armadura. Uso prolongado traz risco de sangramento, asfixia e desmaio." }
        ])}>Adicionar exemplo: Prismarina</Button></div>
    </section>
}
