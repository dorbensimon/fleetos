type RequestError = { code?: string | number; message?: string; status?: string | number };

export type RequestErrorDetails = {
  message: string;
  hint?: string;
  icon: 'alert-circle' | 'cloud-offline';
};

/** Turns technical request failures into an explanation a person can act on. */
export function requestErrorDetails(error: unknown, fallback: string): RequestErrorDetails {
  const candidate = (error ?? {}) as RequestError;
  const code = String(candidate.code ?? candidate.status ?? '');
  const message = String(candidate.message ?? '').toLowerCase();

  // A failed request can also mean a server or permission problem. Mention
  // internet only when the browser explicitly says the device is offline.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { message: fallback, hint: 'אין כרגע חיבור לאינטרנט. בדקו את החיבור ונסו שוב.', icon: 'cloud-offline' };
  }
  if (code === '401' || /jwt expired|session.*expired|not authenticated|authentication required/.test(message)) {
    return { message: 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.', icon: 'alert-circle' };
  }
  if (code === '403' || code === '42501' || /permission denied|not authorized|unauthorized|forbidden|insufficient privilege/.test(message)) {
    return { message: 'אין לחשבון הזה הרשאה לבצע את הפעולה הזו.', icon: 'alert-circle' };
  }
  if (/timeout|timed out|aborted/.test(message)) return { message: 'השרת מתעכב כרגע. נסו שוב בעוד רגע.', icon: 'alert-circle' };
  if (/server error|internal server|service unavailable|bad gateway|\b5\d\d\b/.test(message) || /^5\d\d$/.test(code)) {
    return { message: 'יש תקלה זמנית בשרת. נסו שוב בעוד רגע.', icon: 'alert-circle' };
  }
  return { message: fallback, hint: 'נסו שוב בעוד רגע.', icon: 'alert-circle' };
}
