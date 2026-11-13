import { randomUUID } from 'node:crypto'
import { store, publish } from '@/lib/store'
import type { ArenaSession, ArenaSnapshot, ArenaPortrait, ArenaInput } from './model'
import { advanceArena, forfeitArena, newFighter, publicArena, startRound, upgradeArenaSession, configureArenaSettings, arenaSettings, ARENA_MAX_FIGHTERS, NO_INPUT } from './model'
import { ARENA_CAST, ARENA_STAGES,arenaRoster } from './catalog'
import {unlockAlterLysa,hasAlterUnlock,revokeAlterUnlock} from './secrets'
import {applyArenaInputPacket} from './input-packet'

const root = globalThis as typeof globalThis & { __otmsArenaRooms?: Map<string, ArenaSession>; __otmsArenaTick?:ReturnType<typeof setInterval> }
const rooms = root.__otmsArenaRooms ?? (root.__otmsArenaRooms = new Map<string, ArenaSession>())
// Physics keeps its 60 Hz clock even when a stream buffers or no HTTP request arrives.
if(!root.__otmsArenaTick){root.__otmsArenaTick=setInterval(()=>{const now=Date.now();for(const room of rooms.values())if(room.phase==='playing')advanceArena(room,now)},16);root.__otmsArenaTick.unref?.()}
const age = (n: number) => Date.now() - n
const error = (message: string) => { throw new Error(message) }
function changed(id: string) {const room=rooms.get(id);if(room){room.revision=(room.revision||0)+1;room.lastUpdateAt=Date.now()}publish(id, {type: 'arena:changed'}) }
function rosterFor(_campaignId:string):ArenaPortrait[]{return ARENA_CAST.map(character=>({...character}))}
function updateRoster(room: ArenaSession) {
  if((room.phase==='lobby'||room.phase==='stage')&&arenaSettings(room).mode==='teams'&&(room.fighters.length!==4||room.fighters.some(f=>f.withdrawn))){room.settings={...arenaSettings(room),mode:'free-for-all'};room.fighters.forEach(f=>{f.team=undefined})}
  const fresh = rosterFor(room.campaignId)
  room.secretUnlocks=(room.secretUnlocks||[]).filter(g=>room.fighters.some(f=>f.userId===g.userId&&f.device===g.device&&!f.bot))
  room.roster = arenaRoster({...room,roster:fresh})
  if (room.phase !== 'playing') {
    const ids = new Set(fresh.map(x => x.id))
    for (const fighter of room.fighters) if (fighter.characterId && !ids.has(fighter.characterId)) fighter.characterId = null
  }
}
function retire(room: ArenaSession) {
  if (room.phase !== 'lobby') return
  const before = room.fighters.length
  room.fighters = room.fighters.filter(f => f.bot || age(f.lastSeen) < 20000)
  if (room.fighters.length !== before) changed(room.campaignId)
}
export function arenaSnapshot(campaignId: string): ArenaSnapshot | null {
  const room = rooms.get(campaignId)
  if (!room) return null
  advanceArena(room)
  if(room.phase==='lobby'||room.phase==='stage'||room.phase==='finished'){retire(room);updateRoster(room)}
  return publicArena(room)
}
function ownFighter(room: ArenaSession, userId: string, device: string) {
  return room.fighters.find(f => f.userId === userId && f.device === device && !f.bot)
}
function deviceKey(value: unknown): string {
  if (value === 'keyboard') return 'keyboard'
  if (typeof value !== 'string' || !/^pad:[0-9]{1,2}$/.test(value)) return error('Controle inválido.')
  return value
}
export type ArenaCommand = {
  action: 'open' | 'configure' | 'add-bot' | 'select-bot' | 'remove-bot' | 'join' | 'select' | 'unlock-alter-lysa' | 'stage' | 'start' | 'fight' | 'cancel-stage' | 'rematch' | 'reset' | 'close' | 'leave' | 'kick' | 'input' | 'heartbeat' | 'pause' | 'resume' | 'exit' | 'forfeit'
  device?: unknown; fighterId?: unknown; characterId?: unknown; stageId?:unknown; inputs?: unknown; seq?: unknown; source?: unknown; snapshot?:unknown; settings?:unknown;slot?:unknown
}
const freeSlot=(room:ArenaSession)=>[0,1,2,3].find(i=>!room.fighters.some(f=>f.slot===i))
const sortSlots=(room:ArenaSession)=>room.fighters.sort((a,b)=>(a.slot||0)-(b.slot||0))
function assertGm(gm: boolean) { if (!gm) error('Apenas o mestre administra a arena.') }
export function commandArena(campaignId: string, userId: string, gm: boolean, cmd: ArenaCommand): ArenaSnapshot | null {
  let room = rooms.get(campaignId)
  if (cmd.action === 'open') {
    if (!room) {
      room = {id: randomUUID(), campaignId, phase: 'lobby', createdAt: Date.now(), gmId: userId,
        roster: rosterFor(campaignId), fighters: [], winnerId: null, tickAt: Date.now(), accumulator: 0,
        gameTime: 0, roundElapsed: 0, rounds: 0, roundStatus: 'intro', nextRoundAt: 0, pausedBy: null,
        projectiles: [], zones:[], stageId:'forest', effects: [], effectSequence: 0, message: 'Escolha seu lutador.', lastUpdateAt: Date.now()}
      rooms.set(campaignId, room)
      changed(campaignId)
    }
    upgradeArenaSession(room)
    return publicArena(room)
  }
  if (!room) return error('Abra a arena antes de jogar.')
  advanceArena(room)
  if(cmd.action==='input'){
    if(room.phase==='playing'&&Array.isArray(cmd.inputs))for(const entry of cmd.inputs.slice(0,ARENA_MAX_FIGHTERS) as Array<{device?:unknown;buttons?:unknown;pulses?:unknown}>){
      let device:string;try{device=deviceKey(entry?.device)}catch{continue}
      const fighter=ownFighter(room,userId,device);if(!fighter)continue
      applyArenaInputPacket(fighter,entry.buttons,entry.pulses,typeof cmd.seq==='number'&&Number.isSafeInteger(cmd.seq)?cmd.seq:0,typeof cmd.source==='string'?cmd.source.slice(0,80):'',Date.now(),room.roundStatus==='fight')
    }
    return cmd.snapshot===true?publicArena(room):null
  }
  retire(room)
  updateRoster(room)
  if (cmd.action === 'close') {
    assertGm(gm)
    rooms.delete(campaignId); changed(campaignId); return null
  }
  if (cmd.action === 'reset' || cmd.action === 'exit') {
    if(!gm&&!room.fighters.some(f=>f.userId===userId&&!f.bot))error('Entre na arena para voltar à seleção.')
    revokeAlterUnlock(room)
    room.phase = 'lobby'; room.winnerId = null; room.winningTeam=null; room.gameTime = 0; room.hitstopFrames = 0; room.pausedBy = null; room.projectiles = []; room.effects = [];room.zones=[]
    room.fighters = room.fighters.filter(f => !f.autoBot)
    room.fighters.forEach(f => {f.input = {...NO_INPUT}; f.lastSeen = Date.now(); f.withdrawn=false;f.team=undefined})
    room.message = 'Revanche!'; updateRoster(room); changed(campaignId)
    return publicArena(room)
  }
  if (cmd.action === 'pause') {
    const device = cmd.device === undefined ? null : deviceKey(cmd.device)
    if (!gm && !room.fighters.some(f=>!f.bot&&f.userId===userId&&f.device===device)) error('Somente participantes podem pausar.')
    if (room.phase === 'playing') {
      room.phase='paused';room.pausedBy=userId;room.fighters.forEach(f=>{f.input={...NO_INPUT};f.pendingPulses={}});changed(campaignId)
    }
    return publicArena(room)
  }
  if (cmd.action === 'resume') {
    if (!gm && room.pausedBy!==userId) error('Apenas quem pausou ou o mestre pode continuar.')
    if (room.phase === 'paused') {room.phase='playing';room.pausedBy=null;room.tickAt=Date.now();room.accumulator=0;changed(campaignId)}
    return publicArena(room)
  }
  if (cmd.action === 'forfeit') {
    const fighter:any=ownFighter(room,userId,deviceKey(cmd.device))
    if (!fighter) error('Lutador não encontrado.')
    if((room.phase==='playing'||room.phase==='paused')&&room.fighters.length<=2)return commandArena(campaignId,userId,gm,{action:'reset'})
    revokeAlterUnlock(room,userId,fighter.device)
    if (room.phase==='playing'||room.phase==='paused')forfeitArena(room,fighter)
    changed(campaignId)
    return publicArena(room)
  }
  if (cmd.action === 'kick') {
    assertGm(gm)
    if (room.phase !== 'lobby' && room.phase !== 'finished') error('Encerre a rodada para remover jogadores.')
    const removed=room.fighters.find(f=>f.id===cmd.fighterId)
    if(removed)revokeAlterUnlock(room,removed.userId,removed.device)
    room.fighters = room.fighters.filter(f => f.id !== cmd.fighterId)
    changed(campaignId); return publicArena(room)
  }
  if(cmd.action==='add-bot'){
    if(room.phase!=='lobby')error('Adicione bots na seleção de personagens.')
    const slot=cmd.slot===undefined?freeSlot(room):cmd.slot
    if(typeof slot!=='number'||!Number.isInteger(slot)||slot<0||slot>3||room.fighters.some(f=>f.slot===slot))error('Slot indisponível.')
    const chosen=room.roster.find(p=>p.id===cmd.characterId)||room.roster.find(p=>!room.fighters.some(f=>f.characterId===p.id))||room.roster[0]
    const bot=newFighter('bot:'+randomUUID(),'bot','cpu','BOT',true);bot.characterId=chosen.id;bot.botOwnerId=userId;bot.slot=slot as number
    room.fighters.push(bot);sortSlots(room);changed(campaignId)
  }else if(cmd.action==='select-bot'||cmd.action==='remove-bot'){
    if(room.phase!=='lobby')error('Edite bots na seleção de personagens.')
    const bot=room.fighters.find(f=>f.id===cmd.fighterId&&f.bot)
    if(!bot||!gm&&bot.botOwnerId!==userId)error('Você só pode editar seus bots.')
    if(cmd.action==='remove-bot')room.fighters=room.fighters.filter(f=>f.id!==bot!.id)
    else{const chosen=room.roster.find(p=>p.id===cmd.characterId);if(!chosen)error('Personagem inválido.');bot!.characterId=chosen!.id}
    updateRoster(room);changed(campaignId)
  }else if(cmd.action==='configure'){
    configureArenaSettings(room,cmd.settings);changed(campaignId)
  } else if(cmd.action==='unlock-alter-lysa'){
    unlockAlterLysa(room,userId,deviceKey(cmd.device));updateRoster(room);changed(campaignId)
  } else if(cmd.action==='cancel-stage'){
    if(room.phase!=='stage')error('A seleção de cenário não está aberta.')
    room.phase='lobby';room.message='Escolha seu personagem.';changed(campaignId)
  } else if(cmd.action==='stage'){
    if(room.phase!=='stage')error('Pressione Jogar antes de escolher o cenário.')
    if(!ARENA_STAGES.some(stage=>stage.id===cmd.stageId))error('Cenário inválido.')
    room.stageId=String(cmd.stageId);changed(campaignId)
  } else if (cmd.action === 'join') {
    if (room.phase !== 'lobby') error('A rodada já começou.')
    const device = deviceKey(cmd.device)
    let fighter = ownFighter(room, userId, device)
    if (!fighter) {
      if (room.fighters.length >= ARENA_MAX_FIGHTERS) error('Arena cheia (4 lutadores).')
      updateRoster(room)
      fighter = newFighter(randomUUID(), userId, device, 'Jogador')
      fighter.slot=freeSlot(room)
      // Um único A já entra e escolhe o retrato focado. Nunca fica preso sem herói.
      const chosen = room.roster.find(p => p.id === (cmd.characterId==='alter-lysa'?'lysa':cmd.characterId)) || room.roster[0]
      fighter.characterId = chosen?.id ?? null
      fighter.alterLysa=fighter.characterId==='lysa'&&hasAlterUnlock(room,userId,device)
      // A identidade humana vem exclusivamente da sessão autenticada.
      fighter.name = store.users.get(userId)?.name || (gm ? 'Mestre' : 'Jogador')
      room.fighters.push(fighter)
      sortSlots(room)
      changed(campaignId)
    }
    fighter.lastSeen = Date.now()
  } else if (cmd.action === 'select') {
    if (room.phase !== 'lobby') error('Seleção encerrada.')
    const fighter = ownFighter(room, userId, deviceKey(cmd.device))
    if (!fighter) error('Entre na sala antes de escolher.')
    updateRoster(room)
    const character:any = room.roster.find(c => c.id === (cmd.characterId==='alter-lysa'?'lysa':cmd.characterId))
    if (!character) error('Personagem inválido.')
    fighter!.characterId = character.id
    if(character.id!=='lysa')revokeAlterUnlock(room,userId,fighter!.device)
    fighter!.alterLysa=character.id==='lysa'&&hasAlterUnlock(room,userId,fighter!.device)
    fighter!.lastSeen = Date.now()
    changed(campaignId)
  } else if (cmd.action === 'leave') {
    if (room.phase === 'playing') error('Aguarde o fim da rodada para sair.')
    const device=deviceKey(cmd.device);revokeAlterUnlock(room,userId,device)
    room.fighters = room.fighters.filter(f => f.bot || f.userId !== userId || f.device !== device)
    changed(campaignId)
  } else if (cmd.action === 'start' || cmd.action === 'rematch') {
    if (cmd.action === 'rematch' && room.phase !== 'finished') error('A revanche só começa ao término do combate.')
    if (cmd.action === 'start' && room.phase !== 'lobby') error('Rodada em andamento.')
    if(cmd.action==='rematch'){revokeAlterUnlock(room);room.fighters.forEach(f=>{f.withdrawn=false})}
    room.fighters = room.fighters.filter(f => !f.autoBot)
    updateRoster(room)
    if (!room.fighters.some(f=>!f.bot) || room.fighters.some(f => !f.characterId)) error('Todos os jogadores devem escolher personagens.')
    if(arenaSettings(room).mode==='teams'&&room.fighters.length!==4)error('Em equipe exige quatro jogadores.')
    room.phase='stage';room.message='Escolha o cenário do duelo.';changed(campaignId)
  } else if(cmd.action==='fight'){
    if(room.phase!=='stage')error('Escolha os personagens antes de iniciar o combate.')
    if(!room.fighters.some(f=>!f.bot)||room.fighters.some(f=>!f.characterId))error('Escolha os personagens do duelo.')
    if(!ARENA_STAGES.some(stage=>stage.id===cmd.stageId))error('Cenário inválido.')
    if(arenaSettings(room).mode==='teams'&&(room.fighters.length!==4||room.fighters.some(f=>f.withdrawn)))error('Em equipe exige quatro participantes.')
    room.stageId=String(cmd.stageId)
    if (room.fighters.length === 1) {
      const npc = room.roster.find(c => c.kind !== 'player' && c.id !== room.fighters[0].characterId)
        || room.roster.find(c => c.id !== room.fighters[0].characterId) || room.roster[0]
      const bot = newFighter(`bot:${randomUUID()}`, 'bot', 'cpu', 'CPU', true)
      bot.characterId = npc?.id ?? room.fighters[0].characterId
      bot.slot=freeSlot(room);bot.autoBot=true
      room.fighters.push(bot)
      sortSlots(room)
    }
    room.secretUnlocks=[] // The authorization is spent by this match; fighter flags survive its rounds.
    startRound(room); changed(campaignId)
  } else if (cmd.action === 'heartbeat') {
    const fighter = ownFighter(room, userId, deviceKey(cmd.device))
    if (fighter) fighter.lastSeen = Date.now()
  } else error('Comando desconhecido.')
  room.roster=arenaRoster(room)
  room.lastUpdateAt = Date.now()
  return publicArena(room)
}
