jest.mock('../supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from '../supabase';
import { lookupVehicleRegistry } from '../vehicleRegistry';

const vehicle = {
  plateNumber: '17807102',
  manufacturer: 'סיאט ספרד',
  model: 'ARONA',
  productionYear: 2020,
  color: 'שנהב לבן',
  licenseExpiry: '2027-03-10',
};

describe('lookupVehicleRegistry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('normalizes the plate and returns the registry vehicle', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { found: true, vehicle },
      error: null,
    });

    await expect(lookupVehicleRegistry('17-807-102')).resolves.toEqual(vehicle);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('lookup-vehicle-registry', {
      body: { plateNumber: '17807102' },
    });
  });

  it('returns null when the official registry has no matching vehicle', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({ data: { found: false }, error: null });

    await expect(lookupVehicleRegistry('17807102')).resolves.toBeNull();
  });

  it('does not call the server for an invalid plate number', async () => {
    await expect(lookupVehicleRegistry('1234')).rejects.toThrow('מספר הרישוי חייב להכיל 7–8 ספרות');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('surfaces the server message when the registry is temporarily unavailable', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { error: 'מאגר משרד התחבורה אינו זמין כרגע. אפשר לנסות שוב או למלא ידנית.' },
      error: { message: 'Edge Function returned a non-2xx status code' },
    });

    await expect(lookupVehicleRegistry('17807102')).rejects.toThrow('מאגר משרד התחבורה אינו זמין כרגע');
  });
});
