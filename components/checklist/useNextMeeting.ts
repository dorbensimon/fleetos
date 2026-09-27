import { useCallback, useEffect, useRef, useState } from 'react';
import { readForm } from '../../lib/checklistForms';
import { loadMeetingPlan, setNextMeetingDate, type PlanRow } from '../../lib/meetingPlan';
import type { SigningTemplate } from '../../lib/docuseal';

/**
 * One driver's next meeting on one repeating form, for the driver's folder:
 * when it is due, and a way to move it. Null on a one-time form.
 */
export function useNextMeeting(companyId: string | null | undefined, template: SigningTemplate | null | undefined, driverId: string | null | undefined) {
  const repeatMonths = template?.form_kind === 'checklist' ? readForm(template.form_content)?.repeatMonths ?? 0 : 0;
  const [row, setRow] = useState<PlanRow | null>(null);
  const generation = useRef(0);
  const templateId = template?.id;

  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (!companyId || !templateId || !driverId || !repeatMonths) {
      setRow(null);
      return;
    }
    try {
      const rows = await loadMeetingPlan(companyId);
      if (current === generation.current) setRow(rows.find((r) => r.templateId === templateId && r.driverId === driverId) ?? null);
    } catch {
      // The folder still works; only the next date is missing.
    }
  }, [companyId, templateId, driverId, repeatMonths]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const move = useCallback(async (nextDue: string) => {
    if (!companyId || !templateId || !driverId) return;
    await setNextMeetingDate(companyId, templateId, driverId, nextDue);
    setRow((current) => (current ? { ...current, nextDue } : current));
    void reload();
  }, [companyId, templateId, driverId, reload]);

  return { repeatMonths, row, reload, move };
}
