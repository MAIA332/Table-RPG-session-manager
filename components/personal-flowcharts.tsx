"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Check, ChevronDown, GitBranch, Link2, Loader2, Minus, Plus, Trash2, Unlink, Workflow, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/client"
import type { FlowchartNode, PersonalFlowchart } from "@/lib/types"

const CANVAS_WIDTH = 2400
const CANVAS_HEIGHT = 1600
const NODE_WIDTH = 184
const NODE_HEIGHT = 104
const colors: NonNullable<FlowchartNode["color"]>[] = ["bronze", "blue", "green", "red", "purple"]

export function PersonalFlowcharts({ campaignId }: { campaignId: string }) {
  const [flowcharts, setFlowcharts] = useState<PersonalFlowchart[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chart, setChart] = useState<PersonalFlowchart | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState("")
  const [view, setView] = useState({ x: 24, y: 24, zoom: 1 })
  const [panning, setPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef(view)
  const chartRef = useRef<PersonalFlowchart | null>(null)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const copiedNodeRef = useRef<FlowchartNode | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)

  useEffect(() => { chartRef.current = chart }, [chart])
  useEffect(() => { viewRef.current = view }, [view])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const current = viewRef.current
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const worldX = (pointerX - current.x) / current.zoom
      const worldY = (pointerY - current.y) / current.zoom
      const factor = Math.exp(-event.deltaY * 0.0015)
      const zoom = Math.max(0.4, Math.min(2, current.zoom * factor))
      const next = {
        x: pointerX - worldX * zoom,
        y: pointerY - worldY * zoom,
        zoom,
      }
      viewRef.current = next
      setView(next)
    }
    viewport.addEventListener("wheel", handleWheel, { passive: false })
    return () => viewport.removeEventListener("wheel", handleWheel)
  }, [loading, selectedId])

  useEffect(() => {
    setLoading(true)
    apiFetch<{ flowcharts: PersonalFlowchart[] }>(`/api/campaigns/${campaignId}/notes/flowcharts`)
      .then((response) => {
        const items = [...(response.flowcharts || [])].sort((a, b) => b.updatedAt - a.updatedAt)
        setFlowcharts(items)
        setSelectedId(items[0]?.id || null)
        setChart(items[0] || null)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar os fluxogramas."))
      .finally(() => setLoading(false))
  }, [campaignId])

  const selectedNode = useMemo(() => chart?.nodes.find((node) => node.id === selectedNodeId) || null, [chart, selectedNodeId])

  function updateView(next: { x: number; y: number; zoom: number }) {
    viewRef.current = next
    setView(next)
  }

  function resetView() {
    updateView({ x: 24, y: 24, zoom: 1 })
  }

  function updateLocal(next: PersonalFlowchart) {
    chartRef.current = next
    setChart(next)
    setFlowcharts((current) => current.map((entry) => entry.id === next.id ? next : entry))
    setDirty(true)
  }

  function persist(next: PersonalFlowchart) {
    updateLocal(next)
    setDirty(false)
    setSaving(true)
    setError("")
    const request = saveQueueRef.current
      .catch(() => undefined)
      .then(() => apiFetch<{ flowchart: PersonalFlowchart }>(`/api/campaigns/${campaignId}/notes/flowcharts`, {
        method: "PATCH",
        body: JSON.stringify(next),
      }))
    saveQueueRef.current = request
    request.catch((reason) => {
      setDirty(true)
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o fluxograma.")
    }).finally(() => {
      if (saveQueueRef.current === request) setSaving(false)
    })
  }

  async function createFlowchart() {
    setSaving(true)
    setError("")
    try {
      const response = await apiFetch<{ flowchart: PersonalFlowchart }>(`/api/campaigns/${campaignId}/notes/flowcharts`, {
        method: "POST",
        body: JSON.stringify({ title: "Novo fluxograma" }),
      })
      setFlowcharts((current) => [response.flowchart, ...current])
      setSelectedId(response.flowchart.id)
      setChart(response.flowchart)
      setSelectedNodeId(null)
      setShowList(false)
      setDirty(false)
      resetView()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o fluxograma.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteFlowchart() {
    if (!chart || saving || !window.confirm(`Excluir o fluxograma "${chart.title}"?`)) return
    setSaving(true)
    try {
      await apiFetch(`/api/campaigns/${campaignId}/notes/flowcharts`, { method: "DELETE", body: JSON.stringify({ id: chart.id }) })
      const remaining = flowcharts.filter((entry) => entry.id !== chart.id)
      setFlowcharts(remaining)
      setSelectedId(remaining[0]?.id || null)
      setChart(remaining[0] || null)
      setSelectedNodeId(null)
      setDirty(false)
      resetView()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir o fluxograma.")
    } finally {
      setSaving(false)
    }
  }

  function selectFlowchart(id: string) {
    const next = flowcharts.find((entry) => entry.id === id)
    if (!next) return
    setSelectedId(id)
    setChart(next)
    setSelectedNodeId(null)
    setConnectingFrom(null)
    setShowList(false)
    setDirty(false)
    resetView()
  }

  function addNode(x?: number, y?: number) {
    if (!chart) return
    const viewport = viewportRef.current
    const currentView = viewRef.current
    const defaultX = viewport
      ? (viewport.clientWidth / 2 - currentView.x) / currentView.zoom - NODE_WIDTH / 2
      : 80
    const defaultY = viewport
      ? (viewport.clientHeight / 2 - currentView.y) / currentView.zoom - NODE_HEIGHT / 2
      : 80
    const node: FlowchartNode = {
      id: crypto.randomUUID(),
      text: "Novo acontecimento",
      x: Math.max(16, Math.min(CANVAS_WIDTH - NODE_WIDTH - 16, x ?? defaultX)),
      y: Math.max(16, Math.min(CANVAS_HEIGHT - NODE_HEIGHT - 16, y ?? defaultY)),
      color: "bronze",
    }
    persist({ ...chart, nodes: [...chart.nodes, node] })
    setSelectedNodeId(node.id)
  }

  function deleteSelectedNode() {
    if (!chart || !selectedNodeId) return
    persist({
      ...chart,
      nodes: chart.nodes.filter((node) => node.id !== selectedNodeId),
      edges: chart.edges.filter((edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId),
    })
    setSelectedNodeId(null)
    setConnectingFrom(null)
  }

  function copySelectedNode() {
    const current = chartRef.current
    const node = current?.nodes.find((entry) => entry.id === selectedNodeId)
    if (!node) return false
    copiedNodeRef.current = { ...node }
    return true
  }

  function pasteCopiedNode() {
    const current = chartRef.current
    const copied = copiedNodeRef.current
    if (!current || !copied) return
    const node: FlowchartNode = {
      ...copied,
      id: crypto.randomUUID(),
      x: Math.min(CANVAS_WIDTH - NODE_WIDTH, copied.x + 32),
      y: Math.min(CANVAS_HEIGHT - NODE_HEIGHT, copied.y + 32),
    }
    copiedNodeRef.current = { ...node }
    persist({ ...current, nodes: [...current.nodes, node] })
    setSelectedNodeId(node.id)
    setConnectingFrom(null)
  }

  function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select, [contenteditable='true']")) return

    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      if (copySelectedNode()) event.preventDefault()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === "x") {
      if (!copySelectedNode()) return
      event.preventDefault()
      deleteSelectedNode()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === "v") {
      if (!copiedNodeRef.current) return
      event.preventDefault()
      pasteCopiedNode()
      return
    }
    if (event.key === "Delete" && selectedNodeId) {
      event.preventDefault()
      deleteSelectedNode()
    }
  }

  function unlinkSelectedNode() {
    if (!chart || !selectedNodeId) return
    persist({
      ...chart,
      edges: chart.edges.filter(
        (edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId,
      ),
    })
  }

  function chooseNode(nodeId: string) {
    setSelectedNodeId(nodeId)
    if (!chart || !connectingFrom) return
    if (connectingFrom === nodeId) {
      setConnectingFrom(null)
      return
    }
    const exists = chart.edges.some((edge) => edge.from === connectingFrom && edge.to === nodeId)
    if (!exists) persist({ ...chart, edges: [...chart.edges, { id: crypto.randomUUID(), from: connectingFrom, to: nodeId }] })
    setConnectingFrom(null)
  }

  function pointerPosition(event: { clientX: number; clientY: number }) {
    const viewport = viewportRef.current
    const rect = viewport?.getBoundingClientRect()
    const currentView = viewRef.current
    return {
      x: (event.clientX - (rect?.left || 0) - currentView.x) / currentView.zoom,
      y: (event.clientY - (rect?.top || 0) - currentView.y) / currentView.zoom,
    }
  }

  function startDrag(event: React.PointerEvent, node: FlowchartNode) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPosition(event)
    dragRef.current = { id: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y }
    setSelectedNodeId(node.id)
  }

  function dragNode(event: React.PointerEvent) {
    const drag = dragRef.current
    const current = chartRef.current
    if (!drag || !current) return
    const point = pointerPosition(event)
    updateLocal({
      ...current,
      nodes: current.nodes.map((node) => node.id === drag.id ? {
        ...node,
        x: Math.max(0, Math.min(CANVAS_WIDTH - NODE_WIDTH, point.x - drag.offsetX)),
        y: Math.max(0, Math.min(CANVAS_HEIGHT - NODE_HEIGHT, point.y - drag.offsetY)),
      } : node),
    })
  }

  function finishDrag() {
    if (!dragRef.current || !chartRef.current) return
    dragRef.current = null
    persist(chartRef.current)
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest(".flowchart-node, button, input, textarea, select")) return
    const current = viewRef.current
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: current.x,
      y: current.y,
    }
    setPanning(true)
  }

  function panCanvas(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    updateView({
      ...viewRef.current,
      x: pan.x + event.clientX - pan.clientX,
      y: pan.y + event.clientY - pan.clientY,
    })
  }

  function finishPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return
    panRef.current = null
    setPanning(false)
  }

  if (loading) return <div className="flex min-h-80 flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>

  return <div className="flex min-h-0 flex-1 flex-col">
    {error && <div className="flex items-center justify-between border-b border-red-500/30 bg-red-950/30 px-4 py-2 text-xs text-red-200"><span>{error}</span><button onClick={() => setError("")}><X className="size-4" /></button></div>}
    {!chart ? <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground"><GitBranch className="size-10 opacity-40" /><div><strong className="block text-foreground">Crie seu primeiro fluxograma</strong><span className="text-sm">Organize acontecimentos, pistas, personagens ou qualquer parte da história.</span></div><Button onClick={() => void createFlowchart()} className="gap-2"><Plus className="size-4" /> Novo fluxograma</Button></div> : <>
      <div className="rpg-themed-deep flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 bg-black/15 p-3">
        <div className="relative min-w-44 flex-1 sm:max-w-72">
          <button type="button" onClick={() => setShowList((value) => !value)} className="flex h-9 w-full items-center rounded-sm border border-border/60 bg-background/70 px-3 pr-9 text-left text-sm"><span className="truncate">{chart.title}</span><ChevronDown className={`absolute right-3 size-4 text-muted-foreground transition-transform ${showList ? "rotate-180" : ""}`} /></button>
          {showList && <div className="rpg-themed-deep absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-52 overflow-y-auto rounded-sm border border-primary/30 bg-background p-1 shadow-2xl">{flowcharts.map((entry) => <button key={entry.id} onClick={() => selectFlowchart(entry.id)} className={`block w-full truncate rounded-sm px-3 py-2 text-left text-sm ${entry.id === selectedId ? "bg-primary/15 text-primary" : "hover:bg-white/5"}`}>{entry.title}</button>)}</div>}
        </div>
        <Button size="sm" variant="outline" onClick={() => void createFlowchart()} title="Novo fluxograma"><Plus className="size-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => void deleteFlowchart()} title="Excluir fluxograma"><Trash2 className="size-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => addNode()} className="gap-2"><Workflow className="size-4" /> Novo bloco</Button>
        <Button size="sm" variant="outline" disabled={!selectedNodeId} onClick={deleteSelectedNode} className="gap-2" title="Excluir bloco"><Minus className="size-4" /> Excluir bloco</Button>
        <Button size="sm" variant={connectingFrom ? "magical" : "outline"} disabled={!selectedNodeId} onClick={() => setConnectingFrom((current) => current ? null : selectedNodeId)} title={connectingFrom ? "Cancelar conexão" : "Conectar bloco"} aria-label={connectingFrom ? "Cancelar conexão" : "Conectar bloco"}><Link2 className="size-4" /></Button>
        <Button size="sm" variant="outline" disabled={!selectedNodeId || !chart.edges.some((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId)} onClick={unlinkSelectedNode} title="Desconectar bloco" aria-label="Desconectar bloco"><Unlink className="size-4" /></Button>
        <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">{saving ? <><Loader2 className="size-3 animate-spin" /> Salvando</> : dirty ? "Alterações pendentes" : <><Check className="size-3 text-green-400" /> Salvo</>}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-black/10 px-3 py-2">
        <input value={chart.title} maxLength={120} onChange={(event) => updateLocal({ ...chart, title: event.target.value })} onBlur={() => chartRef.current && persist(chartRef.current)} className="min-w-0 flex-1 rounded-sm border border-border/50 bg-black/25 px-3 py-1.5 text-sm font-bold" aria-label="Título do fluxograma" />
        {selectedNode && <div className="flex items-center gap-1" title="Cor do bloco">{colors.map((color) => <button key={color} type="button" data-flow-color={color} className={`flowchart-color size-5 rounded-full border-2 ${selectedNode.color === color ? "border-white" : "border-transparent"}`} onClick={() => persist({ ...chart, nodes: chart.nodes.map((node) => node.id === selectedNode.id ? { ...node, color } : node) })} aria-label={`Cor ${color}`} />)}</div>}
      </div>
      {connectingFrom && <div className="shrink-0 bg-primary/15 px-4 py-2 text-center text-xs text-primary">Clique no bloco que receberá a seta. Clique novamente no bloco inicial para cancelar.</div>}
      <div
        ref={viewportRef}
        className={`flowchart-viewport relative min-h-0 flex-1 touch-none overflow-hidden bg-[#100c09] ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={startPan}
        onPointerMove={panCanvas}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
        onKeyDown={handleCanvasKeyDown}
        tabIndex={0}
        aria-label="Área do fluxograma"
      >
        <div
          className="flowchart-canvas absolute left-0 top-0"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
          onDoubleClick={(event) => { if (event.target !== event.currentTarget) return; const point = pointerPosition(event); addNode(point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2) }}
        >
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true"><defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker></defs>{chart.edges.map((edge) => {
            const from = chart.nodes.find((node) => node.id === edge.from)
            const to = chart.nodes.find((node) => node.id === edge.to)
            if (!from || !to) return null
            const x1 = from.x + NODE_WIDTH / 2, y1 = from.y + NODE_HEIGHT / 2, x2 = to.x + NODE_WIDTH / 2, y2 = to.y + NODE_HEIGHT / 2
            const bend = Math.max(70, Math.abs(x2 - x1) * .45)
            return <path key={edge.id} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} className="flowchart-edge" markerEnd="url(#flow-arrow)" />
          })}</svg>
          {chart.nodes.map((node) => <div key={node.id} data-color={node.color || "bronze"} className={`flowchart-node absolute flex flex-col overflow-hidden rounded-md border shadow-xl ${selectedNodeId === node.id ? "is-selected" : ""} ${connectingFrom === node.id ? "is-connecting" : ""}`} style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }} onClick={(event) => { event.stopPropagation(); chooseNode(node.id) }}>
            <button type="button" className="flowchart-node-handle flex h-7 shrink-0 cursor-grab items-center justify-between px-2 text-[9px] font-black uppercase tracking-widest active:cursor-grabbing" onPointerDown={(event) => startDrag(event, node)} onPointerMove={dragNode} onPointerUp={finishDrag} onPointerCancel={finishDrag}><span className="flex items-center gap-1"><GitBranch className="size-3" /> Bloco</span>{connectingFrom === node.id && <ArrowRight className="size-3 animate-pulse" />}</button>
            <textarea value={node.text} maxLength={500} onChange={(event) => updateLocal({ ...chart, nodes: chart.nodes.map((entry) => entry.id === node.id ? { ...entry, text: event.target.value } : entry) })} onBlur={() => chartRef.current && persist(chartRef.current)} onClick={(event) => { event.stopPropagation(); setSelectedNodeId(node.id) }} className="custom-scrollbar-sepia min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-5 text-foreground outline-none" aria-label="Texto do bloco" />
          </div>)}
          {chart.nodes.length === 0 && <button type="button" onClick={() => addNode()} className="absolute left-32 top-28 flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-black/35 px-5 py-4 text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary"><Workflow className="size-5" /> Adicionar primeiro bloco</button>}
        </div>
        <button type="button" onClick={resetView} className="absolute bottom-3 right-3 rounded-sm border border-border/60 bg-background/90 px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground shadow-lg hover:border-primary/50 hover:text-primary" title="Restaurar posição e zoom">
          {Math.round(view.zoom * 100)}%
        </button>
      </div>
    </>}
  </div>
}
