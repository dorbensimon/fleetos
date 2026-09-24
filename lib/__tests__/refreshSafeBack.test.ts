import { refreshBackFallback } from '../refreshSafeBack';

describe('refreshBackFallback', () => {
  it('returns vehicle documents from a refreshed vehicle document category', () => {
    expect(refreshBackFallback(
      { name: 'DocumentCategory', params: { ownerType: 'vehicle', ownerId: 'vehicle-1' } },
      'AdminHome',
    )).toEqual({ name: 'VehicleDetail', params: { vehicleId: 'vehicle-1', tab: 'documents' } });
  });

  it('returns the fleet vehicles tab from a refreshed vehicle dossier', () => {
    expect(refreshBackFallback({ name: 'VehicleDetail' }, 'AdminHome')).toEqual({ name: 'AdminHome', params: { mode: 'vehicles' } });
  });

  it('returns to the driver a vehicle was opened from', () => {
    expect(refreshBackFallback(
      { name: 'VehicleDetail', params: { vehicleId: 'vehicle-1', returnTo: 'driver', fromDriverId: 'driver-1' } },
      'AdminHome',
    )).toEqual({ name: 'DriverDetail', params: { driverId: 'driver-1' } });
  });

  it('returns to the vehicle a driver was opened from, else the drivers tab', () => {
    expect(refreshBackFallback({ name: 'DriverDetail', params: { driverId: 'd', fromVehicleId: 'v' } }, 'AdminHome'))
      .toEqual({ name: 'VehicleDetail', params: { vehicleId: 'v' } });
    expect(refreshBackFallback({ name: 'DriverDetail', params: { driverId: 'd' } }, 'AdminHome'))
      .toEqual({ name: 'AdminHome', params: { mode: 'drivers' } });
  });

  it('returns a driver to the driver home', () => {
    expect(refreshBackFallback({ name: 'DriverDocuments' }, 'DriverHome')).toEqual({ name: 'DriverHome' });
  });

  it('does not invent a back route for a home screen', () => {
    expect(refreshBackFallback({ name: 'AdminHome' }, 'AdminHome')).toBeNull();
  });
});
