import { refreshBackFallback } from '../refreshSafeBack';

describe('refreshBackFallback', () => {
  it('returns vehicle documents from a refreshed vehicle document category', () => {
    expect(refreshBackFallback(
      { name: 'DocumentCategory', params: { ownerType: 'vehicle', ownerId: 'vehicle-1' } },
      'AdminHome',
    )).toEqual({ name: 'VehicleDetail', params: { vehicleId: 'vehicle-1', tab: 'documents' } });
  });

  it('returns the fleet from a refreshed vehicle dossier', () => {
    expect(refreshBackFallback({ name: 'VehicleDetail' }, 'AdminHome')).toEqual({ name: 'AdminHome' });
  });

  it('returns a driver to the driver home', () => {
    expect(refreshBackFallback({ name: 'DriverDocuments' }, 'DriverHome')).toEqual({ name: 'DriverHome' });
  });

  it('does not invent a back route for a home screen', () => {
    expect(refreshBackFallback({ name: 'AdminHome' }, 'AdminHome')).toBeNull();
  });
});
