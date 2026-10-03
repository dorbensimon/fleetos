jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../docuseal', () => ({ listSigningTemplates: jest.fn() }));


import { validityLabel } from '../signingRules';
import { notificationTone } from '../notificationLook';

test('signature validity reads as words', () => {
  expect(validityLabel(null)).toBe('ללא תוקף');
  expect(validityLabel(6)).toBe('חצי שנה');
  expect(validityLabel(12)).toBe('שנה');
  expect(validityLabel(24)).toBe('2 שנים');
});

test('a signature about to run out is a heads-up, one that ran out is urgent', () => {
  expect(notificationTone({ notification_type: 'signature_expiry', message: 'החתימה שלך על "נוהל" תפוג בעוד 30 ימים (01/11/2026)' })).toBe('warn');
  expect(notificationTone({ notification_type: 'signature_expiry', message: 'החתימה של דני על "נוהל" פגה ב-01/11/2026' })).toBe('bad');
});
