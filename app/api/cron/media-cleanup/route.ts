import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';

// Daily Vercel cron (see vercel.json). /media stops showing items after 7 days, so a cover
// image is dead weight 14 days after publishing: delete the file from the content-images
// bucket and clear cover_url, keeping the media_items row as history. Only the media/ folder
// is touched -- visual/ (page backgrounds) and externally hosted covers are left alone.
const BUCKET='content-images';
const TTL_MS=14*24*60*60*1000;
const FOLDER='media';

export const dynamic='force-dynamic';

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});

  const db=createAdminClient();
  const publicPrefix=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  const pathOf=(url:string|null)=>url?.startsWith(publicPrefix)?decodeURIComponent(url.slice(publicPrefix.length)):null;
  const cutoff=Date.now()-TTL_MS;

  const {data:items,error}=await db.from('media_items').select('id,cover_url,published_at');
  if(error)return NextResponse.json({error:'media_items query failed'},{status:500});

  // Any path a still-recent item points at is kept, even if an old item shares it.
  const keep=new Set<string>(),expired=new Map<string,string>();
  for(const item of items){
    const path=pathOf(item.cover_url);
    if(!path?.startsWith(`${FOLDER}/`))continue;
    if(new Date(item.published_at).getTime()<cutoff)expired.set(item.id,path);else keep.add(path);
  }
  const referenced=new Set([...keep,...expired.values()]);

  // Clear the rows first: if a file delete then fails, the file is unreferenced and the
  // orphan sweep below removes it on the next run.
  const expiredIds=[...expired.keys()];
  if(expiredIds.length){
    const {error:clearError}=await db.from('media_items').update({cover_url:null}).in('id',expiredIds);
    if(clearError)return NextResponse.json({error:'clearing covers failed'},{status:500});
  }

  // Orphans: uploads older than the TTL that no media item uses (e.g. a cancelled form).
  const orphans:string[]=[];
  for(let offset=0;;offset+=1000){
    const {data:files,error:listError}=await db.storage.from(BUCKET).list(FOLDER,{limit:1000,offset,sortBy:{column:'created_at',order:'asc'}});
    if(listError)return NextResponse.json({error:'listing files failed'},{status:500});
    for(const file of files){
      const path=`${FOLDER}/${file.name}`;
      if(file.id&&file.created_at&&new Date(file.created_at).getTime()<cutoff&&!referenced.has(path))orphans.push(path);
    }
    if(files.length<1000)break;
  }

  const toDelete=[...new Set([...[...expired.values()].filter(path=>!keep.has(path)),...orphans])];
  for(let i=0;i<toDelete.length;i+=100){
    const {error:removeError}=await db.storage.from(BUCKET).remove(toDelete.slice(i,i+100));
    if(removeError)return NextResponse.json({error:'deleting files failed',clearedCovers:expiredIds.length},{status:500});
  }

  return NextResponse.json({clearedCovers:expiredIds.length,deletedFiles:toDelete.length});
}
