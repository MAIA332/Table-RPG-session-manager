'use client'
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react'
import {Gamepad2,Keyboard,Play,Pause,RotateCcw,Swords,X,LogOut,Maximize2,Minimize2,BookOpen,Check,ChevronRight,Volume2,VolumeX,Settings,ArrowLeft,Users,Bot,Trash2} from 'lucide-react'
import {ArenaStage} from './arena-stage'
import type {ArenaInput,ArenaSnapshot,ArenaPortrait,DirectionSample} from '@/lib/arena/model'
import {ARENA_STAGES,ARENA_CAST,arenaRoster,fighterPortrait} from '@/lib/arena/catalog'
import {ALTER_LYSA_KEYS,ALTER_LYSA_PAD,SECRET_HOLD_MS} from '@/lib/arena/secrets'
import {NO_INPUT,PULSE_BUTTONS,arenaSettings,arenaTeam,recognizeMotion} from '@/lib/arena/model'
import {menuRepeatStep,readArenaPadInput,readArenaPadMenu,type MenuRepeat} from '@/lib/arena/gamepad'
import {arenaButtons,nextArenaButton} from './controller-navigation'
import {createPortal} from 'react-dom'
import {animationUrls} from '@/lib/arena/animation'
import {FX_URLS} from '@/lib/arena/fx'
import {arenaAudio} from '@/lib/arena/audio'
import {preloadArenaImages} from '@/lib/arena/assets'
import {acceptArenaSnapshot} from '@/lib/arena/snapshot-order'
import {ArenaWireDecoder} from '@/lib/arena/wire'
import './arena.css'

type Props={campaignId:string;userId:string;isGm:boolean}
type PadView={index:number;name:string}
type PadMemory={repeat:MenuRepeat;confirm:boolean;back:boolean;start:boolean}
const blankMemory=():PadMemory=>({repeat:{direction:0,nextAt:0},confirm:false,back:false,start:false})
const colors=['#cfb18a','#b8a8cf','#9bc7cb','#b5c999']
const deviceKey=(index:number)=>`pad:${index}`
const connectedPads=():Gamepad[]=>typeof navigator!=='undefined'&&navigator.getGamepads?Array.from(navigator.getGamepads()).filter((p):p is Gamepad=>!!p?.connected):[]
const labelDevice=(d:string)=>d==='keyboard'?'Teclado 1':`Controle ${Number(d.slice(4))+1}`
const KEY_INPUT:Record<string,keyof ArenaInput>={
  KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'jump',KeyW:'jump',ArrowUp:'jump',
  KeyJ:'light',KeyK:'heavy',KeyL:'kick',Semicolon:'lowKick',KeyU:'special',KeyO:'special2',KeyP:'special3',KeyI:'guard',ShiftLeft:'dodge',ShiftRight:'dodge',ArrowDown:'crouch',KeyS:'crouch',
}
const columns=()=>typeof window==='undefined'?6:window.innerWidth<600?4:6

