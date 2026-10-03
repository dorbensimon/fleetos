import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS } from './desktopTheme';
import { t } from '../../lib/i18n';
import type { FormReportsState } from '../reports/useFormReports';

/**
 * Desktop body of the reports screen: two export groups (drivers/vehicles),
 * each expanding inline into its category list instead of opening a
 * mobile-style bottom sheet — there's no gesture-driven sheet idiom on
 * desktop. Purely presentational — ReportsScreen owns export logic.
 */

type Category = { value: string; label: string; hint?: string; icon: string };

export function ReportsDesktopView({
  open,
  onToggle,
  driverCategories,
  vehicleCategories,
  forms,
  inspectionCategories,
  exportingCategory,
  onSelectDriverCategory,
  onSelectVehicleCategory,
  onSelectFormCategory,
  onGoToForms,
  onSelectInspectionCategory,
}: {
  open: 'drivers' | 'vehicles' | 'meetings' | 'inspections' | null;
  onToggle: (kind: 'drivers' | 'vehicles' | 'meetings' | 'inspections') => void;
  driverCategories: Category[];
  vehicleCategories: Category[];
  forms: FormReportsState;
  inspectionCategories: Category[];
  exportingCategory: string | null;
  onSelectDriverCategory: (value: string) => void;
  onSelectVehicleCategory: (value: string) => void;
  onSelectFormCategory: (value: string) => void;
  /** "מסמכים חתומים", where the forms are made. */
  onGoToForms: () => void;
  onSelectInspectionCategory: (value: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <DText style={styles.hint}>{t('reports.chooseType')}</DText>

      <ReportGroup
        icon="people-outline"
        title={t('reports.drivers')}
        subtitle={t('reports.driversHint')}
        open={open === 'drivers'}
        onPress={() => onToggle('drivers')}
        categories={driverCategories}
        exportingCategory={exportingCategory}
        onSelect={onSelectDriverCategory}
      />
      <ReportGroup
        icon="car-outline"
        title={t('reports.vehicles')}
        subtitle={t('reports.vehiclesHint')}
        open={open === 'vehicles'}
        onPress={() => onToggle('vehicles')}
        categories={vehicleCategories}
        exportingCategory={exportingCategory}
        onSelect={onSelectVehicleCategory}
      />
      <ReportGroup
        icon="clipboard-outline"
        title={t('reports.meetings')}
        subtitle={t('reports.meetingsHint')}
        open={open === 'meetings'}
        onPress={() => onToggle('meetings')}
        categories={forms.categories}
        exportingCategory={exportingCategory}
        onSelect={onSelectFormCategory}
        body={forms.form ? undefined : <FormList forms={forms} onGoToForms={onGoToForms} />}
        header={forms.form ? <FormHeader forms={forms} /> : undefined}
        error={forms.form ? forms.dataError : null}
        onRetry={() => void forms.retry()}
      />
      <ReportGroup
        icon="shield-checkmark-outline"
        title={t('reports.inspections')}
        subtitle={t('reports.inspectionsHint')}
        open={open === 'inspections'}
        onPress={() => onToggle('inspections')}
        categories={inspectionCategories}
        exportingCategory={exportingCategory}
        onSelect={onSelectInspectionCategory}
      />
    </View>
  );
}

/** Step one of "טפסים לנהגים": the company's forms. */
function FormList({ forms, onGoToForms }: { forms: FormReportsState; onGoToForms: () => void }) {
  if (forms.formsError) {
    return (
      <View style={styles.stateRow}>
        <DText style={styles.stateText}>{forms.formsError}</DText>
        <HoverPressable style={styles.linkButton} hoverStyle={styles.categoryRowHover} onPress={() => void forms.retry()}>
          <DText weight="semiBold" style={styles.link}>{t('common.tryAgain')}</DText>
        </HoverPressable>
      </View>
    );
  }
  if (!forms.forms) {
    return <View style={styles.stateRow}><BrandLoader size="small" color={DESKTOP_COLORS.brand} /></View>;
  }
  if (forms.forms.length === 0) {
    return (
      <View style={styles.stateRow}>
        <DText style={styles.stateText}>{t('reports.formsEmpty')}</DText>
        <HoverPressable style={styles.linkButton} hoverStyle={styles.categoryRowHover} onPress={onGoToForms}>
          <DText weight="semiBold" style={styles.link}>{t('reports.formsEmptyAction')}</DText>
        </HoverPressable>
      </View>
    );
  }
  return (
    <>
      <DText style={styles.pickHint}>{t('reports.pickForm')}</DText>
      {forms.forms.map((item) => (
        <HoverPressable key={item.id} style={styles.formRow} hoverStyle={styles.categoryRowHover} onPress={() => void forms.pick(item)}>
          <Ionicons name="clipboard-outline" size={15} color={DESKTOP_COLORS.inkMuted} />
          <View style={styles.groupCopy}>
            <DText weight="semiBold" style={styles.categoryLabel}>{item.title}</DText>
            <DText style={styles.groupSubtitle}>{forms.formSubtitle(item)}</DText>
          </View>
          <Ionicons name="chevron-back" size={15} color={DESKTOP_COLORS.inkFaint} />
        </HoverPressable>
      ))}
    </>
  );
}

/** Step two: the chosen form, with a way back when there are others. */
function FormHeader({ forms }: { forms: FormReportsState }) {
  return (
    <View style={styles.formHeader}>
      <View style={styles.groupCopy}>
        <DText weight="bold" style={styles.formTitle} numberOfLines={1}>{forms.form?.title}</DText>
        {forms.form && <DText style={styles.groupSubtitle}>{forms.formSubtitle(forms.form)}</DText>}
      </View>
      {forms.canGoBack && (
        <HoverPressable style={styles.linkButton} hoverStyle={styles.categoryRowHover} onPress={forms.back}>
          <Ionicons name="chevron-forward" size={14} color={DESKTOP_COLORS.brand} />
          <DText weight="semiBold" style={styles.link}>{t('reports.allForms')}</DText>
        </HoverPressable>
      )}
    </View>
  );
}

function ReportGroup({
  icon, title, subtitle, open, onPress, categories, exportingCategory, onSelect, body, header, error, onRetry,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  open: boolean;
  onPress: () => void;
  categories: (Category & { count?: number | null })[];
  exportingCategory: string | null;
  onSelect: (value: string) => void;
  /** Shown instead of the categories (the form list). */
  body?: React.ReactNode;
  /** Shown above the categories (the chosen form). */
  header?: React.ReactNode;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.group}>
      <HoverPressable style={styles.groupHeader} hoverStyle={styles.groupHeaderHover} onPress={onPress}>
        <View style={styles.groupIcon}>
          <Ionicons name={icon} size={19} color={DESKTOP_COLORS.brand} />
        </View>
        <View style={styles.groupCopy}>
          <DText weight="bold" style={styles.groupTitle}>{title}</DText>
          <DText style={styles.groupSubtitle}>{subtitle}</DText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={DESKTOP_COLORS.inkFaint} />
      </HoverPressable>

      {open && body ? (
        <View style={styles.categoryList}>{body}</View>
      ) : open && (
        <View style={styles.categoryList}>
          {header}
          {error ? (
            <View style={styles.stateRow}>
              <DText style={styles.stateText}>{error}</DText>
              <HoverPressable style={styles.linkButton} hoverStyle={styles.categoryRowHover} onPress={onRetry}>
                <DText weight="semiBold" style={styles.link}>{t('common.tryAgain')}</DText>
              </HoverPressable>
            </View>
          ) : categories.map((category) => {
            const exporting = exportingCategory === category.value;
            return (
              <HoverPressable
                key={category.value}
                style={styles.categoryRow}
                hoverStyle={styles.categoryRowHover}
                onPress={() => onSelect(category.value)}
                disabled={!!exportingCategory || category.count === null}
              >
                <Ionicons name={category.icon as never} size={15} color={DESKTOP_COLORS.inkMuted} />
                <DText style={styles.categoryLabel}>
                  {category.label}
                  {category.hint ? <DText style={styles.categoryHint}>{`  ·  ${category.hint}`}</DText> : null}
                </DText>
                {exporting ? (
                  <BrandLoader size="small" color={DESKTOP_COLORS.brand} />
                ) : category.count === null ? (
                  <BrandLoader size="small" color={DESKTOP_COLORS.inkFaint} />
                ) : category.count !== undefined ? (
                  <View style={[styles.count, category.count > 0 && (category.value === 'due' || category.value === 'unfinished') && styles.countHot]}>
                    <DText weight="semiBold" style={[styles.countText, category.count > 0 && (category.value === 'due' || category.value === 'unfinished') && styles.countTextHot]}>{category.count}</DText>
                  </View>
                ) : null}
              </HoverPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 14, maxWidth: 640 },
  hint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, marginBottom: 4 },

  group: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 60,
  },
  groupHeaderHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  groupIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCopy: { flex: 1, gap: 2 },
  groupTitle: { fontSize: 13.5 },
  groupSubtitle: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },

  categoryList: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  categoryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 40,
  },
  categoryRowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  categoryLabel: { flex: 1, fontSize: 12.5 },
  categoryHint: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },

  count: { minWidth: 24, height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: DESKTOP_COLORS.borderSoft, alignItems: 'center', justifyContent: 'center' },
  countHot: { backgroundColor: '#FFF1DC' },
  countText: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted },
  countTextHot: { color: '#9A5B00' },
  stateRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8, alignItems: 'flex-end' },
  stateText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'right' },
  pickHint: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, textAlign: 'right' },
  formRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52, paddingVertical: 8 },
  formHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  formTitle: { fontSize: 13, textAlign: 'right' },
  linkButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 30, borderRadius: 6 },
  link: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
});
