import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { AuthPanel } from "@/components/auth-panel"
import { Dices, ScrollText, Map, Sparkles } from "lucide-react"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) redirect("/campaigns")

  return (
    <main className="rpg-page relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15 mix-blend-luminosity"
        style={{ backgroundImage: "url(/arcane-academy-desk.webp)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-black/30 to-black/70" aria-hidden />

      <div className="relative mx-auto flex min-h-dvh max-w-7xl flex-col items-center justify-center gap-12 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-20 lg:py-16">
        <div className="max-w-2xl text-center lg:text-left">
          <span className="rpg-kicker justify-center lg:justify-start">
            <Sparkles className="size-3.5" /> Fabula Última
          </span>
          <h1 className="rpg-title text-glow mt-6 text-balance text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            Over the Magic School
          </h1>
          <div className="rpg-divider mx-auto mt-6 w-56 lg:mx-0" />
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-[#d8cab2] lg:text-left">
            Uma mesa virtual imersiva para suas campanhas de storytelling. Fichas vivas em tempo
            real, rolagens com aprovacao do Mestre, um compendio de lore que se revela e mapas
            interativos — tudo reunido em um arquivo arcano vivo.
          </p>

          <ul className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-x-6 gap-y-2 text-left text-sm sm:grid-cols-2 lg:mx-0">
            <Feature icon={<ScrollText className="size-4" />} label="Fichas interativas ao vivo" />
            <Feature icon={<Dices className="size-4" />} label="Dados com aprovacao do GM" />
            <Feature icon={<Sparkles className="size-4" />} label="Compendio de fragmentos" />
            <Feature icon={<Map className="size-4" />} label="Mapas com fog of war" />
          </ul>

          <p className="mt-8 text-sm text-[#ae9e85]">
            Já tem uma sessão aberta?{" "}
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
    <li className="flex items-center gap-2.5 border-b border-primary/20 px-1 py-3">
      <span className="text-accent">{icon}</span>
      <span className="text-foreground">{label}</span>
    </li>
  )
}
