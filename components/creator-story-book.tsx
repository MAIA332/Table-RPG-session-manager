"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookOpenText, Check, ChevronRight, Feather, PenLine, ScrollText, X } from "lucide-react"
import { IDENTITY_SUGGESTIONS, ORIGIN_SUGGESTIONS, THEME_SUGGESTIONS } from "@/lib/game-data"

type Chapter = "origin" | "identity" | "theme"
type Story = Record<Chapter, string>

const CHAPTERS: Array<{ key: Chapter; title: string; hint: string; empty: string }> = [
  { key: "origin", title: "Origem", hint: "De onde você vem", empty: "O início da sua história ainda não foi escrito." },
  { key: "identity", title: "Identidade", hint: "Quem você é hoje", empty: "O mundo ainda não conhece seu nome e seus feitos." },
  { key: "theme", title: "Tema", hint: "A emoção que te move", empty: "O que move seu coração permanece um mistério." },
]
const SUGGESTIONS: Record<Chapter, readonly string[]> = {
  origin: ORIGIN_SUGGESTIONS, identity: IDENTITY_SUGGESTIONS, theme: THEME_SUGGESTIONS,
}

export function CreatorStoryBookFields({ origin, setOrigin, identity, setIdentity, theme, setTheme }: {
  origin: string; setOrigin: (value: string) => void
  identity: string; setIdentity: (value: string) => void
  theme: string; setTheme: (value: string) => void
}) {
  const [active, setActive] = useState<Chapter | null>(null)
  const [drafts, setDrafts] = useState<Story>({ origin, identity, theme })
  const current: Story = { origin, identity, theme }
  const isOpen = active !== null
  const dialog = useRef<HTMLDivElement>(null)
  const writing = useRef<HTMLTextAreaElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  function openBook(chapter: Chapter) {
    setDrafts({ origin, identity, theme })
    previousFocus.current = document.activeElement as HTMLElement | null
    setActive(chapter)
  }
  function closeBook() { setActive(null) }
  function saveBook() {
    setOrigin(drafts.origin)
    setIdentity(drafts.identity)
    setTheme(drafts.theme)
    closeBook()
  }
  useEffect(() => {
    if (!isOpen) return
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeBook()
      }
      if (event.key !== "Tab" || !dialog.current) return
      const focusables = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
      if (!focusables.length) return
      const first = focusables[0], last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", handleKey, true)
    return () => {
      window.removeEventListener("keydown", handleKey, true)
      document.body.style.overflow = oldOverflow
      previousFocus.current?.focus()
    }
  }, [isOpen])

  const selected = CHAPTERS.find(chapter => chapter.key === active)
  return <>
    <section className="min-w-0 space-y-3" aria-label="Livro da história do personagem">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-serif text-lg font-bold">Livro de Origens</h3><span className="font-mono text-[10px] uppercase tracking-wider text-primary">3 capítulos</span></div>
      {CHAPTERS.map((chapter, index) => <button key={chapter.key} type="button" onClick={() => openBook(chapter.key)}
        className="group flex w-full min-w-0 items-start gap-3 border border-border/60 bg-card/40 p-3.5 text-left transition-colors hover:border-primary/60 hover:bg-primary/[.07] sm:p-4"
        aria-label={`Abrir livro para editar ${chapter.title}`}>
        <span className="grid size-10 shrink-0 place-items-center border border-primary/25 bg-primary/10 text-primary"><BookOpenText className="size-5" /></span>
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="font-serif text-base font-bold">{chapter.title}</strong><span className="text-[10px] text-primary/75">Capítulo {String(index + 1).padStart(2, "0")}</span></span><span className="mt-0.5 block text-[10px] text-muted-foreground">{chapter.hint}</span><span className={`mt-2 block max-w-full break-words text-xs leading-relaxed ${current[chapter.key].trim() ? "line-clamp-3 whitespace-pre-line text-foreground/75" : "italic text-muted-foreground/75"}`}>{current[chapter.key].trim() || chapter.empty}</span></span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary"><PenLine className="size-3.5" /><span className="hidden sm:inline">Editar</span></span>
      </button>)}
      <p className="text-[11px] leading-relaxed text-muted-foreground">Abra um capítulo para escrever livremente ou escolher uma inspiração. O resumo acima é apenas uma prévia.</p>
    </section>
    {active && selected && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[12100] flex items-center justify-center bg-black/85 p-2 text-foreground backdrop-blur-xl sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeBook() }}>
        <div ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-label="Livro editável do personagem" className="relative flex h-[min(92dvh,820px)] w-full max-w-5xl flex-col overflow-hidden border border-primary/40 bg-background shadow-[0_28px_90px_rgba(0,0,0,.65)] outline-none">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/25 bg-card/60 px-4 py-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center border border-primary/40 bg-primary/10 text-primary"><BookOpenText className="size-6" /></span><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.22em] text-primary">Crônicas do Viajante</p><h2 className="font-serif text-xl font-bold sm:text-2xl">Seu Livro de Origens</h2></div></div>
            <button type="button" onClick={closeBook} aria-label="Fechar livro sem salvar" className="grid size-10 shrink-0 place-items-center border border-border/60 bg-background/60 text-muted-foreground hover:border-primary/50 hover:text-primary"><X className="size-5" /></button>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[230px_minmax(0,1fr)] md:overflow-hidden">
            <nav aria-label="Capítulos do livro" className="grid grid-cols-3 gap-1 border-b border-primary/20 bg-card/30 p-3 md:flex md:flex-col md:gap-2 md:border-b-0 md:border-r md:p-5">
              {CHAPTERS.map((chapter, index) => <button key={chapter.key} type="button" onClick={() => setActive(chapter.key)} aria-current={active === chapter.key ? "page" : undefined} className={`min-w-0 border p-2 text-left transition-colors md:p-4 ${active === chapter.key ? "border-primary/65 bg-primary/10 text-primary" : "border-transparent bg-background/35 text-muted-foreground hover:border-primary/35"}`}><span className="block text-[9px] font-bold uppercase tracking-wider">{String(index + 1).padStart(2, "0")} · Capítulo</span><span className="mt-1 block truncate font-serif text-sm font-bold text-foreground md:text-lg">{chapter.title}</span></button>)}
              <span className="mt-auto hidden border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground md:block"><ScrollText className="mb-2 size-5 text-primary/65" />Todas as palavras serão registradas no personagem ao concluir a criação.</span>
            </nav>
            <section className="flex min-h-[390px] min-w-0 flex-col gap-4 p-4 sm:p-7 md:min-h-0 md:overflow-y-auto md:p-9" aria-label={`Editar ${selected.title}`}>
              <div className="min-w-0 border-l-2 border-primary/60 pl-4"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Capítulo · {selected.title}</p><h3 className="mt-1 font-serif text-2xl font-bold">{selected.hint}</h3><p className="mt-2 text-xs text-muted-foreground">Escreva a história em suas próprias palavras ou comece com uma das sugestões.</p></div>
              <textarea ref={writing} aria-label={`Texto de ${selected.title}`} value={drafts[active]} onChange={event => setDrafts(previous => ({ ...previous, [active]: event.target.value }))} placeholder="As primeiras linhas da sua história começam aqui..." className="min-h-[180px] w-full flex-1 resize-y border border-primary/30 bg-card/35 p-4 font-serif text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-primary/70 md:resize-none" />
              <div><p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.18em] text-primary"><Feather className="size-3.5" /> Inspirações</p><div className="flex flex-wrap gap-1.5">{SUGGESTIONS[active].map(suggestion => <button key={suggestion} type="button" onClick={() => setDrafts(previous => ({ ...previous, [active]: suggestion }))} className="max-w-full break-words border border-border/70 bg-background/55 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground">{suggestion}</button>)}</div></div>
            </section>
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-primary/25 bg-card/45 px-4 py-3 sm:px-7"><p className="hidden text-[11px] text-muted-foreground sm:block">Mudanças aplicadas somente ao salvar o livro.</p><div className="ml-auto flex gap-2"><button type="button" onClick={closeBook} className="border border-border/60 px-4 py-2.5 text-xs font-bold">Descartar</button><button type="button" onClick={saveBook} className="inline-flex items-center gap-2 border border-primary/60 bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><Check className="size-4" /> Salvar livro <ChevronRight className="size-4" /></button></div></footer>
        </div>
      </div>, document.body,
    )}
  </>
}
