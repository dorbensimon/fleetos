jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

import { tableReportRows, type TableReportOptions } from '../reportTemplate';

const base: Omit<TableReportOptions, 'sections'> = {
  title: 'דוח', company: { name: 'חברה' }, columns: [{ label: 'מספר רכב', width: 50 }, { label: 'טסט', width: 50 }],
  unit: { one: 'רכב אחד', many: 'רכבים' }, grandTitle: 'סה״כ', note: '', emptyText: '',
};

describe('tableReportRows', () => {
  it('flattens cells and their small line under one header row', () => {
    const rows = tableReportRows({ ...base, sections: [{ title: '', rows: [[{ text: '12-345-67' }, { text: '01/01/2026', sub: 'פג לפני 5 ימים' }], [{ text: null }, { text: 'לא הוזן' }]] }] });
    expect(rows).toEqual([['מספר רכב', 'טסט'], ['12-345-67', '01/01/2026 · פג לפני 5 ימים'], ['', 'לא הוזן']]);
  });

  it('keeps each row\'s section in a first column and drops empty sections', () => {
    const rows = tableReportRows({ ...base, sections: [
      { title: 'טסט פג', rows: [[{ text: '1' }, { text: 'a' }]] },
      { title: 'ריק', rows: [] },
      { title: 'ביטוח פג', rows: [[{ text: '2' }, { text: 'b' }]] },
    ] });
    expect(rows).toEqual([['קבוצה', 'מספר רכב', 'טסט'], ['טסט פג', '1', 'a'], ['ביטוח פג', '2', 'b']]);
  });
});
