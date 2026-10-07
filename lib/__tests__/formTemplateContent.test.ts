jest.mock('../supabase', () => ({ supabase: {} }));

import { cleanEditorContent } from '../../supabase/functions/_shared/editorDocument';
import { editorDraftFromContent } from '../../components/desktop/signing/DocumentEditor.web';

const signature = { kind: 'signature', x: 100, y: 400, w: 200, h: 29 };
const blocks = [
  { type: 'h1', content: [[{ text: 'נוהל בטיחות' }]] },
  { type: 'p', align: 'center', content: [[{ text: 'שם: ', bold: true, color: '#0088CC', evil: 'x' }, { slot: 'f1' }]] },
];

test('a stored document keeps only what the editor makes, and needs a signature', () => {
  const clean = cleanEditorContent(blocks, [signature, { kind: 'driver_full_name', x: 150, y: 200, w: 180, h: 29, slot: 'f1' }]);
  expect(clean).not.toBeNull();
  expect(clean!.blocks[1].content[0][0]).toEqual({ text: 'שם: ', bold: true, color: '#0088CC' });
  expect(clean!.blocks[1].content[0][1]).toEqual({ slot: 'f1' });
  expect(cleanEditorContent(blocks, [{ ...signature, kind: 'text' }])).toBeNull();
  expect(cleanEditorContent([{ type: 'script', content: [[{ text: 'x' }]] }], [signature])).toBeNull();
  expect(cleanEditorContent(blocks, [{ ...signature, kind: 'evil' }])).toBeNull();
});

test('a reopened document is escaped, renamed and keeps its fields', () => {
  const draft = editorDraftFromContent({
    blocks: [
      { type: 'h1', content: [[{ text: 'נוהל בטיחות' }]] },
      { type: 'p', content: [[{ text: '<img src=x onerror=alert(1)>' }, { slot: 'f1' }]] },
    ],
    fields: [signature, { kind: 'driver_full_name', x: 150, y: 200, w: 180, h: 29, slot: 'f1' }, { kind: 'evil', x: 1, y: 1, w: 10, h: 10 }],
  }, 'נוהל החברה שלנו', 'נוהל בטיחות');
  expect(draft).not.toBeNull();
  expect(draft!.html).toContain('<h1>נוהל החברה שלנו</h1>');
  expect(draft!.html).not.toContain('<img');
  expect(draft!.html).toContain('&lt;img');
  expect(draft!.fields).toHaveLength(2);
  const inLine = draft!.fields.find((field) => field.kind === 'driver_full_name')!;
  expect(inLine.slot).toBe(true);
  expect(draft!.html).toContain(`data-fid="${inLine.id}"`);
  expect(editorDraftFromContent(null)).toBeNull();
});
