export const SIGNING_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ExpiringRequest = {
  status: string;
  expires_at?: string | null;
  completed_at?: string | null;
  signed_file_path?: string | null;
};

export function signingDeadline(sentAt: string): string {
  return new Date(Date.parse(sentAt) + SIGNING_WINDOW_MS).toISOString();
}

export function isUnsignedExpired(request: ExpiringRequest, now = Date.now()): boolean {
  if (request.status === 'completed' || request.completed_at || request.signed_file_path) return false;
  const deadline = Date.parse(request.expires_at || '');
  return Number.isFinite(deadline) && deadline <= now;
}

export type RemoteSubmission = {
  status?: string;
  completed_at?: string | null;
  expire_at?: string | null;
  submitters?: Array<{ status?: string; completed_at?: string | null }>;
};

/** Pure decision, exercised before connecting any destructive adapter. Unknown
 * remote state is never evidence that an unsigned request is safe to remove. */
export function expiryDecision(local: ExpiringRequest, remote: RemoteSubmission, now = Date.now()) {
  if (!isUnsignedExpired(local, now)) return 'keep' as const;
  if (remote.status === 'completed' || remote.completed_at ||
      remote.submitters?.some((signer) => signer.status === 'completed' || signer.completed_at)) {
    return 'preserve-signed' as const;
  }
  const remoteDeadline = Date.parse(remote.expire_at || '');
  if (!Number.isFinite(remoteDeadline) || remoteDeadline > now) return 'verify-expiration' as const;
  if (!['expired', 'declined'].includes(remote.status || '')) return 'verify-expiration' as const;
  return 'remove-unsigned' as const;
}

export async function processExpiry(
  local: ExpiringRequest,
  actions: {
    readRemote: () => Promise<RemoteSubmission>;
    preserveSigned: (remote: RemoteSubmission) => Promise<void>;
    removeRemote: () => Promise<void>;
    removeLocal: () => Promise<void>;
  },
  now = Date.now(),
) {
  if (!isUnsignedExpired(local, now)) return 'keep';
  const remote = await actions.readRemote();
  const decision = expiryDecision(local, remote, now);
  if (decision === 'preserve-signed') await actions.preserveSigned(remote);
  if (decision === 'remove-unsigned') {
    await actions.removeRemote();
    await actions.removeLocal();
  }
  return decision;
}
