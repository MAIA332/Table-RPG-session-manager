'use client'
import {ArrowLeft, BookOpen, ChevronRight, Code2, LockKeyhole, Play, ShieldCheck, Sparkles, Users, Swords} from 'lucide-react'
import type {ArenaPortrait} from '@/lib/arena/model'
import type {CSSProperties} from 'react'
import {ARENA_CAST} from '@/lib/arena/catalog'

type HomeProps={onPlay:()=>void;onCommunity:()=>void;onWorkshop:()=>void;isDeveloper:boolean;rosterCount:number}
/** Menu pré-seleção local (sem alterar a fase autoritativa da partida). */
export function ArenaLobbyHome({onPlay,onCommunity,onWorkshop,isDeveloper,rosterCount}:HomeProps){
 return <main className="arena-hub" aria-label="Menu da Arena">
  <div className="arena-hub-hero">
   <span className="arena-hub-eyebrow"><Swords size={16}/> ARENA · MODO DE JOGO</span>
   <h1>A PRÓXIMA LENDA<br/><em>COMEÇA AQUI.</em></h1>
   <p>Escolha um lutador, encare a CPU ou desafie outros jogadores. A comunidade de personagens está ganhando forma.</p>
   <div className="arena-hub-stats"><span><strong>{rosterCount}</strong> personagens disponíveis</span><span><strong>60 Hz</strong> combate 2D</span></div>
  </div>
  <nav className="arena-hub-menu" aria-label="Escolha uma área da Arena">
   <button type="button" data-arena-hub-action="play" className="arena-hub-option arena-hub-primary" onClick={onPlay}><span className="arena-hub-icon"><Play size={25}/></span><span><strong>JOGAR</strong><small>Ir para seleção de personagens</small></span><ChevronRight className="arena-hub-arrow"/></button>
   <button type="button" data-arena-hub-action="community" className="arena-hub-option" onClick={onCommunity}><span className="arena-hub-icon"><Users size={25}/></span><span><strong>COMUNIDADE</strong><small>Conheça lutadores e veja o futuro da criação colaborativa</small></span><ChevronRight className="arena-hub-arrow"/></button>
   {isDeveloper&&<button type="button" data-arena-hub-action="workshop" className="arena-hub-option arena-hub-developer" onClick={onWorkshop}><span className="arena-hub-icon"><Code2 size={25}/></span><span><strong>ESTÚDIO DO DESENVOLVEDOR</strong><small>Editor privado do catálogo global</small></span><LockKeyhole size={18}/></button>}
  </nav>
  <div className="arena-hub-foot"><ShieldCheck size={15}/> Todos os personagens publicados estão disponíveis em todas as campanhas.</div>
 </main>
}

type CommunityProps={roster:ArenaPortrait[];onBack:()=>void;onPlay:()=>void}
const originalIds=new Set(ARENA_CAST.map(p=>p.id))
const communityConcepts=[{id:'concept-1',label:'Vaga de criação',note:'Personagens da comunidade'},{id:'concept-2',label:'Artistas e criadores',note:'Galeria de propostas'},{id:'concept-3',label:'Novas arenas',note:'Conteúdo colaborativo'}]
/** Apenas protótipo: nenhum endpoint comunitário, votação ou instalação de personagens. */
export function ArenaCommunityPreview({roster,onBack,onPlay}:CommunityProps){
 const official=roster.filter(p=>originalIds.has(p.id)),additional=roster.filter(p=>!originalIds.has(p.id))
 return <main className="arena-community-screen" aria-label="Comunidade da Arena — protótipo">
   <div className="arena-community-header">
    <button type="button" data-arena-hub-action="back" onClick={onBack}><ArrowLeft size={18}/> Menu principal</button>
    <span className="arena-community-preview-tag"><Sparkles size={14}/> PROTÓTIPO VISUAL</span>
   </div>
   <div className="arena-community-intro"><div><span>HUB DA ARENA</span><h1>COMUNIDADE</h1><p>Explore o elenco disponível hoje e uma prévia do espaço onde futuramente artistas poderão compartilhar seus próprios lutadores.</p></div><div className="arena-community-count"><b>{roster.length}</b><span>LUTADORES DISPONÍVEIS</span></div></div>
   <section className="arena-community-section" aria-label="Personagens oficiais disponíveis"><header><div><h2>ELENCO OFICIAL</h2><p>Personagens disponíveis em todas as campanhas</p></div><span>{official.length} LUTADORES</span></header>
    <div className="arena-community-grid">{official.map(p=><article className="arena-community-card" key={p.id} style={{'--community-color':p.color} as CSSProperties}><div className="arena-community-portrait"><img loading="lazy" src={p.imageUrl} alt={p.name}/></div><div className="arena-community-card-text"><strong>{p.name}</strong><small>{p.title||'Lutador da Arena'}</small><span>OFICIAL · DISPONÍVEL</span></div></article>)}</div>
   </section>
   {additional.length>0&&<section className="arena-community-section" aria-label="Personagens novos publicados"><header><div><h2>NOVOS PERSONAGENS</h2><p>Criados e publicados pelo desenvolvedor</p></div><span>{additional.length} PUBLICADOS</span></header><div className="arena-community-grid">{additional.map(p=><article className="arena-community-card" key={p.id} style={{'--community-color':p.color} as CSSProperties}><div className="arena-community-portrait"><img loading="lazy" src={p.imageUrl} alt={p.name}/></div><div className="arena-community-card-text"><strong>{p.name}</strong><small>{p.title||'Novo lutador'}</small><span>GLOBAL · DISPONÍVEL</span></div></article>)}</div></section>}
   <section className="arena-community-section arena-community-future" aria-label="Prévia não funcional da comunidade"><header><div><h2>CRIAÇÕES DA COMUNIDADE</h2><p>Espaço reservado para futuros personagens enviados por criadores</p></div><span>EM BREVE</span></header><div className="arena-community-grid">{communityConcepts.map((p,i)=><article className="arena-community-concept" key={p.id}><div className="arena-community-concept-art"><BookOpen size={30}/><i>0{i+1}</i></div><div><strong>{p.label}</strong><small>{p.note}</small><span>PRÉVIA · NÃO DISPONÍVEL</span></div></article>)}</div><p className="arena-community-disclaimer"><LockKeyhole size={15}/> Esta área é apenas um protótipo de interface. Ainda não existem uploads, downloads, avaliações nem publicação comunitária.</p></section>
   <div className="arena-community-footer"><button type="button" className="arena-launch" onClick={onPlay}>ESCOLHER PERSONAGEM <ChevronRight size={20}/></button></div>
 </main>
}
