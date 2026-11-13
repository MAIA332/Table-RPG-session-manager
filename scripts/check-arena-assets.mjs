#!/usr/bin/env node
/** Valida os assets usados pela Arena, sem dependência e sem instalar engine gráfica. */
import {readFileSync,existsSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
const root=resolve('public'),errors=[]
const need=new Set()
const add=(...paths)=>paths.forEach(p=>need.add(p.replace(/^\//,'')))
const ids=['fander','andreas','lightea','maeve','joffrey','valya','miguel','amelia','lysa','thorfinn','loulan','langris']
const canonicalWalks=new Set(['fander','andreas','valya','thorfinn','langris'])
for(const id of ids){
 add('arena/portraits/'+id+(['amelia','lysa','loulan'].includes(id)?'-v10':'')+'.webp')
 add('arena/animations/'+id+'/'+(id==='miguel'?'movement-v4':id==='lightea'?'movement-v9':'movement')+'.webp')
 add('arena/animations/'+id+'/'+(id==='lightea'?'combat-v9':'combat')+'.webp')
 add('arena/animations/'+id+'/'+(canonicalWalks.has(id)?'movement':'walk-v4')+'.webp')
}
for(const id of ['amelia','joffrey'])add(`arena/animations/${id}/idle-v9.webp`)
for(const path of ['fander/elbow-v4','loulan/switch-v4','valya/dragon-v5'])add('arena/animations/'+path+'.webp')
for(const id of ['forest','harbor','egypt','swamp'])add('arena/stages/'+id+'-v15.webp')
add('arena/portraits/alter-lysa-v11.webp')
for(const [name,ver] of [['base-movement',11],['base-combat',11],['euphoria-movement',12],['euphoria-combat',12],['euphoria-dash',13],['transform',13],['revert',12],['dance',13],['clone',11]])add(`arena/animations/alter-lysa/${name}-v${ver}.webp`)
for(const stem of ['attacks-a','attacks-b','attacks-c','attacks-d','whip-v6','puppet-float-v5','ice-dragon-v5','barrier-v4','horns-v4','fate-hands-v4','fire-aura-v6','lysa-roots-v6'])add('arena/fx/'+stem+'.webp')
// Literais escritos diretamente nos módulos ativos; templates são cobertos pelo registro acima.
for(const file of ['lib/arena/animation.ts','lib/arena/alter-animation.ts','components/arena/arena-stage.tsx','components/arena/arena-minigame.tsx']){
 const text=readFileSync(resolve(file),'utf8')
 for(const match of text.matchAll(/['"`]\/(arena\/(?:animations|portraits|fx|stages)\/[a-z\d/_.-]+\.(?:webp|png))['"`]/g))add(match[1])
}
function webpSize(buffer){
 if(buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WEBP')return null
 const code=buffer.toString('ascii',12,16)
 if(code==='VP8X')return [1+buffer.readUIntLE(24,3),1+buffer.readUIntLE(27,3)]
 if(code==='VP8L')return [1+(((buffer[22]&63)<<8)|buffer[21]),1+(((buffer[24]&15)<<10)|(buffer[23]<<2)|((buffer[22]&192)>>6))]
 if(code==='VP8 '&&buffer[23]===0x9d&&buffer[24]===0x01&&buffer[25]===0x2a)return [buffer.readUInt16LE(26)&0x3fff,buffer.readUInt16LE(28)&0x3fff]
 return null
}
for(const pathname of need){
 const path=join(root,pathname)
 if(!existsSync(path)){errors.push('Ausente: '+pathname);continue}
 const file=readFileSync(path);if(pathname.endsWith('.webp')){const size=webpSize(file);if(!size||size.some(n=>n<1||n>16384))errors.push('WebP inválido: '+pathname)}
}
// Verificar integridade básica de todos os manifests estáticos da arte.
const arena=join(root,'arena')
for(const f of readdirSync(arena).filter(p=>/^animation.*manifest\.json$/.test(p))){try{JSON.parse(readFileSync(join(arena,f),'utf8'))}catch{errors.push('JSON de manifest inválido: '+f)}}
if(errors.length){console.error('Falha de integridade de assets da Arena:\n'+errors.map(e=>' - '+e).join('\n'));process.exit(1)}
console.log(`Arena: ${need.size} assets ativos verificados; manifests JSON válidos.`)
