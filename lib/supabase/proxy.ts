import { createServerClient } from '@supabase/ssr';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';

const AUTH_REQUEST_TIMEOUT_MS = 4_000;
const NORMAL_AUTH_LOG_SAMPLE_RATE = 0.01;
const SLOW_CALL_LOG_THRESHOLD_MS = 750;
const REQUEST_ID_HEADER = 'x-ziyu-request-id';

type AuthRequestState = { timedOut: boolean; deadlineAt: number };

function createTimedFetch(state: AuthRequestState): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const forwardAbort = () => controller.abort(sourceSignal?.reason);

    if (sourceSignal?.aborted) forwardAbort();
    else sourceSignal?.addEventListener('abort', forwardAbort, { once: true });

    const remainingMs = Math.max(0, state.deadlineAt - Date.now());
    const timeout = setTimeout(() => {
      state.timedOut = true;
      controller.abort(new DOMException('Middleware auth request timed out', 'TimeoutError'));
    }, remainingMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      sourceSignal?.removeEventListener('abort', forwardAbort);
    }
  };
}

function retryableAuthResponse(response: NextResponse) {
  const retry = new NextResponse('身份验证服务暂时不可用，请稍后重试。', {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '3',
    },
  });
  response.cookies.getAll().forEach(cookie => retry.cookies.set(cookie));
  return retry;
}

export async function updateSession(request: NextRequest) {
  const requestStartedAt = Date.now();
  const pathname = request.nextUrl.pathname;
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const sampled = Math.random() < NORMAL_AUTH_LOG_SAMPLE_RATE;
  const spans: Array<{stage:string;startMs:number;durationMs:number;result:string;errorType?:string}> = [];
  const addSpan = (stage:string,startedAt:number,result:string,errorType?:string) => spans.push({stage,startMs:startedAt-requestStartedAt,durationMs:Date.now()-startedAt,result,...(errorType?{errorType}:{})});
  const logTrace = (outcome:string,errorType?:string) => {
    try{
      const totalMs=Date.now()-requestStartedAt;
      if(outcome!=='failure'&&totalMs<1_000&&!spans.some(span=>span.result==='failure'||span.durationMs>=SLOW_CALL_LOG_THRESHOLD_MS)&&!sampled)return;
      const payload={event:'middleware-request-trace',requestId,pathname,totalMs,outcome,...(errorType?{errorType}:{}),spans};
      if(outcome==='failure')console.warn('[middleware-trace]',payload);else console.info('[middleware-trace]',payload);
    }catch{}
  };
  const nextResponse = () => NextResponse.next({ request: { headers: requestHeaders } });
  if (pathname === '/admin/login') {
    const response=nextResponse();
    addSpan('middleware.public-bypass',requestStartedAt,'success');
    logTrace('success');
    return response;
  }

  const setupStartedAt=Date.now();
  let response = nextResponse();
  const { url, publishableKey } = getSupabaseConfig();
  const startedAt = Date.now();
  const authRequestState: AuthRequestState = {
    timedOut: false,
    deadlineAt: startedAt + AUTH_REQUEST_TIMEOUT_MS,
  };
  const supabase = createServerClient(url, publishableKey, {
    global: { fetch: createTimedFetch(authRequestState) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  addSpan('middleware.setup',setupStartedAt,'success');

  let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  const claimsStartedAt=Date.now();
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch (caught) {
    const errorName=caught instanceof Error ? caught.name : 'UnknownError';
    addSpan('supabase.auth.getClaims',claimsStartedAt,'failure',authRequestState.timedOut?'timeout':errorName);
    if (authRequestState.timedOut || isAuthRetryableFetchError(caught)) {
      const retry=retryableAuthResponse(response);
      addSpan('middleware.response',Date.now(),'success');
      logTrace('failure',authRequestState.timedOut?'auth_timeout':'auth_network_error');
      return retry;
    }
    logTrace('failure',errorName);
    throw caught;
  }

  const { data, error } = claimsResult;
  if (authRequestState.timedOut || isAuthRetryableFetchError(error)) {
    addSpan('supabase.auth.getClaims',claimsStartedAt,'failure',authRequestState.timedOut?'timeout':error?.name);
    const retry=retryableAuthResponse(response);
    addSpan('middleware.response',Date.now(),'success');
    logTrace('failure',authRequestState.timedOut?'auth_timeout':'auth_network_error');
    return retry;
  }
  addSpan('supabase.auth.getClaims',claimsStartedAt,'success',error?'no_session':undefined);

  const authorizeStartedAt=Date.now();
  if (pathname === '/me' || pathname.startsWith('/me/')) {
    const userId=data?.claims?.sub;
    if(error||!userId){const login=request.nextUrl.clone();login.pathname='/login';login.searchParams.set('next',pathname);addSpan('middleware.authorize',authorizeStartedAt,'redirect');const redirect=NextResponse.redirect(login);logTrace('redirect');return redirect}
  }

  if (pathname.startsWith('/admin')) {
    const userId = data?.claims?.sub;
    if (error || !userId) {
      const login = request.nextUrl.clone();
      login.pathname = '/admin/login';
      login.searchParams.set('next', pathname);
      addSpan('middleware.authorize',authorizeStartedAt,'redirect');
      const redirect=NextResponse.redirect(login);
      logTrace('redirect');
      return redirect;
    }
  }
  addSpan('middleware.authorize',authorizeStartedAt,'success');
  addSpan('middleware.response',Date.now(),'success');
  logTrace('success');
  return response;
}
