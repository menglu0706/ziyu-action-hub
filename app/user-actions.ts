'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {isPlatform} from '@/lib/platforms';
import {requireUser,requireUserIdentity} from '@/lib/auth/user';

export async function completeTask(taskId:string){
  const {db}=await requireUser(`/tasks/${taskId}`);
  const {error}=await db.rpc('complete_task',{p_task_id:taskId});
  if(error)throw new Error('完成状态保存失败');
  revalidatePath(`/tasks/${taskId}`);revalidatePath('/me');revalidatePath('/me/tasks');
}

export async function adjustTaskProgress(taskId:string,delta:-1|1){
  const {db}=await requireUserIdentity(`/tasks/${taskId}`);
  const {data,error}=await db.rpc('adjust_task_progress',{p_task_id:taskId,p_delta:delta});
  if(error||typeof data!=='number')throw new Error('进度保存失败');
  return data;
}

export async function updateTimezone(timezone:string){
  const {db,user,profile}=await requireUser('/me');
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{return}
  if(profile.timezone===timezone)return;
  const {error}=await db.from('profiles').update({timezone}).eq('id',user.id);
  if(error)throw new Error('时区保存失败');
  revalidatePath('/me');
}

export async function updateNickname(nickname:string){
  const value=nickname.trim();if(!value||value.length>40)throw new Error('昵称长度需为 1–40 个字符');
  const {db,user}=await requireUser('/me/account');
  const {error}=await db.from('profiles').update({nickname:value}).eq('id',user.id);
  if(error)throw new Error('昵称保存失败');
  revalidatePath('/me');revalidatePath('/me/account');
}
export async function saveAvatarUrl(){
  const {db,user}=await requireUserIdentity('/me/account');const path=`${user.id}/avatar.webp`,baseUrl=db.storage.from('avatars').getPublicUrl(path).data.publicUrl,avatarUrl=`${baseUrl}?v=${Date.now()}`;
  const {error}=await db.from('profiles').update({avatar_url:avatarUrl}).eq('id',user.id);
  if(error)throw new Error('头像保存失败');
  revalidatePath('/me');revalidatePath('/me/account');return avatarUrl;
}
export async function updateLeaderboardOptIn(enabled:boolean){const {db,user}=await requireUser('/me/account');const {error}=await db.from('profiles').update({leaderboard_opt_in:enabled}).eq('id',user.id);if(error)throw new Error('英雄榜设置保存失败');revalidatePath('/me');revalidatePath('/me/account');revalidatePath('/me/leaderboard')}

export async function updatePlatformAccountCount(platform:string,count:number|null){
  if(!isPlatform(platform))throw new Error('账号平台无效');
  if(count!==null&&(!Number.isInteger(count)||count<1||count>10000))throw new Error('账号数量需为 1–10000');
  const {db,user}=await requireUser('/me/account');
  const result=count===null
    ?await db.from('platform_account_counts').delete().eq('user_id',user.id).eq('platform',platform)
    :await db.from('platform_account_counts').upsert({user_id:user.id,platform,account_count:count},{onConflict:'user_id,platform'});
  if(result.error)throw new Error('平台账号数量保存失败');
  revalidatePath('/me/account');revalidatePath('/urgent');revalidatePath('/daily');
}

export async function logout(){
  const {db}=await requireUser('/me/account');await db.auth.signOut();redirect('/login');
}
