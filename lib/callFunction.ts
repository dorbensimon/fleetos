import { supabase } from './supabase';

/** An error from the server, with its machine-readable `code` when it sent one. */
export class FunctionActionError extends Error {
  code?: string;
  data?: Record<string, unknown>;
  constructor(message: string, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/** Calls an Edge Function and keeps the server's Hebrew message and `code` on failure. */
export async function callFunction<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error && !data?.error) return data as T;
  let payload = data as Record<string, unknown> | null;
  const response = (error as { context?: Response } | null)?.context;
  if (!payload && response && typeof response.clone === 'function') {
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
  }
  const message = typeof payload?.error === 'string' && payload.error ? payload.error : fallback;
  throw new FunctionActionError(message, typeof payload?.code === 'string' ? payload.code : undefined, payload ?? undefined);
}
