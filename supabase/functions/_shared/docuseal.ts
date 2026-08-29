const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function signDocuSealJwt(payload: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get('DOCUSEAL_API_KEY');
  if (!secret) throw new Error('DOCUSEAL_API_KEY is not configured');

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export async function docusealFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
  if (!apiKey) throw new Error('DOCUSEAL_API_KEY is not configured');
  const apiUrl = (Deno.env.get('DOCUSEAL_API_URL') || 'https://api.docuseal.com').replace(/\/$/, '');

  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': apiKey,
      ...(init.headers || {}),
    },
  });
}

export function safeDocusealHost(): string {
  const apiUrl = Deno.env.get('DOCUSEAL_API_URL') || 'https://api.docuseal.com';
  return apiUrl.includes('.eu') ? 'cdn.docuseal.eu' : 'cdn.docuseal.com';
}

export function safeDocusealAppUrl(): string {
  const apiUrl = Deno.env.get('DOCUSEAL_API_URL') || 'https://api.docuseal.com';
  return apiUrl.includes('.eu') ? 'https://docuseal.eu' : 'https://docuseal.com';
}
