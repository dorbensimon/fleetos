import { requestErrorDetails } from '../requestError';

const fallback = 'לא הצלחנו לטעון את המסמכים';

describe('requestErrorDetails', () => {
  it('explains permission and server errors without blaming the internet', () => {
    expect(requestErrorDetails({ code: '42501' }, fallback).message).toContain('הרשאה');
    expect(requestErrorDetails({ status: 503 }, fallback).message).toContain('תקלה זמנית בשרת');
  });

  it('uses the internet message only for a confirmed offline browser', () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    expect(requestErrorDetails(new Error('Failed to fetch'), fallback).hint).toContain('חיבור לאינטרנט');
    if (descriptor) Object.defineProperty(navigator, 'onLine', descriptor);
    else delete (navigator as { onLine?: boolean }).onLine;
  });
});
