"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Palette, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useControllerActions } from "@/lib/input/use-controller-actions"

type ThemeId = "archive" | "aether" | "crimson" | "calm-kitty" | "paper" | "electric-mint" | "violet" | "mars" | "natalino"

const lightThemes: ThemeId[] = ["calm-kitty", "paper", "natalino"]

const themes: Array<{
  id: ThemeId
  name: string
  image?: string
  colors: string[]
  description?: string
  previewBackground?: string
  previewForeground?: string
  previewAccent?: string
}> = [
  {
    id: "archive",
    name: "Arquivo Arcano",
    image: "/arcane-academy-desk.webp",
    colors: ["#c69a5f", "#493729", "#17110d"],
  },
  {
    id: "aether",
    name: "Academia Celeste",
    image: "/celestial-academy-night.png",
    colors: ["#63b7ba", "#304d5a", "#09161c"],
  },
  {
    id: "crimson",
    name: "Observatório Rubro",
    image: "/gothic-observatory.png",
    colors: ["#b76465", "#624047", "#150e11"],
  },
  {
    id: "calm-kitty",
    name: "Calm Kitty",
    description: "Sálvia, musgo, marfim e areia suave",
    colors: ["#486350", "#A7B8A7", "#D7DFD3", "#EDF0E7", "#C9BDAF"],
    previewBackground: "linear-gradient(135deg, #EDF0E7 0%, #E0E6DB 55%, #C9D6C6 100%)",
    previewForeground: "#25392e",
    previewAccent: "#6B7F6E",
  },
  {
    id: "paper",
    name: "Paper",
    description: "Leitura aconchegante · marfim, papel quente e grafite",
    colors: ["#343029", "#555447", "#9E9588", "#B8AFA2", "#DAD4C8", "#EFE9DF"],
    previewBackground: "linear-gradient(135deg, #EFE9DF, #E5DED2 54%, #DAD4C8)",
    previewForeground: "#302D29",
    previewAccent: "#57574D",
  },
  {
    id: "mars",
    name: "Mars / Terracota",
    description: "Carvão quente, terracota e cobre · aconchego espacial",
    colors: ["#141212", "#251E1C", "#846258", "#D56C4F", "#F4EFEA"],
    previewBackground: "radial-gradient(circle at 80% 30%, rgba(213,108,79,.2), transparent 55%), linear-gradient(145deg, #251E1C, #141212)",
    previewForeground: "#F4EFEA",
    previewAccent: "#D56C4F",
  },
  {
    id: "natalino",
    name: "Natalino",
    description: "Vermelho festivo, verde-pinho e creme acolhedor",
    colors: ["#D35451", "#1E7A44", "#F4EFE6", "#333333"],
    previewBackground: "linear-gradient(180deg, #1E7A44 0%, #20884A 45%, #F4EFE6 45%, #F4EFE6 100%)",
    previewForeground: "#333333",
    previewAccent: "#D35451",
  },
  {
    id: "electric-mint",
    name: "Electric Mint",
    description: "#2AF5C8 sobre Carbon Black #141414",
    colors: ["#2AF5C8", "#141414", "#343434"],
    previewBackground: "linear-gradient(140deg, #141414, #1c2825)",
    previewForeground: "#e6fff8",
    previewAccent: "#2AF5C8",
  },
  {
    id: "violet",
    name: "Violet / Cyber Line",
    description: "Violeta profundo #3B1A47 com neon #B6FF00",
    colors: ["#3B1A47", "#B6FF00", "#28112e"],
    previewBackground: "linear-gradient(140deg, #3B1A47, #24112c)",
    previewForeground: "#faf2ff",
    previewAccent: "#B6FF00",
  },
]

function isThemeId(value: string | null | undefined): value is ThemeId {
  return themes.some((theme) => theme.id === value)
}

function isLightTheme(theme: ThemeId) {
  return lightThemes.includes(theme)
}

