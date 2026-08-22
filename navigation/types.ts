export type RootStackParamList = {
  Login: undefined;
  SetPassword: undefined;
  OwnerHome: undefined;
  AdminHome: undefined; // the drivers list — where an admin lands
  DriverHome: undefined;
  CompanyDetail: { companyId: string };

  // Admin module
  Vehicles: undefined;
  VehicleDetail: { vehicleId: string };
  VehicleForm: { vehicleId?: string };
  DriverDetail: { driverId: string };
  DriverPersonalDetails: { driverId: string };
  DriverForm: { driverId?: string };
  Departments: undefined;
  AdminProfile: undefined;
  DocumentCategory: {
    ownerType: 'driver' | 'vehicle';
    ownerId: string;
    category: string;
    title: string;
  };
};
