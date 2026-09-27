import { LICENSE_FOCUS, adminNotificationTarget, driverNotificationTarget, type NotificationTargetFields } from '../notificationTargets';

function notification(fields: Partial<NotificationTargetFields>): NotificationTargetFields {
  return {
    notification_type: null,
    actor_id: null,
    recipient_id: null,
    vehicle_id: null,
    folder_key: null,
    message: '',
    company_id: 'c1',
    signature_request_id: null,
    ...fields,
  };
}

const noVehicle = async () => null;
const vehicleFromRow = async (n: NotificationTargetFields) => n.vehicle_id ?? null;

describe('driverNotificationTarget', () => {
  it('goes straight to the request to sign', () => {
    expect(driverNotificationTarget(notification({ notification_type: 'signature_request_assigned', signature_request_id: 'r1' })))
      .toEqual({ screen: 'DriverSigningDocuments', params: { requestId: 'r1' } });
    expect(driverNotificationTarget(notification({ notification_type: 'signature_request_assigned' })))
      .toEqual({ screen: 'DriverSigningDocuments' });
  });

  it('opens the vehicle at the folder, odometer or service it is about', () => {
    expect(driverNotificationTarget(notification({ notification_type: 'vehicle_assignment' }))).toEqual({ screen: 'DriverVehicle' });
    expect(driverNotificationTarget(notification({ notification_type: 'vehicle_annual_test_expiry', folder_key: 'annual_test' })))
      .toEqual({ screen: 'DriverVehicle', params: { focus: 'annual_test' } });
    expect(driverNotificationTarget(notification({ notification_type: 'vehicle_service_due' })))
      .toEqual({ screen: 'DriverVehicle', params: { focus: 'service' } });
    expect(driverNotificationTarget(notification({ notification_type: 'driver_odometer_update' })))
      .toEqual({ screen: 'DriverVehicle', params: { focus: 'odometer' } });
  });

  it('opens the profile at the fields the manager changed', () => {
    expect(driverNotificationTarget(notification({
      notification_type: 'driver_profile_updated_by_manager',
      message: 'המנהל עדכן בתיק שלך: טלפון, תוקף רישיון',
    }))).toEqual({ screen: 'DriverProfile', params: { focus: 'phone,license_expiry' } });
    expect(driverNotificationTarget(notification({ notification_type: 'driver_profile_updated_by_manager', message: 'שונה משהו' })))
      .toEqual({ screen: 'DriverProfile' });
    expect(driverNotificationTarget(notification({ notification_type: 'license_update_reviewed' })))
      .toEqual({ screen: 'DriverProfile', params: { focus: 'license_number,license_classes,license_expiry' } });
  });
});

describe('adminNotificationTarget', () => {
  it('opens the folder of the document a driver uploaded', async () => {
    await expect(adminNotificationTarget(
      notification({ notification_type: 'driver_document_upload', actor_id: 'd1', folder_key: 'license_docs' }),
      noVehicle,
    )).resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1', openFolder: 'license_docs' } });
  });

  it('opens the driver card when an upload has no folder recorded', async () => {
    await expect(adminNotificationTarget(
      notification({ notification_type: 'driver_document_upload', actor_id: 'd1' }),
      noVehicle,
    )).resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1', openFolder: undefined } });
  });

  it('opens the vehicle folder of an expiry alert', async () => {
    await expect(adminNotificationTarget(
      notification({ notification_type: 'vehicle_brakes_annual_expiry', vehicle_id: 'v1', folder_key: 'brakes_annual' }),
      vehicleFromRow,
    )).resolves.toEqual({ screen: 'VehicleDetail', params: { vehicleId: 'v1', openFolder: 'brakes_annual' } });
  });

  it('falls back to the fleet when a vehicle alert names no vehicle', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'vehicle_license_expiry' }), noVehicle))
      .resolves.toEqual({ screen: 'AdminHome' });
  });

  it('opens the driver at the fields they edited', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'driver_profile_update', actor_id: 'd1', message: 'דני עדכן/ה: כתובת, טלפון בבית' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1', focus: 'address,home_phone' } });
    await expect(adminNotificationTarget(notification({ notification_type: 'driver_profile_update', actor_id: 'd1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1' } });
  });

  it('opens the odometer and service on the vehicle', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'driver_odometer_update', actor_id: 'd1', vehicle_id: 'v1' }), vehicleFromRow))
      .resolves.toEqual({ screen: 'VehicleDetail', params: { vehicleId: 'v1', tab: 'maintenance', focus: 'odometer' } });
    await expect(adminNotificationTarget(notification({ notification_type: 'driver_odometer_update', actor_id: 'd1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1' } });
    await expect(adminNotificationTarget(notification({ notification_type: 'vehicle_service_due', vehicle_id: 'v1' }), vehicleFromRow))
      .resolves.toEqual({ screen: 'VehicleDetail', params: { vehicleId: 'v1', tab: 'maintenance', focus: 'service' } });
  });

  it('opens the signing request the driver got', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'signature_request_assigned', recipient_id: 'd1', signature_request_id: 'r1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverSigningDocuments', params: { driverId: 'd1', requestId: 'r1' } });
  });

  it('opens the license for a license update request', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'license_update_requested', actor_id: 'd1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1', openFolder: 'license_docs' } });
  });

  it('has no target for a notification without a type', async () => {
    await expect(adminNotificationTarget(notification({ actor_id: 'd1' }), noVehicle)).resolves.toBeNull();
  });

  it('opens the driver\'s license, the company settings, the signed document and the odometer (migration 101)', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'driver_license_expiry', actor_id: 'd1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1', focus: LICENSE_FOCUS } });
    await expect(adminNotificationTarget(notification({ notification_type: 'company_carrier_license_expiry' }), noVehicle))
      .resolves.toEqual({ screen: 'CompanySettings' });
    await expect(adminNotificationTarget(notification({ notification_type: 'signature_request_completed', actor_id: 'd1', signature_request_id: 'r1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverSigningDocuments', params: { driverId: 'd1', requestId: 'r1' } });
    await expect(adminNotificationTarget(notification({ notification_type: 'vehicle_odometer_stale', vehicle_id: 'v1' }), noVehicle))
      .resolves.toEqual({ screen: 'VehicleDetail', params: { vehicleId: 'v1', tab: 'maintenance', focus: 'odometer' } });
    await expect(adminNotificationTarget(notification({ notification_type: 'vehicle_odometer_stale' }), noVehicle))
      .resolves.toEqual({ screen: 'AdminHome' });
  });
});

describe('driver targets for migration 101', () => {
  it('opens the license and the odometer', () => {
    expect(driverNotificationTarget(notification({ notification_type: 'driver_license_expiry' })))
      .toEqual({ screen: 'DriverProfile', params: { focus: LICENSE_FOCUS } });
    expect(driverNotificationTarget(notification({ notification_type: 'vehicle_odometer_stale', vehicle_id: 'v1' })))
      .toEqual({ screen: 'DriverVehicle', params: { focus: 'odometer' } });
  });
});
