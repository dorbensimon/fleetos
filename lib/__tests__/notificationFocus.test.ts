import { fieldKeysFromMessage, focusParam, plateFromOdometerMessage } from '../notificationFocus';

describe('fieldKeysFromMessage', () => {
  it('maps the labels after the colon to field keys, in order', () => {
    expect(fieldKeysFromMessage('המנהל עדכן בתיק שלך: טלפון בבית, תוקף רישיון, מחלקה'))
      .toEqual(['home_phone', 'license_expiry', 'department_id']);
  });

  it('skips labels it does not know and messages without a list', () => {
    expect(fieldKeysFromMessage('דני עדכן/ה: משהו אחר, כתובת')).toEqual(['address']);
    expect(fieldKeysFromMessage('הודעה בלי רשימה')).toEqual([]);
    expect(fieldKeysFromMessage(null)).toEqual([]);
  });
});

describe('focusParam', () => {
  it('joins keys, or gives nothing for none', () => {
    expect(focusParam(['phone', 'address'])).toBe('phone,address');
    expect(focusParam([])).toBeUndefined();
  });
});

describe('plateFromOdometerMessage', () => {
  it('reads the plate out of the odometer message', () => {
    expect(plateFromOdometerMessage('דני עדכן/ה קילומטראז׳ ברכב 12-345-67 ל-45000 ק״מ')).toBe('12-345-67');
    expect(plateFromOdometerMessage('משהו אחר')).toBeNull();
  });
});
