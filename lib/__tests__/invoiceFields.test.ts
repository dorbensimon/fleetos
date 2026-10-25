import { pickInvoiceFields } from '../invoiceFields';

describe('pickInvoiceFields', () => {
  it('reads a typical garage invoice', () => {
    const text = [
      'מוסך השרון בע"מ',
      'ח.פ. 514433221 · טל 09-7654321',
      'חשבונית מס/קבלה מספר 20431',
      'תאריך: 14/10/2026',
      'החלפת שמן ופילטרים 850.00',
      'סה״כ לפני מע״מ 1,250.00',
      'מע"מ 18% 225.00',
      'סה"כ לתשלום 1,475.00',
    ].join('\n');
    expect(pickInvoiceFields(text)).toEqual({ invoiceNumber: '20431', supplier: 'מוסך השרון', date: '2026-10-14', amountBeforeVat: 1250 });
  });

  it('works the amount out from the total with VAT', () => {
    expect(pickInvoiceFields('צמיגי דן\nחשבונית 777\n01/09/2026\nסה"כ לתשלום 1180').amountBeforeVat).toBe(1000);
  });

  it('amount before its words (right-to-left PDF order)', () => {
    expect(pickInvoiceFields('Garage Ltd\n 640.50 subtotal').amountBeforeVat).toBe(640.5);
  });

  it('keeps to its own line, not the VAT amount on the next one', () => {
    expect(pickInvoiceFields('מוסך\n1,250.00 :לפני מע"מ סה"כ\n225.00 מע"מ').amountBeforeVat).toBe(1250);
  });

  it('skips the VAT rate and the phone number', () => {
    expect(pickInvoiceFields('ספק\nלפני מע"מ 18% 300').amountBeforeVat).toBe(300);
  });

  it('nothing to read', () => {
    expect(pickInvoiceFields('')).toEqual({ invoiceNumber: null, supplier: null, date: null, amountBeforeVat: null });
  });
});
