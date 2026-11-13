'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Backpack, Grip, Package, Search, Settings2, RotateCcw, ArrowLeftRight, Box, Shield, ScrollText, Sparkles, FlaskConical } from 'lucide-react'
import { itemImageUrl } from '@/lib/item-image'
import { formatWeight, itemWeightGrams } from '@/lib/inventory-weight'
import { isConsumableItem } from '@/lib/item-mechanics'
import { INVENTORY_GROUPS, inventoryGroupOf, type InventoryGroup } from '@/lib/inventory-groups'
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
  onShortcutAction: (index: number, action: "primary" | "consume") => Promise<void>
}
export function TravelerInventoryBoard({characterId,campaignId,equipment,catalog,freeKg,maxKg,onManage,onShortcutAction}:Props) {
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
  const [group,setGroup]=useState<InventoryGroup>('Todos')
  const [search,setSearch]=useState('')
  useEffect(()=>{
    if (!active) return
    const frame=requestAnimationFrame(()=>gridRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({preventScroll:true}))
    return ()=>cancelAnimationFrame(frame)
  },[active,group,search])
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
  const visibleItemCount = items.filter(entry=>{
    const item=byCatalog.get(entry.id)
    return (group==='Todos'||inventoryGroupOf(item)===group) &&
      (!search||`${item?.name||entry.id} ${item?.type||''} ${item?.category||''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  }).length
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
  const selectedItemIndex = chosen?.index ?? -1
  const shortcut = (action: "primary" | "consume") => {
    if (organizing || selectedItemIndex < 0) return
    void onShortcutAction(selectedItemIndex, action)
  }
  useControllerActions({
    'ui.back':()=>{if(picked!==null){setPicked(null);return true}return false},
    'inventory.item.primary':()=>{shortcut('primary');return true},
    'inventory.item.consume':()=>{shortcut('consume');return true},
    'inventory.item.manage':()=>{if(selectedItemIndex>=0 && !organizing)onManage(selectedItemIndex);return true},
    'inventory.item.organize':()=>{setOrganizing(current=>!current);setPicked(null);return true},
  }, {enabled:active,priority:380})
  return <div data-controller-inventory-shortcuts="active" className="otms-inventory-board">
    <aside className="otms-inventory-categories">
      <div className="otms-inventory-category-title"><Backpack size={21}/> MOCHILA DO VIAJANTE</div>
      {INVENTORY_GROUPS.map(name=><button type="button" key={name} className="otms-inventory-category" data-active={group===name} onClick={()=>{setGroup(name);setPicked(null);setSelected(null)}}>{name==='Armas'?<Grip size={17}/>:name==='Proteção'?<Shield size={17}/>:name==='Consumíveis'?<ScrollText size={17}/>:<Box size={17}/>} {name}</button>)}
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
          const matches=!!entry&&(!search||`${item?.name||entry.id} ${item?.type||''} ${item?.category||''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))&&(group==='Todos'||inventoryGroupOf(item)===group)
          const image=matches?itemImageUrl(item?.imageUrl):null
          // Filtros exibem apenas as ocorrências correspondentes; os índices
          // originais continuam intactos para equipar/remover/transferir.
          if ((group!=='Todos'||search.trim()) && !matches) return null
          return <button key={index} type="button" draggable={organizing&&!!entry}
            disabled={!!entry && !matches}
            onDragStart={event=>{if(!organizing||!entry)return;event.dataTransfer.setData('text/plain',String(index));event.dataTransfer.effectAllowed='move';setPicked(index)}}
            onDragOver={event=>{if(organizing)event.preventDefault()}}
            onDrop={event=>{if(!organizing)return;event.preventDefault();const source=Number(event.dataTransfer.getData('text/plain'));if(Number.isInteger(source))setStored(swapInventorySlots(slots,source,index));setPicked(null)}}
            onDragEnd={()=>setPicked(null)} onClick={()=>selectSlot(index)}
            onFocus={()=>{if(active && !organizing)setSelected(itemKey||null)}}
            className="otms-inventory-slot" data-selected={!!entry&&selected===itemKey} data-picked={picked===index} data-hidden-item={!!entry&&!matches}
            aria-label={entry ? `Slot ${index+1}: ${item?.name||entry.id}${organizing?', pressione para mover':''}`:`Slot vazio ${index+1}`} aria-pressed={!!entry&&selected===itemKey}>
            {matches&&image?<img src={image} alt="" loading="lazy"/>:matches?<Package size={24}/>:null}
            {matches&&<span className="otms-inventory-slot-name">{item?.name||entry?.id}</span>}
            {matches&&entry&&(stats.get(entry.id) ?? 0) > 1&&<small>x{stats.get(entry.id)}</small>}
          </button>
        })}
      </div>
      {(group!=='Todos'||search.trim())&&visibleItemCount===0&&
        <p className="otms-inventory-instructions" role="status">Nenhum item nesta categoria. Confira outro filtro ou limpe a busca.</p>}
      <div className="otms-inventory-controls" aria-label="Atalhos da mochila">
        <span className="otms-inventory-help-item"><ControllerGlyph button="A" small/> {organizing ? 'Mover slot' : 'Selecionar'}</span>
        <span className="otms-inventory-help-item"><ControllerGlyph button="LS" small/> Equipar/usar</span>
        <span className="otms-inventory-help-item"><ControllerGlyph button="RS" small/> Consumir</span>
        <span className="otms-inventory-help-item"><ControllerGlyph button="RB" small/> Gerenciar</span>
        <span className="otms-inventory-help-item"><ControllerGlyph button="LB" small/> Organizar</span>
        <span className="otms-inventory-help-item"><ControllerGlyph button="B" small/> Voltar</span>
      </div>
    </main>
    <aside className="otms-inventory-details" aria-live="polite">
      <div className="otms-inventory-detail-eyebrow">INFORMAÇÕES DO ITEM</div>
      {chosen ? <>
        <div className="otms-inventory-detail-art">{itemImageUrl(detail?.imageUrl)?<img alt="" src={itemImageUrl(detail?.imageUrl)||''}/>:<Package size={62}/>}</div>
        <h3>{detail?.name||chosen.id}</h3>
        <span className="otms-inventory-detail-type">{detail?.type||detail?.category||'Equipamento'} · {stats.get(chosen.id)} unidade(s)</span>
        <p className="mt-2 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary" aria-label={`Peso de uma unidade: ${formatWeight(itemWeightGrams(detail))}`}>
          Peso unitário: {formatWeight(itemWeightGrams(detail))} · Total: {formatWeight(itemWeightGrams(detail) * (stats.get(chosen.id) || 1))}
        </p>
        <div className="otms-inventory-detail-stats">
          {detail?.damage!=null&&<p>Dano <strong>{String(detail.damage)}</strong></p>}
          {detail?.defense!=null&&<p>Defesa <strong>{String(detail.defense)}</strong></p>}
          {detail?.mdef!=null&&<p>Defesa mágica <strong>{String(detail.mdef)}</strong></p>}
          {detail?.cost!=null&&<p>Valor <strong>{String(detail.cost)} z</strong></p>}
        </div>
        <p className="otms-inventory-detail-text">{detail?.detail||detail?.effect||'Sem descrição cadastrada.'}</p>
        <div className="otms-inventory-actions" aria-label={`Ações de ${detail?.name || chosen.id}`}>
          <button type="button" className="otms-inventory-action otms-inventory-action-primary" onClick={()=>shortcut("primary")} aria-label={`Equipar ou usar ${detail?.name || chosen.id} (L3)`}>
            <ControllerGlyph button="LS" small/>
            <span className="otms-inventory-action-name"><Sparkles size={15} aria-hidden="true"/> Equipar / usar</span>
          </button>
          <button type="button" className="otms-inventory-action otms-inventory-action-consume" onClick={()=>shortcut("consume")} disabled={!isConsumableItem(detail)} aria-label={`Consumir ${detail?.name || chosen.id} (R3)`} title={!isConsumableItem(detail)?'Este item não é consumível':undefined}>
            <ControllerGlyph button="RS" small/>
            <span className="otms-inventory-action-name"><FlaskConical size={15} aria-hidden="true"/> Consumir</span>
          </button>
          <button type="button" className="otms-inventory-action otms-inventory-action-manage" onClick={()=>onManage(chosen.index)} aria-label={`Gerenciar ${detail?.name || chosen.id} (RB)`}>
            <ControllerGlyph button="RB" small/>
            <span className="otms-inventory-action-name"><Settings2 size={16} aria-hidden="true"/> Gerenciar item</span>
          </button>
        </div>
      </> : <div className="otms-inventory-empty"><Package size={48}/><p>Selecione um item na grade para ver sua descrição, atributos e ações.</p></div>}
    </aside>
  </div>
}
