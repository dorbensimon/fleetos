import { buildSigningFolders, lastSignedAt, signingFolderStatus } from '../signingFolders';
import type { CompanyFolder } from '../folderCatalog';
import { missingPrefill } from '../../supabase/functions/_shared/signingPrefill';
import type { SignatureRequest, SigningTemplate } from '../docuseal';
const template = { id: 't1', title: 'בריאות', status: 'ready', company_id: null } as SigningTemplate;
const signed = { id: 'r1', template_id: 't1', status: 'completed', template_title: 'בריאות המקורי' } as SignatureRequest;

test('a new template produces an empty folder before any sends', () => {
  const [folder] = buildSigningFolders([template], []);
  expect(folder.title).toBe('בריאות');
  expect(signingFolderStatus(folder)).toBe('empty');
});
test('a rename changes the folder without rewriting historical evidence', () => {
  const [folder] = buildSigningFolders([{ ...template, title: 'הצהרת בריאות' }], [signed]);
  expect(folder.title).toBe('הצהרת בריאות');
  expect(folder.requests[0].template_title).toBe('בריאות המקורי');
});
test('documents from an archived or removed template remain reachable', () => {
  expect(buildSigningFolders([], [signed])[0].requests).toEqual([signed]);
  expect(buildSigningFolders([], [{ ...signed, template_id: null }])[0].title).toBe('בריאות המקורי');
});
test('a confirmed pending request takes precedence over older signed documents', () => {
  const [folder] = buildSigningFolders([template], [{ ...signed, id: 'r2', status: 'pending', docuseal_submitter_slug: 'confirmed' }, signed]);
  expect(signingFolderStatus(folder)).toBe('pending');
});
test('an unconfirmed send is not presented as successfully sent', () => {
  const [folder] = buildSigningFolders([template], [{ ...signed, status: 'pending', docuseal_submitter_slug: null }]);
  expect(signingFolderStatus(folder)).toBe('failed');
});
test('required profile fields block sending, while signer questions and optional fields do not', () => {
  expect(missingPrefill([
    { name: 'driver_national_id', required: true },
    { name: 'driver_phone', required: false },
    { name: 'health_question', required: true },
    { name: 'signature', type: 'signature', required: true },
  ], {})).toEqual(['תעודת זהות']);
  expect(missingPrefill([{ name: 'driver_national_id', required: true }], { driver_national_id: '123456789' })).toEqual([]);
});
test('safety officer inspections signed before and after the rename share one folder under the new name', () => {
  const before = { id: 'r2', template_id: null, status: 'completed', template_title: 'בדיקת בטיחות תקופתית לרכב' } as SignatureRequest;
  const after = { id: 'r3', template_id: null, status: 'completed', template_title: 'בדיקת קצין בטיחות לרכב' } as SignatureRequest;
  const folders = buildSigningFolders([], [after, before]);
  expect(folders).toHaveLength(1);
  expect(folders[0].title).toBe('בדיקת קצין בטיחות לרכב');
  expect(folders[0].requests).toHaveLength(2);
});

const catalogFolder = (id: string, title: string, extra: Partial<CompanyFolder> = {}) => ({
  id, title, kind: 'document', description: null, sort_order: 0, retired_at: null,
  default_valid_months: null, default_lead_days: 30, default_repeat_months: null,
  added: true, form: null, sameName: null, linkable: [], ...extra,
} as CompanyFolder);

test('an added catalog folder with no form shows empty for managers, catalog folders first in the owner order', () => {
  const own = { ...template, id: 'own', title: 'אאא מסמך שלי' } as SigningTemplate;
  const linked = { ...template, id: 'f2form', title: 'ביטוח', catalog_folder_id: 'c2' } as SigningTemplate;
  const folders = buildSigningFolders([own, linked], [], [
    catalogFolder('c1', 'תדריך'),
    catalogFolder('c2', 'ביטוח', { form: { id: 'f2form', version: 1, updatedAt: '' } }),
    catalogFolder('c3', 'לא נוסף', { added: false }),
  ]);
  expect(folders.map((f) => f.title)).toEqual(['תדריך', 'ביטוח', 'אאא מסמך שלי']);
  expect(folders[0].emptyCatalog?.id).toBe('c1');
  expect(signingFolderStatus(folders[0])).toBe('empty');
});
test('a driver (no catalog given) never gets empty catalog folders', () => {
  expect(buildSigningFolders([], [])).toEqual([]);
});
test('a folder shows the date of its latest signed copy', () => {
  const [folder] = buildSigningFolders([template], [
    { ...signed, completed_at: '2026-09-01T10:00:00Z' },
    { ...signed, id: 'r2', completed_at: '2026-10-05T20:29:00Z' },
    { ...signed, id: 'r3', status: 'pending', completed_at: null, docuseal_submitter_slug: 's' },
  ] as SignatureRequest[]);
  expect(lastSignedAt(folder)).toBe('2026-10-05T20:29:00Z');
  expect(lastSignedAt(buildSigningFolders([template], [])[0])).toBeNull();
});
test('without the catalog (a driver), catalog folders still come before other folders', () => {
  const own = { ...template, id: 't2', title: 'א אחר' } as SigningTemplate;
  const linked = { ...template, id: 't3', title: 'ת קטלוג', catalog_folder_id: 'c1' } as SigningTemplate;
  expect(buildSigningFolders([own, linked], []).map((folder) => folder.id)).toEqual(['t3', 't2']);
});
