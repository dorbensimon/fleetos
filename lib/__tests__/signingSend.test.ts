jest.mock('../docuseal', () => ({
  assignSigningTemplate: jest.fn(),
  deleteSigningRecord: jest.fn(),
  listSignatureRequests: jest.fn(),
}));
jest.mock('../adminApi/drivers', () => ({ listDrivers: jest.fn() }));

import { assignSigningTemplate, deleteSigningRecord, listSignatureRequests } from '../docuseal';
import { listDrivers } from '../adminApi/drivers';
import {
  cancelSigningRequest,
  countWaitingSigners,
  deleteCompanyTemplate,
  deleteTemplateMessage,
  driversCount,
  loadSendRecipients,
  recipientNote,
  sendToRecipients,
} from '../signingSend';

const assign = assignSigningTemplate as jest.Mock;
const requests = listSignatureRequests as jest.Mock;
const drivers = listDrivers as jest.Mock;
const remove = deleteSigningRecord as jest.Mock;

beforeEach(() => jest.resetAllMocks());

test('recipients are the active drivers, by name, with where they stand on this document', async () => {
  drivers.mockResolvedValue([
    { id: 'd1', full_name: 'תמר', status: 'active' },
    { id: 'd2', full_name: ' אבי ', status: 'active' },
    { id: 'd3', full_name: null, status: 'active' },
    { id: 'd4', full_name: 'גיל', status: 'inactive' },
  ]);
  requests.mockResolvedValue([
    { template_id: 't1', driver_id: 'd1', status: 'completed' },
    { template_id: 't1', driver_id: 'd2', status: 'pending' },
    { template_id: 'other', driver_id: 'd3', status: 'completed' },
  ]);
  expect(await loadSendRecipients('c1', 't1')).toEqual([
    { id: 'd2', name: 'אבי', state: 'pending' },
    { id: 'd3', name: 'נהג ללא שם', state: 'none' },
    { id: 'd1', name: 'תמר', state: 'signed' },
  ]);
});

test('a failure for one driver never stops the rest', async () => {
  assign
    .mockResolvedValueOnce({ success: true, created: 1 })
    .mockRejectedValueOnce(new Error('חסרה תעודת זהות'))
    .mockResolvedValueOnce({ success: false, created: 0 });
  const progress = jest.fn();
  const outcome = await sendToRecipients('c1', 't1', [
    { id: 'a', name: 'א', state: 'none' },
    { id: 'b', name: 'ב', state: 'none' },
    { id: 'c', name: 'ג', state: 'none' },
  ], progress);
  expect(assign).toHaveBeenNthCalledWith(2, 'c1', 't1', ['b']);
  expect(outcome).toEqual({ sent: 1, failed: [{ name: 'ב', reason: 'חסרה תעודת זהות' }, { name: 'ג', reason: 'השליחה לא אושרה' }] });
  expect(progress).toHaveBeenLastCalledWith(3, 3);
});

test('the delete warning counts only drivers still waiting on this document', async () => {
  requests.mockResolvedValue([
    { template_id: 't1', status: 'pending' },
    { template_id: 't1', status: 'pending' },
    { template_id: 't1', status: 'completed' },
    { template_id: 't2', status: 'pending' },
  ]);
  expect(await countWaitingSigners('c1', 't1')).toBe(2);
  expect(deleteTemplateMessage(2)).toContain('2 נהגים עוד לא חתמו עליו');
  expect(deleteTemplateMessage(1)).toContain('נהג אחד עוד לא חתם עליו');
  expect(deleteTemplateMessage(0)).toBe('המסמך יימחק לצמיתות, גם מ-DocuSeal. מסמכים שנהגים כבר חתמו עליהם יישארו בתיק הנהג.');
});

test('deleting a document and withdrawing a request use the server actions that cancel waiting signatures', async () => {
  remove.mockResolvedValue({ success: true });
  await deleteCompanyTemplate('c1', 't1');
  await cancelSigningRequest('c1', 'r1');
  expect(remove).toHaveBeenNthCalledWith(1, 'c1', 'template', 't1', 'company-delete');
  expect(remove).toHaveBeenNthCalledWith(2, 'c1', 'request', 'r1', 'archive');
});

test('wording', () => {
  expect(driversCount(1)).toBe('נהג אחד');
  expect(driversCount(4)).toBe('4 נהגים');
  expect(recipientNote({ id: 'x', name: 'x', state: 'pending' }, true)).toBe('ממתין לחתימה · יוחלף במסמך חדש');
  expect(recipientNote({ id: 'x', name: 'x', state: 'signed' }, true)).toBe('כבר חתם · יישלח שוב');
  expect(recipientNote({ id: 'x', name: 'x', state: 'signed' }, false)).toBe('כבר חתם');
  expect(recipientNote({ id: 'x', name: 'x', state: 'none' }, true)).toBe('');
});
