'use client'
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react'
import {Gamepad2,Keyboard,Play,Pause,RotateCcw,Swords,Users,X,LogOut,Maximize2,Minimize2} from 'lucide-react'
import {ArenaStage} from './arena-stage'
import type {ArenaInput,ArenaSnapshot,ArenaPortrait} from '@/lib/arena/model'
import {NO_INPUT,ROUND_SECONDS,ROUNDS_TO_WIN} from '@/lib/arena/model'
import {menuRepeatStep,readArenaPadInput,readArenaPadMenu,type MenuRepeat} from '@/lib/arena/gamepad'
import {navigateArenaMenu,type ArenaMenuFocus} from '@/lib/arena/menu-navigation'
import './arena.css'

type Props={campaignId:string;userId:string;isGm:boolean}
type PadView={index:number;name:string}
type PadMemory={repeat:MenuRepeat;confirm:boolean;back:boolean;start:boolean}
const blankMemory=():PadMemory=>({repeat:{direction:0,nextAt:0},confirm:false,back:false,start:false})
const colors=['#cfb18a','#b8a8cf','#9bc7cb','#b5c999']
const deviceKey=(index:number)=>`pad:${index}`
const connectedPads=():Gamepad[]=>typeof navigator!=='undefined'&&navigator.getGamepads?Array.from(navigator.getGamepads()).filter((p):p is Gamepad=>!!p?.connected):[]
const labelDevice=(d:string)=>d==='keyboard'?'Teclado':`Controle ${Number(d.slice(4))+1}`
const KEY_INPUT:Record<string,keyof ArenaInput>={
  KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'jump',KeyW:'jump',ArrowUp:'jump',
  KeyJ:'light',KeyK:'heavy',KeyU:'special',KeyI:'guard',ShiftLeft:'dodge',ShiftRight:'dodge',ArrowDown:'crouch',KeyS:'crouch',
}
const columns=()=>typeof window==='undefined'?6:window.innerWidth<520?3:window.innerWidth<850?4:window.innerWidth<1260?5:7

