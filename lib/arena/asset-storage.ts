import 'server-only'
import {createHash} from 'node:crypto'
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {isPublishedAssetUrl,safeAssetPath,type ArenaCharacterDefinition} from './character-schema'

/** Montar no Docker como volume persistente. Não grava arquivos no public/ após build. */
export const ASSET_ROOT=path.resolve(process.env.ARENA_ASSETS_DIR||'./.arena-assets')
const MAX_FILE=24*1024*1024,MAX_TOTAL=120*1024*1024,MAX_IMAGES=160
export type IncomingAsset={name:string;data:Buffer;extension:string}
export function checkAssetName(v:string):string{
 const name=v.replace(/^.*?\//,'') // somente usado para sanitizar exibição; a validação mantém o caminho original
 if(!safeAssetPath(v))throw new Error('Caminho de arquivo não permitido: '+name)
 return v
}
function imageDimensions(data:Buffer,ext:string):{width:number;height:number}|null {
 if(ext==='png'){
  if(data.length<24||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null
  return {width:data.readUInt32BE(16),height:data.readUInt32BE(20)}
 }
 if(ext==='webp'){
  if(data.length<30||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP')return null
  const kind=data.toString('ascii',12,16)
  if(kind==='VP8X')return {width:1+data.readUIntLE(24,3),height:1+data.readUIntLE(27,3)}
  if(kind==='VP8L'&&data[20]===0x2f)return {width:1+(((data[22]&63)<<8)|data[21]),height:1+(((data[24]&15)<<10)|(data[23]<<2)|((data[22]&192)>>6))}
  if(kind==='VP8 '&&data[23]===0x9d&&data[24]===0x01&&data[25]===0x2a)return {width:data.readUInt16LE(26)&0x3fff,height:data.readUInt16LE(28)&0x3fff}
  return null
 }
 return null
}
export function validateAssets(files:IncomingAsset[]){
 if(files.length>MAX_IMAGES)throw new Error('Pasta excede 160 assets.')
 if(files.reduce((s,f)=>s+f.data.length,0)>MAX_TOTAL)throw new Error('Upload excede 120 MiB.')
 const names=new Set<string>()
 for(const file of files){
  checkAssetName(file.name)
  if(names.has(file.name))throw new Error('Arquivo duplicado: '+file.name)
  names.add(file.name)
  if(!['png','webp','ogg'].includes(file.extension))throw new Error('Tipo não permitido: '+file.name)
  if(!file.data.length||file.data.length>MAX_FILE)throw new Error('Arquivo vazio ou acima de 24 MiB: '+file.name)
  if(file.extension==='ogg'){
   if(file.data.toString('ascii',0,4)!=='OggS')throw new Error('Áudio OGG inválido: '+file.name)
  }else{
   const size=imageDimensions(file.data,file.extension)
   if(!size||size.width<1||size.height<1||size.width>8192||size.height>8192||size.width*size.height>32_000_000)throw new Error('Imagem inválida ou grande demais: '+file.name)
  }
 }
}
function diskName(data:Buffer,extension:string){return createHash('sha256').update(data).digest('hex')+'.'+extension}
export async function writeContentAssets(files:IncomingAsset[]){
 await mkdir(ASSET_ROOT,{recursive:true})
 const names=new Map<string,string>()
 for(const f of files){
  const name=diskName(f.data,f.extension),target=path.join(ASSET_ROOT,name)
  try {await writeFile(target,f.data,{flag:'wx',mode:0o640})} catch(err){if((err as NodeJS.ErrnoException).code!=='EEXIST')throw err}
  names.set(f.name,'/api/arena/assets/'+name)
 }
 return names
}
export function resolvedDefinition(definition:ArenaCharacterDefinition,names:ReadonlyMap<string,string>):ArenaCharacterDefinition {
 const resolve=(name:string)=>{
  if(isPublishedAssetUrl(name))return name
  const file=names.get(name)
  if(!file)throw new Error('Arquivo citado no character.json não foi enviado: '+name)
  return file
 }
 return {...definition,portrait:resolve(definition.portrait),animations:Object.fromEntries(Object.entries(definition.animations).map(([name,animation])=>[name,animation&&{...animation,atlas:resolve(animation.atlas)}]))}
}
export async function readContentAsset(filename:string):Promise<{bytes:Buffer;size:number}|null>{
 if(!/^[a-f0-9]{64}\.(png|webp|ogg)$/.test(filename))return null
 try{const target=path.join(ASSET_ROOT,filename);const info=await stat(target);if(!info.isFile()||info.size>MAX_FILE)return null;return {bytes:await readFile(target),size:info.size}}catch{return null}
}
