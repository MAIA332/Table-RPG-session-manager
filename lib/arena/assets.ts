/** O preload e o canvas compartilham a mesma imagem decodificada. */
type Entry={image:HTMLImageElement;ready:Promise<void>;failedAt:number}
const cache=new Map<string,Entry>()
export function arenaImage(url:string):HTMLImageElement{
 let entry=cache.get(url)
 if(entry?.failedAt&&performance.now()-entry.failedAt>3000){cache.delete(url);entry=undefined}
 if(!entry){
  const image=new Image();image.decoding='async'
  const record:Entry={image,ready:Promise.resolve(),failedAt:0}
  record.ready=new Promise<void>((resolve,reject)=>{
   image.onload=()=>{void image.decode().then(()=>resolve(),()=>resolve())}
   image.onerror=()=>{record.failedAt=performance.now();reject(new Error('Imagem indisponível: '+url))}
  });record.ready.catch(()=>{})
  cache.set(url,record);image.src=url;entry=record
 }
 cache.delete(url);cache.set(url,entry)
 while(cache.size>64)cache.delete(cache.keys().next().value!)
 return entry.image
}
export async function preloadArenaImages(urls:Iterable<string>){
 const pending=[...new Set(urls)]
 await Promise.all(Array.from({length:Math.min(6,pending.length)},async()=>{
  while(pending.length){const url=pending.shift()!;let failure:unknown
   for(let attempt=0;attempt<3;attempt++){
    if(attempt){cache.delete(url);await new Promise(resolve=>setTimeout(resolve,250*attempt))}
    try{arenaImage(url);await cache.get(url)!.ready;failure=null;break}catch(error){failure=error}
   }
   if(failure)throw failure
  }
 }))
}
export function arenaImageCount(){return cache.size}
