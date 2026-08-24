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
  Settings: undefined;
  DocumentCategory: {
    ownerType: 'driver' | 'vehicle';
    ownerId: string;
    category: string;
    title: string;
  };

  // Driver module
  DriverVehicle: undefined;
  DriverDocuments: undefined;
  DriverProfile: undefined;
};