export function ArenaMinigame({campaignId,userId,isGm}:Props){
  const [visible,setVisible]=useState(false)
  const [showHelp,setShowHelp]=useState(false)
  const [showSettings,setShowSettings]=useState(false)
  const settingsRef=useRef(false);settingsRef.current=showSettings
  const [assetsReady,setAssetsReady]=useState(false)
  const [soundEnabled,setSoundEnabled]=useState(true)
  const [stageCursor,setStageCursor]=useState(0)
  const stageCursorRef=useRef(0);stageCursorRef.current=stageCursor
  const focusedButtons=useRef(new Map<string,HTMLButtonElement>())
  const helpRef=useRef(false);helpRef.current=showHelp
  const [room,setRoom]=useState<ArenaSnapshot|null>(null)
  const [pads,setPads]=useState<PadView[]>([])
  const [target,setTarget]=useState('keyboard')
  const [cursors,setCursors]=useState<Record<string,number>>({})
  const [debugBoxes,setDebugBoxes]=useState(false)
  const [browserFullscreen,setBrowserFullscreen]=useState(false)
  const [error,setError]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  const roomRef=useRef(room)
  const visibleRef=useRef(visible);visibleRef.current=visible
  const targetRef=useRef(target);targetRef.current=target
  const cursorsRef=useRef(cursors);cursorsRef.current=cursors
  const memory=useRef(new Map<number,PadMemory>())
  const pressed=useRef(new Set<string>())
  const motionHistory=useRef(new Map<string,DirectionSample[]>())
  const queuedPresses=useRef(new Map<string,Partial<ArenaInput>>())
  const liveInputs=useRef(new Map<string,ArenaInput>())
  const inputInFlight=useRef(0),inputPump=useRef<(()=>void)|null>(null)
  const pulseCounters=useRef(new Map<string,Partial<Record<keyof ArenaInput,number>>>())
  const lastStreamPacket=useRef(0),lastInputSnapshot=useRef(0),lastInputHud=useRef(0),inputFailures=useRef(0)
  const lastCombatPad=useRef(new Map<number,ArenaInput>())
  const mouse=useRef({light:false,heavy:false})
  const busy=useRef(new Set<string>())
  const requestVersion=useRef(0)
  const refreshInFlight=useRef(false)
  const mutationVersion=useRef(0)
  const inputSequence=useRef(0)
  const inputSource=useRef(`web:${Date.now()}:${Math.random().toString(36).slice(2)}`)
  const dismissed=useRef<string|null>(null)
  useEffect(()=>{arenaAudio.setEnabled(soundEnabled)},[soundEnabled])
  useEffect(()=>{arenaAudio.setMusic(visible?(room?.phase==='playing'||room?.phase==='paused'||room?.phase==='finished'?'battle':'menu'):null,room?.phase==='paused')},[visible,room?.phase])
  useEffect(()=>()=>arenaAudio.setMusic(null),[])
  const endpoint=`/api/campaigns/${encodeURIComponent(campaignId)}/arena`
  const rememberDirection=useCallback((device:string,input:ArenaInput)=>{
    const now=performance.now()/1000,moving=Number(input.right)-Number(input.left)
    const direction=input.crouch?(moving<0?1:moving>0?3:2):moving<0?4:moving>0?6:5
    const history=(motionHistory.current.get(device)||[]).filter(sample=>now-sample.at<.5)
    if(history.at(-1)?.direction!==direction)history.push({direction,at:now})
    motionHistory.current.set(device,history)
    return {history,now}
  },[])
  const queuePulse=useCallback((device:string,key:keyof ArenaInput,input:ArenaInput)=>{
    const {history,now}=rememberDirection(device,input)
    const fighter=roomRef.current?.fighters.find(f=>f.userId===userId&&f.device===device)
    const basic=['light','heavy','kick','lowKick'].includes(key)
    const motion=basic&&fighter?recognizeMotion(history,fighter.facing,now):null
    const forwardShortcut=key==='special'&&device.startsWith('pad:')&&fighter&&(Number(input.right)-Number(input.left))===fighter.facing
    const effective=motion==='forward'?'special':motion==='back'?'special2':forwardShortcut?'special3':key
    const counts=pulseCounters.current.get(device)||{};counts[effective]=(counts[effective]||0)+1;pulseCounters.current.set(device,counts)
    queuedPresses.current.set(device,{...queuedPresses.current.get(device),[effective]:true})
    if(motion)motionHistory.current.set(device,[])
  },[rememberDirection,userId])
  const applyRoom=useCallback((next:ArenaSnapshot|null)=>{if(acceptArenaSnapshot(roomRef.current,next)){roomRef.current=next;setRoom(next)}},[])
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
      if(action==='start')void arenaAudio.play('ui:start')
      if(action==='fight')void arenaAudio.play('ui:battle')
      if(action==='unlock-alter-lysa')void arenaAudio.play('ui:secret')
      if(!inputOnly&&mutation===mutationVersion.current)applyRoom(result.room||null)
      if(!silent)setError('')
    }catch(e){if(!silent)setError(e instanceof Error?e.message:'Erro na arena.')}finally{if(!inputOnly)busy.current.delete(slot)}
  },[applyRoom,endpoint])
  const focusScope=useCallback(()=>{
    const root=ref.current;if(!root)return null
    return root.querySelector<HTMLElement>('.arena-help-card,.arena-settings-card,.arena-result-card')||root
  },[])
  const focusButton=useCallback((device:string,button:HTMLButtonElement,sound=true)=>{
    ref.current?.querySelectorAll('[data-controller-focus=true]').forEach(el=>el.removeAttribute('data-controller-focus'))
    button.dataset.controllerFocus='true';focusedButtons.current.set(device,button)
    button.focus({preventScroll:true});button.scrollIntoView({block:'nearest',inline:'nearest'});if(sound)void arenaAudio.play('ui:move')
    const index=button.dataset.rosterIndex
    if(index!==undefined){cursorsRef.current={...cursorsRef.current,[device]:Number(index)};setCursors(cursorsRef.current)}
    if(button.dataset.stageIndex!==undefined){const i=Number(button.dataset.stageIndex);stageCursorRef.current=i;setStageCursor(i)}
  },[])
  const moveCursor=useCallback((device:string,step:number)=>{
    const root=focusScope();if(!root)return
    focusDevice(device)
    const button=nextArenaButton(root,focusedButtons.current.get(device),step)
    if(button)focusButton(device,button)
  },[focusButton,focusDevice,focusScope])
  const joinOrSelect=useCallback((device:string,index?:number)=>{
    const current=roomRef.current
    if(current?.phase!=='lobby'||!current.roster.length)return
    focusDevice(device)
    const chosen=index??cursorsRef.current[device]??Math.max(0,current.roster.findIndex(c=>c.id===current.fighters.find(f=>f.userId===userId&&f.device===device)?.characterId))
    const characterId=current.roster[chosen]?.id||current.roster[0].id
    const existing=current.fighters.some(f=>f.userId===userId&&f.device===device)
    void arenaAudio.unlock();void arenaAudio.play('ui:confirm')
    void command(existing?'select':'join',{device,characterId})
  },[command,focusDevice,userId])
  const start=useCallback(()=>{if(assetsReady)void command('start')},[command,assetsReady])
  const rematch=useCallback(()=>{void command('rematch')},[command])
  const backToLobby=useCallback(()=>{void command('reset')},[command])
  const confirmLobby=useCallback((device:string)=>{
    const root=focusScope();if(!root)return
    focusDevice(device)
    let button=focusedButtons.current.get(device)
    if(!button||!root.contains(button)||button.disabled)button=arenaButtons(root).find(b=>b.matches('[data-roster-index],[data-stage-index]'))||arenaButtons(root)[0]
    if(button){focusButton(device,button,false);void arenaAudio.unlock();if(!button.matches('[data-roster-index],.arena-seat-main,.arena-devices button'))void arenaAudio.play('ui:confirm');button.click()}
  },[focusButton,focusDevice,focusScope])
  const pause=useCallback((device:string)=>{
    const current=roomRef.current;if(!current)return
    if(current.phase==='playing'){
      const participant=current.fighters.find(f=>!f.bot&&!f.withdrawn&&f.userId===userId&&f.device===device)||current.fighters.find(f=>!f.bot&&!f.withdrawn&&f.userId===userId)
      if(!isGm&&!participant)return
      void command('pause',{device:participant?.device||device})
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
  const openHelp=useCallback(()=>{
    pressed.current.clear();queuedPresses.current.clear()
    const current=roomRef.current
    if(current?.phase==='playing'){
      const fighter=current.fighters.find(f=>f.userId===userId&&!f.bot)
      if(fighter)void command('pause',{device:fighter.device})
    }
    setShowHelp(true)
  },[command,userId])
  const activatePause=useCallback(()=>{confirmLobby(targetRef.current)},[confirmLobby])
  const backMenu=useCallback((device:string)=>{
    if(helpRef.current){setShowHelp(false);return}
    if(settingsRef.current){setShowSettings(false);return}
    const phase=roomRef.current?.phase
    if(phase==='stage')void command('cancel-stage')
    else if(phase==='finished')void command('reset')
    else if(phase==='playing'||phase==='paused')pause(device)
    else if(phase==='lobby')void command('leave',{device})
  },[command,hide,pause])

  useEffect(()=>{
    if(!visible)return
    if(room?.phase==='playing'&&!showHelp&&!showSettings){focusedButtons.current.clear();ref.current?.querySelectorAll('[data-controller-focus]').forEach(el=>el.removeAttribute('data-controller-focus'));ref.current?.focus({preventScroll:true});return}
    focusedButtons.current.clear()
    const timer=requestAnimationFrame(()=>{
      const root=focusScope();if(!root)return
      const preferred=root.querySelector<HTMLButtonElement>(showSettings?'[data-time-choice][aria-pressed=true]':room?.phase==='paused'?'.arena-pause-card button:not(:disabled)':room?.phase==='stage'?'[data-stage-index="0"]':'.arena-character[aria-pressed=true],.arena-character')
      const button=preferred||arenaButtons(root)[0]
      if(button)focusButton(targetRef.current,button,false)
    })
    return()=>cancelAnimationFrame(timer)
  },[visible,room?.phase,showHelp,showSettings,focusButton,focusScope])
  useEffect(()=>{if(room?.phase!=='lobby')setShowSettings(false)},[room?.phase])
  useEffect(()=>{
    const secret=(event:Event)=>{
      const index=(event as CustomEvent<{index:number}>).detail?.index
      if(typeof index!=='number')return
      dismissed.current=null;setPads(connectedPads().map(p=>({index:p.index,name:p.id.slice(0,42)})))
      focusDevice(deviceKey(index));setVisible(true);setError('')
      void command('open')
    }
    const invite=()=>{if(visibleRef.current||!connectedPads().length)return;void refresh().then(next=>{
      if(next?.phase==='lobby'&&dismissed.current!==next.id)setVisible(true)
    })}
    const changed=()=>{void refresh().then(next=>{if(next?.phase==='lobby'&&connectedPads().length&&dismissed.current!==next.id)setVisible(true)})}
    const open=()=>{dismissed.current=null;setVisible(true);void command('open')}
    window.addEventListener('otms.arena.open',open)
    window.addEventListener('otms.arena.secret',secret)
    window.addEventListener('otms.arena.changed',changed)
    invite();const timer=window.setInterval(invite,9000)
    return()=>{clearInterval(timer);window.removeEventListener('otms.arena.open',open);window.removeEventListener('otms.arena.secret',secret);window.removeEventListener('otms.arena.changed',changed)}
  },[command,focusDevice,isGm,refresh])
  useEffect(()=>{
    document.documentElement.dataset.otmsArenaActive=visible?'true':'false'
    if(!visible)return
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden'
    window.requestAnimationFrame(()=>ref.current?.focus({preventScroll:true}))
    return()=>{document.documentElement.dataset.otmsArenaActive='false';document.body.style.overflow=overflow}
  },[visible])
  const selectionKey=(room?.fighters||[]).map(f=>f.alterLysa?'alter-lysa':f.characterId).sort().join('|')
  useEffect(()=>{
    if(!visible)return
    let cancelled=false
    setAssetsReady(false)
    const ids=selectionKey.split('|').filter(Boolean)
    if(!ids.length)ids.push('fander')
    if(ids.length===1)ids.push(ids[0]==='fander'?'andreas':'fander')
    const sources=new Set([...ids.flatMap(animationUrls),...FX_URLS,...ARENA_STAGES.map(s=>s.image)])
    void Promise.all([preloadArenaImages(sources),arenaAudio.preload(ids)]).then(()=>{
      if(!cancelled)setAssetsReady(true)
    }).catch(()=>{if(!cancelled)setError('Não foi possível carregar as animações ou os sons. Confira a conexão e reabra a arena.')})
    return()=>{cancelled=true}
  },[visible,selectionKey])
  useEffect(()=>{
    if(!visible)return
    void refresh()
    if(room?.phase!=='playing'&&room?.phase!=='paused'){
      const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},1200)
      return()=>clearInterval(timer)
    }
    let connected=false,lastHud=0,lastPacket=performance.now()
    const stream=new EventSource(endpoint+'/stream'),wire=new ArenaWireDecoder()
    stream.onopen=()=>{connected=true}
    stream.onmessage=event=>{
      try{
        const decoded=wire.read(JSON.parse(event.data));if(decoded===undefined)return
        const next=decoded?{...decoded,roster:roomRef.current?.roster||ARENA_CAST}:null
        if(!acceptArenaSnapshot(roomRef.current,next))return
        lastPacket=performance.now()
        lastStreamPacket.current=lastPacket
        roomRef.current=next
        const now=performance.now()
        if(now-lastHud>=100||next?.phase!==room?.phase){lastHud=now;setRoom(next)}
      }catch{}
    }
    stream.onerror=()=>{connected=false}
    const fallback=setInterval(()=>{
      const now=performance.now(),owned=roomRef.current?.fighters.some(f=>!f.bot&&f.userId===userId&&!f.withdrawn)
      if((!connected||now-lastPacket>450)&&(!owned||now-lastInputSnapshot.current>200)&&document.visibilityState==='visible')void refresh()
    },50)
    return()=>{stream.close();clearInterval(fallback)}
  },[visible,room?.phase,endpoint,refresh,userId])
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
      if(e.ctrlKey||e.metaKey||e.altKey)return
      if(e.code==='Tab'){
        const root=focusScope();if(root){const buttons=arenaButtons(root),i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(buttons.length){e.preventDefault();focusButton('keyboard',buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length])}}
        return
      }
      if(helpRef.current){e.preventDefault();if(e.code==='Escape'||e.code==='Enter')setShowHelp(false);else if(e.code==='ArrowDown'||e.code==='ArrowUp')ref.current?.querySelector('.arena-help-card')?.scrollBy({top:e.code==='ArrowDown'?150:-150});return}
      const phase=roomRef.current?.phase
      if(e.code==='Escape'||e.code==='Backspace'){
        e.preventDefault();if(!e.repeat)backMenu(roomRef.current?.phase==='lobby'?targetRef.current:'keyboard');return
      }
      if(settingsRef.current){
        const directions:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2}
        if(directions[e.code]){e.preventDefault();if(!e.repeat)moveCursor('keyboard',directions[e.code])}
        else if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)confirmLobby('keyboard')}
        return
      }
      if(phase==='paused'||phase==='finished'||phase==='stage'){
        const movements:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2}
        if(movements[e.code]){e.preventDefault();if(!e.repeat)moveCursor('keyboard',movements[e.code]);return}
        if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)confirmLobby('keyboard');return}
        return
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
        const input=KEY_INPUT[e.code],fresh=!pressed.current.has(e.code)
        pressed.current.add(e.code)
        const buttons:ArenaInput={...NO_INPUT};for(const code of pressed.current)buttons[KEY_INPUT[code]]=true
        rememberDirection('keyboard',buttons)
        if(fresh&&(PULSE_BUTTONS as readonly string[]).includes(input))queuePulse('keyboard',input,buttons)
        inputPump.current?.()
      }
    }
    const keyup=(e:KeyboardEvent)=>{if(e.code in KEY_INPUT){e.preventDefault();pressed.current.delete(e.code);const buttons:ArenaInput={...NO_INPUT};for(const code of pressed.current)buttons[KEY_INPUT[code]]=true;rememberDirection('keyboard',buttons);inputPump.current?.()}}
    const clear=()=>{pressed.current.clear();queuedPresses.current.clear();lastCombatPad.current.clear();motionHistory.current.clear();mouse.current={light:false,heavy:false};inputPump.current?.()}
    window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',clear)
    return()=>{window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',clear);clear()}
  },[visible,activatePause,backToLobby,command,confirmLobby,hide,joinOrSelect,moveCursor,pause,rematch,rememberDirection,queuePulse,backMenu,focusButton,focusScope])
  useEffect(()=>{
    if(!visible)return
    let frame=0,lastAt=0
    const inspect=(now:number)=>{
      frame=requestAnimationFrame(inspect)
      if(now-lastAt<8||document.visibilityState==='hidden')return
      lastAt=now
      const current=roomRef.current
      const connected=connectedPads(),available=new Set(connected.map(p=>p.index))
      for(const index of memory.current.keys())if(!available.has(index))memory.current.delete(index)
      for(const pad of connected){
        const pressedNow=readArenaPadMenu(pad),prev=memory.current.get(pad.index)||blankMemory()
        const isLobby=current?.phase==='lobby',isPaused=current?.phase==='paused',isStage=current?.phase==='stage'
        const {next,move}=menuRepeatStep(prev.repeat,current?.phase!=='playing'||helpRef.current?pressedNow.direction:0,now)
        const device=deviceKey(pad.index)
        if(current?.phase==='playing'){
          const live=readArenaPadInput(pad)
          rememberDirection(device,live)
          const prior=lastCombatPad.current.get(pad.index)||NO_INPUT
          for(const key of PULSE_BUTTONS)if(live[key]&&!prior[key])queuePulse(device,key,live)
          lastCombatPad.current.set(pad.index,live)
        }else lastCombatPad.current.delete(pad.index)
        if(helpRef.current){
          if(move)ref.current?.querySelector('.arena-help-card')?.scrollBy({top:Math.sign(move)*145})
          if(pressedNow.back&&!prev.back||pressedNow.confirm&&!prev.confirm)setShowHelp(false)
        }else if(settingsRef.current){
          if(move)moveCursor(device,move)
          if(pressedNow.confirm&&!prev.confirm)confirmLobby(device)
          if(pressedNow.back&&!prev.back)setShowSettings(false)
        }else if(isLobby||isStage||isPaused||current?.phase==='finished'){
          if(move)moveCursor(device,move)
          if(pressedNow.confirm&&!prev.confirm)confirmLobby(device)
          if(pressedNow.back&&!prev.back)backMenu(device)
          if(pressedNow.start&&!prev.start){
            if(isLobby)start()
            else if(isStage)void command('fight',{stageId:ARENA_STAGES[stageCursorRef.current].id})
            else if(isPaused)pause(device)
            else rematch()
          }
        }else if(current?.phase==='playing'&&pressedNow.start&&!prev.start)pause(device)
        memory.current.set(pad.index,{repeat:next,confirm:pressedNow.confirm,back:pressedNow.back,start:pressedNow.start})
      }
    }
    frame=requestAnimationFrame(inspect)
    return()=>{cancelAnimationFrame(frame);memory.current.clear()}
  },[visible,activatePause,backToLobby,command,confirmLobby,isGm,joinOrSelect,moveCursor,pause,rematch,start,userId,rememberDirection,queuePulse,backMenu])
  useEffect(()=>{
    if(!visible||!room)return
    if(room.phase!=='playing'){
      if(room.phase!=='lobby'&&room.phase!=='stage')return
      const timer=setInterval(()=>{
        for(const f of roomRef.current?.fighters||[])if(f.userId===userId&&!f.bot)void command('heartbeat',{device:f.device},true)
      },3000)
      return()=>clearInterval(timer)
    }
    let stopped=false,lastSignature='',lastSend=0
    const controllers=new Set<AbortController>()
    const push=async()=>{
      if(stopped||inputInFlight.current>=3||document.visibilityState!=='visible'||roomRef.current?.phase!=='playing')return
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
        for(const key of PULSE_BUTTONS)if(pending[key])buttons[key]=true
        liveInputs.current.set(f.device,buttons)
        return {device:f.device,buttons,pulses:{...pulseCounters.current.get(f.device)}}
      })
      const signature=JSON.stringify(inputs),sentAt=performance.now()
      if(signature===lastSignature&&sentAt-lastSend<100)return
      lastSignature=signature;lastSend=sentAt
      // A small bounded pipeline sends edges immediately, independent of the previous RTT.
      // Monotonic pulse counters let a later packet recover a lost/reordered button press.
      for(const f of owned)queuedPresses.current.delete(f.device)
      inputInFlight.current++
      const controller=new AbortController();controllers.add(controller)
      try{
        const timeout=setTimeout(()=>controller.abort(),1800)
        let response:Response
        try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'input',inputs,seq:++inputSequence.current,source:inputSource.current,snapshot:performance.now()-lastStreamPacket.current>250}),signal:controller.signal})}
        finally{clearTimeout(timeout)}
        if(!response.ok)throw new Error('input delivery failed')
        const result=await response.json()
        if(result.compact&&result.room){
          const next={...result.room,roster:roomRef.current?.roster||ARENA_CAST} as ArenaSnapshot,now=performance.now()
          lastInputSnapshot.current=now
          if(acceptArenaSnapshot(roomRef.current,next)){roomRef.current=next;if(now-lastInputHud.current>100){lastInputHud.current=now;setRoom(next)}}
        }
        if(inputFailures.current){inputFailures.current=0;setError(previous=>previous.startsWith('Conexão da arena')?'':previous)}
      }catch{
        if(stopped)return
        lastSignature=''
        if(++inputFailures.current===3)setError('Conexão da arena interrompida. Reconectando os comandos…')
      }finally{controllers.delete(controller);inputInFlight.current=Math.max(0,inputInFlight.current-1)}
    }
    inputPump.current=()=>void push();void push();const timer=setInterval(()=>void push(),16)
    return()=>{stopped=true;inputPump.current=null;clearInterval(timer);for(const c of controllers)c.abort();liveInputs.current.clear();queuedPresses.current.clear()}
  },[visible,room?.phase,endpoint,userId])

  useEffect(()=>{
    const title=ref.current?.querySelector<HTMLElement>('.arena-showcase-copy h2'),subtitle=title?.previousElementSibling as HTMLElement|null
    if(!title||!subtitle)return
    const measure=()=>{
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)return
      const inkLeft=(element:HTMLElement)=>{const style=getComputedStyle(element);context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return -context.measureText(style.textTransform==='uppercase'?(element.textContent||'').toUpperCase():element.textContent||'').actualBoundingBoxLeft}
      subtitle.style.paddingLeft='0';subtitle.style.marginLeft=(inkLeft(title)-inkLeft(subtitle)+parseFloat(getComputedStyle(title).fontSize)*.18)+'px'
    }
    measure();const observer=new ResizeObserver(measure);observer.observe(title)
    return()=>observer.disconnect()
  },[visible,room?.phase,cursors,target,selectionKey])
  useEffect(()=>{
    if(!visible)return
    const keys=new Set<string>(),holds=new Map<string,{at:number;fired:boolean}>();let frame=0
    const down=(e:KeyboardEvent)=>{if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(ALTER_LYSA_KEYS as readonly string[]).includes(e.code)){keys.add(e.code);e.preventDefault()}}
    const up=(e:KeyboardEvent)=>{keys.delete(e.code)}
    const clear=()=>{keys.clear();holds.clear()}
    const inspect=(now:number)=>{
      frame=requestAnimationFrame(inspect)
      const current=roomRef.current
      if(current?.phase!=='lobby'||helpRef.current){holds.clear();return}
      const devices=[{device:'keyboard',held:ALTER_LYSA_KEYS.every(k=>keys.has(k))},...connectedPads().map(p=>({device:deviceKey(p.index),held:ALTER_LYSA_PAD.every(i=>p.buttons[i]?.pressed)}))]
      for(const {device,held}of devices){
        const f=current.fighters.find(f=>f.userId===userId&&f.device===device&&!f.bot)
        if(!held||f?.characterId!=='lysa'){holds.delete(device);continue}
        const hold=holds.get(device)||{at:now,fired:false};holds.set(device,hold)
        if(!hold.fired&&!f.alterLysa&&now-hold.at>=SECRET_HOLD_MS){hold.fired=true;void command('unlock-alter-lysa',{device})}
      }
    }
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',clear);frame=requestAnimationFrame(inspect)
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',clear)}
  },[visible,command,userId])
  if(!visible)return <button type="button" className="otms-arena-entry" onClick={()=>{void arenaAudio.unlock();void arenaAudio.play('ui:open');setVisible(true);void command('open')}} title="Morte Mágica: Arena · L3 + R3"><Swords size={16}/> Arena</button>
  const roster=room?arenaRoster(room):[],fighters=room?.fighters||[]
  const selected=target,own=fighters.find(f=>f.userId===userId&&f.device===selected)
  const fallback=Math.max(0,roster.findIndex(p=>p.id===own?.characterId))
  const focus=Math.max(0,Math.min(roster.length-1,cursors[selected]??fallback))
  const preview=roster[focus]
  const settings=arenaSettings(room||{}),teams=settings.mode==='teams',teamColors=['#94cafa','#f0a3a0'],teamName=(team:number)=>team===0?'AZUL':'VERMELHA'
  const canStart=assetsReady&&!!room&&(room.phase==='lobby'||room.phase==='finished')&&fighters.some(f=>!f.bot)&&fighters.filter(f=>!f.bot).every(f=>!!f.characterId)&&(!teams||fighters.length===4)
  const solo=fighters.length===1
  const options=pauseActions()
  const isPause=room?.phase==='paused'
  const onPortrait=(p:ArenaPortrait,index:number)=>{
    const activeDevice=targetRef.current
    cursorsRef.current={...cursorsRef.current,[selected]:index};setCursors(cursorsRef.current)
    joinOrSelect(activeDevice,index)
  }
  const stage=room?.phase==='stage'?ARENA_STAGES[stageCursor]:ARENA_STAGES.find(s=>s.id===room?.stageId)||ARENA_STAGES[0]
  const winner=fighters.find(f=>f.id===room?.winnerId)
  return createPortal(<div className="otms-arena" role="presentation" style={{'--arena-accent':preview?.color||'#dcbe8b','--arena-scenery':'url("'+stage.image+'")'} as CSSProperties}>
    <div className="otms-arena-shell" onPointerDownCapture={()=>{void arenaAudio.unlock()}} ref={ref} role="dialog" aria-modal="true" aria-label="Morte Mágica: Arena" tabIndex={-1}>
      <div className="arena-atmosphere" aria-hidden="true"/><div className="arena-scanlines" aria-hidden="true"/>
      <header className="arena-header">
        <div className="arena-wordmark"><img src="/arena/logo-v10.png" alt="Morte Mágica: Arena" fetchPriority="high"/></div>
        <div className="arena-toolbar">
          <button aria-label={soundEnabled?'Silenciar efeitos sonoros':'Ativar efeitos sonoros'} aria-pressed={soundEnabled} onClick={()=>{setSoundEnabled(!soundEnabled);arenaAudio.setEnabled(!soundEnabled);if(!soundEnabled)void arenaAudio.unlock()}}>{soundEnabled?<Volume2 size={18}/>:<VolumeX size={18}/>}</button>
          <button onClick={toggleFullscreen} aria-label="Alternar tela cheia">{browserFullscreen?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
          {room?.phase!=='playing'&&room?.phase!=='paused'&&<button onClick={openHelp} aria-label="Comandos" title="Comandos"><BookOpen size={16}/></button>}
          {isGm&&room&&<button onClick={()=>void command('close')} title="Encerrar a sala para todos"><LogOut size={16}/></button>}
          <button onClick={hide} aria-label="Ocultar arena"><X size={19}/></button>
        </div>
      </header>
      {error&&<div role="alert" className="arena-error">{error}<button onClick={()=>setError('')} aria-label="Fechar aviso"><X size={15}/></button></div>}
      {!room?<section className="arena-empty"><Swords size={54}/><h2>SEU PRÓXIMO DUELO ESPERA.</h2><button className="arena-launch" onClick={()=>void command('open')}><Play size={19}/> ENTRAR</button></section>:
      room.phase==='lobby'?<main className="arena-lobby">
        <div className="arena-section-title"><span>SELEÇÃO DE PERSONAGEM</span></div>
        <div className="arena-selection">
          <section className="arena-showcase" key={preview?.id} aria-label="Personagem em destaque">
            <div className="arena-showcase-letter" aria-hidden="true">{preview?.name.charAt(0)}</div>
            {preview&&<img className="arena-showcase-image" src={preview.imageUrl} alt={preview.name} fetchPriority="high" style={{objectPosition:['amelia','lysa','loulan'].includes(preview.id)?'center top':undefined}}/>}
            <div className="arena-showcase-shade"/>
            <div className="arena-showcase-copy"><p>{preview?.title}</p><h2>{preview?.name}</h2>
              <div className="arena-confirm-prompt"><Gamepad2 size={17}/><span>{labelDevice(selected)}</span><i/><span className="arena-pad-key key-a">A</span><span>ou</span><kbd>ENTER</kbd></div>
            </div>
          </section>
          <section className="arena-roster-panel">
            <div className="arena-panel-heading"><h3>PERSONAGENS</h3><span><span className="arena-pad-key key-a">A</span> CONFIRMAR</span></div>
            <div className="arena-roster" style={{'--roster-columns':columns()} as CSSProperties}>
              {roster.map((p,i)=>{
                const picks=fighters.map((f,j)=>({f,j:f.slot??j})).filter(({f})=>f.characterId===p.id)
                return <button type="button" className="arena-character" key={p.id} data-roster-index={i} data-focused={focus===i} aria-label={'Escolher '+p.name} aria-pressed={own?.characterId===p.id} onMouseEnter={()=>{cursorsRef.current={...cursorsRef.current,[selected]:i};setCursors(cursorsRef.current)}} onClick={()=>onPortrait(p,i)} style={{'--fighter-color':p.color,'--card-order':i} as CSSProperties}>
                  <img src={p.imageUrl} alt="" draggable={false}/><span className="arena-character-glow"/><strong>{p.name}</strong>
                  <span className="arena-pick-badges">{picks.map(({f,j})=><b key={f.id} style={{background:colors[j%4]}}>P{j+1}</b>)}</span>
                  {focus===i&&<span className="arena-corner-mark" aria-hidden="true"/>}
                </button>
              })}
            </div>
            <div className="arena-techniques" key={preview?.id}>
              {preview?.techniques?.map((skill,i)=><div className="arena-technique" key={skill.name}><span className="arena-motion">{skill.passive?'✦':i===0?'↓ ↘ →':i===1?'↓ ↙ ←':<><span>→ +</span><kbd className="arena-shoulder-key" aria-label="Botão RB">RB</kbd></>}</span><div><b>{skill.name}</b><p>{skill.description}</p></div></div>)}
            </div>
          </section>
        </div>
        <section className="arena-seats" aria-label="Participantes">{Array.from({length:4},(_,i)=>{
          const f=fighters.find((f,j)=>(f.slot??j)===i),c=f?fighterPortrait(roster,f):undefined,canEditBot=!!f?.bot&&(isGm||f.botOwnerId===userId)
          return <div className="arena-seat" key={i} data-slot={i} data-occupied={!!f} style={{'--seat-color':colors[i]} as CSSProperties}>
            <button type="button" className="arena-seat-main" disabled={!!f&&(f.bot||f.userId!==userId)||!f&&!!own} onClick={()=>{if(!f)joinOrSelect(selected);else if(f.userId===userId)focusDevice(f.device)}}><span className="arena-seat-index">P{i+1}</span>{c&&<img src={c.imageUrl} alt=""/>}<span className="arena-seat-copy"><b>{c?.name||'ENTRAR'}</b><small>{f?<><span className="arena-seat-player">{f.bot?'BOT':f.userId===userId?'Você':f.name}</span>{f.bot?<Bot size={16} aria-label="BOT"/>:f.device==='keyboard'?<Keyboard size={16} role="img" aria-label={labelDevice(f.device)}/>:<Gamepad2 size={16} role="img" aria-label={labelDevice(f.device)}/>}</>:'Escolha um personagem'}</small>{teams&&<em className="arena-team-label" style={{color:teamColors[i%2]}}>EQUIPE {teamName(i%2)}</em>}</span>{f&&!f.bot&&<Check className="arena-seat-check" size={17}/>}</button>
            {!f?<button className="arena-seat-add-bot" aria-label={'Adicionar BOT em P'+(i+1)} onClick={()=>void command('add-bot',{slot:i})}><Bot size={19}/><span>BOT</span></button>:canEditBot?<div className="arena-bot-actions"><button aria-label={'Trocar personagem do BOT P'+(i+1)} title="Trocar personagem" onClick={()=>void command('select-bot',{fighterId:f.id,characterId:roster[(roster.findIndex(p=>p.id===f.characterId)+1)%roster.length].id})}><RotateCcw size={15}/></button><button aria-label={'Remover BOT de P'+(i+1)} title="Remover BOT" onClick={()=>void command('remove-bot',{fighterId:f.id})}><Trash2 size={15}/></button></div>:null}
          </div>
        })}</section>
        <div className="arena-ready"><div className="arena-devices" role="group" aria-label="Dispositivo do jogador">{pads.map((p,i)=>{
          const device=deviceKey(p.index),joined=fighters.some(f=>f.userId===userId&&f.device===device)
          return <button type="button" key={device} data-active={target===device} aria-pressed={target===device} onClick={()=>{focusDevice(device);if(!joined)joinOrSelect(device)}}><Gamepad2 size={16}/>Controle {p.index+1}</button>
        })}<button data-active={target==='keyboard'} aria-pressed={target==='keyboard'} onClick={()=>{focusDevice('keyboard');if(!fighters.some(f=>f.userId===userId&&f.device==='keyboard'))joinOrSelect('keyboard')}}><Keyboard size={15}/>Teclado</button>{own&&<button className="arena-device-leave" onClick={()=>void command('leave',{device:selected})} aria-label={'Desconectar '+labelDevice(selected)}><LogOut size={14}/>Sair</button>}</div>
          <div className="arena-launch-actions"><button className="arena-launch arena-settings-open" onClick={()=>setShowSettings(true)} aria-label="Configurações da arena" title="Configurações da arena"><Settings size={24}/></button><button className="arena-launch" disabled={!canStart} onClick={start}><span>{!assetsReady?'PREPARANDO ARENA…':solo?'JOGAR CONTRA CPU':'JOGAR'}</span><ChevronRight size={25}/></button></div>
        </div>
      </main>:room.phase==='stage'?<main className="arena-stage-selection">
        <div className="arena-section-title"><span>SELEÇÃO DE CENÁRIO</span><button onClick={()=>void command('cancel-stage')}><ArrowLeft size={20}/> Voltar aos personagens</button></div>
        <div className="arena-map-showcase" key={stage.id}><img src={stage.image} alt={stage.region}/><div><h2>{stage.name}</h2></div></div>
        <div className="arena-stage-options">{ARENA_STAGES.map((s,i)=><button type="button" key={s.id} data-stage-index={i} data-active={stageCursor===i} aria-label={'Escolher cenário: '+s.region} onMouseEnter={()=>setStageCursor(i)} onFocus={()=>setStageCursor(i)} onClick={()=>void command('fight',{stageId:s.id})}><img src={s.image} alt=""/><span><b>{s.name}</b></span>{stageCursor===i&&<Check size={19}/>}</button>)}</div>
        <div className="arena-stage-ready"><button className="arena-launch" onClick={()=>void command('fight',{stageId:stage.id})}><Swords size={19}/> INICIAR COMBATE <ChevronRight size={20}/></button></div>
      </main>:<main className="arena-battle">
        <div className="arena-battle-hud"><span>ROUND {room.rounds}</span><span>{stage.name}</span></div>
        <div className="arena-health-grid" data-fighters={fighters.filter(f=>!f.withdrawn).length}><b className="arena-clock" aria-label="Tempo restante">{settings.roundSeconds===null?'∞':String(Math.max(0,settings.roundSeconds-Math.floor(room.roundElapsed))).padStart(2,'0')}</b>{fighters.filter(f=>!f.withdrawn).map((f,i,active)=>{
          const p=fighterPortrait(roster,f)
          const side=teams?(arenaTeam(room,f)===0?'left':'right'):i<Math.ceil(active.length/2)?'left':'right',row=teams?active.slice(0,i).filter(e=>arenaTeam(room,e)===arenaTeam(room,f)).length+1:side==='left'?i+1:i-Math.ceil(active.length/2)+1
          return <div key={f.id} className="arena-health" data-side={side} style={{'--seat-color':teams?teamColors[arenaTeam(room,f)]:colors[i%4],gridColumn:side==='left'?1:3,gridRow:row} as CSSProperties}><img src={p?.imageUrl} alt=""/><div><div className="arena-health-name"><b>{p?.name}</b><small>{teams&&<span className="arena-team-label">{teamName(arenaTeam(room,f))} · </span>}{f.bot?'CPU':f.userId===userId?labelDevice(f.device):f.name} {'◆'.repeat(f.wins)}</small></div><div className="arena-health-track"><span style={{width:f.health+'%'}}/></div><div className="arena-meter-row"><div title={f.alterLysa?'Euforia: 20 MP para transformar e 3 MP/s. Após sair, exige MP cheio.':'Magia: cada especial consome 25'}><span style={{width:f.meter+'%'}}/></div><small>{Math.ceil(f.health)} HP</small></div>{f.characterId==='loulan'&&<span className="arena-weapon-state" data-weapon={f.weapon}>{f.weapon==='kunai'?'◆ KUNAI · VELOCIDADE +10%':'◒ KARAMBIT · DANO +18%'}</span>}</div></div>
        })}</div>
        <div className="arena-stage-wrap"><ArenaStage room={room} getSnapshot={()=>roomRef.current||room} debugBoxes={debugBoxes} localPlayerId={userId} getLocalInput={(device)=>{if(device==='keyboard'){const input:ArenaInput={...NO_INPUT};for(const code of pressed.current){const key=KEY_INPUT[code];if(key)input[key]=true}input.light||=mouse.current.light;input.heavy||=mouse.current.heavy;return input}const pad=connectedPads().find(p=>deviceKey(p.index)===device);return pad?readArenaPadInput(pad):liveInputs.current.get(device)}} onPointerAttack={(kind,isPressed)=>{const fresh=isPressed&&!mouse.current[kind];mouse.current[kind]=isPressed;if(fresh){const input:ArenaInput={...NO_INPUT};for(const code of pressed.current){const key=KEY_INPUT[code];if(key)input[key]=true}input.light=mouse.current.light;input.heavy=mouse.current.heavy;queuePulse('keyboard',kind,input)}inputPump.current?.()}}/>
          {room.phase==='finished'&&<div className="arena-overlay arena-result"><div className="arena-result-card"><strong>{winner?'VITÓRIA':'FIM DO COMBATE'}</strong><h2>{teams&&room.winningTeam!=null?'EQUIPE '+teamName(room.winningTeam):winner?fighterPortrait(roster,winner)?.name||'EMPATE':'EMPATE'}</h2>{teams&&room.winningTeam!=null&&<p>{fighters.filter(f=>arenaTeam(room,f)===room.winningTeam).map(f=>fighterPortrait(roster,f)?.name).join(' + ')}</p>}<div><button className="arena-launch" onClick={rematch}><RotateCcw size={18}/> REVANCHE</button><button onClick={backToLobby}>Voltar à seleção</button></div></div></div>}
          {isPause&&<div className="arena-overlay" role="menu" aria-label="Pausa da partida"><div className="arena-pause-card"><h2><Pause size={30}/>PAUSA</h2>{options.map((action,i)=><button key={i} role="menuitem"  disabled={!action.enabled} onClick={action.action}>{i===0?<Play size={17}/>:<LogOut size={17}/>} {action.label}</button>)}<button role="menuitem" onClick={openHelp}><BookOpen size={17}/> Comandos</button></div></div>}
        </div>
        <div className="arena-battle-footer"><button disabled={room.phase==='finished'||(!isGm&&!fighters.some(f=>f.userId===userId&&!f.bot&&!f.withdrawn))||(isPause&&!isGm&&room.pausedBy!==userId)} aria-label={isPause?'Continuar partida':'Pausar partida'} onClick={()=>pause(fighters.find(f=>f.userId===userId&&!f.withdrawn)?.device||'keyboard')}><Pause size={14}/> {isPause?'Continuar':'Pausa'} <kbd>ESC</kbd></button></div>
      </main>}
      <footer className="arena-footer"><span><span className="arena-pad-key key-a">A</span><kbd>ENTER</kbd> Confirmar <span className="arena-pad-key key-b">B</span><kbd>ESC</kbd> Voltar</span><span className="arena-secret-hint"><kbd>L3</kbd> + <kbd>R3</kbd> Abrir arena</span></footer>
      {showSettings&&room?.phase==='lobby'&&<div className="arena-overlay arena-settings" role="dialog" aria-modal="true" aria-label="Configurações da arena"><div className="arena-settings-card"><button className="arena-settings-close" onClick={()=>setShowSettings(false)} aria-label="Sair das configurações"><X size={22}/></button><h2><Settings size={28}/> CONFIGURAÇÕES</h2><section aria-label="Tempo da partida"><h3>TEMPO DA PARTIDA</h3><div className="arena-time-options">{([30,60,99,null] as const).map(seconds=><button key={seconds??'infinite'} data-time-choice={seconds??'infinite'} aria-pressed={settings.roundSeconds===seconds} onClick={()=>void command('configure',{settings:{...settings,roundSeconds:seconds}})}>{seconds===null?'∞ Infinito':seconds+'s'}</button>)}</div></section><section aria-label="Modo da partida"><h3>MODO DA PARTIDA</h3><div className="arena-mode-options"><button aria-pressed={!teams} onClick={()=>void command('configure',{settings:{...settings,mode:'free-for-all'}})}><Swords size={21}/><span>Todos contra todos</span></button><button aria-pressed={teams} disabled={fighters.filter(f=>!f.withdrawn).length!==4} onClick={()=>void command('configure',{settings:{...settings,mode:'teams'}})}><Users size={21}/><span>Em equipe · 2 × 2</span></button></div></section><button className="arena-launch" onClick={()=>setShowSettings(false)}><ArrowLeft size={19}/> VOLTAR AO MENU</button></div></div>}
      {showHelp&&<div className="arena-overlay arena-help" role="dialog" aria-modal="true" aria-label="Comandos da arena"><div className="arena-help-card"><button className="arena-help-close" onClick={()=>setShowHelp(false)} aria-label="Fechar comandos"><X size={20}/></button><h2>COMANDOS</h2><div className="arena-command-columns"><section><h3><Gamepad2 size={18}/> CONTROLE</h3>{[['← / →','Mover / recuar para bloquear'],['↑','Pular'],['↓','Abaixar / bloquear golpes baixos'],['X','Soco alto'],['Y','Soco baixo'],['A','Chute alto'],['B','Chute baixo'],['RB / LT / RT','Especial 1 / 2 / 3'],['LB','Esquiva'],['START','Pausa']].map(([key,label])=><div key={key}><kbd className={['X','Y','A','B'].includes(key)?'arena-pad-key key-'+key.toLowerCase():''}>{key}</kbd><span>{label}</span></div>)}</section><section><h3><Keyboard size={18}/> TECLADO</h3>{[['A / D ou ← / →','Mover / recuar para bloquear'],['W / ↑ / ESPAÇO','Pular'],['S / ↓','Abaixar / bloquear golpes baixos'],['J','Soco alto'],['K','Soco baixo'],['L','Chute alto'],[';','Chute baixo'],['U / O / P','Especial 1 / 2 / 3'],['SHIFT','Esquiva'],['ESC','Pausa'],['F1','Mostrar hitboxes']].map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</section></div><div className="arena-motion-guide"><b>↓ ↘ → + ATAQUE</b><span>Meia-lua para frente · Especial 1</span><b>↓ ↙ ← + ATAQUE</b><span>Meia-lua para trás · Especial 2</span><b>→ + <kbd className="arena-shoulder-key" aria-label="Botão RB">RB</kbd></b><span>Especial 3 · As direções acompanham o lado do personagem.</span></div></div></div>}
    </div>
  </div>,document.body)
}
