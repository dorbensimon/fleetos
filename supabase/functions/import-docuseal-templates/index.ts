import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { isSignedRequestPath, isSigningTemplateSourcePath } from '../_shared/signingPaths.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type RemoteTemplate = {
  id?: number;
  name?: string;
  external_id?: string | null;
  folder_name?: string | null;
  fields?: Array<{ type?: string }>;
  documents?: Array<{ url?: string; filename?: string }>;
};

async function listAllTemplates(): Promise<RemoteTemplate[]> {
  const templates: RemoteTemplate[] = [];
  let after: number | null = null;
  // The account holds a handful of templates; the page cap only guards against a runaway loop.
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', String(after));
    const response = await docusealFetch(`/templates?${query}`);
    if (!response.ok) throw new Error(`docuseal templates ${response.status}`);
    const result = await response.json();
    templates.push(...(result?.data ?? []));
    after = result?.pagination?.next ?? null;
    if (!after) break;
  }
  return templates;
}

/** DocuSeal folder paths are "/"-separated, e.g. "ניהול צי רכבים / אלמוג" — the company's own folder is whichever segment carries its name. */
function folderMatchesCompany(folderName: string | null | undefined, companyId: string, companyName: string): boolean {
  if (!folderName) return false;
  if (folderName === `FleetOS-${companyId}`) return true;
  if (!companyName) return false;
  return folderName.split('/').map((segment) => segment.trim()).includes(companyName);
}

/**
 * A template deleted directly in DocuSeal has nothing left to sync — mirror
 * that by permanently removing its FleetOS row too, using the same safety
 * rule as the in-app "delete forever" action: a signed document only goes
 * away once its PDF is confirmed saved in our own storage, never before.
 */
async function deleteOrphanedTemplates(
  adminClient: SupabaseClient,
  companyId: string,
  remoteIds: Set<number>,
): Promise<number> {
  const { data: local } = await adminClient
    .from('signing_templates')
    .select('id, title, source_file_path, docuseal_template_id')
    .eq('company_id', companyId)
    .not('docuseal_template_id', 'is', null);
  const orphaned = (local ?? []).filter((template) => !remoteIds.has(Number(template.docuseal_template_id)));
  if (!orphaned.length) return 0;

  let deleted = 0;
  for (const template of orphaned) {
    const { data: requests } = await adminClient
      .from('signature_requests')
      .select('id, company_id, driver_id, status, docuseal_submission_id, signed_file_path')
      .eq('template_id', template.id).eq('company_id', companyId);
    const signed = (requests ?? []).filter((request) => request.status === 'completed');
    const nonCompleted = (requests ?? []).filter((request) => request.status !== 'completed');
    // A signed document whose PDF never made it into our storage would vanish with no evidence left — keep the template until it's synced.
    if (signed.some((request) => !isSignedRequestPath(request.company_id, request.driver_id, request.id, request.signed_file_path))) {
      console.error('import-docuseal-templates: orphaned template kept, unsynced signed document', template.id);
      continue;
    }

    const { data: ok } = await adminClient.rpc('delete_signing_template_records', {
      target_template_id: template.id, target_company_id: companyId, template_title_snapshot: template.title,
    });
    if (!ok) continue;
    deleted += 1;

    for (const request of nonCompleted) {
      if (!request.docuseal_submission_id) continue;
      const response = await docusealFetch(`/submissions/${request.docuseal_submission_id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        console.error('import-docuseal-templates: docuseal submission cleanup failed', request.id, response.status);
      }
    }
    const paths = [
      ...(isSigningTemplateSourcePath(companyId, template.source_file_path) ? [template.source_file_path as string] : []),
      ...nonCompleted.flatMap((request) => isSignedRequestPath(companyId, request.driver_id, request.id, request.signed_file_path)
        ? [request.signed_file_path as string] : []),
    ];
    if (paths.length) {
      const { error: storageError } = await adminClient.storage.from('documents').remove(paths);
      if (storageError) console.error('import-docuseal-templates: storage cleanup failed', template.id, storageError.message);
    }
  }
  return deleted;
}

/**
 * Templates built directly in the DocuSeal dashboard have no FleetOS row. A
 * template placed anywhere under the company's folder — a folder named
 * exactly the company name, a subfolder of it, or the `FleetOS-<companyId>`
 * folder the in-app builder uses — is imported as a ready template of that
 * company, with its PDF copied into storage so the preview and download
 * flows work exactly as for in-app templates.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה לייבא תבניות' }, 403);

    const { data: company } = await access.adminClient.from('companies').select('name').eq('id', companyId).single();
    if (!company) return json({ error: 'החברה לא נמצאה' }, 404);

    let companyName = typeof company.name === 'string' ? company.name.trim() : '';
    if (companyName) {
      // A name shared by two companies can't tell them apart, so only the id folder counts then.
      const { count } = await access.adminClient.from('companies').select('id', { count: 'exact', head: true }).eq('name', company.name);
      if (count !== 1) companyName = '';
    }

    const remoteTemplates = await listAllTemplates();
    const remoteIds = new Set(remoteTemplates.map((remote) => remote.id).filter((id): id is number => typeof id === 'number'));
    const deletedCount = await deleteOrphanedTemplates(access.adminClient, companyId, remoteIds);

    // In-app templates carry the local row id as external_id (including unfinished drafts), so skip them.
    const candidates = remoteTemplates.filter((remote) =>
      remote.id && !remote.external_id && folderMatchesCompany(remote.folder_name, companyId, companyName));
    if (!candidates.length) return json({ imported: 0, deleted: deletedCount });

    const { data: known } = await access.adminClient
      .from('signing_templates')
      .select('docuseal_template_id')
      .in('docuseal_template_id', candidates.map((remote) => remote.id));
    const knownIds = new Set((known ?? []).map((row) => Number(row.docuseal_template_id)));

    let imported = 0;
    for (const remote of candidates) {
      if (knownIds.has(remote.id!)) continue;
      knownIds.add(remote.id!);
      if (!remote.fields?.some((field) => field.type === 'signature')) continue;
      const documentUrl = remote.documents?.[0]?.url;
      if (!documentUrl) continue;

      const pdfResponse = await fetch(documentUrl);
      if (!pdfResponse.ok) {
        console.error('import-docuseal-templates: document download failed', remote.id, pdfResponse.status);
        continue;
      }
      const filePath = `${companyId}/signing-templates/docuseal-${remote.id}-${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await access.adminClient.storage
        .from('documents')
        .upload(filePath, await pdfResponse.arrayBuffer(), { contentType: 'application/pdf' });
      if (uploadError) {
        console.error('import-docuseal-templates: storage upload failed', remote.id, uploadError.message);
        continue;
      }

      const title = (remote.name || 'מסמך').trim().slice(0, 200) || 'מסמך';
      const { error: insertError } = await access.adminClient.from('signing_templates').insert({
        company_id: companyId,
        created_by: access.callerId,
        title,
        source_file_path: filePath,
        source_file_name: `${title}.pdf`.slice(0, 255),
        docuseal_template_id: remote.id,
        status: 'ready',
      });
      if (insertError) {
        // A concurrent import already linked this template (docuseal_template_id is unique).
        await access.adminClient.storage.from('documents').remove([filePath]);
        continue;
      }
      imported += 1;
    }
    return json({ imported, deleted: deletedCount });
  } catch (error) {
    console.error('import-docuseal-templates failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'ייבוא התבניות מ-DocuSeal נכשל' }, 500);
  }
});
