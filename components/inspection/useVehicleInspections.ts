import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getInspectionSettings,
  listInspections,
  listStateOf,
  loadInspectionPlan,
  setNextInspectionDate,
  type InspectionListRow,
  type InspectionPlanRow,
  type InspectionState,
} from '../../lib/inspections';
import { t } from '../../lib/i18n';

export type VehicleInspectionEntry = { row: InspectionListRow; state: InspectionState };

/**
 * One vehicle's safety inspections, for its card: when the next one is due,
 * a way to move that date, and every inspection it had, newest first.
 */
export function useVehicleInspections(companyId: string | null | undefined, vehicleId: string | null | undefined) {
  const [plan, setPlan] = useState<InspectionPlanRow | null>(null);
  const [entries, setEntries] = useState<VehicleInspectionEntry[] | null>(null);
  const [repeatMonths, setRepeatMonths] = useState(1);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (!companyId || !vehicleId) return;
    try {
      const [rows, planRows, settings] = await Promise.all([
        listInspections(companyId, vehicleId),
        loadInspectionPlan(companyId).catch(() => [] as InspectionPlanRow[]),
        getInspectionSettings(companyId).catch(() => ({ repeatMonths: 1, form: null })),
      ]);
      if (current !== generation.current) return;
      setEntries(rows.map((row) => ({ row, state: listStateOf(row) })));
      setPlan(planRows.find((p) => p.vehicleId === vehicleId) ?? null);
      setRepeatMonths(settings.repeatMonths);
      setError('');
    } catch (e) {
      if (current === generation.current) setError((e as Error)?.message || t('inspection.loadFailed'));
    }
  }, [companyId, vehicleId]);

  // Again on every return, e.g. back from an inspection just signed.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const move = useCallback(
    async (nextDue: string) => {
      if (!companyId || !vehicleId) return;
      await setNextInspectionDate(companyId, vehicleId, nextDue);
      setPlan((current) => (current ? { ...current, nextDue } : current));
      void reload();
    },
    [companyId, vehicleId, reload],
  );

  const draft = entries?.find((e) => e.state === 'draft')?.row ?? null;
  return { plan, entries, repeatMonths, error, draft, reload, move };
}
