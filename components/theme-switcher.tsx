"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Palette, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type ThemeId = "archive" | "aether" | "crimson"

const themes: Array<{
  id: ThemeId
  name: string
  image: string
  colors: string[]
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
]

function isThemeId(value: string | null | undefined): value is ThemeId {
  return themes.some((theme) => theme.id === value)
}

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeId>("archive")

  useEffect(() => {
    const current = document.documentElement.dataset.theme
    const nextTheme = isThemeId(current) ? current : "archive"
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
    setMounted(true)
  }, [])

  function selectTheme(nextTheme: ThemeId) {
    document.documentElement.dataset.theme = nextTheme
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
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.22 }} className="rpg-modal max-h-[92vh] w-full max-w-4xl overflow-y-auto border p-6 custom-scrollbar-sepia sm:p-8" onClick={(event) => event.stopPropagation()}>
                <div className="mb-6 flex items-center justify-between gap-5">
                  <h2 className="rpg-title text-2xl font-bold text-foreground sm:text-3xl">Tema da interface</h2>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-sm p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Fechar temas"><X className="size-6" /></button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {themes.map((option) => {
                    const selected = option.id === theme
                    return (
                      <button key={option.id} type="button" onClick={() => selectTheme(option.id)} className={`theme-option relative overflow-hidden border text-left transition-colors ${selected ? "is-selected" : ""}`} aria-pressed={selected}>
                        <span className="theme-option-preview block aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgb(5 7 9 / 14%), rgb(5 7 9 / 52%)), url('${option.image}')` }} />
                        <span className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
                          <span className="min-w-0">
                            <span className="block truncate font-serif text-sm font-bold text-foreground">{option.name}</span>
                            <span className="mt-2 flex items-center gap-1.5">
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
