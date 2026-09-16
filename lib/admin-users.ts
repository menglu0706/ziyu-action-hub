import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';

export type AdminAccount={userId:string;email:string;role:'admin'|'editor';isActive:boolean;createdAt:string};
export type AdminAccountsResult={accounts:AdminAccount[];error?:string};

export async function getAdminAccounts(actor:{role:'admin'|'editor'}):Promise<AdminAccountsResult>{
  try{
    if(actor.role!=='admin')return {accounts:[],error:'仅启用的管理员可以读取后台账号'};
    const service=createAdminClient();
    const rowsResult=await service.from('admin_users').select('user_id,role,is_active,created_at').order('created_at',{ascending:true});
    if(rowsResult.error)return {accounts:[],error:`service-role 读取 admin_users 失败（${rowsResult.error.code}）：${rowsResult.error.message}。请确认 Vercel 的 SUPABASE_SERVICE_ROLE_KEY 使用正确项目的 service_role 密钥`};
    const rows=rowsResult.data??[],users=await Promise.all(rows.map(row=>service.auth.admin.getUserById(row.user_id)));
    const authError=users.find(result=>result.error)?.error;
    if(authError)return {accounts:[],error:`Supabase Auth Admin 读取邮箱失败：${authError.message}`};
    return {accounts:rows.map((row,index)=>({userId:row.user_id,email:users[index].data.user?.email??'邮箱不可用',role:row.role as 'admin'|'editor',isActive:row.is_active,createdAt:row.created_at}))};
  }catch(error){
    return {accounts:[],error:error instanceof Error?error.message:'后台账号加载失败'};
  }
}
