import type { RootStackParamList } from '../navigation/types';
import type { UserRole } from './supabase';

type RouteName = keyof RootStackParamList;
type Access = 'public' | readonly UserRole[];

/**
 * Who may open each screen. Every screen is registered in one stack and on
 * web each one has its own URL, so the browser's back button, a bookmark or
 * a typed address can land anyone on any screen — e.g. a driver signing in
 * after an admin on the same browser, then pressing back onto the admin's
 * fleet page. The data itself is guarded by RLS; this keeps each role on
 * its own screens. A `Record` so a new screen cannot be added unclassified.
 */
const ROUTE_ACCESS: Record<RouteName, Access> = {
  Login: 'public',
  Legal: 'public',
  SetPassword: 'public',

  OwnerHome: ['owner'],
  CompanyDetail: ['owner'],

  AdminHome: ['admin'],
  VehicleDetail: ['admin'],
  VehicleForm: ['admin'],
  DriverDetail: ['admin'],
  DriverArchive: ['admin'],
  DriverPersonalDetails: ['admin'],
  DriverForm: ['admin'],
  Departments: ['admin'],
  CompanyDocuments: ['admin'],
  Attention: ['admin'],
  Reports: ['admin'],
  CompanySettings: ['admin'],
  SignedDocuments: ['admin'],
  ChecklistMeeting: ['admin'],
  SafetyInspections: ['admin'],
  SafetyInspectionSettings: ['admin'],
  SafetyInspection: ['admin'],

  DriverHome: ['driver'],
  DriverVehicle: ['driver'],
  DriverDocuments: ['driver'],
  DriverSignDocument: ['driver'],
  DriverProfile: ['driver'],
  DriverOdometer: ['driver'],
  DriverAttention: ['driver'],

  // Shared screens that adapt to the signed-in role.
  AdminProfile: ['admin', 'owner'],
  // Redirects each role to its own place (old bookmarks).
  AdminDocumentSigning: ['owner', 'admin', 'driver'],
  Notifications: ['owner', 'admin', 'driver'],
  NotificationPreferences: ['owner', 'admin', 'driver'],
  Menu: ['owner', 'admin', 'driver'],
  SystemSettings: ['owner', 'admin', 'driver'],
  DocusealWebView: ['admin', 'driver'],
  DocumentCategory: ['admin', 'driver'],
  DriverLicenseDocuments: ['admin', 'driver'],
  DriverSigningDocuments: ['admin', 'driver'],
};

export function isPublicRoute(name: string): boolean {
  return ROUTE_ACCESS[name as RouteName] === 'public';
}

/** Whether a signed-in user with `role` may be on the screen `name`. */
export function canOpenRoute(role: UserRole, name: string): boolean {
  const access = ROUTE_ACCESS[name as RouteName];
  if (!access) return false;
  return access === 'public' || access.includes(role);
}
