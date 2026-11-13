import { randomUUID } from 'node:crypto'
import { store, publish } from '@/lib/store'
import type { ArenaSession, ArenaSnapshot, ArenaPortrait, ArenaInput } from './model'
import { advanceArena, forfeitArena, newFighter, publicArena, startRound, upgradeArenaSession, configureArenaSettings, arenaSettings, ARENA_MAX_FIGHTERS, NO_INPUT } from './model'
import { ARENA_CAST, ARENA_STAGES,arenaRoster } from './catalog'
import {unlockAlterLysa,hasAlterUnlock,revokeAlterUnlock} from './secrets'

const root = globalThis as typeof globalThis & { __otmsArenaRooms?: Map<string, ArenaSession> }
const rooms = root.__otmsArenaRooms ?? (root.__otmsArenaRooms = new Map<string, ArenaSession>())
const age = (n: number) => Date.now() - n
const error = (message: string) => { throw new Error(message) }
function changed(id: string) {const room=rooms.get(id);if(room){room.revision=(room.revision||0)+1;room.lastUpdateAt=Date.now()}publish(id, {type: 'arena:changed'}) }
function rosterFor(_campaignId:string):ArenaPortrait[]{return ARENA_CAST.map(character=>({...character}))}
function updateRoster(room: ArenaSession) {
  if((room.phase==='lobby'||room.phase==='stage')&&arenaSettings(room).mode==='teams'&&(room.fighters.length!==4||room.fighters.some(f=>f.bot||f.withdrawn))){room.settings={...arenaSettings(room),mode:'free-for-all'};room.fighters.forEach(f=>{f.team=undefined})}
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
  retire(room)
  updateRoster(room)
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
  action: 'open' | 'configure' | 'join' | 'select' | 'unlock-alter-lysa' | 'stage' | 'start' | 'fight' | 'cancel-stage' | 'rematch' | 'reset' | 'close' | 'leave' | 'kick' | 'input' | 'heartbeat' | 'pause' | 'resume' | 'exit' | 'forfeit'
  device?: unknown; fighterId?: unknown; characterId?: unknown; stageId?:unknown; inputs?: unknown; seq?: unknown; source?: unknown; snapshot?:unknown; settings?:unknown
}
function normalizeInput(value: unknown): ArenaInput {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.keys(NO_INPUT).map(key=>[key,data[key]===true])) as ArenaInput
}
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
    room.fighters = room.fighters.filter(f => !f.bot)
    room.fighters.forEach(f => {f.input = {...NO_INPUT}; f.lastSeen = Date.now(); f.withdrawn=false;f.team=undefined})
    room.message = 'Revanche!'; updateRoster(room); changed(campaignId)
    return publicArena(room)
  }
  if (cmd.action === 'pause') {
    const device = cmd.device === undefined ? null : deviceKey(cmd.device)
    if (!gm && !room.fighters.some(f=>!f.bot&&f.userId===userId&&f.device===device)) error('Somente participantes podem pausar.')
    if (room.phase === 'playing') {
      room.phase='paused';room.pausedBy=userId;room.fighters.forEach(f=>{f.input={...NO_INPUT}});changed(campaignId)
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
  if(cmd.action==='configure'){
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
      // Um único A já entra e escolhe o retrato focado. Nunca fica preso sem herói.
      const chosen = room.roster.find(p => p.id === (cmd.characterId==='alter-lysa'?'lysa':cmd.characterId)) || room.roster[0]
      fighter.characterId = chosen?.id ?? null
      fighter.alterLysa=fighter.characterId==='lysa'&&hasAlterUnlock(room,userId,device)
      // A identidade humana vem exclusivamente da sessão autenticada.
      fighter.name = store.users.get(userId)?.name || (gm ? 'Mestre' : 'Jogador')
      room.fighters.push(fighter)
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
    if(cmd.action==='rematch')revokeAlterUnlock(room)
    room.fighters = room.fighters.filter(f => !f.bot)
    updateRoster(room)
    if (!room.fighters.length || room.fighters.some(f => !f.characterId)) error('Todos os jogadores devem escolher personagens.')
    if(arenaSettings(room).mode==='teams'&&room.fighters.length!==4)error('Em equipe exige quatro jogadores.')
    room.phase='stage';room.message='Escolha o cenário do duelo.';changed(campaignId)
  } else if(cmd.action==='fight'){
    if(room.phase!=='stage')error('Escolha os personagens antes de iniciar o combate.')
    if(!room.fighters.some(f=>!f.bot)||room.fighters.some(f=>!f.characterId))error('Escolha os personagens do duelo.')
    if(!ARENA_STAGES.some(stage=>stage.id===cmd.stageId))error('Cenário inválido.')
    if(arenaSettings(room).mode==='teams'&&(room.fighters.length!==4||room.fighters.some(f=>f.bot||f.withdrawn)))error('Em equipe exige quatro jogadores.')
    room.stageId=String(cmd.stageId)
    if (room.fighters.length === 1) {
      const npc = room.roster.find(c => c.kind !== 'player' && c.id !== room.fighters[0].characterId)
        || room.roster.find(c => c.id !== room.fighters[0].characterId) || room.roster[0]
      const bot = newFighter(`bot:${randomUUID()}`, 'bot', 'cpu', 'CPU', true)
      bot.characterId = npc?.id ?? room.fighters[0].characterId
      room.fighters.push(bot)
    }
    room.secretUnlocks=[] // The authorization is spent by this match; fighter flags survive its rounds.
    startRound(room); changed(campaignId)
  } else if (cmd.action === 'heartbeat') {
    const fighter = ownFighter(room, userId, deviceKey(cmd.device))
    if (fighter) fighter.lastSeen = Date.now()
  } else if (cmd.action === 'input') {
    if (room.phase === 'playing' && Array.isArray(cmd.inputs)) {
      for (const entry of cmd.inputs.slice(0, ARENA_MAX_FIGHTERS) as Array<{device?:unknown, buttons?:unknown}>) {
        let device: string
        try {device = deviceKey(entry?.device)} catch {continue}
        const fighter = ownFighter(room, userId, device)
        if (!fighter) continue
        // Pacotes da rede podem chegar fora de ordem. Cada cliente envia contador e sessão.
        const seq = typeof cmd.seq === 'number' && Number.isSafeInteger(cmd.seq) ? cmd.seq : 0
        const source = typeof cmd.source === 'string' ? cmd.source.slice(0,80) : ''
        if (source && source === fighter.lastInputSource && seq <= fighter.lastInputSeq) continue
        fighter.lastInputSource = source
        fighter.lastInputSeq = seq
        fighter.input = normalizeInput(entry.buttons)
        fighter.lastSeen = Date.now()
      }
    }
  } else error('Comando desconhecido.')
  room.roster=arenaRoster(room)
  room.lastUpdateAt = Date.now()
  return publicArena(room)
}
