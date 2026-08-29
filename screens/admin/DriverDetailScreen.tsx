import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, Pressable, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, PressableCard, LoadingState, ErrorState, PrimaryButton } from '../../components/ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, expiryState, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, deleteDriver, resetDriverPassword, DriverRow } from '../../lib/adminApi';
import { DRIVER_DOCUMENT_CATEGORIES, DriverDocCategory } from '../../lib/driverDocumentCategories';
import { formatPlate } from '../../lib/plate';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';

/**
 * A5 — "כרטיס נהג": a compact identity summary up top, then a flat menu
 * of document/record categories below it. Each row opens the same
 * generic DocumentCategoryScreen scoped to its own category, rather
 * than eleven bespoke screens for what is really one shape repeated.
 * The category list is shared with the driver's own "המסמכים שלי" menu.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDetail'>;

const MENU = DRIVER_DOCUMENT_CATEGORIES;

export default function DriverDetailScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, company } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const closeReset = () => {
    setResetOpen(false);
    setResetPassword('');
    setResetConfirm('');
    setResetError('');
  };

  const submitReset = async () => {
    if (!companyId) return;
    if (resetPassword.length < 6) {
      setResetError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('הסיסמאות אינן תואמות');
      return;
    }
    setResetError('');
    setResetting(true);
    const result = await resetDriverPassword(driverId, companyId, resetPassword);
    setResetting(false);
    if (!result.ok) {
      setResetError(result.error);
      return;
    }
    closeReset();
    Alert.alert('הסיסמה אופסה', 'הנהג יתבקש לקבוע סיסמה קבועה משלו בכניסה הבאה.');
  };

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await getDriver(driverId);
      setDriver(d);
    } catch (err: any) {
      setLoadError(err?.message ?? 'טעינת הנהג נכשלה');
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCategory = (item: DriverDocCategory) => {
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
      <ScreenHeader title="כרטיס נהג" subtitle={driver?.full_name ?? undefined} onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <PressableCard
            style={styles.summaryCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DriverPersonalDetails', { driverId })}
          >
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
                {[
                  driver?.phone ? formatPhone(driver.phone) : null,
                  driver?.vehicle_plate ? `רכב ${formatPlate(driver.vehicle_plate)}` : 'ללא רכב',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
            <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
          </PressableCard>

          <View style={styles.menuList}>
            {MENU.flatMap((item) => [
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
              </TouchableOpacity>,
              ...(item.key === 'license_docs'
                ? [
                    <TouchableOpacity
                      key="signed_documents"
                      style={styles.menuRow}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('DriverSigningDocuments', { driverId })}
                    >
                      <View style={styles.menuIcon}>
                        <Ionicons name="create-outline" size={17} color={COLORS.accent} />
                      </View>
                      <AppText weight="bold" style={styles.menuLabel} numberOfLines={1}>
                        מסמכים לחתימה ומסמכים חתומים
                      </AppText>
                      <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
                    </TouchableOpacity>,
                  ]
                : []),
            ])}

            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('DriverForm', { driverId })}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="pencil-outline" size={17} color={COLORS.accent} />
              </View>
              <AppText weight="bold" style={styles.menuLabel} numberOfLines={1}>
                עריכת פרטי הנהג
              </AppText>
              <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7} onPress={() => setResetOpen(true)}>
              <View style={styles.menuIcon}>
                <Ionicons name="key-outline" size={17} color={COLORS.accent} />
              </View>
              <AppText weight="bold" style={styles.menuLabel} numberOfLines={1}>
                איפוס סיסמה לנהג
              </AppText>
              <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.7}
              onPress={confirmDelete}
              disabled={deleting}
            >
              <View style={[styles.menuIcon, styles.menuIconDanger]}>
                <Ionicons name="trash-outline" size={17} color={COLORS.dangerText} />
              </View>
              <AppText weight="bold" style={[styles.menuLabel, styles.menuLabelDanger]} numberOfLines={1}>
                מחיקת נהג
              </AppText>
            </TouchableOpacity>
          </View>

          {!!driver?.created_at && (
            <AppText style={styles.joinedText}>
              הצטרף לאפליקציה בתאריך {formatDate(driver.created_at)}
            </AppText>
          )}
        </ScrollView>
      )}

      <Modal visible={resetOpen} transparent animationType="fade" onRequestClose={closeReset}>
        <Pressable style={styles.resetOverlay} onPress={closeReset}>
          <Pressable style={styles.resetModal} onPress={(e) => e.stopPropagation()}>
            <AppText weight="bold" style={styles.resetTitle}>
              איפוס סיסמה
            </AppText>
            <AppText style={styles.resetSubtitle}>
              קביעת סיסמה חדשה עבור {driver?.full_name ?? 'הנהג'}. הוא יתבקש לקבוע סיסמה קבועה משלו
              בכניסה הבאה, ולא יוכל להתחבר לפני כן.
            </AppText>

            <TextInput
              style={styles.resetInput}
              value={resetPassword}
              onChangeText={setResetPassword}
              placeholder="סיסמה חדשה (לפחות 6 תווים)"
              placeholderTextColor={COLORS.textFaint}
              secureTextEntry
              autoCapitalize="none"
              textAlign="left"
            />
            <TextInput
              style={styles.resetInput}
              value={resetConfirm}
              onChangeText={setResetConfirm}
              placeholder="אימות סיסמה"
              placeholderTextColor={COLORS.textFaint}
              secureTextEntry
              autoCapitalize="none"
              textAlign="left"
            />

            {!!resetError && <AppText style={styles.resetError}>{resetError}</AppText>}

            <View style={styles.resetActions}>
              <TouchableOpacity style={styles.resetCancel} onPress={closeReset} disabled={resetting}>
                <AppText weight="bold" style={styles.resetCancelText}>
                  ביטול
                </AppText>
              </TouchableOpacity>
              <PrimaryButton
                label="אפס סיסמה"
                onPress={submitReset}
                loading={resetting}
                style={styles.resetConfirmBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 48 },

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
  menuIconDanger: { backgroundColor: COLORS.dangerBg },
  menuLabelDanger: { color: COLORS.dangerText },
  licenseBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  licenseBadgeText: { fontSize: 11 },
  joinedText: { fontSize: 12, color: COLORS.textFaint, textAlign: 'center', marginTop: 4 },

  resetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  resetModal: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  resetTitle: { fontSize: 16.5, color: COLORS.text, textAlign: 'right' },
  resetSubtitle: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'right', lineHeight: 18 },
  resetInput: {
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    backgroundColor: COLORS.field,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  resetError: { fontSize: 12.5, color: COLORS.dangerText, textAlign: 'center' },
  resetActions: { flexDirection: 'row-reverse', gap: SPACING.sm, marginTop: SPACING.xs },
  resetCancel: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetCancelText: { fontSize: 14, color: COLORS.text },
  resetConfirmBtn: { flex: 1.4 },
});
