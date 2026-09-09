import {
  isValidIsraeliNationalId,
  validateDriverForm,
  type DriverFormValidationState,
} from '../driverFormValidation';

const validForm: DriverFormValidationState = {
  full_name: 'ישראל ישראלי',
  phone: '0500001101',
  email: 'driver@example.com',
  password: '1234',
  national_id: '342342342',
  license_classes: 'B',
  license_expiry: '2099-09-30',
};

describe('driver form validation', () => {
  it('accepts a valid Israeli ID checksum', () => {
    expect(isValidIsraeliNationalId('342342342')).toBe(true);
  });

  it('rejects an invalid Israeli ID checksum', () => {
    expect(isValidIsraeliNationalId('342342343')).toBe(false);
  });

  it('reports an entered invalid ID while editing', () => {
    expect(validateDriverForm({ ...validForm, national_id: '342342343' }, true)).toMatchObject({
      national_id: 'תעודת זהות לא תקינה',
    });
  });

  it('does not require legacy license and ID fields while editing', () => {
    expect(validateDriverForm({
      ...validForm,
      national_id: '',
      license_classes: '',
      license_expiry: '',
    }, true)).toEqual({});
  });
});
