import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../components/ui';
import { useCompany } from './CompanyContext';
import {
  ADMIN_NOTIFICATION_TYPES,
  DRIVER_NOTIFICATION_TYPES,
  MAX_VEHICLE_EXPIRY_LEAD_DAYS,
  MIN_VEHICLE_EXPIRY_LEAD_DAYS,
  NotificationPreferencesMap,
  NotificationType,
  getPreferences,
  getVehicleExpiryLeadDays,
  setPreference,
  setVehicleExpiryLeadDays,
} from './notificationPreferencesApi';

/**
 * The signed-in user's notification toggles plus the company's vehicle
 * expiry lead time (admins only) — shared by the phone preferences screen
 * and the desktop notifications page, which shows them beside the list.
 * Loads on focus; pass `enabled: false` to skip loading entirely.
 */
export function useNotificationPreferences({ enabled = true }: { enabled?: boolean } = {}) {
  const { profile, companyId } = useCompany();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesMap | null>(null);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
  // Company-wide lead time for vehicle folder expiry alerts (admins only).
  const [leadDays, setLeadDays] = useState<number | null>(null);
  const [leadDraft, setLeadDraft] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const loadRequest = useRef(0);

  const isDriver = profile?.role === 'driver';
  const profileId = profile?.id;
  const visibleTypes = isDriver ? DRIVER_NOTIFICATION_TYPES : ADMIN_NOTIFICATION_TYPES;

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profileId) {
      if (requestId === loadRequest.current) {
        setError('פרופיל המשתמש אינו זמין');
        setLoading(false);
      }
      return;
    }
    try {
      const data = await getPreferences(profileId);
      if (requestId !== loadRequest.current) return;
      setPrefs(data);
      if (!isDriver && companyId) {
        // Hidden rather than failing the whole screen if the setting can't be read.
        const days = await getVehicleExpiryLeadDays(companyId).catch(() => null);
        if (requestId !== loadRequest.current) return;
        setLeadDays(days);
        setLeadDraft(days != null ? String(days) : '');
      }
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת ההעדפות נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profileId, isDriver, companyId]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      load();
      return () => { loadRequest.current += 1; };
    }, [enabled, load])
  );

  /** Optimistic + immediate save, per the PRD's "no save button" rule. Resolves to whether it saved. */
  const toggle = async (type: NotificationType, next: boolean): Promise<boolean> => {
    if (!profileId || !prefs) return false;
    const previous = prefs[type];
    setPrefs({ ...prefs, [type]: next });
    setSavingType(type);
    try {
      await setPreference(profileId, type, next);
      return true;
    } catch {
      setPrefs((p) => (p ? { ...p, [type]: previous } : p));
      showToast('שמירת ההעדפה נכשלה, נסה שוב');
      return false;
    } finally {
      setSavingType(null);
    }
  };

  const saveLeadDays = async () => {
    if (!companyId || leadDays == null || savingLead) return;
    const next = Number(leadDraft);
    if (!Number.isInteger(next) || next < MIN_VEHICLE_EXPIRY_LEAD_DAYS || next > MAX_VEHICLE_EXPIRY_LEAD_DAYS) {
      setLeadDraft(String(leadDays));
      showToast(`יש להזין מספר ימים בין ${MIN_VEHICLE_EXPIRY_LEAD_DAYS} ל-${MAX_VEHICLE_EXPIRY_LEAD_DAYS}`);
      return;
    }
    if (next === leadDays) return;
    setSavingLead(true);
    try {
      await setVehicleExpiryLeadDays(companyId, next);
      setLeadDays(next);
      showToast('זמן ההתראה נשמר');
    } catch {
      setLeadDraft(String(leadDays));
      showToast('שמירת זמן ההתראה נכשלה, נסה שוב');
    } finally {
      setSavingLead(false);
    }
  };

  const leadChanged = leadDays != null && leadDraft !== String(leadDays);

  return {
    loading,
    error,
    load,
    prefs,
    savingType,
    toggle,
    isDriver,
    visibleTypes,
    leadDays,
    leadDraft,
    setLeadDraft,
    savingLead,
    saveLeadDays,
    leadChanged,
  };
}

export type NotificationPreferencesState = ReturnType<typeof useNotificationPreferences>;

export const LEAD_DAYS_LABEL = 'זמן התראה לפני פקיעת תוקף';
export const LEAD_DAYS_DESCRIPTION = 'כמה ימים לפני שתוקף של תיקיית רכב פג תישלח התראה. חל על כל המנהלים והנהגים בחברה.';