export function ArenaMinigame({campaignId,userId,isGm}:Props){
  const [visible,setVisible]=useState(false)
  const [room,setRoom]=useState<ArenaSnapshot|null>(null)
  const [pads,setPads]=useState<PadView[]>([])
  const [target,setTarget]=useState('keyboard')
  const [cursors,setCursors]=useState<Record<string,number>>({})
  const [pauseChoice,setPauseChoice]=useState(0)
  const [menuFocus,setMenuFocus]=useState<Record<string,ArenaMenuFocus>>({})
  const [debugBoxes,setDebugBoxes]=useState(false)
  const [browserFullscreen,setBrowserFullscreen]=useState(false)
  const [error,setError]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  const roomRef=useRef(room);roomRef.current=room
  const visibleRef=useRef(visible);visibleRef.current=visible
  const targetRef=useRef(target);targetRef.current=target
  const cursorsRef=useRef(cursors);cursorsRef.current=cursors
  const pauseChoiceRef=useRef(pauseChoice);pauseChoiceRef.current=pauseChoice
  const menuFocusRef=useRef(menuFocus);menuFocusRef.current=menuFocus
  const memory=useRef(new Map<number,PadMemory>())
  const pressed=useRef(new Set<string>())
  const queuedPresses=useRef(new Map<string,Partial<ArenaInput>>())
  const liveInputs=useRef(new Map<string,ArenaInput>())
  const inputInFlight=useRef(false)
  const lastCombatPad=useRef(new Map<number,ArenaInput>())
  const mouse=useRef({light:false,heavy:false})
  const busy=useRef(new Set<string>())
  const requestVersion=useRef(0)
  const refreshInFlight=useRef(false)
  const mutationVersion=useRef(0)
  const inputSequence=useRef(0)
  const inputSource=useRef(`web:${Date.now()}:${Math.random().toString(36).slice(2)}`)
  const dismissed=useRef<string|null>(null)
  const endpoint=`/api/campaigns/${encodeURIComponent(campaignId)}/arena`
  const applyRoom=useCallback((next:ArenaSnapshot|null)=>{roomRef.current=next;setRoom(next)},[])
  const hide=useCallback(()=>{dismissed.current=roomRef.current?.id||null;setVisible(false)},[])
  const toggleFullscreen=useCallback(()=>{
    if(document.fullscreenElement){void document.exitFullscreen().catch(()=>{})}
    else {void ref.current?.requestFullscreen?.().catch(()=>{})}
  },[])
  useEffect(()=>{const sync=()=>setBrowserFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[])
  const focusDevice=useCallback((device:string)=>{targetRef.current=device;setTarget(device)},[])
  const refresh=useCallback(async()=>{
    if(refreshInFlight.current)return roomRef.current
    refreshInFlight.current=true
    const request=++requestVersion.current,mutation=mutationVersion.current
    try{
      const compact=roomRef.current?.phase==='playing'||roomRef.current?.phase==='paused'
      const controller=new AbortController()
      const timeout=setTimeout(()=>controller.abort(),1800)
      let response:Response
      try{response=await fetch(compact?`${endpoint}?compact=1`:endpoint,{cache:'no-store',signal:controller.signal})}
      finally{clearTimeout(timeout)}
      if(!response.ok)return null
      const result=await response.json()
      const next=result.room?(result.compact?{...result.room,roster:roomRef.current?.roster||[]}:result.room) as ArenaSnapshot:null
      if(request===requestVersion.current&&mutation===mutationVersion.current)applyRoom(next)
      return next
    }catch{return null}finally{refreshInFlight.current=false}
  },[applyRoom,endpoint])
  const command=useCallback(async(action:string,data:Record<string,unknown>={},silent=false)=>{
    const slot=`${action}:${String(data.device||'')}`
    const inputOnly=action==='input'||action==='heartbeat'
    if(!inputOnly&&busy.current.has(slot))return
    if(!inputOnly)busy.current.add(slot)
    const mutation=inputOnly?mutationVersion.current:++mutationVersion.current
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Não foi possível acessar a arena.')
      if(!inputOnly&&mutation===mutationVersion.current)applyRoom(result.room||null)
      if(!silent)setError('')
    }catch(e){if(!silent)setError(e instanceof Error?e.message:'Erro na arena.')}finally{if(!inputOnly)busy.current.delete(slot)}
  },[applyRoom,endpoint])
  const moveCursor=useCallback((device:string,step:number)=>{
    const current=roomRef.current;if(!current)return
    const previous=menuFocusRef.current[device]||{zone:'roster' as const,index:cursorsRef.current[device]||0}
    const next=navigateArenaMenu(previous,step,{rosterCount:current.roster.length,columns:columns(),joinCount:connectedPads().length+1,canLaunch:isGm,topCount:isGm?3:2})
    menuFocusRef.current={...menuFocusRef.current,[device]:next};setMenuFocus(menuFocusRef.current)
    if(next.zone==='roster'){
      cursorsRef.current={...cursorsRef.current,[device]:next.index};setCursors(cursorsRef.current)
      ref.current?.querySelector<HTMLElement>(`[data-roster-index="${next.index}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'})
    }
    focusDevice(device)
  },[focusDevice,isGm])
  const joinOrSelect=useCallback((device:string,index?:number)=>{
    const current=roomRef.current
    if(current?.phase!=='lobby'||!current.roster.length)return
    focusDevice(device)
    const chosen=index??cursorsRef.current[device]??Math.max(0,current.roster.findIndex(c=>c.id===current.fighters.find(f=>f.userId===userId&&f.device===device)?.characterId))
    const characterId=current.roster[chosen]?.id||current.roster[0].id
    const existing=current.fighters.some(f=>f.userId===userId&&f.device===device)
    void command(existing?'select':'join',{device,characterId})
  },[command,focusDevice,userId])
  const start=useCallback(()=>{if(isGm)void command('start')},[command,isGm])
  const rematch=useCallback(()=>{if(isGm)void command('rematch')},[command,isGm])
  const backToLobby=useCallback(()=>{if(isGm)void command('reset');else hide()},[command,hide,isGm])
  const confirmLobby=useCallback((device:string)=>{
    const focus=menuFocusRef.current[device]||{zone:'roster' as const,index:cursorsRef.current[device]||0}
    if(focus.zone==='top'){
      if(focus.index===0)toggleFullscreen()
      else if(isGm&&focus.index===1)void command('close')
      else hide()
    }else if(focus.zone==='launch'){
      if(isGm)start()
    }else if(focus.zone==='join'){
      const padsNow=connectedPads(),chosen=focus.index<padsNow.length?deviceKey(padsNow[focus.index].index):'keyboard'
      focusDevice(chosen)
      const existing=roomRef.current?.fighters.some(f=>f.userId===userId&&f.device===chosen)
      if(existing)void command('leave',{device:chosen});else joinOrSelect(chosen)
    }else if(focus.zone==='seats'){
      const occupant=roomRef.current?.fighters[focus.index]
      if(!occupant)joinOrSelect(device)
      else if(occupant.userId===userId)focusDevice(occupant.device)
    }else joinOrSelect(device,focus.index)
  },[command,focusDevice,hide,isGm,joinOrSelect,start,toggleFullscreen,userId])
  const pause=useCallback((device:string)=>{
    const current=roomRef.current;if(!current)return
    if(current.phase==='playing'){
      if(!isGm&&!current.fighters.some(f=>f.userId===userId&&f.device===device))return
      setPauseChoice(0);pauseChoiceRef.current=0
      void command('pause',{device})
    }else if(current.phase==='paused'&&(isGm||current.pausedBy===userId))void command('resume')
  },[command,isGm,userId])
  const exitMatch=useCallback(()=>{
    const current=roomRef.current
    if(!current)return
    if(isGm)void command('exit')
    else{
      const fighter=current.fighters.find(f=>f.userId===userId&&!f.bot)
      if(fighter)void command('forfeit',{device:fighter.device}).then(()=>hide())
      else hide()
    }
  },[command,hide,isGm,userId])
  const pauseActions=useCallback(()=>{
    const current=roomRef.current
    const canResume=isGm||current?.pausedBy===userId
    return [{label:'Continuar combate',enabled:canResume,action:()=>{if(canResume)void command('resume')}},
      {label:isGm?'Voltar para seleção':'Desistir e sair',enabled:true,action:exitMatch}]
  },[command,exitMatch,isGm,userId])
  const activatePause=useCallback(()=>{pauseActions()[pauseChoiceRef.current]?.action()},[pauseActions])

  useEffect(()=>{
    const secret=(event:Event)=>{
      const index=(event as CustomEvent<{index:number}>).detail?.index
      if(typeof index!=='number')return
      dismissed.current=null;setPads(connectedPads().map(p=>({index:p.index,name:p.id.slice(0,42)})))
      focusDevice(deviceKey(index));setVisible(true);setError('')
      if(isGm)void command('open');else void refresh()
    }
    const invite=()=>{if(visibleRef.current||!connectedPads().length)return;void refresh().then(next=>{
      if(next?.phase==='lobby'&&dismissed.current!==next.id)setVisible(true)
    })}
    const changed=()=>{void refresh().then(next=>{if(next?.phase==='lobby'&&connectedPads().length&&dismissed.current!==next.id)setVisible(true)})}
    window.addEventListener('otms.arena.secret',secret)
    window.addEventListener('otms.arena.changed',changed)
    invite();const timer=window.setInterval(invite,9000)
    return()=>{clearInterval(timer);window.removeEventListener('otms.arena.secret',secret);window.removeEventListener('otms.arena.changed',changed)}
  },[command,focusDevice,isGm,refresh])
  useEffect(()=>{
    document.documentElement.dataset.otmsArenaActive=visible?'true':'false'
    if(!visible)return
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden'
    window.requestAnimationFrame(()=>ref.current?.focus({preventScroll:true}))
    return()=>{document.documentElement.dataset.otmsArenaActive='false';document.body.style.overflow=overflow}
  },[visible])
  useEffect(()=>{
    if(!visible)return
    void refresh()
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},room?.phase==='playing'?70:room?.phase==='paused'?300:1400)
    return()=>clearInterval(timer)
  },[visible,room?.phase,refresh])
  useEffect(()=>{
    if(!visible)return
    const update=()=>setPads(connectedPads().map(p=>({index:p.index,name:p.id.slice(0,42)})))
    update();window.addEventListener('gamepadconnected',update);window.addEventListener('gamepaddisconnected',update)
    const timer=setInterval(update,1700)
    return()=>{clearInterval(timer);window.removeEventListener('gamepadconnected',update);window.removeEventListener('gamepaddisconnected',update)}
  },[visible])
  useEffect(()=>{
    if(!visible)return
    const keydown=(e:KeyboardEvent)=>{
      const phase=roomRef.current?.phase
      if(phase==='finished'){
        if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)rematch();return}
        if(e.code==='Escape'||e.code==='Backspace'){e.preventDefault();if(!e.repeat)backToLobby();return}
      }
      if(phase==='paused'){
        if(['Escape','KeyP'].includes(e.code)){e.preventDefault();if(!e.repeat)pause('keyboard');return}
        if(e.code==='ArrowUp'||e.code==='ArrowDown'){
          e.preventDefault();if(!e.repeat){const choice=(pauseChoiceRef.current+1)%2
            // As duas opções ciclam de forma independente do foco do DOM.
            pauseChoiceRef.current=choice;setPauseChoice(choice)}return
        }
        if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)activatePause();return}
        return
      }
      if(e.code==='Escape'||e.code==='KeyP'){
        e.preventDefault();if(!e.repeat){if(phase==='playing')pause('keyboard');else if(e.code==='Escape')hide()}return
      }
      if(e.code==='F1'){e.preventDefault();if(!e.repeat)setDebugBoxes(v=>!v);return}
      if(phase==='lobby'){
        const movements:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2}
        if(movements[e.code]){e.preventDefault();if(!e.repeat)moveCursor('keyboard',movements[e.code]);return}
        if(e.code==='Enter'){e.preventDefault();if(!e.repeat)confirmLobby('keyboard');return}
        if(e.code==='Backspace'){e.preventDefault();if(!e.repeat)void command('leave',{device:'keyboard'});return}
      }
      if(e.code in KEY_INPUT){
        e.preventDefault()
        const input=KEY_INPUT[e.code]
        if(!pressed.current.has(e.code)&&['jump','light','heavy','special','dodge'].includes(input)){
          queuedPresses.current.set('keyboard',{...queuedPresses.current.get('keyboard'),[input]:true})
        }
        pressed.current.add(e.code)
      }
    }
    const keyup=(e:KeyboardEvent)=>{if(e.code in KEY_INPUT){e.preventDefault();pressed.current.delete(e.code)}}
    const clear=()=>{pressed.current.clear();queuedPresses.current.clear();lastCombatPad.current.clear();mouse.current={light:false,heavy:false}}
    window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',clear)
    return()=>{window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',clear);clear()}
  },[visible,activatePause,backToLobby,command,confirmLobby,hide,joinOrSelect,moveCursor,pause,rematch])
  useEffect(()=>{
    if(!visible)return
    let frame=0,lastAt=0
    const inspect=(now:number)=>{
      frame=requestAnimationFrame(inspect)
      if(now-lastAt<22||document.visibilityState==='hidden')return
      lastAt=now
      const current=roomRef.current
      const connected=connectedPads(),available=new Set(connected.map(p=>p.index))
      for(const index of memory.current.keys())if(!available.has(index))memory.current.delete(index)
      for(const pad of connected){
        const pressedNow=readArenaPadMenu(pad),prev=memory.current.get(pad.index)||blankMemory()
        const isLobby=current?.phase==='lobby',isPaused=current?.phase==='paused'
        const {next,move}=menuRepeatStep(prev.repeat,isLobby?pressedNow.direction:isPaused?(pressedNow.direction===2?1:pressedNow.direction===-2?-1:0):0,now)
        const device=deviceKey(pad.index)
        if(current?.phase==='playing'){
          const live=readArenaPadInput(pad)
          const prior=lastCombatPad.current.get(pad.index)||NO_INPUT
          const next={...queuedPresses.current.get(device)}
          for(const key of ['jump','light','heavy','special','dodge'] as const)if(live[key]&&!prior[key])next[key]=true
          queuedPresses.current.set(device,next)
          lastCombatPad.current.set(pad.index,live)
        }else lastCombatPad.current.delete(pad.index)
        if(isLobby){
          if(move)moveCursor(device,move)
          if(pressedNow.confirm&&!prev.confirm)confirmLobby(device)
          if(pressedNow.back&&!prev.back&&current.fighters.some(f=>f.device===device&&f.userId===userId))void command('leave',{device})
          if(pressedNow.start&&!prev.start&&isGm)start()
        }else if(isPaused){
          if(move){const index=(pauseChoiceRef.current+1)%2;pauseChoiceRef.current=index;setPauseChoice(index)}
          if(pressedNow.confirm&&!prev.confirm)activatePause()
          if((pressedNow.start&&!prev.start||pressedNow.back&&!prev.back)&& (isGm||current.pausedBy===userId))pause(device)
        }else if(current?.phase==='playing'&&pressedNow.start&&!prev.start)pause(device)
        else if(current?.phase==='finished'){
          if(pressedNow.confirm&&!prev.confirm)rematch()
          else if(pressedNow.back&&!prev.back)backToLobby()
        }
        memory.current.set(pad.index,{repeat:next,confirm:pressedNow.confirm,back:pressedNow.back,start:pressedNow.start})
      }
    }
    frame=requestAnimationFrame(inspect)
    return()=>{cancelAnimationFrame(frame);memory.current.clear()}
  },[visible,activatePause,backToLobby,command,confirmLobby,isGm,joinOrSelect,moveCursor,pause,rematch,start,userId])
  useEffect(()=>{
    if(!visible||!room)return
    if(room.phase!=='playing'){
      if(room.phase!=='lobby')return
      const timer=setInterval(()=>{
        for(const f of roomRef.current?.fighters||[])if(f.userId===userId&&!f.bot)void command('heartbeat',{device:f.device},true)
      },3000)
      return()=>clearInterval(timer)
    }
    const push=async()=>{
      if(inputInFlight.current||document.visibilityState!=='visible')return
      const owned=roomRef.current?.fighters.filter(f=>f.userId===userId&&!f.bot&&!f.withdrawn)||[]
      if(!owned.length)return
      const keyboard:ArenaInput={...NO_INPUT}
      for(const code of pressed.current){const key=KEY_INPUT[code];if(key)keyboard[key]=true}
      keyboard.light ||= mouse.current.light;keyboard.heavy ||= mouse.current.heavy
      const connected=connectedPads()
      const inputs=owned.map(f=>{
        const pad=connected.find(p=>deviceKey(p.index)===f.device)
        const live=f.device==='keyboard'?keyboard:pad?readArenaPadInput(pad):{...NO_INPUT}
        const pending=queuedPresses.current.get(f.device)||{}
        const buttons={...live}
        for(const key of ['jump','light','heavy','special','dodge'] as const)if(pending[key])buttons[key]=true
        liveInputs.current.set(f.device,buttons)
        return {device:f.device,buttons}
      })
      // Um único POST em trânsito por cliente. Comandos não competem entre si.
      // Os pulsos são restaurados se a rede falhar, e pacotes recebem sequência monotônica.
      for(const f of owned)queuedPresses.current.delete(f.device)
      inputInFlight.current=true
      try{
        const controller=new AbortController()
        const timeout=setTimeout(()=>controller.abort(),1800)
        let response:Response
        try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'input',inputs,seq:++inputSequence.current,source:inputSource.current}),signal:controller.signal})}
        finally{clearTimeout(timeout)}
        if(!response.ok)throw new Error('input delivery failed')
      }catch{
        for(const entry of inputs){
          const old=queuedPresses.current.get(entry.device)||{}
          const restore:Partial<ArenaInput>={...old}
          for(const key of ['jump','light','heavy','special','dodge'] as const)if(entry.buttons[key])restore[key]=true
          queuedPresses.current.set(entry.device,restore)
        }
      }finally{inputInFlight.current=false}
    }
    void push();const timer=setInterval(()=>void push(),32)
    return()=>{clearInterval(timer);liveInputs.current.clear()}
  },[visible,room?.phase,endpoint,userId])

  if(!visible)return null
  const roster=room?.roster||[],fighters=room?.fighters||[]
  const selected=target,own=fighters.find(f=>f.userId===userId&&f.device===selected)
  const fallback=Math.max(0,roster.findIndex(p=>p.id===own?.characterId))
  const focus=Math.max(0,Math.min(roster.length-1,cursors[selected]??fallback))
  const preview=roster[focus]
  const canStart=!!room&&(room.phase==='lobby'||room.phase==='finished')&&fighters.some(f=>!f.bot)&&fighters.filter(f=>!f.bot).every(f=>!!f.characterId)
  const solo=fighters.filter(f=>!f.bot).length===1
  const options=pauseActions()
  const focusZone=menuFocus[selected]?.zone||'roster'
  const focusIndex=menuFocus[selected]?.index??focus
  const isPause=room?.phase==='paused'
  const onPortrait=(p:ArenaPortrait,index:number)=>{
    menuFocusRef.current={...menuFocusRef.current,[selected]:{zone:'roster',index}};setMenuFocus(menuFocusRef.current)
    cursorsRef.current={...cursorsRef.current,[selected]:index};setCursors(cursorsRef.current)
    joinOrSelect(selected,index)
  }
  return <div className="otms-arena" role="presentation"><div className="otms-arena-shell" ref={ref} role="dialog" aria-modal="true" aria-label="Arena de luta" tabIndex={-1}>
    <header className="otms-arena-header">
      <div className="otms-arena-brand"><div className="otms-arena-brand-symbol"><Swords size={24}/></div><div><p className="otms-arena-eyebrow">OTMS / MINIGAME DA CAMPANHA</p><h1 className="otms-arena-title">ARENA <span>DOS DESASTRES</span></h1></div></div>
      <div className="otms-arena-actions">
        <button data-controller-focus={room?.phase==='lobby'&&focusZone==='top'&&focusIndex===0} onClick={toggleFullscreen} title="Tela cheia real do navegador">{browserFullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>} Tela cheia</button>
        {room?.phase==='playing'&&<button onClick={()=>pause(fighters.find(f=>f.userId===userId)?.device||'keyboard')}><Pause size={15}/> Pausar</button>}
        {room?.phase==='paused'&&(isGm||room.pausedBy===userId)&&<button onClick={()=>void command('resume')}><Play size={15}/> Continuar</button>}
        {isGm&&room?.phase==='finished'&&<button className="otms-arena-primary" onClick={rematch}><RotateCcw size={15}/> Revanche</button>}
        {isGm&&room&&<button data-controller-focus={room?.phase==='lobby'&&focusZone==='top'&&focusIndex===1} onClick={()=>void command('close')}><X size={14}/> Fechar sala</button>}
        <button data-controller-focus={room?.phase==='lobby'&&focusZone==='top'&&focusIndex===(isGm?2:1)} onClick={hide} aria-label="Ocultar arena"><X size={16}/> Ocultar</button>
      </div>
    </header>
    <div className="otms-arena-content">
      {error&&<div role="alert" className="otms-arena-error">{error}</div>}
      {!room?<section className="otms-arena-empty"><Swords size={47}/><h2>O RINGUE ESTÁ VAZIO</h2><p>{isGm?'Abra a sala para lutar contra a CPU ou convidar outros jogadores.':'Aguardando o mestre abrir a arena.'}</p>{isGm&&<button className="otms-arena-primary" onClick={()=>void command('open')}>Abrir sala</button>}</section>:
      room.phase==='lobby'?<>
        <div className="otms-arena-sectionline"><span>01 / SELEÇÃO DE PERSONAGEM</span><span>{roster.length} FICHAS DISPONÍVEIS</span></div>
        <div className="otms-arena-select">
          <section className="otms-arena-hero" aria-label="Personagem em destaque">
            <div className="otms-arena-hero-top"><span>FIGHTER PREVIEW</span><span>{String(focus+1).padStart(2,'0')}</span></div>
            {preview?.imageUrl?<img className="otms-arena-hero-image" src={preview.imageUrl} alt={preview.name}/>:<div className="otms-arena-hero-blank">⚔</div>}
            <div className="otms-arena-hero-info"><small>{preview?.kind==='monster'?'CRIATURA':preview?.kind==='npc'?'PERSONAGEM DO MESTRE':'JOGADOR'}</small><h2>{preview?.name||'SEM PERSONAGENS'}</h2>
              {preview&&<div className="otms-arena-move-list">{preview.moves.map(m=><div key={m.kind}><span>{m.kind==='light'?'X':m.kind==='heavy'?'Y':'RB'}</span><strong>{m.name}</strong></div>)}</div>}
              <p className="otms-arena-preview-device"><Gamepad2 size={14}/> {labelDevice(selected)} • {own?.characterId===preview?.id?'ESCOLHIDO':'A / ENTER PARA ESCOLHER'}</p>
            </div>
          </section>
          <section className="otms-arena-selector"><div className="otms-arena-selector-header"><strong>ELENCO DA CAMPANHA</strong><span>Retratos das fichas ativas</span></div>
            <div className="otms-arena-roster" style={{'--roster-columns':columns()} as CSSProperties}>{roster.length?roster.map((p,i)=>{
              const picks=fighters.map((f,j)=>f.characterId===p.id?{f,j}:null).filter((x):x is {f:typeof fighters[number];j:number}=>!!x)
              return <button key={p.id} type="button" data-roster-index={i} data-focused={focus===i} data-controller-focus={focusZone==='roster'&&focusIndex===i} data-picked={picks.length>0} className="otms-arena-roster-card" aria-label={`Escolher ${p.name}`} onClick={()=>onPortrait(p,i)}>
                <div className="otms-arena-portrait-frame">{p.imageUrl?<img src={p.imageUrl} loading="lazy" alt=""/>:<span>⚔</span>}{focus===i&&<b className="otms-arena-cursor">◆</b>}{picks.length>0&&<span className="otms-arena-picks">{picks.map(({f,j})=><b key={f.id} style={{background:colors[j%4]}}>{`P${j+1}`}</b>)}</span>}</div>
                <strong title={p.name}>{p.name}</strong>
              </button>
            }):<p className="otms-arena-no-roster">Nenhum personagem ou NPC disponível nesta campanha.</p>}</div>
            <div className="otms-arena-selector-footer">D-PAD / ANALÓGICO · TODAS AS ÁREAS <span>A / ENTER · CONFIRMAR</span> <span>B · SAIR</span></div>
          </section>
        </div>
        <div className="otms-arena-sectionline"><span>02 / JOGADORES</span><span>{fighters.length} / 4</span></div>
        <section className="otms-arena-seats">{Array.from({length:4},(_,i)=>{
          const f=fighters[i],c=roster.find(p=>p.id===f?.characterId)
          return <div className="otms-arena-seat" key={f?.id||i} data-controller-focus={focusZone==='seats'&&focusIndex===i} data-occupied={!!f} style={{'--seat-color':colors[i]} as CSSProperties}>
            <b className="otms-arena-seat-number">{f?`P${i+1}`:'+'}</b>{c?.imageUrl?<img src={c.imageUrl} alt=""/>:null}
            <div className="otms-arena-seat-copy"><strong>{c?.name||'VAGA LIVRE'}</strong><span>{f?`${labelDevice(f.device)} · ${f.bot?'CPU':f.userId===userId?'Você':f.name}`:'Pressione A para entrar'}</span></div>
            {f&&isGm&&<button className="otms-arena-mini-remove" title="Remover" onClick={()=>void command('kick',{fighterId:f.id})}><X size={14}/></button>}
          </div>
        })}</section>
        <div className="otms-arena-ready"><div className="otms-arena-join"><Users size={17}/><span>ENTRAR:</span>{pads.map(p=>{
          const device=deviceKey(p.index),joined=fighters.some(f=>f.userId===userId&&f.device===device)
          return <button key={device} data-controller-focus={focusZone==='join'&&focusIndex===pads.findIndex(x=>x.index===p.index)} data-active={target===device} onClick={()=>{focusDevice(device);if(joined)void command('leave',{device});else joinOrSelect(device)}}><Gamepad2 size={14}/>{`P${p.index+1} · ${joined?'SAIR':'ENTRAR'}`}</button>
        })}<button data-controller-focus={focusZone==='join'&&focusIndex===pads.length} data-active={target==='keyboard'} onClick={()=>{focusDevice('keyboard');if(fighters.some(f=>f.userId===userId&&f.device==='keyboard'))void command('leave',{device:'keyboard'});else joinOrSelect('keyboard')}}><Keyboard size={14}/> TECLADO</button></div>
          {isGm?<button className="otms-arena-primary otms-arena-launch" data-controller-focus={focusZone==='launch'} disabled={!canStart} onClick={start}><Play size={17}/>{solo?'JOGAR CONTRA CPU':'INICIAR LUTA'}</button>:<span className="otms-arena-waiting">AGUARDANDO O MESTRE</span>}
        </div>
      </>:<div className="otms-arena-fight">
        <div className="otms-arena-fight-header">
          <div className="otms-arena-rounds">{room.phase==='finished'?'RESULTADO':`ROUND ${room.rounds}`} <span>PRIMEIRO A {ROUNDS_TO_WIN} VITÓRIAS</span></div>
          <div className="otms-arena-timer">{String(Math.max(0,ROUND_SECONDS-Math.floor(room.roundElapsed))).padStart(2,'0')}</div>
          <div className="otms-arena-rounds right">{room.phase==='finished'?'COMBATE ENCERRADO':'VERSUS MODE'} <span>START / ESC · MENU</span></div>
        </div>
        <div className="otms-arena-health-grid">{fighters.filter(f=>!f.withdrawn).map((f,i)=>{
          const p=roster.find(c=>c.id===f.characterId)
          return <div key={f.id} className="otms-arena-health" style={{'--seat-color':colors[i%4]} as CSSProperties}>
            {p?.imageUrl&&<img src={p.imageUrl} alt=""/>}
            <div className="otms-arena-health-body"><div className="otms-arena-health-name"><strong>{p?.name||f.name}</strong><small>{f.bot?'CPU':f.userId===userId?labelDevice(f.device):'JOGADOR'} · {'◆'.repeat(f.wins)}</small></div>
              <div className="otms-arena-health-track"><div style={{width:`${f.health}%`}}/></div>
              <div className="otms-arena-resource"><div className="otms-arena-meter" title="Especial"><div style={{width:`${f.meter}%`}}/></div><div className="otms-arena-guard" title="Defesa"><div style={{width:`${f.guard}%`}}/></div><span>{Math.ceil(f.health)} HP</span></div>
            </div>
          </div>
        })}</div>
        <div className="otms-arena-stage-wrap"><ArenaStage room={room} debugBoxes={debugBoxes} localPlayerId={userId} getLocalInput={(device)=>{if(device==='keyboard'){const input:ArenaInput={...NO_INPUT};for(const code of pressed.current){const key=KEY_INPUT[code];if(key)input[key]=true}input.light||=mouse.current.light;input.heavy||=mouse.current.heavy;return input}const pad=connectedPads().find(p=>deviceKey(p.index)===device);return pad?readArenaPadInput(pad):liveInputs.current.get(device)}} onPointerAttack={(kind,isPressed)=>{mouse.current[kind]=isPressed}}/>
          {room.phase==='finished'&&<div className="otms-arena-result" role="group" aria-label="Resultado do combate">
            <div className="otms-arena-result-card">
              <small>RESULTADO FINAL · MELHOR DE {ROUNDS_TO_WIN*2-1}</small>
              <h2>{room.winnerId?`${(roster.find(p=>p.id===fighters.find(f=>f.id===room.winnerId)?.characterId)?.name||fighters.find(f=>f.id===room.winnerId)?.name||'LUTADOR').toUpperCase()} VENCEU!`:'FIM DA PARTIDA'}</h2>
              <p>{room.message}</p>
              <div className="otms-arena-result-actions">
                {isGm?<><button className="otms-arena-primary" onClick={rematch}><RotateCcw size={18}/> REVANCHE <small>A / ENTER</small></button>
                  <button onClick={backToLobby}><LogOut size={18}/> VOLTAR À SALA <small>B / ESC</small></button></>:
                  <><span>O mestre controla a revanche e o retorno à sala.</span><button onClick={hide}><LogOut size={18}/> SAIR DA ARENA</button></>}
              </div>
            </div>
          </div>}
          {isPause&&<div className="otms-arena-pause" role="menu" aria-label="Pausa da partida"><div className="otms-arena-pause-panel"><span className="otms-arena-eyebrow">PARTIDA INTERROMPIDA</span><h2>PAUSA</h2><p>{room.pausedBy===userId?'Você pausou o combate.':'Aguardando a continuação do combate.'}</p>
            {options.map((action,i)=><button key={i} role="menuitem" data-selected={pauseChoice===i} disabled={!action.enabled} onMouseEnter={()=>{pauseChoiceRef.current=i;setPauseChoice(i)}} onClick={action.action}>{i===0?<Play size={17}/>:<LogOut size={17}/>} {action.label}</button>)}
            <small>↑↓ SELECIONAR · A/ENTER CONFIRMAR · START CONTINUAR</small>
          </div></div>}
        </div>
        <div className="otms-arena-fight-bottom"><span>{room.message}</span><span>{room.phase==='finished'&&isGm?<><button onClick={rematch}><RotateCcw size={15}/> Revanche</button><button onClick={backToLobby}><LogOut size={15}/> Voltar à sala</button></>:room.phase==='playing'?<button onClick={()=>pause(fighters.find(f=>f.userId===userId)?.device||'keyboard')}><Pause size={14}/> PAUSAR</button>:null}</span></div>
      </div>}
      <footer className="otms-arena-footer"><div><Gamepad2 size={16}/><b>CONTROLE</b> STICK mover · A pular · X leve · Y forte · RB especial · B defesa · LB esquiva · START pausa</div>
        <div><Keyboard size={16}/><b>TECLADO</b> A/D mover · ESPAÇO pular · J/K atacar · U especial · I defender · SHIFT esquiva · ESC pausa · F1 hitboxes</div></footer>
    </div>
  </div></div>
}
