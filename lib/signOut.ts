// יציאה מהחשבון
import { supabase } from './supabase';

// כמה זמן מחכים לשרת ביציאה
const GLOBAL_SIGN_OUT_TIMEOUT_MS = 6000;

// מוציא את המשתמש מהמכשיר תמיד, גם אם השרת לא עונה
/**
 * Signs the user out on this device, always. The regular sign-out also
 * revokes the session on the server; when that call fails or hangs (a weak
 * phone connection), supabase-js keeps the local session, so the user
 * stayed signed in. Fall back to clearing the local session, which is what
 * the user asked for.
 */
export async function signOut(): Promise<void> {
  try {
    const result = await Promise.race([
      supabase.auth.signOut(),
      new Promise<{ error: Error }>((resolve) =>
        setTimeout(() => resolve({ error: new Error('sign-out timed out') }), GLOBAL_SIGN_OUT_TIMEOUT_MS)
      ),
    ]);
    if (!result.error) return;
  } catch {
    // Fall through to the local sign-out.
  }
  await supabase.auth.signOut({ scope: 'local' });
}
