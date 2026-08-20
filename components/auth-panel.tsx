"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { Loader2, ScrollText } from "lucide-react"

export function AuthPanel() {
  const router = useRouter()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register"
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      })
      router.push("/campaigns")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel border-glow w-full max-w-md rounded-md border p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-sm border border-accent/35 bg-accent/10 text-accent shadow-inner">
          <ScrollText className="size-6" />
        </div>
        <div>
          <h2 className="rpg-title text-xl font-bold">
            {mode === "login" ? "Retornar ao Salão" : "Forjar Contrato"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Reabra os registros da sua campanha." : "Crie sua conta de aventureiro."}
          </p>
        </div>
      </div>

      <div className="rpg-divider mb-6" />
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === "register" && (
          <Field
            label="Nome"
            value={name}
            onChange={setName}
            placeholder="Como o mundo te chama?"
            autoComplete="name"
          />
        )}
        <Field
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="voce@reino.com"
          autoComplete="email"
        />
        <Field
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Sua palavra de poder"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="mt-2 w-full font-semibold">
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {mode === "login" ? "Entrar" : "Criar conta"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login")
          setError(null)
        }}
        className="mt-5 w-full text-center text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        {mode === "login" ? "Ainda nao tem conta? Forje uma." : "Ja tem conta? Retorne."}
      </button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="min-h-10 rounded-sm border border-input bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
      />
    </label>
  )
}
