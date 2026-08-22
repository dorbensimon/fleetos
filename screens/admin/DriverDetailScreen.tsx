import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, LoadingState, SecondaryButton } from '../../components/ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, expiryState, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, deleteDriver, DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * A5 — "כרטיס נהג": a compact identity summary up top, then a flat menu
 * of document/record categories below it. Each row opens the same
 * generic DocumentCategoryScreen scoped to its own category, rather
 * than eleven bespoke screens for what is really one shape repeated.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDetail'>;

type MenuItem = { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] };

const MENU: MenuItem[] = [
  { key: 'license_docs', label: 'מסמכי רישיון נהיגה', icon: 'card-outline' },
  { key: 'driver_file', label: 'תיק נהג', icon: 'folder-outline' },
  { key: 'notes_feedback', label: 'הערות לנהג ותגובות הנהג', icon: 'chatbubble-ellipses-outline' },
  { key: 'traffic_reports', label: 'דוחות תעבורה', icon: 'alert-circle-outline' },
  { key: 'procedure_6', label: 'נוהל 6', icon: 'shield-checkmark-outline' },
  { key: 'certifications', label: 'הסמכות והכשרות', icon: 'ribbon-outline' },
  { key: 'accompanying_drivers', label: 'נהגים נלווים', icon: 'people-outline' },
  { key: 'hazmat', label: 'חומרים מסוכנים', icon: 'warning-outline' },
  { key: 'trainings', label: 'הדרכות והכשרות', icon: 'school-outline' },
  { key: 'general', label: 'מסמכים כלליים', icon: 'document-text-outline' },
  { key: 'transport_info', label: 'מסמכי מידע תעבורתי', icon: 'information-circle-outline' },
];

export default function DriverDetailScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, company } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      'מחיקת נהג',
      `האם למחוק לצמיתות את ${driver?.full_name ?? 'הנהג'}? הפעולה אינה ניתנת לשחזור.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק לצמיתות',
          style: 'destructive',
          onPress: async () => {
            if (!companyId) return;
            setDeleting(true);
            const result = await deleteDriver(driverId, companyId);
            setDeleting(false);
            if (!result.ok) {
              Alert.alert('מחיקה נכשלה', result.error);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const d = await getDriver(driverId);
        if (active) {
          setDriver(d);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [driverId])
  );

  const openCategory = (item: MenuItem) => {
    navigation.navigate('DocumentCategory', {
      ownerType: 'driver',
      ownerId: driverId,
      category: item.key,
      title: item.label,
    });
  };

  const licenseState = expiryState(driver?.license_expiry);
  const licenseColor =
    licenseState === 'expired' ? COLORS.dangerText : licenseState === 'soon' ? COLORS.warnText : COLORS.okText;

  return (
    <Screen>
      <ScreenHeader
        title="כרטיס נהג"
        subtitle={driver?.full_name ?? undefined}
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete} disabled={deleting} hitSlop={8}>
              <Ionicons name="trash-outline" size={17} color={COLORS.dangerText} />
            </TouchableOpacity>
            <SecondaryButton
              label="עריכה"
              icon="pencil-outline"
              onPress={() => navigation.navigate('DriverForm', { driverId })}
            />
          </View>
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.summaryCard}>
            <View style={styles.avatar}>
              <AppText weight="bold" style={styles.avatarText}>
                {(driver?.full_name ?? '?').trim().charAt(0)}
              </AppText>
            </View>
            <View style={styles.summaryText}>
              <AppText weight="bold" style={styles.summaryName} numberOfLines={1}>
                {driver?.full_name ?? 'ללא שם'}
              </AppText>
              <AppText style={styles.summarySub} numberOfLines={1}>
                {[company?.name, driver?.national_id ? `ת.ז ${driver.national_id}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              <AppText style={styles.summarySub} numberOfLines={1}>
                {[driver?.phone, driver?.vehicle_plate ? `רכב ${driver.vehicle_plate}` : 'ללא רכב']
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
          </Card>

          <View style={styles.menuList}>
            {MENU.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuRow}
                activeOpacity={0.7}
                onPress={() => openCategory(item)}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon} size={17} color={COLORS.accent} />
                </View>
                <AppText weight="bold" style={styles.menuLabel} numberOfLines={1}>
                  {item.label}
                </AppText>
                {item.key === 'license_docs' && !!driver?.license_expiry && (
                  <View style={[styles.licenseBadge, { backgroundColor: `${licenseColor}1A` }]}>
                    <AppText weight="bold" style={[styles.licenseBadgeText, { color: licenseColor }]}>
                      {formatDate(driver.license_expiry)}
                    </AppText>
                  </View>
                )}
                <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 48 },

  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.sm },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, color: COLORS.accent },
  summaryText: { flex: 1, gap: 2 },
  summaryName: { fontSize: 16.5 },
  summarySub: { fontSize: 12.5, color: COLORS.textMuted },

  menuList: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  menuRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 14.5, color: COLORS.text, textAlign: 'right' },
  licenseBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  licenseBadgeText: { fontSize: 11 },
});