function previewCheckColor(theme: ThemeId) {
  return theme === "violet" || theme === "electric-mint" || theme === "mars" ? "#141414" : "#ffffff"
}

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeId>("archive")

  useControllerActions({ "ui.back": () => { setOpen(false); return true } }, { enabled: open, priority: 240 })

  useEffect(() => {
    const current = document.documentElement.dataset.theme
    const nextTheme = isThemeId(current) ? current : "archive"
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.classList.toggle("dark", !isLightTheme(nextTheme))
    setTheme(nextTheme)
    setMounted(true)
  }, [])

  function selectTheme(nextTheme: ThemeId) {
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.classList.toggle("dark", !isLightTheme(nextTheme))
    localStorage.setItem("vtt-interface-theme", nextTheme)
    setTheme(nextTheme)
  }

  return (
    <>
      <Button variant="outline" size="sm" className="rpg-cartography-action h-9 gap-2" onClick={() => setOpen(true)}>
        <Palette className="size-4" /> Tema
      </Button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[600] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6" onClick={() => setOpen(false)}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.22 }} role="dialog" aria-modal="true" aria-label="Escolher tema" className="rpg-modal max-h-[92dvh] w-full max-w-5xl overflow-y-auto border p-5 custom-scrollbar-sepia sm:p-8" onClick={(event) => event.stopPropagation()}>
                <div className="mb-6 flex items-center justify-between gap-5">
                  <h2 className="rpg-title text-2xl font-bold text-foreground sm:text-3xl">Tema da interface</h2>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-sm p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Fechar temas"><X className="size-6" /></button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {themes.map((option) => {
                    const selected = option.id === theme
                    return (
                      <button key={option.id} type="button" onClick={() => selectTheme(option.id)} className={`theme-option relative overflow-hidden border text-left transition-colors ${selected ? "is-selected" : ""}`} aria-pressed={selected}>
                        <span
                          className="theme-option-preview relative flex aspect-[4/3] flex-col justify-between overflow-hidden bg-cover bg-center p-4"
                          style={option.image
                            ? { backgroundImage: `linear-gradient(rgb(5 7 9 / 14%), rgb(5 7 9 / 52%)), url('${option.image}')` }
                            : { background: option.previewBackground, color: option.previewForeground }}
                        >
                          {option.id === "mars" && (
                            <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <span className="absolute left-4 top-4 text-[10px] font-bold uppercase tracking-[.28em] text-[#D56C4F]">MARS / 04</span>
                              <span className="relative size-[42%] rounded-full border border-[#E6987A]/35 shadow-[inset_-12px_-15px_24px_#4b241e,0_14px_32px_#080606]" style={{ background: "radial-gradient(circle at 28% 22%, #F0AB89 0%, #D56C4F 26%, #975441 62%, #4C2925 100%)" }} />
                              <span className="absolute bottom-4 left-4 rounded-full border border-[#D56C4F]/70 px-4 py-1.5 text-[10px] font-bold tracking-[.17em] text-[#F4EFEA]">TERRACOTA</span>
                            </span>
                          )}

                          {option.id === "natalino" && (
                            <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                              <span className="absolute inset-x-0 top-0 h-[44%] bg-[#1E7A44]" />
                              <span className="absolute left-1/2 top-[18%] h-[36%] w-[62%] -translate-x-1/2 rounded-[22px] border border-white/20 bg-[#D35451] shadow-[0_14px_28px_rgba(0,0,0,.18)]" />
                              <span className="absolute left-1/2 top-[16%] -translate-x-1/2 text-[24px] text-[#F4EFE6]">🎁</span>
                              <span className="absolute left-4 top-4 text-[10px] font-semibold uppercase tracking-[.24em] text-[#F4EFE6]">NATALINO</span>
                              <span className="absolute bottom-4 left-4 rounded-full border border-[#D35451]/35 bg-[#F4EFE6] px-3 py-1 text-[10px] font-semibold tracking-[.16em] text-[#333333]">COZY CHRISTMAS</span>
                              <span className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-[#1E7A44] px-3 py-1 text-[10px] font-semibold tracking-[.14em] text-[#F4EFE6]"><span className="h-2 w-2 rounded-full bg-[#D35451]" />JOY</span>
                            </span>
                          )}

                          {!option.image && option.id !== "mars" && option.id !== "natalino" && (
                            <>
                              <span className="relative flex items-center gap-2 opacity-80" aria-hidden="true">
                                <span className="size-2.5 rounded-full border border-current" />
                                <span className="h-px flex-1 bg-current opacity-20" />
                                <span className="h-2 w-9 rounded-full border border-current opacity-40" />
                              </span>
                              <span className="relative flex items-end justify-between gap-3" aria-hidden="true">
                                <span className="min-w-0"><span className="block font-serif text-3xl font-bold tracking-tight sm:text-4xl">Aa</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-[.18em] opacity-70">Interface</span></span>
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-current/20" style={{ backgroundColor: option.previewAccent, color: previewCheckColor(option.id) }}><Check className="size-5" /></span>
                              </span>
                            </>
                          )}
                        </span>
                        <span className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
                          <span className="min-w-0">
                            <span className="block truncate font-serif text-sm font-bold text-foreground">{option.name}</span>
                            {option.description && <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{option.description}</span>}
                            <span className="mt-2 flex flex-wrap items-center gap-1.5">
                              {option.colors.map((color) => <span key={color} className="size-3 rounded-full border border-white/20" style={{ backgroundColor: color }} />)}
                            </span>
                          </span>
                          <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${selected ? "border-accent bg-accent text-accent-foreground" : "border-border text-transparent"}`}><Check className="size-4" /></span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
