// Edge Function: delete-company
// Owner-only permanent deletion of a company, its Auth users and private files.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function publicObjectPath(url: string | null, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try {
    return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

async function removePaths(adminClient: SupabaseClient, bucket: string, paths: Array<string | null>): Promise<boolean> {
  const unique = [...new Set(paths.filter((path): path is string => !!path))];
  for (let index = 0; index < unique.length; index += 100) {
    const { error } = await adminClient.storage.from(bucket).remove(unique.slice(index, index + 100));
    if (error) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const access = await verifyOwner(req.headers.get('Authorization'));
    if (!access.ok) return json({ error: access.error }, access.status);

    const { companyId, confirmName } = await req.json();
    if (!companyId || !confirmName) return json({ error: 'חסרים פרטי אישור המחיקה' }, 400);

    const { adminClient } = access;
    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('id, name, logo_url')
      .eq('id', companyId)
      .single();
    if (companyError || !company) return json({ error: 'החברה לא נמצאה' }, 404);
    if (confirmName.trim() !== company.name) return json({ error: 'שם החברה לאישור אינו תואם' }, 400);

    const [profilesResult, documentsResult, legacyTemplatesResult, templatesResult, requestsResult] = await Promise.all([
      adminClient.from('profiles').select('id').eq('company_id', companyId),
      adminClient.from('documents').select('file_path').eq('company_id', companyId),
      adminClient.from('document_templates').select('source_file_path').eq('company_id', companyId),
      adminClient.from('signing_templates').select('source_file_path').eq('company_id', companyId),
      adminClient.from('signature_requests').select('signed_file_path').eq('company_id', companyId),
    ]);
    if (
      profilesResult.error || documentsResult.error || legacyTemplatesResult.error ||
      templatesResult.error || requestsResult.error
    ) {
      return json({ error: 'איסוף נתוני החברה למחיקה נכשל' }, 500);
    }

    let deletedUsers = 0;
    let failedUsers = 0;
    for (const profile of profilesResult.data ?? []) {
      const { error } = await adminClient.auth.admin.deleteUser(profile.id);
      if (error) failedUsers += 1;
      else deletedUsers += 1;
    }
    if (failedUsers > 0) {
      return json({
        error: 'מחיקת חלק ממשתמשי החברה נכשלה. החברה נשארה במערכת וניתן לנסות שוב.',
        deletedUsers,
        failedUsers,
      }, 500);
    }

    const { error: deleteError } = await adminClient.from('companies').delete().eq('id', companyId);
    if (deleteError) return json({ error: 'מחיקת החברה נכשלה' }, 500);

    const documentPaths = [
      ...(documentsResult.data ?? []).map((row: { file_path: string | null }) => row.file_path),
      ...(legacyTemplatesResult.data ?? []).map((row: { source_file_path: string | null }) => row.source_file_path),
      ...(templatesResult.data ?? []).map((row: { source_file_path: string | null }) => row.source_file_path),
    ];
    const signedPaths = (requestsResult.data ?? []).map((row: { signed_file_path: string | null }) => row.signed_file_path);
    const logoPath = publicObjectPath(company.logo_url, 'company-logos');

    const [documentsClean, signedClean, logoClean] = await Promise.all([
      removePaths(adminClient, 'documents', documentPaths),
      removePaths(adminClient, 'signed-documents', signedPaths),
      logoPath ? removePaths(adminClient, 'company-logos', [logoPath]) : Promise.resolve(true),
    ]);

    return json({ success: true, cleanupPending: !(documentsClean && signedClean && logoClean) }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
