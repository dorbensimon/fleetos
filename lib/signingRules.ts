import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { listSigningTemplates } from './docuseal';
import { isChecklistTemplate } from './checklistForms';
import type { LeadRule } from './notificationPreferencesApi';
import { errorMessage } from './requestError';
import { t } from './i18n';

/**
 * How long a driver's signature on each signing document stays good, and how
 * many days before the end the alert goes out (supabase/sql/105). Every
 * document of the company shows up here on its own; no row = never expires.
 * Checklist forms keep their own "repeat every".
 */

export interface SigningRuleRow {
  templateId: string;
  title: string;
  /** null: the signature never expires. */
  validMonths: number | null;
  leadDays: number;
}

export const VALIDITY_MONTHS = [0, 6, 12, 24, 36] as const;
export const SIGNING_LEAD_DEFAULT = 30;
export const SIGNING_LEAD_RULE: LeadRule = { unit: 'days', min: 1, max: 90, step: 1, presets: [7, 14, 30, 60] };

export function validityLabel(months: number | null): string {
  if (!months) return t('signingRules.noExpiry');
  if (months === 6) return t('signingRules.halfYear');
  if (months === 12) return t('signingRules.oneYear');
  if (months % 12 === 0) return t('signingRules.yearsValue', { value: months / 12 });
  return t('signingRules.monthsValue', { value: months });
}

export function useSigningRules(companyId: string | null, enabled: boolean) {
  const [rows, setRows] = useState<SigningRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !enabled) return;
    setError(null);
    try {
      const [templates, rules] = await Promise.all([
        listSigningTemplates(companyId),
        supabase.from('signing_template_rules').select('template_id, valid_months, lead_days').eq('company_id', companyId),
      ]);
      if (rules.error) throw rules.error;
      const byTemplate = new Map((rules.data ?? []).map((r) => [r.template_id as string, r]));
      setRows(templates.filter((tpl) => !isChecklistTemplate(tpl)).map((tpl) => {
        const rule = byTemplate.get(tpl.id);
        return { templateId: tpl.id, title: tpl.title, validMonths: rule?.valid_months ?? null, leadDays: rule?.lead_days ?? SIGNING_LEAD_DEFAULT };
      }));
    } catch (err) {
      setError(errorMessage(err, t('signingRules.loadFailed')));
    }
  }, [companyId, enabled]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (templateId: string, validMonths: number | null, leadDays: number): Promise<boolean> => {
    if (!companyId) return false;
    setSaving(templateId);
    const request = validMonths
      ? supabase.from('signing_template_rules').upsert(
          { company_id: companyId, template_id: templateId, valid_months: validMonths, lead_days: leadDays, updated_at: new Date().toISOString() },
          { onConflict: 'company_id,template_id' },
        )
      : supabase.from('signing_template_rules').delete().eq('company_id', companyId).eq('template_id', templateId);
    const { error: saveError } = await request;
    setSaving(null);
    if (saveError) {
      setError(errorMessage(saveError, t('signingRules.saveFailed')));
      return false;
    }
    setError(null);
    setRows((current) => current?.map((row) => (row.templateId === templateId ? { ...row, validMonths, leadDays } : row)) ?? null);
    return true;
  }, [companyId]);

  return { rows, error, saving, load, save };
}
