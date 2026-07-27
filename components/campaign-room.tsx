"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/client"
import { useRealtime } from "@/lib/use-realtime"
import { CharacterCreator } from "@/components/character-creator"
import { CharacterSheet } from "@/components/character-sheet"
import { Button } from "@/components/ui/button"
import type { Character, RealtimeEvent, Role } from "@/lib/types"
import {
  ArrowLeft,
  Crown,
  Plus,
  Radio,
  Shield,
  Users,
} from "lucide-react"

interface Member {
  userId: string
  role: Role
  name: string
}

interface CampaignData {
  campaign: { id: string; name: string; code: string; ownerId: string }
  role: Role
  members: Member[]
  characters: Character[]
  me: { id: string; name: string }
}

export function CampaignRoom({ initial }: { initial: CampaignData }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [characters, setCharacters] = useState<Character[]>(initial.characters)
  const [creating, setCreating] = useState(false)
  const [live, setLive] = useState(false)

  const isGm = data.role === "gm"

  // aplica eventos SSE ao estado local
  const handleEvent = useCallback((event: RealtimeEvent) => {
    setLive(true)
    setCharacters((prev) => {
      switch (event.type) {
        case "character:created":
          if (prev.some((c) => c.id === event.character.id)) return prev
          return [...prev, event.character]
        case "character:updated":
          return prev.map((c) => (c.id === event.character.id ? event.character : c))
        case "character:deleted":
          return prev.filter((c) => c.id !== event.characterId)
        default:
          return prev
      }
    })
  }, [])

  useRealtime(data.campaign.id, handleEvent)

  // atualizacao otimista local vinda das fichas
  const applyOptimistic = useCallback((c: Character) => {
    setCharacters((prev) => prev.map((x) => (x.id === c.id ? c : x)))
  }, [])

  const myCharacters = characters.filter((c) => c.ownerId === data.me.id)
  const otherCharacters = characters.filter((c) => c.ownerId !== data.me.id)

  // refetch leve ao montar para garantir consistencia
  useEffect(() => {
    apiFetch<CampaignData>(`/api/campaigns/${initial.campaign.id}`)
      .then((fresh) => {
        setData(fresh)
        setCharacters(fresh.characters)
      })
      .catch(() => {})
  }, [initial.campaign.id])

  if (creating) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 font-serif text-2xl font-black text-foreground">Forjar seu Heroi</h1>
        <CharacterCreator
          campaignId={data.campaign.id}
          onCancel={() => setCreating(false)}
          onCreated={(c) => {
            setCharacters((prev) =>
              prev.some((x) => x.id === c.id) ? prev : [...prev, c],
            )
            setCreating(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Barra superior */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/campaigns")}
            aria-label="Voltar"
            className="text-muted-foreground"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="font-serif text-2xl font-black text-foreground">{data.campaign.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="font-mono">#{data.campaign.code}</span>
              <span
                className={`inline-flex items-center gap-1 ${
                  live ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Radio className={`size-3.5 ${live ? "animate-pulse" : ""}`} />
                {live ? "Ao vivo" : "Conectando..."}
              </span>
            </div>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            isGm ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
          }`}
        >
          {isGm ? <Crown className="size-4" /> : <Shield className="size-4" />}
          {isGm ? "Mestre de Jogo" : "Jogador"}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Coluna principal: fichas */}
        <div className="flex flex-col gap-6">
          {/* Meus personagens */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {isGm ? "Personagens do Mestre" : "Meus herois"}
              </h2>
              <Button size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5">
                <Plus className="size-4" /> Novo heroi
              </Button>
            </div>
            {myCharacters.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                Voce ainda nao forjou um heroi. Crie o primeiro para comecar a aventura.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {myCharacters.map((c) => (
                  <CharacterSheet
                    key={c.id}
                    character={c}
                    editable
                    onOptimistic={applyOptimistic}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Outros personagens da mesa */}
          {otherCharacters.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {isGm ? "Herois dos jogadores" : "Companheiros de jornada"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {otherCharacters.map((c) => (
                  <CharacterSheet
                    key={c.id}
                    character={c}
                    // GM pode editar recursos de qualquer heroi
                    editable={isGm}
                    onOptimistic={applyOptimistic}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Coluna lateral: membros */}
        <aside className="flex flex-col gap-4">
          <div className="panel rounded-xl border border-border/60 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Users className="size-4" /> Na mesa
            </h2>
            <ul className="flex flex-col gap-2">
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {m.name}
                    {m.userId === data.me.id && (
                      <span className="ml-1 text-xs text-muted-foreground">(voce)</span>
                    )}
                  </span>
                  <span className={m.role === "gm" ? "text-accent" : "text-primary"}>
                    {m.role === "gm" ? (
                      <Crown className="size-4" />
                    ) : (
                      <Shield className="size-4" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel rounded-xl border border-border/60 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Convidar jogadores
            </h2>
            <p className="text-sm text-muted-foreground">
              Compartilhe o codigo abaixo para outros entrarem na mesa.
            </p>
            <p className="mt-2 rounded-md border border-primary/30 bg-primary/10 py-2 text-center font-mono text-lg font-bold tracking-widest text-primary">
              {data.campaign.code}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
