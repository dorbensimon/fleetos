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
  setPreferences,
  setVehicleExpiryLeadDays,
} from './notificationPreferencesApi';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';
import { t } from './i18n';
import { errorMessage } from './requestError';

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
  // The latest values, for saves started one after another before a re-render.
  const prefsRef = useRef<NotificationPreferencesMap | null>(null);
  const leadsRef = useRef<NotificationLeads | null>(null);
  prefsRef.current = prefs;
  leadsRef.current = leads;

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
      if (requestId === loadRequest.current) setError(errorMessage(err, t('prefs.loadFailed')));
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
  const toggle = async (type: NotificationType, next: boolean): Promise<boolean> => toggleMany([type], next);

  /**
   * Several types at once ("turn all on/off"): one change on screen and one
   * request, so none of them is lost to another's stale copy of the state.
   */
  const toggleMany = async (types: NotificationType[], next: boolean): Promise<boolean> => {
    const current = prefsRef.current;
    if (!profileId || !current) return false;
    const changed = types.filter((type) => current[type] !== next);
    if (!changed.length) return true;
    const apply = (value: boolean) =>
      setPrefs((p) => {
        if (!p) return p;
        const copy = { ...p };
        for (const type of changed) copy[type] = value;
        prefsRef.current = copy;
        return copy;
      });
    apply(next);
    setSavingType(changed.length === 1 ? changed[0] : null);
    try {
      if (changed.length === 1) await setPreference(profileId, changed[0], next);
      else await setPreferences(profileId, changed, next);
      return true;
    } catch {
      apply(!next);
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
    const leads = leadsRef.current;
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
    leadsRef.current = { ...leads, values, custom };
    setLeads(leadsRef.current);
    setSavingLeadType(type);
    try {
      if (shared) {
        await setVehicleExpiryLeadDays(companyId, next);
      } else {
        await setNotificationLead(companyId, type, next);
      }
      return true;
    } catch {
      // Only this type goes back; a save that ran alongside keeps its value.
      const latest = leadsRef.current;
      if (latest && !shared) {
        const values = { ...latest.values, [type]: previous.values[type] };
        const custom = new Set(latest.custom);
        if (!previous.custom.has(type)) custom.delete(type);
        leadsRef.current = { ...latest, values, custom };
      } else {
        leadsRef.current = previous;
      }
      setLeads(leadsRef.current);
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
    toggleMany,
    isDriver,
    isOwner,
    visibleTypes,
    leads,
    setLead,
    savingLeadType,
  };
}

export type NotificationPreferencesState = ReturnType<typeof useNotificationPreferences>;
