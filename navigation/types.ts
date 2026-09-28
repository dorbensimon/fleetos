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
  VehicleDetail: { vehicleId: string; returnTo?: 'driver'; fromDriverId?: string; tab?: 'general' | 'maintenance' | 'documents' | 'drivers' | 'licensing'; /** A folder key (lib/vehicleFolderAlerts.ts) to open on arrival, e.g. from an expiry notification. */ openFolder?: string; /** Opens the assigned-drivers dialog on arrival, e.g. from "needs attention". */ openDrivers?: boolean; /** 'odometer' or 'service': scroll to and light up the maintenance card (from a notification). */ focus?: string };
  VehicleForm: { vehicleId?: string };
  DriverDetail: { driverId: string; /** Set when opened from a vehicle, so a refreshed page still goes back to it. */ fromVehicleId?: string; /** A document category to open on arrival, e.g. from a "driver uploaded a document" notification. */ openFolder?: string; /** Field keys (comma separated) to scroll to and light up, e.g. from a "driver updated details" notification. */ focus?: string };
  DriverArchive: undefined;
  DriverPersonalDetails: { driverId: string; focus?: string };
  DriverForm: { driverId?: string };
  Departments: undefined;
  CompanyDocuments: undefined;
  Attention: undefined;
  Reports: undefined;
  AdminProfile: undefined;
  CompanySettings: undefined;
  /** `openMeeting`: a repeating form's id, to open its "מפגש חדש" list (from a "meetings due" notification). */
  SignedDocuments: { openMeeting?: string } | undefined;
  Notifications: { section?: 'settings' } | undefined;
  AdminDocumentSigning: { companyId?: string } | undefined;
  /** A meeting on a "רשימת סעיפים" form: a new one (templateId) or one in progress (meetingId). */
  ChecklistMeeting: { driverId: string; templateId?: string; meetingId?: string };
  /** "בדיקות בטיחות": the company's vehicle inspections and the vehicles due for one. */
  SafetyInspections: undefined;
  SafetyInspectionSettings: undefined;
  /** One vehicle inspection: a new one, or one opened again (`inspectionId`). */
  SafetyInspection: { vehicleId: string; inspectionId?: string };
  /** Owner-only: manage the global signing templates shared by every company. */
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
  /** `focus`: a vehicle folder key to scroll to and light up. */
  DriverVehicle: { focus?: string } | undefined;
  DriverDocuments: undefined;
  /** `requestId`: open that request on arrival (a driver goes straight to signing it). */
  DriverSigningDocuments: { driverId?: string; folderId?: string; requestId?: string } | undefined;
  /** `focus`: field keys to scroll to and light up; `edit` opens the form so the driver can fill them in. */
  DriverProfile: { focus?: string; edit?: boolean } | undefined;
  /** A driver signs one request on the app's own signature pad (a document that only needs a signature). */
  DriverSignDocument: { requestId: string; title: string; documentUrl: string | null };
  DriverOdometer: { vehicleId: string; currentOdometer: number };
  DriverAttention: undefined;

  // Shared
  Menu: undefined;
};
