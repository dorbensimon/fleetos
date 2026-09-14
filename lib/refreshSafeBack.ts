import type { RootStackParamList } from '../navigation/types';

type RouteName = keyof RootStackParamList;

export type RefreshBackRoute = {
  name: RouteName;
  params?: Record<string, unknown>;
};

/**
 * A browser refresh can restore a deep link as the only item in the native
 * stack. In that state `goBack()` has nothing to pop, so choose the closest
 * useful parent screen instead of leaving the user on a dead back button.
 */
export function refreshBackFallback(
  current: { name: string; params?: Record<string, unknown> } | undefined,
  homeRoute: RouteName,
): RefreshBackRoute | null {
  if (!current) return null;

  const params = current.params ?? {};
  const driverHome = homeRoute === 'DriverHome';

  switch (current.name) {
    case 'VehicleDetail':
      return { name: params.returnTo === 'driver' ? 'DriverHome' : 'AdminHome' };
    case 'VehicleForm':
      return typeof params.vehicleId === 'string'
        ? { name: 'VehicleDetail', params: { vehicleId: params.vehicleId } }
        : { name: 'AdminHome' };
    case 'DocumentCategory':
      if (params.ownerType === 'vehicle' && typeof params.ownerId === 'string') {
        return { name: 'VehicleDetail', params: { vehicleId: params.ownerId, tab: 'documents' } };
      }
      return driverHome
        ? { name: 'DriverDocuments' }
        : typeof params.ownerId === 'string'
          ? { name: 'DriverDetail', params: { driverId: params.ownerId } }
          : { name: 'AdminHome' };
    case 'DriverLicenseDocuments':
    case 'DriverPersonalDetails':
      return driverHome
        ? { name: 'DriverDocuments' }
        : typeof params.driverId === 'string'
          ? { name: 'DriverDetail', params: { driverId: params.driverId } }
          : { name: 'AdminHome' };
    case 'DriverForm':
      return typeof params.driverId === 'string'
        ? { name: 'DriverDetail', params: { driverId: params.driverId } }
        : { name: 'AdminHome' };
    case 'DriverOdometer':
      return { name: 'DriverVehicle' };
    case 'DriverVehicle':
    case 'DriverDocuments':
    case 'DriverSigningDocuments':
    case 'DriverProfile':
      return { name: 'DriverHome' };
    case 'CompanyDetail':
      return { name: 'OwnerHome' };
    case 'SetPassword':
      return params.voluntary ? { name: homeRoute } : { name: 'Login' };
    case 'Login':
    case 'OwnerHome':
    case 'AdminHome':
    case 'DriverHome':
      return null;
    default:
      return { name: homeRoute };
  }
}
