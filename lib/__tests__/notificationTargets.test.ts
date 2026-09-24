import { adminNotificationTarget, driverNotificationTarget, type NotificationTargetFields } from '../notificationTargets';

function notification(fields: Partial<NotificationTargetFields>): NotificationTargetFields {
  return {
    notification_type: null,
    actor_id: null,
    recipient_id: null,
    vehicle_id: null,
    folder_key: null,
    message: '',
    company_id: 'c1',
    ...fields,
  };
}

const noVehicle = async () => null;
const vehicleFromRow = async (n: NotificationTargetFields) => n.vehicle_id ?? null;

describe('driverNotificationTarget', () => {
  it('opens the signing documents for a signing request', () => {
    expect(driverNotificationTarget(notification({ notification_type: 'signature_request_assigned' })))
      .toEqual({ screen: 'DriverSigningDocuments' });
  });

  it('opens the vehicle screen for assignments, odometer and every vehicle alert', () => {
    for (const type of ['vehicle_assignment', 'driver_odometer_update', 'vehicle_child_detection_expiry', 'vehicle_service_due']) {
      expect(driverNotificationTarget(notification({ notification_type: type }))).toEqual({ screen: 'DriverVehicle' });
    }
  });

  it('opens the profile when the manager changed their details', () => {
    expect(driverNotificationTarget(notification({ notification_type: 'driver_profile_updated_by_manager' })))
      .toEqual({ screen: 'DriverProfile' });
    expect(driverNotificationTarget(notification({ notification_type: 'license_update_reviewed' })))
      .toEqual({ screen: 'DriverProfile' });
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

  it('opens the driver details a driver edited', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'driver_profile_update', actor_id: 'd1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverPersonalDetails', params: { driverId: 'd1' } });
  });

  it('opens the license for a license update request', async () => {
    await expect(adminNotificationTarget(notification({ notification_type: 'license_update_requested', actor_id: 'd1' }), noVehicle))
      .resolves.toEqual({ screen: 'DriverDetail', params: { driverId: 'd1', openFolder: 'license_docs' } });
  });

  it('has no target for a notification without a type', async () => {
    await expect(adminNotificationTarget(notification({ actor_id: 'd1' }), noVehicle)).resolves.toBeNull();
  });
});
