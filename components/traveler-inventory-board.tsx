'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Backpack, Grip, Package, Search, Settings2, RotateCcw, ArrowLeftRight, Box, Shield, ScrollText } from 'lucide-react'
import { itemImageUrl } from '@/lib/item-image'
import { indexedInventory, reconcileInventorySlots, swapInventorySlots } from '@/lib/inventory-slot-layout'
import { useControllerActions } from '@/lib/input/use-controller-actions'
import { useController } from './controller/controller-provider'
import { ControllerGlyph } from './controller/controller-glyph'

interface Props {
  characterId: string
  campaignId: string
  equipment: string[]
  catalog: any[]
  freeKg: number
  maxKg: number
  onManage: (index: number) => void
}
const groups = ['Todos', 'Armas', 'Proteção', 'Consumíveis', 'Outros'] as const
function groupOf(item: any): typeof groups[number] {
  const type = String(item?.type || '').toLocaleLowerCase('pt-BR')
  if (/arma|weapon|cajado|espada|lança|arco|adaga|firearm/.test(type)) return 'Armas'
  if (/armadura|escudo|shield|armor|acess[oó]rio|accessory|proteção/.test(type)) return 'Proteção'
  if (/consum|potion|poção|alimento|food/.test(type)) return 'Consumíveis'
  return 'Outros'
}
export function TravelerInventoryBoard({characterId,campaignId,equipment,catalog,freeKg,maxKg,onManage}:Props) {
  const {active} = useController()
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!active)return
    const frame=requestAnimationFrame(()=>gridRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({preventScroll:true}))
    return ()=>cancelAnimationFrame(frame)
  },[active])
  const items=useMemo(()=>indexedInventory(equipment),[equipment])
  const key = `otms-inventory-slots:v2:${campaignId}:${characterId}`
  const [stored,setStored]=useState<(string|null)[]>([])
  const [ready,setReady]=useState(false)
  const [selected,setSelected]=useState<string|null>(null)
  const [picked,setPicked]=useState<number|null>(null)
  const [organizing,setOrganizing]=useState(false)
  const [group,setGroup]=useState<typeof groups[number]>('Todos')
  const [search,setSearch]=useState('')
  useEffect(()=>{
    try {const saved=JSON.parse(localStorage.getItem(key)||'[]');setStored(Array.isArray(saved)?saved.filter((k:unknown)=>k===null||typeof k==='string').slice(0,256):[])}
    catch{setStored([])}
    setSelected(null);setPicked(null);setOrganizing(false);setReady(true)
  },[key])
  const slots=useMemo(()=>reconcileInventorySlots(stored,items),[stored,items])
  const slotKey=slots.join('|')
  useEffect(()=>{if(!ready)return;try{localStorage.setItem(key,JSON.stringify(slots))}catch{}},[key,slotKey,ready])
  const byKey=useMemo(()=>new Map(items.map(item=>[item.key,item])),[items])
  const byCatalog=useMemo(()=>new Map(catalog.map(item=>[item.id,item])),[catalog])
  const chosen=selected?byKey.get(selected):undefined
  const detail=chosen?byCatalog.get(chosen.id):undefined
  const stats=useMemo(()=>{
    const counts = new Map<string,number>()
    items.forEach(item=>counts.set(item.id,(counts.get(item.id)||0)+1))
    return counts
  },[items])
  function selectSlot(index:number) {
    const itemKey=slots[index]
    if(organizing) {
      if(picked === null) { if (itemKey) setPicked(index); return }
      setStored(swapInventorySlots(slots,picked,index));setPicked(null)
      if(itemKey) setSelected(itemKey)
      return
    }
    setSelected(itemKey||null)
  }
  useControllerActions({'ui.back':()=>{if(picked!==null){setPicked(null);return true}return false}}, {enabled:active,priority:250})
  return <div className="otms-inventory-board">
    <aside className="otms-inventory-categories">
      <div className="otms-inventory-category-title"><Backpack size={21}/> MOCHILA DO VIAJANTE</div>
      {groups.map(name=><button type="button" key={name} className="otms-inventory-category" data-active={group===name} onClick={()=>{setGroup(name);setPicked(null)}}>{name==='Armas'?<Grip size={17}/>:name==='Proteção'?<Shield size={17}/>:name==='Consumíveis'?<ScrollText size={17}/>:<Box size={17}/>} {name}</button>)}
      <div className="otms-inventory-load"><span>CARGA DISPONÍVEL</span><strong>{freeKg} / {maxKg} kg</strong><small>Os slots são visuais; movimentá-los não transfere nem consome itens.</small></div>
    </aside>
    <main className="otms-inventory-grid-area">
      <div className="otms-inventory-tools">
        <label className="otms-inventory-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar equipamento..." aria-label="Buscar itens da mochila"/></label>
        <button type="button" data-active={organizing} className="otms-inventory-organize" onClick={()=>{setOrganizing(v=>!v);setPicked(null);setGroup('Todos');setSearch('')}}><ArrowLeftRight size={16}/> {organizing?'Concluir organização':'Organizar slots'}</button>
        <button type="button" className="otms-inventory-reset" title="Restaurar ordem visual" aria-label="Restaurar ordem visual dos slots" onClick={()=>{setStored([]);setPicked(null)}}><RotateCcw size={17}/></button>
      </div>
      <p className="otms-inventory-instructions" aria-live="polite">{organizing ? picked!==null ? 'Escolha outro slot e pressione A para trocar as posições (B cancela).' : 'Escolha um item e pressione A; selecione outro slot para mover ou trocar.' : 'Selecione um item para consultar detalhes. Use Gerenciar para equipar, consumir ou transferir.'}</p>
      <div ref={gridRef} className="otms-inventory-slots" role="group" aria-label="Slots da mochila">
        {slots.map((itemKey,index)=>{
          const entry=itemKey?byKey.get(itemKey):undefined
          const item=entry?byCatalog.get(entry.id):undefined
          const matches=!!entry&&(!search||`${item?.name||entry.id} ${item?.type||''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))&&(group==='Todos'||groupOf(item)===group)
          const image=matches?itemImageUrl(item?.imageUrl):null
          return <button key={index} type="button" draggable={organizing&&!!entry}
            disabled={!!entry && !matches}
            onDragStart={event=>{if(!organizing||!entry)return;event.dataTransfer.setData('text/plain',String(index));event.dataTransfer.effectAllowed='move';setPicked(index)}}
            onDragOver={event=>{if(organizing)event.preventDefault()}}
            onDrop={event=>{if(!organizing)return;event.preventDefault();const source=Number(event.dataTransfer.getData('text/plain'));if(Number.isInteger(source))setStored(swapInventorySlots(slots,source,index));setPicked(null)}}
            onDragEnd={()=>setPicked(null)} onClick={()=>selectSlot(index)}
            className="otms-inventory-slot" data-selected={!!entry&&selected===itemKey} data-picked={picked===index} data-hidden-item={!!entry&&!matches}
            aria-label={entry ? `Slot ${index+1}: ${item?.name||entry.id}${organizing?', pressione para mover':''}`:`Slot vazio ${index+1}`} aria-pressed={!!entry&&selected===itemKey}>
            {matches&&image?<img src={image} alt="" loading="lazy"/>:matches?<Package size={24}/>:null}
            {matches&&<span className="otms-inventory-slot-name">{item?.name||entry?.id}</span>}
            {matches&&entry&&(stats.get(entry.id) ?? 0) > 1&&<small>x{stats.get(entry.id)}</small>}
          </button>
        })}
      </div>
      <div className="otms-inventory-controls"><ControllerGlyph button="A" small/> Escolher {organizing?' / mover':' item'} <ControllerGlyph button="B" small/> Voltar <span>Mouse: clique {organizing?'ou arraste para trocar slots':''}</span></div>
    </main>
    <aside className="otms-inventory-details" aria-live="polite">
      <div className="otms-inventory-detail-eyebrow">INFORMAÇÕES DO ITEM</div>
      {chosen ? <>
        <div className="otms-inventory-detail-art">{itemImageUrl(detail?.imageUrl)?<img alt="" src={itemImageUrl(detail?.imageUrl)||''}/>:<Package size={62}/>}</div>
        <h3>{detail?.name||chosen.id}</h3>
        <span className="otms-inventory-detail-type">{detail?.type||'Equipamento'} · {stats.get(chosen.id)} unidade(s)</span>
        <div className="otms-inventory-detail-stats">
          {detail?.damage!=null&&<p>Dano <strong>{String(detail.damage)}</strong></p>}
          {detail?.defense!=null&&<p>Defesa <strong>{String(detail.defense)}</strong></p>}
          {detail?.mdef!=null&&<p>Defesa mágica <strong>{String(detail.mdef)}</strong></p>}
          {detail?.cost!=null&&<p>Valor <strong>{String(detail.cost)} z</strong></p>}
        </div>
        <p className="otms-inventory-detail-text">{detail?.detail||detail?.effect||'Sem descrição cadastrada.'}</p>
        <button type="button" className="otms-inventory-manage" onClick={()=>onManage(chosen.index)}><Settings2 size={18}/> Gerenciar este item</button>
      </> : <div className="otms-inventory-empty"><Package size={48}/><p>Selecione um item na grade para ver sua descrição, atributos e ações.</p></div>}
    </aside>
  </div>
}
