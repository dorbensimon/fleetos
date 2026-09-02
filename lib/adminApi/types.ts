export type VehicleStatus = 'active' | 'maintenance' | 'disabled' | 'archived';
export type VehicleType = 'car' | 'minibus' | 'bus' | 'truck';
export type AcquisitionType = 'purchase' | 'leasing' | 'rental';
export type OwnerType = 'vehicle' | 'driver';

export interface Vehicle {
  id: string;
  company_id: string;
  department_id: string | null;
  primary_driver_id: string | null;
  plate_number: string;
  internal_code: string | null;
  vin: string | null;
  vehicle_type: VehicleType;
  manufacturer: string | null;
  model: string | null;
  production_year: number | null;
  production_month: number | null;
  road_registration_date: string | null;
  acquisition_type: AcquisitionType | null;
  usage_type: string | null;
  status: VehicleStatus;
  odometer: number;
  odometer_updated_at: string | null;
  last_service_km: number;
  service_interval_km: number | null;
  next_service_km: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverDetails {
  id: string;
  company_id: string;
  department_id: string | null;
  employee_number: string | null;
  national_id: string | null;
  birth_date: string | null;
  address: string | null;
  home_phone: string | null;
  marital_status: string | null;
  education: string | null;
  employment_start_date: string | null;
  license_number: string | null;
  license_classes: string | null;
  license_issue_date: string | null;
  license_expiry: string | null;
  status: 'active' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** One vehicle a driver is actively assigned to, as attached to DriverRow. */
export interface DriverRowVehicle {
  id: string;
  plate_number: string;
  is_primary: boolean;
}

/** A driver as the list and detail screens need them: profile + details. */
export interface DriverRow extends DriverDetails {
  full_name: string | null;
  phone: string | null;
  job_title: string | null;
  email?: string | null;
  /**
   * All vehicles the driver is currently (actively) assigned to — 0 to 2,
   * primary first. `vehicle_id`/`vehicle_plate` below are kept for screens
   * that only care about "a" vehicle to show (list cards, filters) and are
   * simply the first entry of this array.
   */
  vehicles: DriverRowVehicle[];
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
}

export interface ComplianceItem {
  id: string;
  company_id: string;
  owner_type: OwnerType;
  owner_id: string;
  category: string;
  item_type: string;
  last_date: string | null;
  expiry_date: string | null;
  notes: string | null;
}

export interface DocumentRow {
  id: string;
  company_id: string;
  owner_type: OwnerType;
  owner_id: string;
  compliance_item_id: string | null;
  category: string;
  title: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  expiry_date: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
}

export interface Notification {
  id: string;
  company_id: string;
  actor_id: string | null;
  actor_name: string | null;
  recipient_id: string | null;
  notification_type: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface VehicleDriverAssignment {
  id: string;
  company_id: string;
  vehicle_id: string;
  driver_id: string;
  is_primary: boolean;
  assigned_at: string;
  unassigned_at: string | null;
}

/** An active assignment joined with the driver's identity, for display. */
export interface VehicleDriverWithProfile extends VehicleDriverAssignment {
  full_name: string | null;
  phone: string | null;
}

/** An active assignment joined with the vehicle, for the driver-facing screens. */
export interface DriverVehicleAssignment extends VehicleDriverAssignment {
  vehicle: Vehicle;
}
