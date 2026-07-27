"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { apiFetch } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { Crown, LogOut, Plus, Shield, Swords, Loader2, KeyRound } from "lucide-react"

interface CampaignRow {
  id: string
  name: string
  code: string
  role: "gm" | "player"
}

const fetcher = (url: string) => apiFetch<{ campaigns: CampaignRow[] }>(url)

export function CampaignsDashboard({ userName }: { userName: string }) {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR("/api/campaigns", fetcher)
  const [newName, setNewName] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [busy, setBusy] = useState<"create" | "join" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy("create")
    setError(null)
    try {
      const { campaign } = await apiFetch<{ campaign: CampaignRow }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      })
      setNewName("")
      await mutate()
      router.push(`/campaigns/${campaign.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar.")
    } finally {
      setBusy(null)
    }
  }

  async function joinCampaign(e: React.FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return
    setBusy("join")
    setError(null)
    try {
      const { campaign } = await apiFetch<{ campaign: CampaignRow }>("/api/campaigns/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode }),
      })
      setJoinCode("")
      await mutate()
      router.push(`/campaigns/${campaign.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.")
    } finally {
      setBusy(null)
    }
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-black text-foreground">Salao das Campanhas</h1>
          <p className="text-sm text-muted-foreground">Bem-vindo, {userName}.</p>
        </div>
        <Button variant="ghost" onClick={logout} className="gap-2 text-muted-foreground">
          <LogOut className="size-4" /> Sair
        </Button>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <form onSubmit={createCampaign} className="panel border-glow rounded-xl border p-5">
          <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-foreground">
            <Crown className="size-5 text-accent" /> Mestrar nova campanha
          </h2>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da campanha"
              className="flex-1 rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" disabled={busy === "create"} className="gap-1.5">
              {busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Criar
            </Button>
          </div>
        </form>

        <form onSubmit={joinCampaign} className="panel border-glow rounded-xl border p-5">
          <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-foreground">
            <KeyRound className="size-5 text-primary" /> Entrar com codigo
          </h2>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODIGO"
              maxLength={6}
              className="flex-1 rounded-md border border-input bg-background/60 px-3 py-2 font-mono text-sm uppercase tracking-widest outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" variant="secondary" disabled={busy === "join"} className="gap-1.5">
              {busy === "join" ? <Loader2 className="size-4 animate-spin" /> : <Swords className="size-4" />}
              Entrar
            </Button>
          </div>
        </form>
      </div>

      {error && (
        <p className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Suas mesas
      </h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !data?.campaigns.length ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          Nenhuma campanha ainda. Crie uma como Mestre ou entre com um codigo.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.campaigns.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => router.push(`/campaigns/${c.id}`)}
                className="panel group flex w-full items-center justify-between rounded-xl border border-border/60 p-4 text-left transition-all hover:border-primary/50 hover:border-glow"
              >
                <div>
                  <p className="font-serif text-lg font-bold text-foreground group-hover:text-primary">
                    {c.name}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">#{c.code}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    c.role === "gm"
                      ? "bg-accent/15 text-accent"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {c.role === "gm" ? <Crown className="size-3.5" /> : <Shield className="size-3.5" />}
                  {c.role === "gm" ? "Mestre" : "Jogador"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
