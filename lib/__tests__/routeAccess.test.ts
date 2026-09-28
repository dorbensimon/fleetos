jest.mock('../supabase', () => ({ supabase: {} }));

import { canOpenRoute, isPublicRoute } from '../routeAccess';
import { ROLE_ROUTES } from '../session';

describe('routeAccess', () => {
  it('keeps a driver off admin and owner screens', () => {
    for (const name of ['AdminHome', 'VehicleDetail', 'DriverDetail', 'Reports', 'CompanySettings', 'SignedDocuments', 'OwnerHome', 'CompanyDetail', 'AdminProfile']) {
      expect(canOpenRoute('driver', name)).toBe(false);
    }
  });

  it('keeps an admin off driver and owner screens', () => {
    for (const name of ['DriverHome', 'DriverVehicle', 'DriverProfile', 'DriverDocuments', 'OwnerHome', 'CompanyDetail']) {
      expect(canOpenRoute('admin', name)).toBe(false);
    }
  });

  it('keeps the owner off company screens', () => {
    for (const name of ['AdminHome', 'DriverHome', 'Reports', 'DriverDetail']) {
      expect(canOpenRoute('owner', name)).toBe(false);
    }
  });

  it('lets every role open its own home', () => {
    for (const [role, home] of Object.entries(ROLE_ROUTES)) {
      expect(canOpenRoute(role as keyof typeof ROLE_ROUTES, home)).toBe(true);
    }
  });

  it('opens shared screens to the roles that use them', () => {
    expect(canOpenRoute('driver', 'DriverSigningDocuments')).toBe(true);
    expect(canOpenRoute('admin', 'DriverSigningDocuments')).toBe(true);
    expect(canOpenRoute('driver', 'DocumentCategory')).toBe(true);
    expect(canOpenRoute('owner', 'Notifications')).toBe(true);
  });

  it('treats login, legal and set-password as public, unknown screens as closed', () => {
    expect(isPublicRoute('Login')).toBe(true);
    expect(isPublicRoute('Legal')).toBe(true);
    expect(isPublicRoute('SetPassword')).toBe(true);
    expect(isPublicRoute('AdminHome')).toBe(false);
    expect(canOpenRoute('admin', 'NoSuchScreen')).toBe(false);
  });
});
