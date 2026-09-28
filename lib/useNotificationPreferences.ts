import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../components/ui';
import { useCompany } from './CompanyContext';
import {
  ADMIN_NOTIFICATION_TYPES,
  DRIVER_NOTIFICATION_TYPES,
  OWNER_NOTIFICATION_TYPES,
  LEAD_RULES,
  NotificationLeads,
  NotificationPreferencesMap,
  NotificationType,
  getNotificationLeads,
  getPreferences,
  setNotificationLead,
  setPreference,
  setVehicleExpiryLeadDays,
} from './notificationPreferencesApi';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';
import { t } from './i18n';

/**
 * The signed-in user's notification toggles plus the company's lead time
 * for each timed alert (admins only) — shared by the phone preferences
 * screen and the desktop notifications page.
 * Loads on focus; pass `enabled: false` to skip loading entirely.
 */
export function useNotificationPreferences({ enabled = true }: { enabled?: boolean } = {}) {
  const { profile, companyId } = useCompany();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesMap | null>(null);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
  // Per-type lead times (admins only).
  const [leads, setLeads] = useState<NotificationLeads | null>(null);
  const [savingLeadType, setSavingLeadType] = useState<NotificationType | null>(null);
  const loadRequest = useRef(0);

  const isDriver = profile?.role === 'driver';
  const isOwner = profile?.role === 'owner';
  const profileId = profile?.id;
  const visibleTypes = isDriver ? DRIVER_NOTIFICATION_TYPES : isOwner ? OWNER_NOTIFICATION_TYPES : ADMIN_NOTIFICATION_TYPES;

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profileId) {
      if (requestId === loadRequest.current) {
        setError(t('prefs.profileUnavailable'));
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
        const perType = await getNotificationLeads(companyId).catch(() => null);
        if (requestId !== loadRequest.current) return;
        setLeads(perType);
      }
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? t('prefs.loadFailed'));
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
      showToast(t('prefs.saveFailed'));
      return false;
    } finally {
      setSavingType(null);
    }
  };

  /**
   * Saves one type's lead time, optimistically. Before migration 100 only
   * the vehicle folders can change, and they change together.
   */
  const setLead = async (type: NotificationType, value: number): Promise<boolean> => {
    const rule = LEAD_RULES[type];
    if (!companyId || !leads || !rule) return false;
    const next = Math.max(rule.min, Math.min(rule.max, Math.round(value / rule.step) * rule.step));
    if (leads.values[type] === next) return true;
    const shared = !leads.perType;
    if (shared && !isVehicleFolderNotification(type)) return false;
    const previous = leads;
    const values = { ...leads.values };
    const custom = new Set(leads.custom);
    if (shared) {
      for (const key of Object.keys(values) as NotificationType[]) if (isVehicleFolderNotification(key)) values[key] = next;
    } else {
      values[type] = next;
      custom.add(type);
    }
    setLeads({ ...leads, values, custom });
    setSavingLeadType(type);
    try {
      if (shared) {
        await setVehicleExpiryLeadDays(companyId, next);
      } else {
        await setNotificationLead(companyId, type, next);
      }
      return true;
    } catch {
      setLeads(previous);
      showToast(t('prefs.saveTimingFailed'));
      return false;
    } finally {
      setSavingLeadType(null);
    }
  };

  return {
    loading,
    error,
    load,
    prefs,
    savingType,
    toggle,
    isDriver,
    isOwner,
    visibleTypes,
    leads,
    setLead,
    savingLeadType,
  };
}

export type NotificationPreferencesState = ReturnType<typeof useNotificationPreferences>;
