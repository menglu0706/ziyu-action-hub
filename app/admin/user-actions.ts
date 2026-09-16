'use server';
import {getAdminActor} from '@/lib/auth/admin';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import type {AdminAccount} from '@/lib/admin-users';

type Role='admin'|'editor';
type Result<T>={ok:true;data:T;message:string}|{ok:false;error:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(error:string):Result<never>=>({ok:false,error});

async function authorize(){
  const db=await createClient(),actor=await getAdminActor(db);
  if(!actor||actor.role!=='admin')throw new Error('仅管理员可管理后台账号');
}

function safeError(error:unknown){
  const message=error instanceof Error?error.message:'';
  return message.includes('SUPABASE_SERVICE_ROLE_KEY')?message:message==='仅管理员可管理后台账号'?message:'操作失败，请稍后重试';
}

export async function createAdminAccount(input:{email:string;password:string;role:string;isActive:boolean}):Promise<Result<AdminAccount>>{
  try{
    await authorize();
    const email=input.email.trim().toLowerCase(),role=input.role as Role;
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('请输入有效邮箱');
    if(input.password.length<8||input.password.length>128)return fail('初始密码需为 8–128 个字符');
    if(role!=='admin'&&role!=='editor')return fail('角色无效');
    if(typeof input.isActive!=='boolean')return fail('启用状态无效');
    const service=createAdminClient(),created=await service.auth.admin.createUser({email,password:input.password,email_confirm:true});
    if(created.error||!created.data.user){
      const duplicate=created.error?.message.toLowerCase().includes('already')||created.error?.message.toLowerCase().includes('registered');
      return fail(duplicate?'该邮箱已存在':'认证账号创建失败');
    }
    const user=created.data.user,inserted=await service.from('admin_users').insert({user_id:user.id,role,is_active:input.isActive,created_at:user.created_at});
    if(inserted.error){
      const rollback=await service.auth.admin.deleteUser(user.id);
      return fail(rollback.error?'账号创建未完成，认证账号清理失败，请联系技术人员':'后台账号记录创建失败，认证账号已清理');
    }
    return {ok:true,message:'创建成功',data:{userId:user.id,email:user.email??email,role,isActive:input.isActive,createdAt:user.created_at}};
  }catch(error){return fail(safeError(error))}
}

async function updateAccount(userId:string,change:{role?:Role;isActive?:boolean}):Promise<Result<{userId:string;role:Role;isActive:boolean}>>{
  try{
    await authorize();
    if(!uuid.test(userId))return fail('账号无效');
    const service=createAdminClient(),targetResult=await service.from('admin_users').select('user_id,role,is_active').eq('user_id',userId).maybeSingle();
    const target=targetResult.data;
    if(targetResult.error||!target)return fail('后台账号不存在');
    const nextRole=change.role??target.role as Role,nextActive=change.isActive??target.is_active;
    if(nextRole!=='admin'&&nextRole!=='editor')return fail('角色无效');
    const removesActiveAdmin=target.role==='admin'&&target.is_active&&!(nextRole==='admin'&&nextActive);
    if(removesActiveAdmin){
      const before=await service.from('admin_users').select('user_id',{count:'exact',head:true}).eq('role','admin').eq('is_active',true);
      if(before.error)return fail('管理员数量检查失败');
      if((before.count??0)<=1)return fail('必须保留至少一个启用的管理员账号');
    }
    const updated=await service.from('admin_users').update({role:nextRole,is_active:nextActive}).eq('user_id',userId);
    if(updated.error)return fail('保存失败');
    if(removesActiveAdmin){
      const after=await service.from('admin_users').select('user_id',{count:'exact',head:true}).eq('role','admin').eq('is_active',true);
      if(after.error||(after.count??0)===0){
        const rollback=await service.from('admin_users').update({role:target.role,is_active:target.is_active}).eq('user_id',userId);
        return fail(rollback.error?'管理员保护回滚失败，请立即检查账号状态':'必须保留至少一个启用的管理员账号');
      }
    }
    return {ok:true,message:nextActive?'保存成功':'账号已停用',data:{userId,role:nextRole,isActive:nextActive}};
  }catch(error){return fail(safeError(error))}
}

export async function changeAdminAccountRole(userId:string,role:string){
  if(role!=='admin'&&role!=='editor')return fail('角色无效');
  return updateAccount(userId,{role});
}

export async function setAdminAccountActive(userId:string,isActive:boolean){
  if(typeof isActive!=='boolean')return fail('启用状态无效');
  return updateAccount(userId,{isActive});
}
