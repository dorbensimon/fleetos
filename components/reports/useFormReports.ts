import { useCallback, useMemo, useRef, useState } from 'react';
import type { DriverRow } from '../../lib/adminApi';
import {
  formReportCategories,
  formReportCount,
  listReportForms,
  loadFormReportData,
  selectFormReport,
  type FormReportCategory,
  type FormReportData,
  type ReportForm,
} from '../../lib/meetingReport';
import { repeatLabel, todayIso } from '../../lib/checklistForms';
import { formatDate } from '../../lib/theme';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

export type FormReportsState = ReturnType<typeof useFormReports>;

/**
 * "טפסים לנהגים" in the reports: first the company's checklist forms, then
 * the chosen form's reports with how many rows each one has. Shared by the
 * desktop reports screen, the dashboard's reports window and the phone.
 */
export function useFormReports(companyId: string | null | undefined, drivers: DriverRow[]) {
  const [forms, setForms] = useState<ReportForm[] | null>(null);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [form, setForm] = useState<ReportForm | null>(null);
  const [data, setData] = useState<FormReportData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  // Ignores an answer that arrives after another form was picked.
  const picked = useRef<string | null>(null);

  const pick = useCallback(async (next: ReportForm) => {
    if (!companyId) return;
    picked.current = next.id;
    setForm(next);
    setData(null);
    setDataError(null);
    try {
      const loaded = await loadFormReportData(companyId, next);
      if (picked.current === next.id) setData(loaded);
    } catch (e) {
      if (picked.current === next.id) setDataError(errorMessage(e, t('reports.loadFailed')));
    }
  }, [companyId]);

  const back = useCallback(() => {
    picked.current = null;
    setForm(null);
    setData(null);
    setDataError(null);
  }, []);

  /**
   * Loads the forms afresh (a form made a minute ago shows up). Stays on the
   * chosen form when `keepForm` and it still exists; a single form opens at once.
   */
  const open = useCallback(async (keepForm = true) => {
    if (!companyId) return;
    const current = keepForm ? picked.current : null;
    if (!keepForm) back();
    setFormsError(null);
    try {
      const list = await listReportForms(companyId);
      setForms(list);
      // The user picked a form while the list loaded: leave their choice.
      if (picked.current !== current) return;
      const next = list.find((item) => item.id === current) ?? (list.length === 1 ? list[0] : null);
      if (next) void pick(next);
      else back();
    } catch (e) {
      setFormsError(errorMessage(e, t('reports.loadFailed')));
    }
  }, [companyId, pick, back]);

  const categories = useMemo(() => {
    if (!form) return [];
    const today = todayIso();
    return formReportCategories(form).map((category) => ({
      ...category,
      count: data ? formReportCount(category.value, selectFormReport(category.value, form, data, drivers, today)) : null,
    }));
  }, [form, data, drivers]);

  /** Under each form's name: how often, and the date it was made when two share a name. */
  const formSubtitle = useCallback((item: ReportForm) => {
    const often = item.repeatMonths > 0 ? t('meeting.repeatLabel', { repeatMonths: repeatLabel(item.repeatMonths) }) : t('frequency.once');
    const twin = (forms ?? []).some((other) => other.id !== item.id && other.title.trim() === item.title.trim());
    return twin ? `${often} · ${t('signing.createdOnV1', { v1: formatDate(item.createdAt) })}` : often;
  }, [forms]);

  return {
    forms,
    formsError,
    form,
    data,
    dataError,
    categories,
    open,
    pick,
    back,
    retry: () => (form ? pick(form) : open()),
    formSubtitle,
    /** Back to the list is offered only when there is more than one form. */
    canGoBack: (forms?.length ?? 0) > 1,
  };
}

export type { FormReportCategory };
