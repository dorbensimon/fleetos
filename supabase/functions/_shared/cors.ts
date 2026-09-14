export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // Browser calls to Edge Functions first send an OPTIONS preflight. Keep this
  // list in sync with the headers Supabase JS can send, including retries and
  // optional distributed tracing headers.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
