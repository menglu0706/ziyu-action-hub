import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';

export type AdminAccount={userId:string;email:string;role:'admin'|'editor';isActive:boolean;createdAt:string};
export type AdminAccountsResult={accounts:AdminAccount[];error?:string};

export async function getAdminAccounts():Promise<AdminAccountsResult>{
  try{
    const service=createAdminClient();
    const rowsResult=await service.from('admin_users').select('user_id,role,is_active,created_at').order('created_at',{ascending:true});
    if(rowsResult.error)return {accounts:[],error:'后台账号加载失败'};
    const rows=rowsResult.data??[],users=await Promise.all(rows.map(row=>service.auth.admin.getUserById(row.user_id)));
    return {accounts:rows.map((row,index)=>({userId:row.user_id,email:users[index].data.user?.email??'邮箱不可用',role:row.role as 'admin'|'editor',isActive:row.is_active,createdAt:row.created_at}))};
  }catch(error){
    return {accounts:[],error:error instanceof Error?error.message:'后台账号加载失败'};
  }
}
