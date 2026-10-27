// בחירת החברה שהמנהל נכנס אליה
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from '../components/desktop/primitives';
import { DESKTOP_COLORS, webOnly } from '../components/desktop/desktopTheme';
import { CARD_SHADOW, pageStyles } from '../components/desktop/record/RecordPage';
import { useCompany } from '../lib/CompanyContext';
import { MyCompany, lastUsedCompanyId, loadMyCompanies, reopenInActiveCompany, switchCompany } from '../lib/companySwitch';
import { signOut } from '../lib/signOut';
import { showAlert } from '../lib/platformAlert';
import type { RootStackParamList } from '../navigation/types';
import { t, dirIcon } from '../lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyPicker'>;

// Above this many companies the list gets a search field.
const SEARCH_FROM = 7;

// המסך
/**
 * Shown to every manager right after signing in (one card when they have one
 * company) and from "החלפת חברה" in the system settings. Picking a card
 * enters that company: the server checks the membership, then the site starts
 * over in it.
 */
export default function CompanyPickerScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profile, companyId, refresh } = useCompany();
  const [companies, setCompanies] = useState<MyCompany[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [entering, setEntering] = useState<string | null>(null);
  const canGoBack = navigation.canGoBack();

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setCompanies(await loadMyCompanies());
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const lastUsed = useMemo(() => (companies ? lastUsedCompanyId(companies) : null), [companies]);
  const shown = useMemo(() => {
    const q = query.trim();
    return (companies ?? []).filter((c) => !q || c.name.includes(q));
  }, [companies, query]);
  const anyActive = (companies ?? []).some((c) => c.status === 'active');

  const enter = async (company: MyCompany) => {
    if (entering || company.status !== 'active') return;
    // From the settings, the current company is already open: just go back.
    if (company.is_current && canGoBack) {
      navigation.goBack();
      return;
    }
    setEntering(company.id);
    try {
      await switchCompany(company.id, companyId);
      if (reopenInActiveCompany()) return;
      await refresh();
      navigation.reset({ index: 0, routes: [{ name: 'AdminHome' }] });
    } catch {
      setEntering(null);
      showAlert(t('companyPicker.switchFailed'));
      void load();
    }
  };

  const leave = async () => {
    try {
      await signOut();
    } catch {
      showAlert(t('auth.signOutFailed'), t('common.tryAgainShortly'));
    }
  };

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.column}>
        <View style={[pageStyles.hero, pageStyles.heroNight, pageStyles.enter]}>
          <View style={[pageStyles.heroGlow, pageStyles.heroGlowBlue, { pointerEvents: 'none' }]} />
          <View style={[pageStyles.heroGlow, pageStyles.heroGlowCyan, { pointerEvents: 'none' }]} />
          <View style={styles.heroIcon}>
            <Ionicons name="business" size={22} color="#FFFFFF" />
          </View>
          <View style={pageStyles.heroIdentity}>
            <DText weight="bold" style={[pageStyles.heroName, pageStyles.heroNameOnDark]} accessibilityRole="header">{t('companyPicker.title')}</DText>
            <DText style={[pageStyles.heroSubText, pageStyles.heroSubTextOnDark]}>
              {firstName ? t('companyPicker.greeting', { name: firstName }) : t('companyPicker.greetingNoName')}
            </DText>
          </View>
          {canGoBack ? (
            <HoverPressable style={styles.heroButton} hoverStyle={styles.heroButtonHover} onPress={() => navigation.goBack()} accessibilityRole="button">
              <DText weight="medium" style={styles.heroButtonText}>{t('common.cancel')}</DText>
            </HoverPressable>
          ) : (
            <HoverPressable style={styles.heroButton} hoverStyle={styles.heroButtonHover} onPress={leave} accessibilityRole="button">
              <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
              <DText weight="medium" style={styles.heroButtonText}>{t('auth.signOut')}</DText>
            </HoverPressable>
          )}
        </View>

        {loadError ? (
          <View style={styles.notice}>
            <DText style={styles.noticeText}>{t('companyPicker.loadFailed')}</DText>
            <HoverPressable style={styles.retry} hoverStyle={styles.retryHover} onPress={load} accessibilityRole="button">
              <DText weight="medium" style={styles.retryText}>{t('common.tryAgain')}</DText>
            </HoverPressable>
          </View>
        ) : !companies ? (
          <ActivityIndicator style={styles.loader} color={DESKTOP_COLORS.brand} />
        ) : !anyActive ? (
          <View style={styles.notice}>
            <Ionicons name="lock-closed-outline" size={22} color={DESKTOP_COLORS.inkMuted} />
            <DText style={styles.noticeText}>{t('companyPicker.noneActive')}</DText>
          </View>
        ) : (
          <>
            {companies.length >= SEARCH_FROM && (
              <View style={styles.search}>
                <Ionicons name="search" size={16} color={DESKTOP_COLORS.inkFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('companyPicker.search')}
                  placeholderTextColor={DESKTOP_COLORS.inkFaint}
                  style={styles.searchInput}
                  accessibilityLabel={t('companyPicker.search')}
                />
              </View>
            )}
            {shown.length === 0 && <DText style={styles.empty}>{t('companyPicker.noResults')}</DText>}
            <View style={styles.list}>
              {shown.map((company) => {
                const inactive = company.status !== 'active';
                const tag = inactive
                  ? t('companyPicker.inactive')
                  : company.is_current && canGoBack
                    ? t('companyPicker.current')
                    : company.id === lastUsed && companies.length > 1
                      ? t('companyPicker.lastUsed')
                      : null;
                return (
                  <HoverPressable
                    key={company.id}
                    style={[styles.card, inactive && styles.cardInactive]}
                    hoverStyle={inactive ? undefined : styles.cardHover}
                    onPress={() => enter(company)}
                    disabled={inactive || !!entering}
                    accessibilityRole="button"
                    accessibilityLabel={company.name}
                    accessibilityState={{ disabled: inactive }}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons name="business-outline" size={18} color={inactive ? DESKTOP_COLORS.inkFaint : DESKTOP_COLORS.brand} />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardTitleRow}>
                        <DText weight="bold" style={[styles.cardName, inactive && styles.textInactive]} numberOfLines={1}>{company.name}</DText>
                        {tag && (
                          <View style={[styles.tag, inactive && styles.tagInactive]}>
                            <DText weight="medium" style={[styles.tagText, inactive && styles.tagTextInactive]}>{tag}</DText>
                          </View>
                        )}
                      </View>
                      <View style={styles.counts}>
                        <View style={styles.count}>
                          <Ionicons name="car-outline" size={13} color={DESKTOP_COLORS.inkMuted} />
                          <DText style={styles.countText}>{t('companyPicker.vehicles', { count: company.vehicles })}</DText>
                        </View>
                        <View style={styles.count}>
                          <Ionicons name="people-outline" size={13} color={DESKTOP_COLORS.inkMuted} />
                          <DText style={styles.countText}>{t('companyPicker.drivers', { count: company.drivers })}</DText>
                        </View>
                      </View>
                    </View>
                    {entering === company.id ? (
                      <ActivityIndicator size="small" color={DESKTOP_COLORS.brand} />
                    ) : !inactive ? (
                      <Ionicons name={dirIcon('chevron-back')} size={16} color={DESKTOP_COLORS.inkFaint} />
                    ) : null}
                  </HoverPressable>
                );
              })}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DESKTOP_COLORS.canvas },
  content: { paddingHorizontal: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: 880, gap: 16 },
  heroIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  heroButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroButtonHover: { backgroundColor: 'rgba(255,255,255,0.2)' },
  heroButtonText: { fontSize: 13.5, color: '#FFFFFF' },
  loader: { marginTop: 32 },
  notice: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 14, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  noticeText: { fontSize: 14.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  retry: { height: 34, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', backgroundColor: DESKTOP_COLORS.brand },
  retryHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  retryText: { color: '#FFFFFF', fontSize: 13.5 },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput },
  searchInput: { flex: 1, fontSize: 14.5, color: DESKTOP_COLORS.ink, textAlign: 'right', ...webOnly({ outlineStyle: 'none' }) },
  empty: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', paddingVertical: 12 },
  list: { gap: 10 },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: CARD_SHADOW, transition: 'border-color 150ms ease, background-color 150ms ease' }),
  },
  cardHover: { borderColor: DESKTOP_COLORS.brand, backgroundColor: '#FBFCFF' },
  cardInactive: { backgroundColor: DESKTOP_COLORS.surfaceMuted },
  cardIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(47,91,255,0.08)' },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  cardTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 16, color: DESKTOP_COLORS.ink, flexShrink: 1 },
  textInactive: { color: DESKTOP_COLORS.inkFaint },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(47,91,255,0.1)' },
  tagText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  tagInactive: { backgroundColor: '#EEF1F4' },
  tagTextInactive: { color: DESKTOP_COLORS.inkMuted },
  counts: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  count: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  countText: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
});
