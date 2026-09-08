'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/user';

export async function completeTask(taskId:string){
  const {db}=await requireUser(`/tasks/${taskId}`);
  const {error}=await db.rpc('complete_task',{p_task_id:taskId});
  if(error)throw new Error('完成状态保存失败');
  revalidatePath(`/tasks/${taskId}`);revalidatePath('/me');revalidatePath('/me/tasks');
}

export async function adjustTaskProgress(taskId:string,delta:-1|1){
  const {db}=await requireUser(`/tasks/${taskId}`);
  const {data,error}=await db.rpc('adjust_task_progress',{p_task_id:taskId,p_delta:delta});
  if(error||typeof data!=='number')throw new Error('进度保存失败');
  revalidatePath(`/tasks/${taskId}`);revalidatePath('/urgent');revalidatePath('/daily');
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

export async function logout(){
  const {db}=await requireUser('/me/account');await db.auth.signOut();redirect('/login');
}
