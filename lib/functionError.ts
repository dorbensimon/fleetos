type FunctionResponse = { error?: unknown; context?: { json?: () => Promise<unknown> } } | null | undefined;

/** Extracts the server's user-facing error from a Supabase Edge Function call. */
export async function functionErrorMessage(
  error: FunctionResponse,
  data: any,
  fallback: string,
  includeErrorMessage = true
): Promise<string> {
  let message = data?.error || (includeErrorMessage ? (error as any)?.message : null) || fallback;
  const context = (error as any)?.context;

  if (context?.json) {
    try {
      const body = await context.json();
      if (body?.error) message = body.error;
    } catch {
      // Keep the best message already available when the response body is not JSON.
    }
  }

  return String(message);
}
