import { routeForPushNotification } from '../pushNotificationRoutes';

describe('routeForPushNotification', () => {
  it('opens a driver signing request directly', () => {
    expect(routeForPushNotification('driver', { notificationType: 'signature_request_assigned' }))
      .toBe('DriverSigningDocuments');
  });

  it('opens the relevant driver vehicle screen', () => {
    expect(routeForPushNotification('driver', { notificationType: 'vehicle_assignment' }))
      .toBe('DriverVehicle');
  });

  it('keeps manager alerts in the notification inbox without a generic signing page', () => {
    expect(routeForPushNotification('admin', { notificationType: 'driver_document_upload' }))
      .toBe('Notifications');
    expect(routeForPushNotification('admin', { notificationType: 'signature_request_assigned' }))
      .toBe('Notifications');
  });

  it('opens the vehicle folder for a manager expiry alert', () => {
    expect(routeForPushNotification('admin', { notificationType: 'vehicle_brakes_annual_expiry', vehicleId: 'v1', folderKey: 'brakes_annual' }))
      .toBe('VehicleDetail');
  });

  it('keeps a manager expiry alert without a vehicle in the inbox', () => {
    expect(routeForPushNotification('admin', { notificationType: 'vehicle_license_expiry' }))
      .toBe('Notifications');
  });

  it('sends a driver expiry alert to their vehicle screen', () => {
    expect(routeForPushNotification('driver', { notificationType: 'vehicle_child_detection_expiry', vehicleId: 'v1' }))
      .toBe('DriverVehicle');
  });
});
