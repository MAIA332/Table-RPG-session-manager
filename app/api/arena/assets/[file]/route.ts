    import {readContentAsset} from '@/lib/arena/asset-storage'
export const runtime='nodejs'
export async function GET(request:Request,{params}:{params:Promise<{file:string}>}){
 const {file}=await params,asset=await readContentAsset(file)
 if(!asset)return new Response('Arquivo não encontrado',{status:404})
 const etag='"'+file.split('.')[0]+'"'
 if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':'public, max-age=31536000, immutable'}})
 const mime=file.endsWith('.png')?'image/png':file.endsWith('.ogg')?'audio/ogg':'image/webp'
 return new Response(new Uint8Array(asset.bytes),{headers:{'Content-Type':mime,'Content-Length':String(asset.size),'Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public, max-age=31536000, immutable',ETag:etag,'X-Content-Type-Options':'nosniff'}})
}
