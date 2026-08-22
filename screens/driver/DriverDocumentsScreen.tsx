import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText } from '../../components/ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { DRIVER_DOCUMENT_CATEGORIES } from '../../lib/driverDocumentCategories';
import { RootStackParamList } from '../../navigation/types';

/**
 * U3 — "המסמכים שלי". Same category list and same DocumentCategoryScreen
 * the admin uses on the driver's card, so a document either side uploads
 * shows up for both.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDocuments'>;

export default function DriverDocumentsScreen({ navigation }: Props) {
  const { profile } = useCompany();

  return (
    <Screen>
      <ScreenHeader title="המסמכים שלי" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <View style={styles.menuList}>
          {DRIVER_DOCUMENT_CATEGORIES.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.menuRow}
              activeOpacity={0.7}
              onPress={() =>
                profile &&
                navigation.navigate('DocumentCategory', {
                  ownerType: 'driver',
                  ownerId: profile.id,
                  category: item.key,
                  title: item.label,
                })
              }
            >
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon} size={17} color={COLORS.accent} />
              </View>
              <AppText weight="bold" style={styles.menuLabel} numberOfLines={1}>
                {item.label}
              </AppText>
              <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg },
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
});
