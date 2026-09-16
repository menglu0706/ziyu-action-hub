import 'server-only';
import {createAdminClient,getAdminKeyType} from '@/lib/supabase/admin';

export type AdminAccount={userId:string;email:string;role:'admin'|'editor';isActive:boolean;createdAt:string};
export type AdminAccountsResult={accounts:AdminAccount[];error?:string};

type SafeError={message:string;status?:number;code?:string};

function diagnostic(authError:SafeError|null,tableError:SafeError|null){
  const auth=authError?`FAILED (${authError.status??'unknown'}: ${authError.message})`:'OK';
  const table=tableError?`FAILED (${tableError.code??'unknown'}: ${tableError.message})`:'OK';
  return `密钥类型: ${getAdminKeyType()}；Supabase Admin Auth API: ${auth}；admin_users SELECT: ${table}`;
}

export async function diagnoseAdminUsersAccess(service:ReturnType<typeof createAdminClient>){
  const [auth,table]=await Promise.all([
    service.auth.admin.listUsers({page:1,perPage:1}),
    service.from('admin_users').select('user_id',{count:'exact',head:true}),
  ]);
  return diagnostic(auth.error,table.error);
}

export async function getAdminAccounts(actor:{role:'admin'|'editor'}):Promise<AdminAccountsResult>{
  try{
    if(actor.role!=='admin')return {accounts:[],error:'仅启用的管理员可以读取后台账号'};
    const service=createAdminClient();
    const [authResult,rowsResult]=await Promise.all([
      service.auth.admin.listUsers({page:1,perPage:1000}),
      service.from('admin_users').select('user_id,role,is_active,created_at').order('created_at',{ascending:true}),
    ]);
    if(authResult.error||rowsResult.error)return {accounts:[],error:diagnostic(authResult.error,rowsResult.error)};
    const users=new Map(authResult.data.users.map(user=>[user.id,user]));
    return {accounts:(rowsResult.data??[]).map(row=>({userId:row.user_id,email:users.get(row.user_id)?.email??'邮箱不可用',role:row.role as 'admin'|'editor',isActive:row.is_active,createdAt:row.created_at}))};
  }catch(error){
    return {accounts:[],error:error instanceof Error?error.message:'后台账号加载失败'};
  }
}
