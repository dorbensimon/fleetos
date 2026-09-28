import type { DriverRow } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import {
  DRIVER_CARD_GROUPS,
  type DriverCardGroup,
  type DriverCardRow,
} from './driverCardSections';
import { t } from '../../lib/i18n';

export function maskNationalId(id: string | null | undefined): string {
  if (!id || id.length < 6) return id ?? '—';
  return `${id.slice(0, 3)}•••${id.slice(-3)}`;
}

export function buildDriverDetailGroups(
  driver: DriverRow | null,
  licenseStatus: 'expired' | 'verified' | 'pending',
  pendingSigningCount = 0
): DriverCardGroup[] {
  const vehicles = driver?.vehicles ?? [];
  const vehicleRows: DriverCardRow[] =
    vehicles.length === 0
      ? [{ key: 'vehicle', kind: 'value', label: t('vehicle.vehicle'), icon: 'car', tint: 'indigo', value: t('driver.noVehicleAssigned'), ltr: true }]
      : vehicles.map((vehicle) => ({
          key: vehicle.is_primary ? 'primary-vehicle' : 'secondary-vehicle',
          kind: 'nav',
          label: vehicles.length > 1 ? (vehicle.is_primary ? t('driver.primaryVehicle') : t('driver.secondaryVehicle')) : t('vehicle.vehicle'),
          icon: 'car',
          tint: 'indigo',
          badge: vehicle.plate_number,
          tone: 'muted',
        }));

  return DRIVER_CARD_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.flatMap((row): DriverCardRow[] => {
      if (row.key === 'license-documents' && row.kind === 'nav') {
        const badge =
          licenseStatus === 'expired' ? t('status.expiredLong') : licenseStatus === 'verified' ? t('common.verified') : t('common.pendingCompletion');
        const tone = licenseStatus === 'expired' ? 'bad' : licenseStatus === 'verified' ? 'muted' : 'warn';
        return [{ ...row, badge, tone }];
      }
      if (row.key === 'signing-documents' && row.kind === 'nav') {
        return [
          {
            ...row,
            badge: pendingSigningCount > 0 ? t('driverCard.pendingCount', { pendingSigningCount }) : t('driverCard.allSigned'),
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
