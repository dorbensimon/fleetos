import type { DriverRow } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import {
  DRIVER_CARD_GROUPS,
  type DriverCardGroup,
  type DriverCardRow,
} from './driverCardSections';

export function maskNationalId(id: string | null | undefined): string {
  if (!id || id.length < 6) return id ?? '—';
  return `${id.slice(0, 3)}•••${id.slice(-3)}`;
}

export function buildDriverDetailGroups(
  driver: DriverRow | null,
  licenseVerified: boolean,
  pendingSigningCount = 0
): DriverCardGroup[] {
  const vehicles = driver?.vehicles ?? [];
  const vehicleRows: DriverCardRow[] =
    vehicles.length === 0
      ? [{ key: 'vehicle', kind: 'value', label: 'רכב', icon: 'car', tint: 'indigo', value: 'ללא רכב משויך', ltr: true }]
      : vehicles.map((vehicle) => ({
          key: vehicle.is_primary ? 'primary-vehicle' : 'secondary-vehicle',
          kind: 'nav',
          label: vehicles.length > 1 ? (vehicle.is_primary ? 'רכב ראשי' : 'רכב משני') : 'רכב',
          icon: 'car',
          tint: 'indigo',
          badge: vehicle.plate_number,
          tone: 'muted',
        }));

  return DRIVER_CARD_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.flatMap((row): DriverCardRow[] => {
      if (row.key === 'license-documents' && row.kind === 'nav') {
        return [{ ...row, badge: licenseVerified ? 'מאומת' : 'ממתין להשלמה', tone: licenseVerified ? 'muted' : 'warn' }];
      }
      if (row.key === 'signing-documents' && row.kind === 'nav') {
        return [
          {
            ...row,
            badge: pendingSigningCount > 0 ? `${pendingSigningCount} ממתינים` : 'הכל חתום',
            tone: pendingSigningCount > 0 ? 'warn' : 'muted',
          },
        ];
      }
      if (row.kind !== 'value') return [row];
      if (row.key === 'phone') return [{ ...row, value: driver?.phone ? formatPhone(driver.phone) : '—' }];
      if (row.key === 'email') return [{ ...row, value: driver?.email || '—' }];
      if (row.key === 'national-id') return [{ ...row, value: maskNationalId(driver?.national_id) }];
      return [row];
    }),
  })).map((group) => (group.title === 'פרטי קשר ורכב' ? { ...group, rows: [...group.rows, ...vehicleRows] } : group))
    .filter((group) => group.rows.length > 0);
}
