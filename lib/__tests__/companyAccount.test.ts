import { accountMrr, accountToForm, emptyAccountForm, formToAccountInput, validateAccountForm } from '../companyAccount';
import { emptyOwnerCompanyForm, validateCompanyStep } from '../newCompanyForm';

describe('company account form', () => {
  it('round-trips an account through the form', () => {
    const form = { ...emptyAccountForm(), status: 'active' as const, monthlyPrice: '450', vehicleLimit: '12', contactPhone: '050-123-4567', notes: '  ' };
    const input = formToAccountInput(form);
    expect(input.monthly_price).toBe(450);
    expect(input.vehicle_limit).toBe(12);
    expect(input.contact_phone).toBe('0501234567');
    expect(input.notes).toBeNull();
    expect(accountToForm({ company_id: 'x', ...input }).monthlyPrice).toBe('450');
  });

  it('rejects a bad price, quota and email', () => {
    const errors = validateAccountForm({ ...emptyAccountForm(), monthlyPrice: 'abc', vehicleLimit: '0', contactEmail: 'nope' });
    expect(Object.keys(errors).sort()).toEqual(['contactEmail', 'monthlyPrice', 'vehicleLimit']);
  });

  it('counts revenue only for paying accounts', () => {
    const base = formToAccountInput(emptyAccountForm());
    expect(accountMrr({ company_id: 'x', ...base, monthly_price: 300 })).toBe(0);
    expect(accountMrr({ company_id: 'x', ...base, status: 'active', monthly_price: 300 })).toBe(300);
  });
});

describe('new company steps', () => {
  it('asks for a name first, then the manager and a numeric temporary password', () => {
    const form = emptyOwnerCompanyForm();
    expect(validateCompanyStep(0, form)).toHaveProperty('name');
    const filled = { ...form, name: 'אלמוג', adminFirstName: 'דוד', adminLastName: 'כהן', email: 'd@a.co.il', phone: '0501234567', password: '12' };
    expect(validateCompanyStep(0, filled)).toEqual({});
    expect(validateCompanyStep(1, filled)).toEqual({ password: 'לפחות 4 ספרות, ספרות בלבד' });
    expect(validateCompanyStep(1, { ...filled, password: '123456' })).toEqual({});
  });
});
