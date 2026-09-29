import { buildSigningFolders, signingFolderStatus } from '../signingFolders';
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
