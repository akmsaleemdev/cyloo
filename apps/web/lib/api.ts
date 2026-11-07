'use client';

// Thin API client with the mandatory UX states handled centrally (§7):
//  - session expired (401) → redirect to /login preserving safe navigation
//  - offline (navigator.onLine / failed fetch) → typed OfflineError
//  - slow network → 20s AbortController timeout (never hang the UI)
// Token source: dev login (ADR-0004); Supabase session at cutover — only this
// file changes.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const TIMEOUT_MS = 20_000;

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gcc_token');
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export class OfflineError extends Error {
  constructor() { super('You appear to be offline. Check your connection and retry.'); }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError();
  }
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Please retry.');
    throw new OfflineError();
  }
  clearTimeout(timer);

  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  // Session expired → secure redirect without data exposure.
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('gcc_token');
    const here = window.location.pathname;
    if (!here.startsWith('/login')) {
      window.location.href = `/login?expired=1&next=${encodeURIComponent(here)}`;
    }
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
  }

  if (!res.ok) {
    const b = body ?? {};
    throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? `HTTP ${res.status}`, b.details);
  }
  return body as T;
}
