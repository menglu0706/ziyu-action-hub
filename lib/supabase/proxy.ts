import { createServerClient } from '@supabase/ssr';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';

const AUTH_REQUEST_TIMEOUT_MS = 4_000;
const SLOW_AUTH_LOG_THRESHOLD_MS = 1_000;
const NORMAL_AUTH_LOG_SAMPLE_RATE = 0.01;

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
  const pathname = request.nextUrl.pathname;
  if (pathname === '/admin/login') return NextResponse.next({ request });

  let response = NextResponse.next({ request });
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
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const requestId = request.headers.get('x-vercel-id') ?? crypto.randomUUID();
  const sampled = Math.random() < NORMAL_AUTH_LOG_SAMPLE_RATE;
  if (sampled) console.info('[middleware-auth]', { event: 'claims-start', requestId, pathname });

  let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch (caught) {
    const durationMs = Date.now() - startedAt;
    if (authRequestState.timedOut || isAuthRetryableFetchError(caught)) {
      console.warn('[middleware-auth]', {
        event: authRequestState.timedOut ? 'claims-timeout' : 'claims-network-error',
        requestId,
        pathname,
        durationMs,
        errorName: caught instanceof Error ? caught.name : 'UnknownError',
      });
      return retryableAuthResponse(response);
    }
    console.error('[middleware-auth]', {
      event: 'claims-exception',
      requestId,
      pathname,
      durationMs,
      errorName: caught instanceof Error ? caught.name : 'UnknownError',
    });
    throw caught;
  }

  const { data, error } = claimsResult;
  const durationMs = Date.now() - startedAt;
  if (authRequestState.timedOut || isAuthRetryableFetchError(error)) {
    console.warn('[middleware-auth]', {
      event: authRequestState.timedOut ? 'claims-timeout' : 'claims-network-error',
      requestId,
      pathname,
      durationMs,
      errorName: error?.name ?? 'UnknownError',
    });
    return retryableAuthResponse(response);
  }
  if (sampled || durationMs >= SLOW_AUTH_LOG_THRESHOLD_MS) {
    console.info('[middleware-auth]', {
      event: 'claims-complete',
      requestId,
      pathname,
      durationMs,
      outcome: error || !data?.claims?.sub ? 'no-session' : 'authenticated',
    });
  }

  if (pathname === '/me' || pathname.startsWith('/me/')) {
    const userId=data?.claims?.sub;
    if(error||!userId){const login=request.nextUrl.clone();login.pathname='/login';login.searchParams.set('next',pathname);return NextResponse.redirect(login)}
  }

  if (pathname.startsWith('/admin')) {
    const userId = data?.claims?.sub;
    if (error || !userId) {
      const login = request.nextUrl.clone();
      login.pathname = '/admin/login';
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
  }
  return response;
}
