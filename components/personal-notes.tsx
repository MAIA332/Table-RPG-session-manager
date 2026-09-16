"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, FileText, GitBranch, Loader2, NotebookPen, Plus, Trash2, X } from "lucide-react"
import { apiFetch } from "@/lib/client"
import type { PersonalNote } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { PersonalFlowcharts } from "@/components/personal-flowcharts"

interface PersonalNotesProps {
  campaignId: string
}

export function PersonalNotes({ campaignId }: PersonalNotesProps) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<PersonalNote[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [mobileTop, setMobileTop] = useState<number | null>(null)
  const [showNoteList, setShowNoteList] = useState(false)
  const [activeMode, setActiveMode] = useState<"notes" | "flowcharts">("notes")
  const rootRef = useRef<HTMLDivElement | null>(null)
  const loadStartedRef = useRef(false)
  const closeRequestedRef = useRef(false)

  const selected = useMemo(() => notes.find((note) => note.id === selectedId) || null, [notes, selectedId])
  const dirty = Boolean(selected && (selected.title !== title || selected.content !== content))

  useEffect(() => {
    if (!open || loaded || loadStartedRef.current) return
    loadStartedRef.current = true
    setLoading(true)
    setError("")
    apiFetch<{ notes: PersonalNote[] }>(`/api/campaigns/${campaignId}/notes`)
      .then(async (response) => {
        const existing = [...(response.notes || [])].sort((a, b) => b.updatedAt - a.updatedAt)
        if (existing.length > 0) return existing
        const created = await apiFetch<{ note: PersonalNote }>(`/api/campaigns/${campaignId}/notes`, {
          method: "POST",
          body: JSON.stringify({ title: "Anotações", content: "" })
        })
        return [created.note]
      })
      .then((loadedNotes) => {
        setNotes(loadedNotes)
        setSelectedId(loadedNotes[0]?.id || null)
        setTitle(loadedNotes[0]?.title || "")
        setContent(loadedNotes[0]?.content || "")
        setLoaded(true)
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar as anotações.")
        loadStartedRef.current = false
      })
      .finally(() => setLoading(false))
  }, [campaignId, loaded, open])

  useEffect(() => {
    if (!open) {
      setMobileTop(null)
      return
    }
    const updatePosition = () => {
      if (window.innerWidth >= 640) {
        setMobileTop(null)
        return
      }
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      setMobileTop(Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 320)))
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open])

  async function saveCurrent() {
    if (!selected || !dirty) return true
    if (saving) return false
    setSaving(true)
    setError("")
    try {
      const response = await apiFetch<{ note: PersonalNote }>(`/api/campaigns/${campaignId}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ id: selected.id, title, content })
      })
      setNotes((current) => current
        .map((note) => note.id === response.note.id ? response.note : note)
        .sort((a, b) => b.updatedAt - a.updatedAt))
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a anotação.")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function closeNotes() {
    if (saving) {
      closeRequestedRef.current = true
      return
    }
    const saved = await saveCurrent()
    if (saved) {
      setShowNoteList(false)
      setOpen(false)
    }
  }

  useEffect(() => {
    if (saving || !closeRequestedRef.current) return
    closeRequestedRef.current = false
    void closeNotes()
  }, [saving])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      void closeNotes()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (showNoteList) {
        setShowNoteList(false)
        return
      }
      void closeNotes()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, saving, dirty, selectedId, title, content, showNoteList])

  useEffect(() => {
    if (!open || !dirty || saving) return
    const timeoutId = window.setTimeout(() => void saveCurrent(), 1100)
    return () => window.clearTimeout(timeoutId)
  }, [open, dirty, saving, selectedId, title, content])

  async function selectNote(noteId: string) {
    if (saving) return
    if (noteId === selectedId) {
      setShowNoteList(false)
      return
    }
    const saved = await saveCurrent()
    if (!saved) return
    const note = notes.find((item) => item.id === noteId)
    if (!note) return
    setSelectedId(note.id)
    setTitle(note.title)
    setContent(note.content)
    setShowNoteList(false)
  }

  async function createNote() {
    if (saving) return
    const saved = await saveCurrent()
    if (!saved) return
    setShowNoteList(false)
    setSaving(true)
    setError("")
    try {
      const response = await apiFetch<{ note: PersonalNote }>(`/api/campaigns/${campaignId}/notes`, {
        method: "POST",
        body: JSON.stringify({ title: "Nova anotação", content: "" })
      })
      setNotes((current) => [response.note, ...current])
      setSelectedId(response.note.id)
      setTitle(response.note.title)
      setContent("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a anotação.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteCurrent() {
    if (!selected || saving || !confirm(`Excluir "${selected.title}"?`)) return
    setSaving(true)
    setShowNoteList(false)
    setError("")
    try {
      await apiFetch(`/api/campaigns/${campaignId}/notes`, {
        method: "DELETE",
        body: JSON.stringify({ id: selected.id })
      })
      const remaining = notes.filter((note) => note.id !== selected.id)
      setNotes(remaining)
      setSelectedId(remaining[0]?.id || null)
      setTitle(remaining[0]?.title || "")
      setContent(remaining[0]?.content || "")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir a anotação.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="rpg-cartography-action h-9 gap-2"
        onClick={() => open ? void closeNotes() : setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <NotebookPen className="size-4" /> Notas
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={`rpg-modal rpg-themed-workspace absolute right-0 top-[calc(100%+0.5rem)] z-[120] flex max-h-[min(82vh,760px)] flex-col overflow-hidden border border-primary/30 text-foreground shadow-2xl transition-[width] ${activeMode === "flowcharts" ? "h-[min(82vh,760px)] w-[min(94vw,1040px)]" : "w-[min(92vw,540px)]"}`}
            style={mobileTop === null ? undefined : activeMode === "flowcharts"
              ? { position: "fixed", left: 12, right: 12, top: 12, bottom: 12, width: "auto", height: "auto", maxHeight: "none" }
              : { position: "fixed", left: 12, right: 12, top: mobileTop, width: "auto" }}
            role="dialog"
            aria-label="Notas pessoais"
          >
            <header className="rpg-modal-header flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <NotebookPen className="size-4 shrink-0 text-primary" />
                <h2 className="rpg-title truncate text-base font-bold text-foreground">Bloco de notas</h2>
              </div>
              <button type="button" onClick={() => void closeNotes()} className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground" aria-label="Fechar notas">
                <X className="size-4" />
              </button>
            </header>

            <nav className="flex shrink-0 border-b border-border/50 bg-black/20 p-1.5" aria-label="Ferramentas do bloco de notas">
              <button type="button" onClick={() => setActiveMode("notes")} className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${activeMode === "notes" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}><FileText className="size-4" /> Anotações</button>
              <button type="button" onClick={() => setActiveMode("flowcharts")} className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${activeMode === "flowcharts" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}><GitBranch className="size-4" /> Fluxogramas</button>
            </nav>

            {activeMode === "notes" && error && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                <span>{error}</span>
                <button type="button" onClick={() => setError("")} className="rounded-sm p-1 hover:bg-destructive/10" aria-label="Fechar aviso"><X className="size-3.5" /></button>
              </div>
            )}

            {activeMode === "flowcharts" ? (
              <PersonalFlowcharts campaignId={campaignId} />
            ) : loading ? (
              <div className="flex min-h-72 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : selected ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="rpg-themed-deep flex shrink-0 items-center gap-2 border-b border-border/50 bg-black/15 p-3">
                  <div className="relative min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setShowNoteList((value) => !value)}
                      disabled={saving}
                      className="flex h-9 w-full items-center rounded-sm border border-border/60 bg-background/70 py-0 pl-2.5 pr-10 text-left font-sans text-sm text-foreground outline-none transition-colors hover:border-primary/45 focus:border-primary/60"
                      aria-label="Selecionar anotação"
                      aria-expanded={showNoteList}
                      aria-haspopup="listbox"
                    >
                      <span className="truncate">{selected.title || "Sem título"}</span>
                    </button>
                    <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform ${showNoteList ? "rotate-180" : ""}`} />
                    <AnimatePresence>
                      {showNoteList && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.14 }}
                          className="rpg-themed-deep custom-scrollbar-sepia absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-52 overflow-y-auto rounded-sm border border-primary/30 bg-background p-1 shadow-2xl"
                          role="listbox"
                          aria-label="Anotações"
                        >
                          {notes.map((note) => (
                            <button
                              key={note.id}
                              type="button"
                              onClick={() => void selectNote(note.id)}
                              className={`flex min-h-9 w-full items-center border-l-2 px-3 py-2 text-left font-sans text-sm transition-colors ${note.id === selectedId ? "border-primary bg-primary/15 text-foreground" : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
                              role="option"
                              aria-selected={note.id === selectedId}
                            >
                              <span className="truncate">{note.title || "Sem título"}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button type="button" onClick={() => void createNote()} disabled={saving} className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground disabled:opacity-50" aria-label="Nova anotação" title="Nova anotação">
                    <Plus className="size-4" />
                  </button>
                  <button type="button" onClick={() => void deleteCurrent()} disabled={saving} className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label="Excluir anotação" title="Excluir anotação">
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="shrink-0 border-b border-border/50 bg-transparent px-4 py-3 font-sans text-base font-bold text-foreground outline-none placeholder:text-muted-foreground focus:bg-black/10"
                  placeholder="Título da anotação"
                />
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  maxLength={30000}
                  className="custom-scrollbar-sepia min-h-64 flex-1 resize-none bg-transparent px-4 py-4 font-sans text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:bg-black/5 sm:min-h-72"
                  placeholder="Escreva aqui..."
                  autoFocus
                />

              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <span className="text-sm">Nenhuma anotação</span>
                <Button onClick={() => void createNote()} disabled={saving} size="sm" className="gap-2"><Plus className="size-4" /> Criar anotação</Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
