import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { AuthPanel } from "@/components/auth-panel"
import { Dices, ScrollText, Map, Sparkles } from "lucide-react"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) redirect("/campaigns")

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: "url(/hero-magitech.png)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" aria-hidden />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col items-center justify-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-primary">
            <Sparkles className="size-3.5" /> Fabula Ultima VTT
          </span>
          <h1 className="mt-5 text-balance font-serif text-4xl font-black leading-tight text-foreground text-glow sm:text-5xl lg:text-6xl">
            Over the Magic School
          </h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Uma mesa virtual imersiva para suas campanhas de storytelling. Fichas vivas em tempo
            real, rolagens com aprovacao do Mestre, um compendio de lore que se revela e mapas
            interativos — tudo num painel magitech.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-3 text-left text-sm">
            <Feature icon={<ScrollText className="size-4" />} label="Fichas interativas ao vivo" />
            <Feature icon={<Dices className="size-4" />} label="Dados com aprovacao do GM" />
            <Feature icon={<Sparkles className="size-4" />} label="Compendio de fragmentos" />
            <Feature icon={<Map className="size-4" />} label="Mapas com fog of war" />
          </ul>

          <p className="mt-8 text-sm text-muted-foreground">
            Ja tem uma sessao aberta?{" "}
            <Link href="/campaigns" className="text-primary underline-offset-4 hover:underline">
              Ir para minhas campanhas
            </Link>
          </p>
        </div>

        <AuthPanel />
      </div>
    </main>
  )
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <span className="text-primary">{icon}</span>
      <span className="text-foreground">{label}</span>
    </li>
  )
}
