export type RootStackParamList = {
  Login: undefined;
  SetPassword: undefined;
  OwnerHome: undefined;
  AdminHome: undefined; // the drivers list — where an admin lands
  DriverHome: undefined;
  CompanyDetail: { companyId: string };

  // Admin module
  VehicleDetail: { vehicleId: string };
  VehicleForm: { vehicleId?: string };
  DriverDetail: { driverId: string };
  DriverPersonalDetails: { driverId: string };
  DriverForm: { driverId?: string };
  Departments: undefined;
  AdminProfile: undefined;
  Notifications: undefined;
  AdminDocumentSigning: { companyId?: string } | undefined;
  DocusealWebView: {
    mode: 'builder' | 'sign' | 'preview' | 'document' | 'image';
    title: string;
    token?: string;
    src?: string;
    host?: string;
    templateId?: string;
    requestId?: string;
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
  };
  DriverLicenseDocuments: { driverId: string };
  // Driver module
  DriverVehicle: undefined;
  DriverDocuments: undefined;
  DriverSigningDocuments: { driverId?: string } | undefined;
  DriverProfile: undefined;

  // Shared
  Menu: undefined;
};
