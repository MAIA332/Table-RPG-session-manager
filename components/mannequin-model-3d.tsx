"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Rotate3D, Shirt, UserRound } from "lucide-react"
import { MANNEQUIN_ZONES, type MannequinItem, type MannequinPlacement, type MannequinZone } from "@/lib/equipment-mannequin"

/**
 * Renderização procedural 3D em Canvas 2D. A geometria é gerada uma vez por pose;
 * cada frame apenas rotaciona/projeta vértices já preparados. Não há malha para
 * cada equipamento/camada: a camada isolada é indicada por pinos e etiquetas.
 */
type Vec = readonly [number, number, number]
type Pose = "relaxed" | "t"
type BodyPart = { zone: MannequinZone; center: Vec; radii: Vec; tone: number }
type Face = { a: number; b: number; c: number; color: string }
type Mesh = { vertices: Vec[]; faces: Face[] }
type Projection = { x: number; y: number; depth: number }
type MarkerGroup = { zone: MannequinZone; items: MannequinItem[] }
type Marker = MarkerGroup & { point: Projection; left: boolean }
type Leader = { zone: MannequinZone; x1: number; y1: number; x2: number; y2: number; color: string }

const ZONE_LABELS = new Map<MannequinZone, string>(MANNEQUIN_ZONES.map(zone => [zone.id, zone.name] as const))
const PIN_TONES = { weapon: "#ed9785", armor: "#dcb777", shield: "#8bb9cd", accessory: "#c0a3e9" } as const
const BODY: BodyPart[] = [
  { zone: "head", center: [0, 2.18, 0], radii: [.245,.30,.225], tone: 1 },
  { zone: "neck", center: [0, 1.88, 0], radii: [.115,.16,.106], tone: 0 },
  { zone: "shoulders", center: [0, 1.73, 0], radii: [.45,.175,.225], tone: 0 },
  { zone: "chest", center: [0, 1.43, 0], radii: [.35,.43,.235], tone: 0 },
  { zone: "abdomen", center: [0, 1.07, 0], radii: [.29,.29,.205], tone: 1 },
  { zone: "waist", center: [0, .86, 0], radii: [.29,.15,.207], tone: 0 },
  { zone: "hips", center: [0,.72,0], radii: [.33,.24,.235], tone: 1 },
  { zone: "leftUpperArm", center: [-.49, 1.43, 0], radii: [.15,.37,.153], tone: 0 },
  { zone: "rightUpperArm", center: [.49,1.43,0], radii: [.15,.37,.153], tone: 0 },
  { zone: "leftForearm", center: [-.55,.99,.02], radii: [.12,.30,.12], tone: 1 },
  { zone: "rightForearm", center: [.55,.99,.02], radii: [.12,.30,.12], tone: 1 },
  { zone: "leftHand", center: [-.56,.66,.05], radii: [.112,.19,.085], tone: 0 },
  { zone: "rightHand", center: [.56,.66,.05], radii: [.112,.19,.085], tone: 0 },
  { zone: "leftThigh", center: [-.19,.31,0], radii: [.18,.45,.19], tone: 0 },
  { zone: "rightThigh", center: [.19,.31,0], radii: [.18,.45,.19], tone: 0 },
  { zone: "leftShin", center: [-.195,-.42,.02], radii: [.137,.38,.145], tone: 1 },
  { zone: "rightShin", center: [.195,-.42,.02], radii: [.137,.38,.145], tone: 1 },
  { zone: "leftFoot", center: [-.205,-.86,.12], radii: [.16,.12,.28], tone: 0 },
  { zone: "rightFoot", center: [.205,-.86,.12], radii: [.16,.12,.28], tone: 0 },
  { zone: "face", center: [0,2.18,.195], radii: [.17,.20,.045], tone: 0 },
  { zone: "back", center: [0,1.38,-.21], radii: [.31,.43,.06], tone: 0 },
]
const T_ARMS: Record<string, { center: Vec; radii: Vec }> = {
  leftUpperArm: {center: [-.65,1.70,0], radii: [.32,.145,.15]},
  rightUpperArm: {center: [.65,1.70,0], radii: [.32,.145,.15]},
  leftForearm: {center: [-1.04,1.70,0], radii: [.275,.12,.115]},
  rightForearm: {center: [1.04,1.70,0], radii: [.275,.12,.115]},
  leftHand: {center: [-1.36,1.70,0], radii: [.145,.11,.085]},
  rightHand: {center: [1.36,1.70,0], radii: [.145,.11,.085]},
}
const PARTS: Record<Pose, BodyPart[]> = {
  relaxed: BODY,
  t: BODY.map(part => T_ARMS[part.zone] ? { ...part, ...T_ARMS[part.zone] } : part),
}
const ANCHORS: Record<Pose, Map<MannequinZone, BodyPart>> = {
  relaxed: new Map(PARTS.relaxed.map(part => [part.zone, part])),
  t: new Map(PARTS.t.map(part => [part.zone, part])),
}
const latSteps = 6
const lonSteps = 11
function meshForPose(parts: BodyPart[]): Mesh {
  const vertices: Vec[] = []
  const faces: Face[] = []
  const rgb = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  for (const part of parts) {
    if (part.zone === "face" || part.zone === "back") continue
    const start = vertices.length
    for (let i = 0; i <= latSteps; i++) {
      const phi = Math.PI * i / latSteps
      for (let j = 0; j <= lonSteps; j++) {
        const theta = j * Math.PI * 2 / lonSteps
        vertices.push([
          part.center[0] + part.radii[0] * Math.sin(phi) * Math.cos(theta),
          part.center[1] + part.radii[1] * Math.cos(phi),
          part.center[2] + part.radii[2] * Math.sin(phi) * Math.sin(theta),
        ])
      }
    }
    for (let i = 0; i < latSteps; i++) for (let j = 0; j < lonSteps; j++) {
      const a = start + i * (lonSteps + 1) + j
      const b = a + lonSteps + 1
      for (const [u,v,w] of [[a,b,b+1], [a,b+1,a+1]]) {
        const p = vertices[u], q = vertices[v], r = vertices[w]
        const ux=q[0]-p[0],uy=q[1]-p[1],uz=q[2]-p[2]
        const vx=r[0]-p[0],vy=r[1]-p[1],vz=r[2]-p[2]
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx
        const len=Math.hypot(nx,ny,nz)||1
        const light = Math.max(0, (nx*-.35+ny*.75+nz*.65)/len)
        const glow=.61+light*.30 + (part.tone ? .045 : 0)
        faces.push({ a:u,b:v,c:w, color:`rgb(${rgb(110*glow)}, ${rgb(126*glow)}, ${rgb(148*glow)})` })
      }
    }
  }
  return {vertices,faces}
}
const CACHED_MESHES: Record<Pose, Mesh> = {
  relaxed: meshForPose(PARTS.relaxed),
  t: meshForPose(PARTS.t),
}
function rotate([x,y,z]: Vec, yaw: number, pitch: number): Vec {
  const co=Math.cos(yaw),si=Math.sin(yaw)
  const u=x*co+z*si, v=z*co-x*si
  return [u,y*Math.cos(pitch)-v*Math.sin(pitch),y*Math.sin(pitch)+v*Math.cos(pitch)]
}
function project([x,y,z]: Vec, width: number, height: number, zoom: number, pose: Pose): Projection {
  const scale=Math.min(width/(pose==="t"?3.9:2.85),height/4.45)*zoom
  const perspective=5.9/(5.9-z)
  return {x:width/2+x*scale*perspective,y:height/2+.22*scale-y*scale*perspective,depth:z}
}
function clamp(n: number, a: number, b: number) {return Math.max(a,Math.min(b,n))}
function markersLayout(groups: MarkerGroup[], yaw: number, pitch: number, zoom: number, pose: Pose, width: number, height: number): Marker[] {
  let leftCount = 0, rightCount = 0
  return groups.map(group => {
    const part = ANCHORS[pose].get(group.zone)!
    const point = project(rotate(part.center, yaw, pitch), width, height, zoom, pose)
    // Regiões próximas do eixo central podem usar qualquer coluna. Balancear
    // evita concentrar todas as legendas num único lado do manequim.
    const nearCenter = Math.abs(point.x - width/2) < width * .115
    const left = width < 480 ? false : nearCenter ? leftCount <= rightCount : point.x < width/2
    if (left) leftCount++; else rightCount++
    return { ...group, point, left }
  })
}

