export type RootStackParamList = {
  Login: undefined;
  SetPassword: undefined;
  OwnerHome: undefined;
  AdminHome: undefined;
  DriverHome: undefined;
  CompanyDetail: { companyId: string };

  // Admin module — detail screens push over the admin tab bar
  VehicleDetail: { vehicleId: string };
  VehicleForm: { vehicleId?: string };
  DriverDetail: { driverId: string };
  DriverForm: { driverId?: string };
};

/** Tabs inside AdminHomeScreen. */
export type AdminTabParamList = {
  Dashboard: undefined;
  Vehicles: undefined;
  Drivers: undefined;
  More: undefined;
};
