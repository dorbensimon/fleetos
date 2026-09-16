import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Every company reads and sends the same global templates; none has its own.
// Global rows carry no real company, but storage policies require the first
// path segment to be a uuid, so this sentinel stands in for "no company".
const GLOBAL_COMPANY_SENTINEL = '00000000-0000-0000-0000-000000000000';
// Fixed folder name, not derived from a human-typed company name, so this
// match can never go stale the way per-company folder matching did.
const GLOBAL_FOLDER_NAME = 'FleetOS-Global';

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
    if (!after) return templates;
  }
  throw new Error('Template pagination exceeded safe limit');
}

/** Missing provider templates are archived locally; reconciliation never
 * deletes submissions or signed evidence. */
async function archiveOrphanedGlobalTemplates(adminClient: SupabaseClient, remoteIds: Set<number>): Promise<number> {
  const { data: local, error } = await adminClient.from('signing_templates')
    .select('id, docuseal_template_id').is('company_id', null).is('archived_at', null)
    .not('docuseal_template_id', 'is', null);
  if (error) throw error;
  const missing = (local || []).filter(template => !remoteIds.has(Number(template.docuseal_template_id)));
  if (!missing.length) return 0;
  const { error: archiveError } = await adminClient.from('signing_templates')
    .update({ archived_at: new Date().toISOString() }).in('id', missing.map(template => template.id));
  if (archiveError) throw archiveError;
  return missing.length;
}

/**
 * Templates built directly in DocuSeal, inside the fixed "FleetOS-Global"
 * folder, apply to every company. No company creates its own templates
 * anymore — this is the only way a template comes into existence, and only
 * the platform owner may trigger the sync.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    if (user.profile.role !== 'owner') return json({ error: 'רק הבעלים יכול לסנכרן תבניות' }, 403);
    const { adminClient, userId } = user;

    const remoteTemplates = await listAllTemplates();
    const remoteIds = new Set(remoteTemplates.map((remote) => remote.id).filter((id): id is number => typeof id === 'number'));
    const archivedCount = await archiveOrphanedGlobalTemplates(adminClient, remoteIds);

    // Templates built through the (now retired) in-app builder carried the
    // local row id as external_id — skip any leftovers so they are never
    // mistaken for a new global template.
    const candidates = remoteTemplates.filter((remote) =>
      remote.id && !remote.external_id && remote.folder_name === GLOBAL_FOLDER_NAME);
    if (!candidates.length) return json({ imported: 0, deleted: 0, archived: archivedCount });

    const { data: known } = await adminClient
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
      const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
      // A partial/aborted download can still resolve with a 200 status, so verify the
      // bytes themselves: they must start with the PDF magic number, and — when
      // DocuSeal told us how many bytes to expect — match that count exactly.
      const declaredLength = Number(pdfResponse.headers.get('content-length'));
      const isPdfHeader = pdfBytes.length >= 5
        && pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46 && pdfBytes[4] === 0x2d;
      if (!isPdfHeader || (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== pdfBytes.length)) {
        console.error('import-docuseal-templates: downloaded document looks corrupt', remote.id, `bytes=${pdfBytes.length}`, `declared=${declaredLength}`);
        continue;
      }
      const filePath = `${GLOBAL_COMPANY_SENTINEL}/signing-templates/${crypto.randomUUID()}/docuseal-${remote.id}.pdf`;
      const { error: uploadError } = await adminClient.storage
        .from('documents')
        .upload(filePath, pdfBytes, { contentType: 'application/pdf' });
      if (uploadError) {
        console.error('import-docuseal-templates: storage upload failed', remote.id, uploadError.message);
        continue;
      }

      const title = (remote.name || 'מסמך').trim().slice(0, 200) || 'מסמך';
      const { error: insertError } = await adminClient.from('signing_templates').insert({
        company_id: null,
        created_by: userId,
        title,
        source_file_path: filePath,
        source_file_name: `${title}.pdf`.slice(0, 255),
        docuseal_template_id: remote.id,
        status: 'ready',
      });
      if (insertError) {
        // A concurrent sync already linked this template (docuseal_template_id is unique).
        await adminClient.storage.from('documents').remove([filePath]);
        continue;
      }
      imported += 1;
    }
    return json({ imported, deleted: 0, archived: archivedCount });
  } catch (error) {
    console.error('import-docuseal-templates failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'סנכרון התבניות מ-DocuSeal נכשל' }, 500);
  }
});