export function MannequinModel3D({placements,items,selected,selectedKey,activeLayer,onZone,onSelectItem}:{
  placements: MannequinPlacement[]
  items: MannequinItem[]
  selected: MannequinZone
  selectedKey?: string | null
  activeLayer: number
  onZone: (zone:MannequinZone)=>void
  onSelectItem: (key:string)=>void
}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const root=useRef<HTMLDivElement>(null)
  const orbit=useRef({yaw:-.26,pitch:.07,zoom:1})
  const gesture=useRef<{x:number;y:number,startX:number,startY:number,moved:boolean}|null>(null)
  const raf=useRef<number|null>(null)
  const resize=useRef({width:0,height:0})
  const [pose,setPose]=useState<Pose>("relaxed")
  const [markers,setMarkers]=useState<Marker[]>([])
  const [leaders,setLeaders]=useState<Leader[]>([])
  const labelCards=useRef(new Map<MannequinZone, HTMLDivElement>())
  const leftRail=useRef<HTMLDivElement>(null)
  const rightRail=useRef<HTMLDivElement>(null)
  const [expanded,setExpanded]=useState<MannequinZone|null>(null)
  const arrowId=useId().replace(/:/g,"")
  const byKey=useMemo(()=>new Map(items.map(item=>[item.key,item])),[items])
  const groups=useMemo(()=>{
    const grouped = new Map<MannequinZone,MannequinItem[]>()
    for (const placement of placements) {
      if (placement.layer !== activeLayer) continue
      const item=byKey.get(placement.key)
      if (!item) continue
      if (!grouped.has(placement.zone)) grouped.set(placement.zone,[])
      grouped.get(placement.zone)!.push(item)
    }
    return Array.from(grouped,([zone,located])=>({zone,items:located}))
  },[placements,byKey,activeLayer])

  // As etiquetas pertencem a duas colunas roláveis. Uma etiqueta expandida
  // ocupa espaço REAL no fluxo da coluna, empurrando suas vizinhas ao invés
  // de sobrepor ou ficar atrás delas. Linhas apontadoras usam as coordenadas
  // efetivas dos cartões depois do layout/scroll.
  const measureLeaders=useCallback(()=>{
    const outer=root.current?.getBoundingClientRect()
    if(!outer)return
    const next:Leader[]=[]
    for(const marker of markers){
      const card=labelCards.current.get(marker.zone)?.getBoundingClientRect()
      const rail=(marker.left?leftRail:rightRail).current?.getBoundingClientRect()
      if(!card||!rail)continue
      const edgeY=card.top+Math.min(card.height/2,22)
      if(edgeY<=rail.top+3||edgeY>=rail.bottom-3)continue
      next.push({zone:marker.zone,x1:marker.point.x,y1:marker.point.y,
        x2:(marker.left?card.right:card.left)-outer.left,y2:edgeY-outer.top,
        color:PIN_TONES[marker.items[0].category]})
    }
    setLeaders(previous=>{
      const signature=(arr:Leader[])=>arr.map(v=>`${v.zone}:${v.x1.toFixed(1)}:${v.y1.toFixed(1)}:${v.x2.toFixed(1)}:${v.y2.toFixed(1)}`).join('|')
      return signature(previous)===signature(next)?previous:next
    })
  },[markers])
  useLayoutEffect(()=>{measureLeaders()},[measureLeaders,expanded])
  const labelColumn=(left:boolean)=>markers.filter(marker=>marker.left===left).sort((a,b)=>a.point.y-b.point.y)

  const drawNow=useCallback(()=>{
    const element=canvas.current
    if (!element) return
    const context=element.getContext("2d",{alpha:true})
    if (!context) return
    const width=element.clientWidth,height=element.clientHeight
    if (!width||!height) return
    // Evita recriar o bitmap ao girar (era feito a cada pointermove).
    const dpr=Math.min(window.devicePixelRatio||1,1.5)
    const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr)
    if (element.width!==pixelWidth||element.height!==pixelHeight) {
      element.width=pixelWidth;element.height=pixelHeight
    }
    resize.current={width,height}
    context.setTransform(dpr,0,0,dpr,0,0)
    context.clearRect(0,0,width,height)
    const {yaw,pitch,zoom}=orbit.current
    const geometry=CACHED_MESHES[pose]
    const transformed=geometry.vertices.map(vertex=>rotate(vertex,yaw,pitch))
    const projected=transformed.map(vertex=>project(vertex,width,height,zoom,pose))
    const order=geometry.faces.map((face,index)=>({index,depth:(transformed[face.a][2]+transformed[face.b][2]+transformed[face.c][2])/3}))
    order.sort((a,b)=>a.depth-b.depth)
    const floor=project(rotate([0,-1.01,0],yaw,pitch),width,height,zoom,pose)
    const glow=context.createRadialGradient(floor.x,floor.y,4,floor.x,floor.y,Math.min(width*.28,220))
    glow.addColorStop(0,"rgba(210,170,103,.16)");glow.addColorStop(1,"rgba(210,170,103,0)")
    context.fillStyle=glow
    context.fillRect(floor.x-230,floor.y-150,460,300)
    for (const entry of order) {
      const face=geometry.faces[entry.index]
      const a=projected[face.a],b=projected[face.b],c=projected[face.c]
      context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.lineTo(c.x,c.y)
      context.closePath();context.fillStyle=face.color;context.fill()
    }
    // Destaque leve da região atual; não cria cascas que empilham armaduras.
    const target=ANCHORS[pose].get(selected)
    if(target) {
      const p=project(rotate(target.center,yaw,pitch),width,height,zoom,pose)
      context.beginPath();context.arc(p.x,p.y,8,0,Math.PI*2)
      context.fillStyle="rgba(249,202,115,.93)";context.fill()
      context.lineWidth=1.5;context.strokeStyle="rgba(255,248,230,.95)";context.stroke()
      context.beginPath();context.arc(p.x,p.y,17,0,Math.PI*2)
      context.strokeStyle="rgba(249,202,115,.32)";context.stroke()
    }
    setMarkers(markersLayout(groups,yaw,pitch,zoom,pose,width,height))
  },[groups,pose,selected])

  const drawRef=useRef(drawNow)
  drawRef.current=drawNow
  const schedule=useCallback(()=>{
    if(raf.current!==null) return
    raf.current=window.requestAnimationFrame(()=>{raf.current=null;drawRef.current()})
  },[])
  useEffect(()=>{schedule()},[drawNow,schedule])
  useEffect(()=>{
    const element=canvas.current
    if(!element) return
    const observer=new ResizeObserver(()=>schedule())
    observer.observe(element)
    return ()=>{observer.disconnect();if(raf.current!==null){cancelAnimationFrame(raf.current);raf.current=null}}
  },[schedule])

  function reset(yaw:number) {orbit.current={yaw,pitch:.07,zoom:1};schedule()}
  function pointerDown(event:React.PointerEvent<HTMLCanvasElement>) {
    gesture.current={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pointerMove(event:React.PointerEvent<HTMLCanvasElement>) {
    const active=gesture.current
    if(!active)return
    if(Math.abs(event.clientX-active.startX)+Math.abs(event.clientY-active.startY)>5)active.moved=true
    const dx=event.clientX-active.x,dy=event.clientY-active.y
    active.x=event.clientX;active.y=event.clientY
    if(!active.moved)return
    orbit.current.yaw+=dx*.008
    orbit.current.pitch=clamp(orbit.current.pitch+dy*.005,-.42,.65)
    schedule() // Um desenho por frame; sem setState em cada evento de ponteiro.
  }
  function pointerUp(event:React.PointerEvent<HTMLCanvasElement>) {
    const current=gesture.current
    if(!current)return
    if(!current.moved&&canvas.current) {
      const bounds=canvas.current.getBoundingClientRect()
      const x=event.clientX-bounds.left,y=event.clientY-bounds.top
      const {width,height}=resize.current
      const nearest=PARTS[pose].map(part=>({zone:part.zone,point:project(rotate(part.center,orbit.current.yaw,orbit.current.pitch),width,height,orbit.current.zoom,pose)}))
        .map(entry=>({...entry,distance:Math.hypot(entry.point.x-x,entry.point.y-y)}))
        .sort((a,b)=>a.distance-b.distance)[0]
      if(nearest&&nearest.distance<48)onZone(nearest.zone)
    }
    gesture.current=null
  }
  return <div ref={root} className="relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-primary/25 bg-background/45"
    style={{backgroundImage:"radial-gradient(ellipse at 51% 38%,color-mix(in srgb,var(--primary) 7%,transparent),transparent 52%),linear-gradient(to bottom,transparent 97%,color-mix(in srgb,var(--primary) 5%,transparent))"}}>
    <canvas ref={canvas} aria-label="Manequim tridimensional. Arraste para girar, clique numa região e use a roda para aproximar." role="img"
      className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{gesture.current=null}}
      onWheel={event=>{orbit.current.zoom=clamp(orbit.current.zoom-event.deltaY*.001,.72,1.65);schedule()}} />
    {leaders.length>0 && <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${resize.current.width} ${resize.current.height}`} preserveAspectRatio="none">
      <defs><marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 Z" fill="currentColor" /></marker></defs>
      {leaders.map(line=><g key={line.zone} style={{color:line.color}}>
        <path d={`M ${line.x2} ${line.y2} Q ${(line.x2+line.x1)/2} ${line.y2} ${line.x1} ${line.y1}`} fill="none" stroke="currentColor" strokeWidth="1.3" strokeOpacity=".8" markerEnd={`url(#${arrowId})`}/>
        <circle cx={line.x1} cy={line.y1} r="3" fill={line.color} stroke="#140e09" strokeWidth="1.2" />
      </g>)}
    </svg>}
    {([true,false] as const).map(left=><div key={left?"left":"right"} ref={left?leftRail:rightRail}
      onScroll={measureLeaders}
      aria-label={left?"Itens do lado esquerdo":"Itens do lado direito"}
      className={`absolute z-30 top-[64px] bottom-[150px] w-[179px] space-y-2 overflow-y-auto overscroll-contain p-0.5 [scrollbar-color:rgba(170,128,68,.45)_transparent] ${left?"left-2":"right-2"}`}>
      {labelColumn(left).map(marker=>{
        const open=expanded===marker.zone
        const active=marker.items.some(item=>item.key===selectedKey)
        return <div key={marker.zone} ref={element=>{if(element)labelCards.current.set(marker.zone,element);else labelCards.current.delete(marker.zone)}}
          className={`relative w-[173px] shrink-0 rounded-lg border text-left shadow-[0_8px_25px_rgba(0,0,0,.4)] backdrop-blur-md ${open?"border-primary bg-card":""} ${!open&&(active?"border-primary/75 bg-card/95":"border-border/65 bg-background/90")}`}>
          <button type="button" aria-expanded={open} aria-label={`${ZONE_LABELS.get(marker.zone)}: ${marker.items.map(item=>item.name).join(", ")}. ${open?"Recolher":"Expandir"}`}
            onClick={event=>{
              setExpanded(old=>old===marker.zone?null:marker.zone)
              onSelectItem(marker.items[0].key)
              const card=event.currentTarget.parentElement
              if(!open&&card)requestAnimationFrame(()=>card.scrollIntoView({block:"nearest",behavior:"smooth"}))
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="size-1.5 shrink-0 rounded-full" style={{background:PIN_TONES[marker.items[0].category]}}/>
            <span className="min-w-0 flex-1"><span className="block truncate text-primary/90">{ZONE_LABELS.get(marker.zone)}</span><span className="block truncate text-foreground">{marker.items[0].name}{marker.items.length>1?` +${marker.items.length-1}`:""}</span></span>
            <ChevronDown className={`size-3 shrink-0 text-muted-foreground transition-transform ${open?"rotate-180":""}`}/>
          </button>
          {open&&<div className="max-h-40 overflow-y-auto border-t border-border/45 p-1.5">
            {marker.items.map(item=><button key={item.key} type="button" onClick={()=>onSelectItem(item.key)} className={`block w-full rounded-md px-2 py-1.5 text-left text-[10px] hover:bg-primary/10 ${item.key===selectedKey?"text-primary":"text-foreground"}`}>{item.name}<span className="block text-[9px] text-muted-foreground">Camada {activeLayer+1} · {ZONE_LABELS.get(marker.zone)}</span></button>)}
          </div>}
        </div>
      })}
    </div>)}
    {groups.length===0&&<div className="pointer-events-none absolute left-1/2 top-[48%] -translate-x-1/2 rounded-lg border border-border/40 bg-background/80 px-3 py-2 text-[10px] text-muted-foreground">Nenhuma peça nesta camada</div>}
    <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/85 p-1 backdrop-blur-md">
      <button type="button" onClick={()=>setPose("relaxed")} aria-pressed={pose==="relaxed"} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold ${pose==="relaxed"?"bg-primary/20 text-primary":"text-muted-foreground hover:bg-primary/10"}`}><UserRound className="size-3"/>Normal</button>
      <button type="button" onClick={()=>setPose("t")} aria-pressed={pose==="t"} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold ${pose==="t"?"bg-primary/20 text-primary":"text-muted-foreground hover:bg-primary/10"}`}><Shirt className="size-3"/>T-pose</button>
    </div>
    <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-border/60 bg-background/85 p-1 backdrop-blur-md">
      <button type="button" className="rounded-md px-2.5 py-1.5 text-[10px] font-bold hover:bg-primary/15" onClick={()=>reset(0)}>Frente</button>
      <button type="button" className="rounded-md px-2.5 py-1.5 text-[10px] font-bold hover:bg-primary/15" onClick={()=>reset(Math.PI)}>Costas</button>
    </div>
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-background/70 px-2 py-1 text-[10px] text-muted-foreground"><Rotate3D className="size-3"/>Arraste para girar · roda para zoom</div>
  </div>
}
