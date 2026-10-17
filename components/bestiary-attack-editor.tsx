"use client"

import type { Attack, Attribute } from "@/lib/combat-model"
import {
  BESTIARY_ATTRIBUTES,
  MAX_BESTIARY_ATTACK_ATTRIBUTES,
  formatBestiaryFormula,
  type BestiaryAttribute,
} from "@/lib/bestiary-attack-formula"
import { Minus, Plus } from "lucide-react"

const input = "w-full min-w-0 rounded-lg border border-white/15 bg-zinc-900 p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-destructive/50"

type Props = {
  value: Attack
  onChange: (attack: Attack) => void
  creatureDice?: any
}

/** Editor independente para ataques básicos do Bestiário.
 * Não altera o AttackEditor global dos personagens jogadores nem as habilidades.
 */
export function BestiaryAttackEditor({ value, onChange, creatureDice }: Props) {
  const attributes = Array.isArray(value.attributes) ? value.attributes : []
  const setAttributes = (next: Attribute[]) => onChange({
    ...value,
    attributes: next as Attack["attributes"],
  })

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-300">
        Nome do ataque
        <input className={input} value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-300">
        Alvo do ataque
        <select className={input} value={value.targetDefense} onChange={event => onChange({ ...value, targetDefense: event.target.value as Attack["targetDefense"] })}>
          <option value="physical">Defesa Física</option>
          <option value="magical">Defesa Mágica</option>
        </select>
      </label>

      <fieldset className="min-w-0 space-y-2 rounded-lg border border-destructive/25 bg-black/20 p-3 sm:col-span-2">
        <legend className="px-1 text-xs font-bold uppercase tracking-widest text-destructive">Fórmula de acerto</legend>
        <p className="text-xs text-zinc-400">Escolha de 1 a 4 atributos, repetidos ou diferentes. Cada posição equivale a um dado independente.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {attributes.map((attribute, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center font-mono text-xs text-zinc-500">{index + 1}</span>
              <select
                aria-label={`Atributo ${index + 1} do acerto`}
                value={attribute}
                className={input}
                onChange={event => {
                  const next = [...attributes] as Attribute[]
                  next[index] = event.target.value as Attribute
                  setAttributes(next)
                }}
              >
                {BESTIARY_ATTRIBUTES.map((key:any) => <option key={key} value={key}>{key.toUpperCase()} {creatureDice?.[key] ? `(${creatureDice[key]})` : ""}</option>)}
              </select>
              <button
                type="button"
                disabled={attributes.length <= 1}
                aria-label={`Remover atributo ${index + 1}`}
                title="Remover este dado"
                className="rounded-md border border-white/15 p-2 text-zinc-400 hover:border-red-500/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                onClick={() => setAttributes(attributes.filter((_, position) => position !== index) as Attribute[])}
              ><Minus className="size-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm font-bold text-amber-200">{formatBestiaryFormula(attributes, creatureDice)}</span>
            <span className="text-[11px] text-zinc-500">{attributes.length}/{MAX_BESTIARY_ATTACK_ATTRIBUTES} dados na rolagem</span>
          </div>
          <button
            type="button"
            disabled={attributes.length >= MAX_BESTIARY_ATTACK_ATTRIBUTES}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => setAttributes([...attributes, (attributes.at(-1) || "mig") as Attribute])}
          ><Plus className="size-3.5" /> Adicionar atributo</button>
        </div>
      </fieldset>

      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-300">
        Dano fixo ou dados
        <input className={input} value={value.damage} placeholder="10 ou 2d6+2" onChange={event => onChange({ ...value, damage: event.target.value })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-300">
        Tipo de dano
        <select className={input} value={value.type} onChange={event => onChange({ ...value, type: event.target.value })}>
          {["físico", "fogo", "gelo", "raio", "ar", "terra", "luz", "trevas", "veneno"].map(key => <option key={key} value={key}>{key}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-300 sm:col-span-2">
        Descrição / efeito do ataque
        <textarea rows={2} className={input} value={value.description || ""} onChange={event => onChange({ ...value, description: event.target.value })} />
      </label>
    </div>
  )
}
