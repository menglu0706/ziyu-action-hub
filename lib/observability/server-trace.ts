import 'server-only';

import {headers} from 'next/headers';

const REQUEST_ID_HEADER='x-ziyu-request-id';
const SLOW_CALL_MS=750;
const SLOW_REQUEST_MS=1_000;
const SAMPLE_RATE=0.01;

type TraceResult='success'|'failure'|'redirect';
type TraceSpan={stage:string;startMs:number;durationMs:number;result:TraceResult;errorType?:string};

function safeErrorType(error:unknown){
  if(error&&typeof error==='object'&&'digest' in error&&String(error.digest).startsWith('NEXT_REDIRECT'))return 'redirect';
  const value=error instanceof Error?error.name:'UnknownError';
  return value.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)||'UnknownError';
}

function resultErrorType(error:unknown){
  if(!error)return undefined;
  if(typeof error==='object'){
    const candidate=error as {name?:unknown;code?:unknown;status?:unknown};
    const value=candidate.code??candidate.status??candidate.name;
    if(value!==undefined)return safeStage(String(value));
  }
  return safeErrorType(error);
}

function safeStage(value:string){return value.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,100)}

function supabaseStage(input:RequestInfo|URL){
  try{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const pathname=new URL(raw).pathname;
    if(pathname==='/auth/v1/user')return 'supabase.auth.getUser';
    const rpc=pathname.match(/^\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)$/)?.[1];
    if(rpc)return `supabase.rpc.${safeStage(rpc)}`;
    const table=pathname.match(/^\/rest\/v1\/([a-zA-Z0-9_]+)$/)?.[1];
    if(table)return `supabase.db.${safeStage(table)}`;
    if(pathname.startsWith('/auth/v1/'))return 'supabase.auth.request';
    if(pathname.startsWith('/storage/v1/'))return 'supabase.storage.request';
  }catch{}
  return 'supabase.request';
}

export class ServerTrace{
  readonly startedAt:number;
  readonly requestId:string;
  private readonly route:string;
  private readonly sampled:boolean;
  private spans:TraceSpan[]=[];
  private flushed=false;

  constructor(route:string,requestId:string,startedAt=Date.now()){
    this.route=route;
    this.requestId=requestId;
    this.startedAt=startedAt;
    this.sampled=Math.random()<SAMPLE_RATE;
  }

  start(){return Date.now()}

  end(stage:string,startedAt:number,result:TraceResult='success',errorType?:string){
    try{
      this.spans.push({stage:safeStage(stage),startMs:Math.max(0,startedAt-this.startedAt),durationMs:Math.max(0,Date.now()-startedAt),result,...(errorType?{errorType:safeStage(errorType)}:{})});
    }catch{}
  }

  async measure<T>(stage:string,work:()=>PromiseLike<T>):Promise<T>{
    const startedAt=this.start();
    try{
      const value=await work();
      this.end(stage,startedAt);
      return value;
    }catch(error){
      const errorType=safeErrorType(error);
      this.end(stage,startedAt,errorType==='redirect'?'redirect':'failure',errorType);
      throw error;
    }
  }

  async measureResult<T extends {error?:unknown}>(stage:string,work:()=>PromiseLike<T>):Promise<T>{
    const startedAt=this.start();
    try{
      const value=await work();
      const errorType=resultErrorType(value.error);
      this.end(stage,startedAt,errorType?'failure':'success',errorType);
      return value;
    }catch(error){
      this.end(stage,startedAt,'failure',safeErrorType(error));
      throw error;
    }
  }

  timedFetch():typeof fetch{
    return async(input,init)=>{
      const stage=supabaseStage(input);
      const startedAt=this.start();
      try{
        const response=await fetch(input,init);
        this.end(stage,startedAt,response.ok?'success':'failure',response.ok?undefined:`http_${response.status}`);
        return response;
      }catch(error){
        this.end(stage,startedAt,'failure',safeErrorType(error));
        throw error;
      }
    };
  }

  flush(outcome:'success'|'failure'|'redirect'='success',error?:unknown,completion:'page-return'|'async-dependencies-settled'='page-return'){
    if(this.flushed)return;
    this.flushed=true;
    try{
      const observationMs=Math.max(0,Date.now()-this.startedAt);
      const errorType=error?safeErrorType(error):undefined;
      const shouldLog=outcome==='failure'||observationMs>=SLOW_REQUEST_MS||this.spans.some(span=>span.result==='failure'||span.durationMs>=SLOW_CALL_MS)||this.sampled;
      if(!shouldLog)return;
      const payload={event:'server-request-trace',requestId:this.requestId,route:this.route,completion,observationMs,...(completion==='page-return'?{totalMs:observationMs}:{}),outcome,...(errorType?{errorType}:{}),spans:this.spans};
      if(outcome==='failure')console.warn('[server-trace]',payload);
      else console.info('[server-trace]',payload);
    }catch{}
  }


  flushError(error:unknown,completion:'page-return'|'async-dependencies-settled'='page-return'){
    this.flush(safeErrorType(error)==='redirect'?'redirect':'failure',error,completion);
  }
}

export async function createServerTrace(route:string,startedAt=Date.now()){
  let requestId=crypto.randomUUID();
  try{requestId=(await headers()).get(REQUEST_ID_HEADER)??requestId}catch{}
  return new ServerTrace(route,requestId,startedAt);
}
