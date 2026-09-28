import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {parseSubscription} from '@/lib/push';

// Turns 加热提醒 on (POST) or off (DELETE) for one browser. The table isn't writable by visitors
// directly; only this route stores the (anonymous) subscription.
export const dynamic='force-dynamic';

export async function POST(request:Request){
  const sub=parseSubscription(await request.json().catch(()=>null));
  if(!sub)return NextResponse.json({error:'订阅信息无效'},{status:400});
  const {error}=await createAdminClient().from('push_subscriptions').upsert(sub,{onConflict:'endpoint'});
  return error?NextResponse.json({error:'保存失败'},{status:500}):NextResponse.json({ok:true});
}

export async function DELETE(request:Request){
  const body=await request.json().catch(()=>null) as {endpoint?:unknown}|null;
  if(typeof body?.endpoint!=='string')return NextResponse.json({error:'缺少订阅地址'},{status:400});
  const {error}=await createAdminClient().from('push_subscriptions').delete().eq('endpoint',body.endpoint);
  return error?NextResponse.json({error:'删除失败'},{status:500}):NextResponse.json({ok:true});
}
