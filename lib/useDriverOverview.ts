import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCompany } from './CompanyContext';
import { countUnreadNotifications, getDriver, listActiveDriverVehicles, listCompliance, type ComplianceItem, type DriverRow, type Vehicle } from './adminApi';
import { complianceTargetDate, findComplianceDef, isRetiredVehicleComplianceItem } from './compliance';
import { listSignatureRequests, type SignatureRequest } from './docuseal';
import { expiryState, formatDate, type ExpiryState } from './theme';

export type Severity = 'danger' | 'warning' | 'success';
export type OverviewItem = { title: string; detail: string; severity: Severity; item: ComplianceItem; target: string | null };

const RANK: Record<Severity, number> = { danger: 0, warning: 1, success: 2 };

function severityFor(state: ExpiryState): Severity {
  return state === 'expired' ? 'danger' : state === 'soon' ? 'warning' : 'success';
}

/** A request the driver can sign right now. */
export function isAwaitingSignature(request: SignatureRequest) {
  return request.status === 'pending' && !!request.docuseal_submitter_slug;
}

/**
 * Everything the driver's home and "requires attention" screens show: the
 * driver, their primary vehicle and its validity items, the forms waiting
 * for their signature and the unread count. Reloads whenever the screen
 * regains focus.
 */
export function useDriverOverview() {
  const { company, profile, loading: profileLoading } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<SignatureRequest[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    if (!profile) {
      // Right after a refresh the profile is still on its way: keep loading.
      if (profileLoading) return;
      setError('פרופיל הנהג אינו זמין');
      setLoading(false);
      return;
    }
    const requestId = ++loadRequest.current;
    try {
      setError('');
      const [loadedDriver, assignments, signatures, unread] = await Promise.all([
        getDriver(profile.id),
        listActiveDriverVehicles(profile.id),
        listSignatureRequests(),
        company?.id ? countUnreadNotifications(company.id) : Promise.resolve(0),
      ]);
      if (requestId !== loadRequest.current) return;
      const primary = assignments.find((a) => a.is_primary) ?? assignments[0] ?? null;
      const loadedCompliance = primary ? await listCompliance('vehicle', primary.vehicle.id) : [];
      if (requestId !== loadRequest.current) return;
      setDriver(loadedDriver);
      setVehicle(primary?.vehicle ?? null);
      setCompliance(loadedCompliance);
      setPendingRequests(signatures.filter(isAwaitingSignature));
      setUnreadNotifications(unread);
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message || 'טעינת נתוני המסך נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [company, profile, profileLoading]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const items = useMemo<OverviewItem[]>(() => {
    if (!vehicle) return [];
    return compliance
      .filter((item) => !isRetiredVehicleComplianceItem(item.item_type))
      .map((item) => {
        const def = findComplianceDef('vehicle', item.item_type);
        const target = def ? complianceTargetDate(def, item) : item.expiry_date;
        if (!def && !target) return null;
        return {
          title: def?.label || item.item_type,
          detail: target ? formatDate(target) : 'תאריך חסר',
          severity: severityFor(expiryState(target)),
          item,
          target: target ?? null,
        };
      })
      .filter((x): x is OverviewItem => !!x)
      .sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  }, [compliance, vehicle]);

  const reload = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  return { company, profile, driver, vehicle, items, pendingRequests, unreadNotifications, loading, error, reload };
}
