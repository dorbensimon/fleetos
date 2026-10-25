// לשונית 'תוקפים' במסך ההתראות: מה פג ומה עומד לפוג, לפי תיקייה
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandLoader } from '../ui/BrandLoader';
import { DLtrText, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly } from './desktopTheme';
import { useCompany } from '../../lib/CompanyContext';
import { filterValidity, loadValidity, validityCsv, validityStatusText, type ValidityData, type ValidityOwner, type ValidityRow, type ValidityState } from '../../lib/validityList';
import { downloadRemoteFileOnWeb } from '../../lib/webDownload';
import { formatDate } from '../../lib/theme';
import { errorMessage } from '../../lib/requestError';
import { t, dirIcon } from '../../lib/i18n';

/**
 * Every dated folder of every vehicle and driver, as it stands right now:
 * pick vehicles or drivers, expired / about to expire / all, one or more
 * folders, search, export what is shown. A row opens that folder.
 * Shared by the desktop page and the phone screen.
 */
export function ValidityPanel({ onOpen, compact }: { onOpen: (row: ValidityRow) => void; compact?: boolean }) {
  const { companyId } = useCompany();
  const [data, setData] = useState<ValidityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState<ValidityOwner>('vehicle');
  const [state, setState] = useState<ValidityState>('expired');
  const [folderKeys, setFolderKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    try {
      setData(await loadValidity(companyId));
    } catch (e) {
      setError(errorMessage(e, t('common.tryAgain')));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const none = useMemo(() => new Set<string>(), []);
  const visible = useMemo(() => (data ? filterValidity(data.rows, { ownerType: owner, folderKeys, state, query }) : []), [data, owner, folderKeys, state, query]);
  // How many rows each chip would show, under the other filters.
  const countFor = (patch: { ownerType?: ValidityOwner; folderKeys?: Set<string>; state?: ValidityState }) =>
    data ? filterValidity(data.rows, { ownerType: owner, folderKeys, state, query, ...patch }).length : 0;
  const folders = (data?.folders ?? []).filter((f) => f.ownerType === owner);

  const pickOwner = (next: ValidityOwner) => { setOwner(next); setFolderKeys(new Set()); };
  const toggleFolder = (key: string) => setFolderKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const exportCsv = async () => {
    setExporting(true);
    const url = URL.createObjectURL(new Blob([validityCsv(visible, owner)], { type: 'text/csv;charset=utf-8' }));
    try {
      await downloadRemoteFileOnWeb(url, `${t('validity.fileName')} ${formatDate(new Date().toISOString()).replace(/\//g, '.')}.csv`);
    } finally {
      URL.revokeObjectURL(url);
      setExporting(false);
    }
  };

  if (error) {
    return (
      <View style={styles.state}>
        <DText style={styles.muted}>{error}</DText>
        <HoverPressable style={styles.ghost} hoverStyle={styles.ghostHover} onPress={() => void load()}>
          <DText weight="semiBold" style={styles.ghostText}>{t('common.tryAgain')}</DText>
        </HoverPressable>
      </View>
    );
  }
  if (!data) return <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>;

  const states: { key: ValidityState; label: string }[] = [
    { key: 'expired', label: t('status.expiredLong') },
    { key: 'soon', label: t('fleet.filter.aboutToExpire') },
    { key: 'all', label: t('validity.allDated') },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Segment
          items={[
            { key: 'vehicle', label: t('common.vehicles'), count: countFor({ ownerType: 'vehicle', folderKeys: none }) },
            { key: 'driver', label: t('common.drivers'), count: countFor({ ownerType: 'driver', folderKeys: none }) },
          ]}
          value={owner}
          onChange={pickOwner}
        />
        <Segment items={states.map((s) => ({ ...s, count: countFor({ state: s.key }) }))} value={state} onChange={setState} />
        <View style={[styles.search, compact && styles.searchFull]}>
          <Ionicons name="search" size={17} color={DESKTOP_COLORS.inkFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={owner === 'vehicle' ? t('validity.searchVehicles') : t('validity.searchDrivers')}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            style={styles.searchInput}
            accessibilityLabel={t('validity.search')}
          />
        </View>
        <HoverPressable
          style={[styles.ghost, (!visible.length || exporting) && styles.disabled]}
          hoverStyle={styles.ghostHover}
          onPress={visible.length && !exporting ? () => void exportCsv() : undefined}
          accessibilityLabel={t('validity.export')}
        >
          <Ionicons name="download-outline" size={17} color={DESKTOP_COLORS.brand} />
          <DText weight="semiBold" style={styles.ghostText}>{t('validity.export')}</DText>
        </HoverPressable>
      </View>

      <View style={styles.chips}>
        <Chip label={t('validity.allFolders')} count={countFor({ folderKeys: none })} active={!folderKeys.size} onPress={() => setFolderKeys(new Set())} />
        {folders.map((f) => {
          const count = countFor({ folderKeys: new Set([f.key]) });
          const active = folderKeys.has(f.key);
          // The phone hides empty folders, to save scrolling.
          if (compact && !count && !active) return null;
          return <Chip key={f.key} label={f.label} count={count} active={active} onPress={() => toggleFolder(f.key)} />;
        })}
      </View>

      <DText weight="semiBold" style={styles.total}>{t('validity.rowsCount', { count: visible.length })}</DText>

      {visible.length === 0 ? (
        <View style={styles.state}>
          <Ionicons name="checkmark-circle-outline" size={28} color={DESKTOP_TONES.ok.fg} />
          <DText style={styles.muted}>{t('validity.none')}</DText>
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((row, index) => {
            const tone = row.days < 0 ? DESKTOP_TONES.bad : row.days <= 30 ? DESKTOP_TONES.warn : DESKTOP_TONES.ok;
            return (
              <HoverPressable
                key={row.id}
                style={[styles.row, index > 0 && styles.rowBorder, compact && styles.rowCompact]}
                hoverStyle={styles.rowHover}
                onPress={() => onOpen(row)}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, ${row.folderLabel}, ${validityStatusText(row)}`}
              >
                <View style={styles.who}>
                  {row.ownerType === 'vehicle'
                    ? <DLtrText weight="bold" style={styles.name}>{row.name}</DLtrText>
                    : <DText weight="bold" style={styles.name}>{row.name}</DText>}
                  {!!(row.detail || row.department) && <DText style={styles.muted} numberOfLines={1}>{[row.detail, row.department].filter(Boolean).join(' · ')}</DText>}
                </View>
                <DText weight="semiBold" style={styles.folder} numberOfLines={1}>{row.folderLabel}</DText>
                <View style={styles.when}>
                  <DLtrText weight="semiBold" style={[styles.date, { color: tone.fg }]}>{formatDate(row.until)}</DLtrText>
                  <View style={[styles.tag, { backgroundColor: tone.bg }]}>
                    <DText weight="semiBold" style={[styles.tagText, { color: tone.fg }]}>{validityStatusText(row)}</DText>
                  </View>
                </View>
                <Ionicons name={dirIcon('chevron-back')} size={16} color={DESKTOP_COLORS.inkFaint} />
              </HoverPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// מתג של כמה אפשרויות
function Segment<T extends string>({ items, value, onChange }: { items: { key: T; label: string; count: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <HoverPressable
            key={item.key}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            hoverStyle={active ? undefined : styles.segmentItemHover}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${item.label}, ${item.count}`}
          >
            <DText weight="semiBold" style={[styles.segmentText, active && styles.onBrand]}>{item.label}</DText>
            <DText weight="semiBold" style={[styles.segmentCount, active && styles.onBrand]}>{item.count}</DText>
          </HoverPressable>
        );
      })}
    </View>
  );
}

// כפתור תיקייה
function Chip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <HoverPressable
      style={[styles.chip, active && styles.chipActive]}
      hoverStyle={active ? undefined : styles.chipHover}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <DText weight="semiBold" style={[styles.chipText, active && styles.onBrand]}>{label}</DText>
      <DText style={[styles.chipCount, active && styles.onBrand]}>{count}</DText>
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  toolbar: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  segment: { flexDirection: 'row-reverse', backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 12, padding: 3, gap: 2 },
  segmentItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  segmentItemActive: { backgroundColor: DESKTOP_COLORS.brand },
  segmentItemHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  segmentText: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  segmentCount: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  onBrand: { color: '#FFFFFF' },
  search: { flexGrow: 1, minWidth: 200, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  searchFull: { minWidth: '100%' as any },
  searchInput: { flex: 1, fontSize: 14, color: DESKTOP_COLORS.ink, fontFamily: DESKTOP_FONT.regular, textAlign: 'right', ...webOnly({ outlineStyle: 'none' }) },
  ghost: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: DESKTOP_COLORS.surface },
  ghostHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  ghostText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: DESKTOP_COLORS.surface },
  chipActive: { backgroundColor: DESKTOP_COLORS.brand, borderColor: DESKTOP_COLORS.brand },
  chipHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  chipText: { fontSize: 13, color: DESKTOP_COLORS.ink },
  chipCount: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  total: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  list: { backgroundColor: DESKTOP_COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: DESKTOP_COLORS.border, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowCompact: { flexWrap: 'wrap', gap: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  who: { flex: 2, minWidth: 150, gap: 2 },
  name: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  folder: { flex: 1.4, minWidth: 110, fontSize: 13.5, color: DESKTOP_COLORS.ink },
  when: { flex: 1.4, minWidth: 140, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  date: { fontSize: 13.5, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 12 },
  muted: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  state: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
});
