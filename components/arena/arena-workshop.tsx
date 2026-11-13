'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {validateCharacterDefinition,type ArenaCharacterDefinition,type BasicMove,type CharacterAction,type CharacterRecord,DEFAULT_MOVES,CHARACTER_ACTIONS} from '@/lib/arena/character-schema'
import './workshop.css'

type Upload={name:string;file:File}
const CELL=384,COLUMNS=6
const fmt=(n:number)=>Number.isFinite(n)?n:0
const moves:BasicMove[]=['light','heavy','kick','lowKick','special']
const example=(id:string):ArenaCharacterDefinition=>({schemaVersion:1,id:id.replace(/[^a-z0-9-]/g,'-').slice(0,48)||'novo-personagem',revision:1,name:'Novo personagem',portrait:'portrait.webp',speed:225,power:10,color:'#7bafff',rig:{cellWidth:CELL,cellHeight:CELL,anchorX:192,anchorY:304,bodyHeight:184,bodyWidth:56},animations:{},moves:structuredClone(DEFAULT_MOVES),abilities:[{name:'Especial',action:'projectile',projectileStyle:'fire',damage:16}],ai:{style:'balanced',difficulty:'normal'}})
async function imageBounds(file:File){
 const img=await createImageBitmap(file)
 const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0)
 const bytes=ctx.getImageData(0,0,img.width,img.height).data
 let left=img.width,right=-1,top=img.height,bottom=-1
 // Examinar pixels em saltos pequenos economiza tempo em grandes imagens.
 for(let y=0;y<img.height;y+=2)for(let x=0;x<img.width;x+=2){if(bytes[(y*img.width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}
 return {image:img,left:right<0?0:left,right:right<0?img.width-1:right,top:bottom<0?0:top,bottom:bottom<0?img.height-1:bottom}
}
/** Normaliza o chão de cada PNG e cria um WebP de 6 colunas sem dependência de Aseprite. */
async function createSheet(action:string,frames:Upload[],rig:ArenaCharacterDefinition['rig']):Promise<Upload>{
 if(frames.length>120)throw new Error(action+': limite de 120 quadros por atlas; divida a animação.')
 const rows=Math.ceil(frames.length/COLUMNS),canvas=document.createElement('canvas')
 canvas.width=rig.cellWidth*COLUMNS;canvas.height=rig.cellHeight*rows
 if(canvas.width*canvas.height>32_000_000||canvas.width>8192||canvas.height>8192)throw new Error(action+': atlas excede limite de 32 milhões de pixels ou 8192 px. Reduza as células.')
 const ctx=canvas.getContext('2d')!
 for(let i=0;i<frames.length;i++){
  const b=await imageBounds(frames[i].file),x=(i%COLUMNS)*rig.cellWidth,y=Math.floor(i/COLUMNS)*rig.cellHeight
  const w=b.right-b.left+1,h=b.bottom-b.top+1,scale=Math.min(1,(rig.cellWidth-16)/w,(rig.cellHeight-16)/h)
  const dx=x+rig.anchorX-w*scale/2,dy=y+rig.anchorY-h*scale
  ctx.drawImage(b.image,b.left,b.top,w,h,dx,dy,w*scale,h*scale)
  b.image.close()
 }
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível gerar atlas.')),'image/webp',.94))
 const name=`animations/${action}.webp`
 return {name,file:new File([blob],action+'.webp',{type:'image/webp'})}
}
const entryPath=(file:File)=>{const path=(file.webkitRelativePath||file.name).replaceAll('\\','/');return file.webkitRelativePath?path.split('/').slice(1).join('/'):path}
async function prepareFolder(list:FileList):Promise<{definition:ArenaCharacterDefinition;files:Upload[]}>{
 const original=[...list].map(file=>({name:entryPath(file),file})).filter(x=>x.name&&!x.name.startsWith('.'))
 const folder=(list.item(0)?.webkitRelativePath||'').split('/')[0].toLowerCase().replace(/[^a-z0-9-]/g,'-')
 const manifest=original.find(x=>x.name==='character.json')
 const base=manifest?validateCharacterDefinition(JSON.parse(await manifest.file.text())):example(folder||'novo-personagem')
 const files=original.filter(x=>x.name!=='character.json'&&!/^animations\/[^/]+\/[^/]+\.(png|webp)$/i.test(x.name))
 const folders=new Map<string,Upload[]>()
 for(const file of original){const match=file.name.match(/^animations\/([a-zA-Z0-9-]+)\/([^/]+)\.(png|webp)$/)
  if(!match||!CHARACTER_ACTIONS.includes(match[1] as CharacterAction))continue
  const action=match[1],arr=folders.get(action)||[];arr.push(file);folders.set(action,arr)
 }
 for(const [name,frames] of folders){
  frames.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
  files.push(await createSheet(name,frames,base.rig))
  base.animations[name as CharacterAction]={atlas:`animations/${name}.webp`,columns:COLUMNS,rows:Math.ceil(frames.length/COLUMNS),frames:frames.length,fps:12,loop:['idle','forward','backward'].includes(name)}
 }
 // Sheets já prontos podem vir sem character.json.
 for(const file of files){const match=file.name.match(/^animations\/([A-Za-z0-9]+)\.(webp|png)$/)
  if(!match||!CHARACTER_ACTIONS.includes(match[1] as CharacterAction)||base.animations[match[1] as CharacterAction])continue
  const bitmap=await createImageBitmap(file.file)
  const columns=Math.max(1,Math.round(bitmap.width/base.rig.cellWidth)),rows=Math.max(1,Math.round(bitmap.height/base.rig.cellHeight))
  bitmap.close();base.animations[match[1] as CharacterAction]={atlas:file.name,columns,rows,frames:columns*rows,fps:12,loop:['idle','forward','backward'].includes(match[1])}
 }
 const portrait=files.find(x=>/^portrait\.(png|webp)$/.test(x.name))
 if(portrait)base.portrait=portrait.name
 return {definition:validateCharacterDefinition(base),files}
}
export function ArenaWorkshop(){
 const [records,setRecords]=useState<CharacterRecord[]>([]),[draft,setDraft]=useState(''),[assets,setAssets]=useState<Upload[]>([])
 const [active,setActive]=useState('idle' as CharacterAction),[frame,setFrame]=useState(0),[combatTick,setCombatTick]=useState(1),[playing,setPlaying]=useState(false),[onion,setOnion]=useState(false),[mirror,setMirror]=useState(false)
 const [message,setMessage]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[advanced,setAdvanced]=useState(false)
 const [previewUrls,setPreviewUrls]=useState<Record<string,string>>({})
 const picker=useRef<HTMLInputElement|null>(null),canvas=useRef<HTMLCanvasElement|null>(null)
 const definition=(()=>{try{return validateCharacterDefinition(JSON.parse(draft))}catch{return null}})()
 const refresh=useCallback(async()=>{
  try{const res=await fetch('/api/arena/characters',{cache:'no-store'});const json=await res.json();if(!res.ok)throw new Error(json.error);setRecords(json.characters||[])}
  catch(e){setMessage(e instanceof Error?e.message:'Não foi possível obter o catálogo.')}finally{setLoading(false)}
 },[])
 useEffect(()=>{void refresh()},[refresh])
 useEffect(()=>{
  const urls:Record<string,string>={}
  for(const a of assets)urls[a.name]=URL.createObjectURL(a.file)
  setPreviewUrls(urls)
  return()=>{for(const url of Object.values(urls))URL.revokeObjectURL(url)}
 },[assets])
 const change=(fn:(obj:ArenaCharacterDefinition)=>void)=>{try{const obj=JSON.parse(draft) as ArenaCharacterDefinition;fn(obj);setDraft(JSON.stringify(obj,null,2));setMessage('')}catch{setMessage('Corrija primeiro o JSON do personagem.')}}
 const loadRevision=(rec:CharacterRecord,rev:number)=>{
  const selected=rec.revisions.find(r=>r.revision===rev)
  if(!selected)return
  setDraft(JSON.stringify(selected.definition,null,2));setAssets([]);setActive('idle');setFrame(0);setAdvanced(false);setMessage(`Editando ${rec.id}, baseado na revisão ${rev}. A publicação cria uma nova revisão.`)
 }
 const selectFiles=async(list:FileList|null)=>{
  if(!list||!list.length)return
  setLoading(true)
  try{const parsed=await prepareFolder(list);setDraft(JSON.stringify(parsed.definition,null,2));setAssets(parsed.files);setActive('idle');setFrame(0);setMessage(`Pasta importada: ${parsed.files.length} recursos, ${Object.keys(parsed.definition.animations).length} animações. Confira e publique.`)}
  catch(e){setMessage(e instanceof Error?e.message:'Pasta inválida.')}finally{setLoading(false)}
 }
 const publish=async(action:'draft'|'publish')=>{
  if(!definition){setMessage('Manifest inválido. Verifique o JSON e os campos obrigatórios.');return}
  setSaving(true)
  try{const form=new FormData();form.append('action',action);form.append('manifest',JSON.stringify(definition));for(const a of assets){form.append('paths',a.name);form.append('files',a.file,a.name.split('/').at(-1)||a.name)}
   const response=await fetch('/api/arena/characters/import',{method:'POST',body:form});const json=await response.json();if(!response.ok)throw new Error(json.error)
   setMessage(`${action==='draft'?'Rascunho salvo':'Publicado'}: ${definition.name}, revisão ${json.revision}. O personagem fica disponível em todas as campanhas.`);setDraft(JSON.stringify(json.definition,null,2));setAssets([]);await refresh()
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao publicar.')}
  finally{setSaving(false)}
 }
 const setPublication=async(id:string,revision:number|null,action:'rollback'|'archive'|'publish')=>{
  if(!confirm(action==='archive'?'Arquivar este personagem?':`Publicar a revisão ${revision} de ${id}?`))return
  try{const response=await fetch('/api/arena/characters/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,action})}),data=await response.json();if(!response.ok)throw new Error(data.error);await refresh();setMessage('Catálogo atualizado. Partidas em andamento preservam as versões anteriores.')}
  catch(e){setMessage(e instanceof Error?e.message:'Falha ao alterar versão.')}
 }
 const anim=definition?.animations[active]||definition?.animations.idle
 useEffect(()=>{if(!playing||!anim)return;const id=setInterval(()=>setFrame(n=>(n+1)%anim.frames),1000/anim.fps);return()=>clearInterval(id)},[playing,anim?.fps,anim?.frames,active])
 useEffect(()=>{
  const c=canvas.current,g=c?.getContext('2d');if(!g||!c)return
  g.clearRect(0,0,c.width,c.height);g.fillStyle='#1c2835';g.fillRect(0,0,c.width,c.height)
  for(let x=0;x<c.width;x+=24){g.strokeStyle='#2b3949';g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}
  for(let y=0;y<c.height;y+=24){g.strokeStyle='#2b3949';g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  if(!definition||!anim)return
  const source=previewUrls[anim.atlas]||anim.atlas
  const image=new Image();let cancelled=false
  image.onload=()=>{if(cancelled)return
   const pos=(anim.startFrame||0)+Math.min(frame,anim.frames-1),row=Math.floor(pos/anim.columns),col=pos%anim.columns,w=image.naturalWidth/anim.columns,h=image.naturalHeight/anim.rows
   g.save()
   if(mirror){g.translate(384,0);g.scale(-1,1)}
   if(onion&&frame>0){const prev=(anim.startFrame||0)+frame-1;g.globalAlpha=.22;g.drawImage(image,(prev%anim.columns)*w,Math.floor(prev/anim.columns)*h,w,h,0,0,384,384);g.globalAlpha=1}
   g.drawImage(image,col*w,row*h,w,h,0,0,384,384)
   const rig=definition.rig,scale=rig.bodyHeight/200
   const mx=(v:number)=>((rig.anchorX+v/scale)/rig.cellWidth)*384,my=(v:number)=>((rig.anchorY+v/scale)/rig.cellHeight)*384
   g.strokeStyle='#5bd9ed';g.lineWidth=2;g.strokeRect(mx(-rig.bodyWidth/2),my(-rig.bodyHeight),rig.bodyWidth/scale/rig.cellWidth*384,rig.bodyHeight/scale/rig.cellHeight*384)
   const move=definition.moves[active as BasicMove],frameTick=combatTick
   if(move?.hitboxes)for(const hit of move.hitboxes){if(frameTick<hit.fromFrame||frameTick>hit.toFrame)continue;g.strokeStyle='#ff7878';g.lineWidth=3;g.strokeRect(mx(hit.x),my(hit.y),hit.w/scale/rig.cellWidth*384,hit.h/scale/rig.cellHeight*384)}
   g.strokeStyle='#c6a7ff';g.beginPath();g.moveTo(mx(0)-8,my(0));g.lineTo(mx(0)+8,my(0));g.moveTo(mx(0),my(0)-8);g.lineTo(mx(0),my(0)+8);g.stroke();g.restore()
  }
  image.src=source
  return()=>{cancelled=true}
 },[definition&&JSON.stringify(definition),anim&&JSON.stringify(anim),frame,combatTick,previewUrls,active,onion,mirror])
 return <main className="arena-workshop">
  <header><div><p>ESTÚDIO · ACESSO DO DESENVOLVEDOR</p><h1>Character Workshop</h1><span>Next.js · Canvas 2D · MongoDB · contrato JSON v1</span></div><a href='/campaigns'>Voltar às campanhas / testar contra CPU</a></header>
  <section className="workshop-info">Importe uma pasta contendo <code>character.json</code>, <code>portrait.webp</code> e <code>animations/idle/001.png...</code>. Sem JSON, o editor gera um modelo inicial. Frames avulsos são alinhados automaticamente pelos pés e convertidos em atlases WebP. Personagens publicados aparecem na seleção de qualquer campanha.</section>
  {message&&<p role="status" className="workshop-message">{message}</p>}
  <div className="workshop-grid">
   <aside className="workshop-panel"><h2>Catálogo e revisões</h2>
    <button type="button" onClick={()=>{setDraft(JSON.stringify(example('novo-personagem'),null,2));setAssets([]);setMessage('Adicione um retrato e a animação idle antes de publicar.')}}>+ Criar definição</button>
    <button type="button" onClick={()=>picker.current?.click()} disabled={loading}>Importar pasta / sprites</button>
    <input ref={picker} hidden type="file" multiple accept="image/png,image/webp,application/json,audio/ogg" onChange={e=>{void selectFiles(e.currentTarget.files);e.currentTarget.value=''}}/>
    <button type="button" onClick={()=>{if(picker.current){picker.current.setAttribute('webkitdirectory','');picker.current.removeAttribute('accept');picker.current.click()}}}>Selecionar diretório completo</button>
    {loading&&<p>Carregando / processando imagens...</p>}
    {records.length===0&&!loading&&<p>Nenhum personagem customizado no catálogo global.</p>}
    {records.map(rec=><article key={rec.id}><strong>{rec.revisions.at(-1)?.definition.name||rec.id}</strong><small>{rec.id} · publicação {rec.publishedRevision??'nenhuma'}</small>
      <div className="workshop-revisions">{rec.revisions.slice().reverse().map(rev=><button key={rev.revision} type="button" onClick={()=>loadRevision(rec,rev.revision)} title="Carregar revisão para edição">r{rev.revision} {rev.revision===rec.publishedRevision?'●':''}</button>)}</div>
      <div className="workshop-inline"><select aria-label={'Escolher revisão de '+rec.id} id={'rev-'+rec.id} defaultValue={rec.publishedRevision??rec.revisions.at(-1)?.revision}>{rec.revisions.map(rev=><option key={rev.revision} value={rev.revision}>Revisão {rev.revision}</option>)}</select><button onClick={()=>{const select=document.getElementById('rev-'+rec.id) as HTMLSelectElement;void setPublication(rec.id,Number(select.value),'rollback')}}>Restaurar</button><button onClick={()=>void setPublication(rec.id,null,'archive')}>Arquivar</button></div>
     </article>)}
   </aside>
   <section className="workshop-panel workshop-editor"><h2>Editor de personagem</h2>
    {!definition?<div><p>Selecione um personagem, importe uma pasta ou crie uma definição.</p>{draft&&<textarea aria-label="Manifest JSON" className="workshop-json" value={draft} onChange={e=>setDraft(e.target.value)}/>}</div>:<>
     <div className="workshop-fields"><label>ID estável<input value={definition.id} onChange={e=>change(d=>{d.id=e.target.value})}/></label><label>Nome<input value={definition.name} onChange={e=>change(d=>{d.name=e.target.value})}/></label><label>Velocidade<input type="number" value={definition.speed} onChange={e=>change(d=>{d.speed=+e.target.value})}/></label><label>Estilo da CPU<select value={definition.ai?.style||'balanced'} onChange={e=>change(d=>{d.ai={...(d.ai||{difficulty:'normal'}),style:e.target.value as NonNullable<ArenaCharacterDefinition['ai']>['style']}})}>{['balanced','rushdown','zoner','grappler'].map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>
     <h3>Animações</h3><div className="workshop-actions">{Object.keys(definition.animations).map(action=><button key={action} type="button" aria-pressed={active===action} onClick={()=>{setActive(action as CharacterAction);setFrame(0);setCombatTick(1)}}>{action}</button>)}</div>
     <div className="workshop-preview"><canvas ref={canvas} width="384" height="384" aria-label="Prévia de sprite, hurtbox e hitbox"/><div><p>Azul: hurtbox · vermelho: hitbox · cruz: pivô dos pés</p><div className="workshop-preview-controls"><button onClick={()=>setPlaying(p=>!p)}>{playing?'Pausar':'Reproduzir'}</button><label><input type="checkbox" checked={onion} onChange={e=>setOnion(e.target.checked)}/> Onion skin</label><label><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/> Espelhar</label></div><label>Frame visual {frame+1} / {anim?.frames||0}<input type="range" min={0} max={Math.max(0,(anim?.frames||1)-1)} value={Math.min(frame,(anim?.frames||1)-1)} onChange={e=>setFrame(+e.target.value)}/></label>{definition.moves[active as BasicMove]&&<label>Tick do golpe {combatTick} / {(definition.moves[active as BasicMove]!.startupFrames)+(definition.moves[active as BasicMove]!.activeFrames)+(definition.moves[active as BasicMove]!.recoveryFrames)}<input type="range" min={1} max={(definition.moves[active as BasicMove]!.startupFrames)+(definition.moves[active as BasicMove]!.activeFrames)+(definition.moves[active as BasicMove]!.recoveryFrames)} value={Math.min(combatTick,(definition.moves[active as BasicMove]!.startupFrames)+(definition.moves[active as BasicMove]!.activeFrames)+(definition.moves[active as BasicMove]!.recoveryFrames))} onChange={e=>setCombatTick(+e.target.value)}/></label>}{anim&&<><label>FPS da animação<input type="number" min="1" max="60" value={anim.fps} onChange={e=>change(d=>{d.animations[active]!.fps=+e.target.value})}/></label><label>Frames disponíveis<input type="number" min="1" value={anim.frames} onChange={e=>change(d=>{d.animations[active]!.frames=+e.target.value})}/></label></>}</div></div>
     <h3>Frame data e colisões</h3>
     <div className="workshop-moves">{moves.map(kind=>{const m=definition.moves[kind]||DEFAULT_MOVES[kind];return <details key={kind} open={active===kind}><summary>{kind} · {m.startupFrames}f startup / {m.activeFrames}f active / {m.recoveryFrames}f recovery</summary><div className="workshop-fields">{(['startupFrames','activeFrames','recoveryFrames','damage','range','bufferFrames'] as const).map(field=><label key={field}>{field}<input type="number" min="1" value={m[field]??6} onChange={e=>change(d=>{d.moves[kind]={...DEFAULT_MOVES[kind],...d.moves[kind],[field]:+e.target.value}})}/></label>)}</div><h4>Hitboxes por intervalo (coordenadas relativas aos pés)</h4>{(m.hitboxes||[]).map((box,i)=><div className="workshop-hitbox" key={i}>{(['fromFrame','toFrame','x','y','w','h'] as const).map(field=><label key={field}>{field}<input type="number" value={fmt(box[field])} onChange={e=>change(d=>{d.moves[kind]!.hitboxes![i][field]=+e.target.value})}/></label>)}<button onClick={()=>change(d=>{d.moves[kind]!.hitboxes!.splice(i,1)})}>Remover</button></div>)}<button onClick={()=>change(d=>{d.moves[kind]={...DEFAULT_MOVES[kind],...d.moves[kind]};d.moves[kind]!.hitboxes=[...(d.moves[kind]!.hitboxes||[]),{fromFrame:m.startupFrames+1,toFrame:m.startupFrames+m.activeFrames,x:20,y:-140,w:100,h:70}]})}>+ Hitbox</button></details>})}</div>
     <div className="workshop-buttons"><button onClick={()=>void publish('draft')} disabled={saving}>Salvar rascunho</button><button className="workshop-primary" onClick={()=>void publish('publish')} disabled={saving}>{saving?'Publicando...':'Validar e publicar'}</button><button onClick={()=>setAdvanced(!advanced)}>{advanced?'Ocultar':'Editar'} JSON avançado</button></div>
     {advanced&&<textarea aria-label="JSON avançado" className="workshop-json" spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)}/>}
    </>}
   </section>
  </div>
  <footer>Upload e publicação reservados ao desenvolvedor autorizado. Revisões imutáveis e assets por hash; partidas já iniciadas não recebem mudanças ao vivo.</footer>
 </main>
}
