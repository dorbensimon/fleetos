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

  it('keeps manager alerts in the notification inbox except signing', () => {
    expect(routeForPushNotification('admin', { notificationType: 'driver_document_upload' }))
      .toBe('Notifications');
    expect(routeForPushNotification('admin', { notificationType: 'signature_request_assigned' }))
      .toBe('AdminDocumentSigning');
  });
});
