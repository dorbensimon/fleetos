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
  DriverForm: { driverId?: string };
  Departments: undefined;
};
