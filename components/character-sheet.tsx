"use client"

import { useState } from "react"
import Image from "next/image"
import { apiFetch } from "@/lib/client"
import { ResourceBar } from "@/components/resource-bar"
import { ATTRIBUTE_META, getClass, getEquipment } from "@/lib/game-data"
import type { AttributeKey, Character, CharacterResources } from "@/lib/types"
import { Heart, Zap, Backpack, Sparkles, Minus, Plus } from "lucide-react"

interface Props {
  character: Character
  editable: boolean
  // callback para atualizacao otimista no estado do pai
  onOptimistic: (c: Character) => void
}

const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]

export function CharacterSheet({ character, editable, onOptimistic }: Props) {
  const [pending, setPending] = useState(false)

  async function patchResource(key: keyof CharacterResources, delta: number) {
    const res = character.resources
    const next: CharacterResources = { ...res }
    const max =
      key === "hp" ? res.maxHp : key === "mp" ? res.maxMp : key === "ip" ? res.maxIp : Infinity
    next[key] = Math.max(0, Math.min(max, res[key] + delta))

    // otimista
    onOptimistic({ ...character, resources: next })
    setPending(true)
    try {
      const { character: updated } = await apiFetch<{ character: Character }>(
        `/api/characters/${character.id}`,
        { method: "PATCH", body: JSON.stringify({ resources: { [key]: next[key] } }) },
      )
      onOptimistic(updated)
    } catch {
      // em caso de erro, o proximo evento SSE ou refetch corrige
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="panel border-glow rounded-xl border p-5">
      {/* Cabecalho */}
      <div className="flex items-start gap-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-primary/40">
          <Image
            src={character.avatarUrl || "/mystic-adventurer-portrait.png"}
            alt={`Retrato de ${character.name}`}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-xl font-bold text-foreground">{character.name}</h3>
          <p className="truncate text-sm text-muted-foreground">
            {[character.identity, character.origin].filter(Boolean).join(" · ") || "Aventureiro"}
          </p>
          {character.theme && (
            <span className="mt-1 inline-block rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
              {character.theme}
            </span>
          )}
        </div>
      </div>

      {/* Classes */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {character.classes.map((cl) => {
          const gc = getClass(cl.classId)
          return (
            <span
              key={cl.classId}
              className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {gc?.name ?? cl.classId} <span className="font-mono opacity-70">Nv{cl.level}</span>
            </span>
          )
        })}
      </div>

      {/* Atributos */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {ATTR_KEYS.map((k) => (
          <div key={k} className="rounded-lg border border-border/60 bg-card/40 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ATTRIBUTE_META[k].short}
            </p>
            <p className="font-serif text-lg font-black text-primary">{character.attributes[k]}</p>
          </div>
        ))}
      </div>

      {/* Recursos */}
      <div className="mt-5 flex flex-col gap-3">
        <ResourceBar
          label="Vida"
          short="HP"
          icon={<Heart className="size-4" />}
          current={character.resources.hp}
          max={character.resources.maxHp}
          colorVar="--hp"
          editable={editable}
          onChange={(d) => patchResource("hp", d)}
        />
        <ResourceBar
          label="Mente"
          short="MP"
          icon={<Zap className="size-4" />}
          current={character.resources.mp}
          max={character.resources.maxMp}
          colorVar="--mp"
          editable={editable}
          onChange={(d) => patchResource("mp", d)}
        />
        <ResourceBar
          label="Inventario"
          short="IP"
          icon={<Backpack className="size-4" />}
          current={character.resources.ip}
          max={character.resources.maxIp}
          colorVar="--ip"
          editable={editable}
          onChange={(d) => patchResource("ip", d)}
        />

        {/* Pontos Fabula */}
        <div className="flex items-center justify-between rounded-lg border border-[color:var(--fp)]/30 bg-[color:var(--fp)]/5 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--fp)]">
            <Sparkles className="size-4" /> Pontos Fabula
          </span>
          <div className="flex items-center gap-2">
            {editable && (
              <button
                aria-label="Diminuir FP"
                onClick={() => patchResource("fp", -1)}
                className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:border-[color:var(--fp)]"
              >
                <Minus className="size-3.5" />
              </button>
            )}
            <span className="w-6 text-center font-mono text-lg font-bold text-[color:var(--fp)]">
              {character.resources.fp}
            </span>
            {editable && (
              <button
                aria-label="Aumentar FP"
                onClick={() => patchResource("fp", 1)}
                className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:border-[color:var(--fp)]"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Equipamento */}
      {character.equipment.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Equipamento
          </p>
          <div className="flex flex-wrap gap-1.5">
            {character.equipment.map((id) => {
              const item = getEquipment(id)
              if (!item) return null
              return (
                <span
                  key={id}
                  className="rounded border border-border/60 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {item.name}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {pending && <p className="mt-3 text-[11px] text-muted-foreground">Sincronizando...</p>}
    </div>
  )
}
