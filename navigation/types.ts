export type RootStackParamList = {
  Login: undefined;
  /** A legal page (terms, privacy, cookies, accessibility), open to everyone, signed in or not. */
  Legal: { doc: 'privacy' | 'terms' | 'cookies' | 'accessibility' };
  /**
   * voluntary: true — reached from a profile screen's "שינוי סיסמה" by an
   * already-activated user choosing to change their password, not the
   * forced first-login/post-reset flow (must_change_password=true). Only
   * changes the copy shown and whether "cancel" is offered instead of
   * "sign out" — the same complete-password-setup call handles both.
   */
  SetPassword: { voluntary?: boolean } | undefined;
  OwnerHome: undefined;
  /** The fleet workspace. Desktop breadcrumbs may open a specific tab. */
  AdminHome: { mode?: 'drivers' | 'vehicles' } | undefined;
  DriverHome: undefined;
  CompanyDetail: { companyId: string };

  // Admin module
  /** `returnTo: 'driver'` keeps the back affordance honest when a vehicle
   * is opened from inside a driver's dossier rather than from the fleet;
   * `fromDriverId` names that driver so a refreshed page still goes back to them. */
  VehicleDetail: { vehicleId: string; returnTo?: 'driver'; fromDriverId?: string; tab?: 'general' | 'maintenance' | 'documents' | 'drivers' | 'licensing'; /** A folder key (lib/vehicleFolderAlerts.ts) to open on arrival, e.g. from an expiry notification. */ openFolder?: string; /** Opens the assigned-drivers dialog on arrival, e.g. from "needs attention". */ openDrivers?: boolean };
  VehicleForm: { vehicleId?: string };
  DriverDetail: { driverId: string; /** Set when opened from a vehicle, so a refreshed page still goes back to it. */ fromVehicleId?: string; /** A document category to open on arrival, e.g. from a "driver uploaded a document" notification. */ openFolder?: string };
  DriverArchive: undefined;
  DriverPersonalDetails: { driverId: string };
  DriverForm: { driverId?: string };
  Departments: undefined;
  CompanyDocuments: undefined;
  Attention: undefined;
  Reports: undefined;
  AdminProfile: undefined;
  CompanySettings: undefined;
  SignedDocuments: undefined;
  Notifications: undefined;
  AdminDocumentSigning: { companyId?: string } | undefined;
  /** Owner-only: manage the global signing templates shared by every company. */
  GlobalSigningTemplates: undefined;
  DocusealWebView: {
    mode: 'builder' | 'sign' | 'preview' | 'document' | 'image';
    title: string;
    token?: string;
    src?: string;
    host?: string;
    templateId?: string;
    requestId?: string;
    /** After a driver signs, return to the root "טפסים ומסמכים" screen. */
    returnToDriverDocuments?: boolean;
    /** Signed-document download is available to the driver who completed it. */
    allowDownload?: boolean;
    /** When the document was signed, shown by the desktop viewer. */
    signedAt?: string;
    previewFields?: Array<{
      name: string;
      type: 'signature' | 'stamp';
      areas: Array<{ page: number; x: number; y: number; w: number; h: number }>;
    }>;
  };
  NotificationPreferences: undefined;
  DocumentCategory: {
    ownerType: 'driver' | 'vehicle';
    ownerId: string;
    category: string;
    title: string;
    allowDelete?: boolean;
    requiresExpiry?: boolean;
  };
  DriverLicenseDocuments: { driverId: string };
  // Driver module
  DriverVehicle: undefined;
  DriverDocuments: undefined;
  DriverSigningDocuments: { driverId?: string; folderId?: string } | undefined;
  DriverProfile: undefined;
  DriverOdometer: { vehicleId: string; currentOdometer: number };
  DriverAttention: undefined;

  // Shared
  Menu: undefined;
};
