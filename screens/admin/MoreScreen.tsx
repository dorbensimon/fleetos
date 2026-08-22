import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText, Card } from '../../components/ui';
import { COLORS, SPACING, TYPO } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

/**
 * The catch-all admin tab: things that don't warrant their own bottom
 * tab yet (maintenance, invoices, alerts, suppliers, reports — A6/A7/A9-
 * A16 from the spec) will get entries here as they're built.
 */
export default function MoreScreen() {
  const { company, profile } = useCompany();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const logout = async () => {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText weight="bold" style={TYPO.screenTitle}>
          עוד
        </AppText>
      </View>

      <View style={styles.content}>
        <Card style={styles.profileCard}>
          <AppText weight="bold" style={styles.companyName}>
            {company?.name ?? '—'}
          </AppText>
          <AppText style={styles.email}>{profile?.full_name ?? ''}</AppText>
        </Card>

        <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={logout}>
          <Ionicons name="log-out-outline" size={19} color={COLORS.dangerText} />
          <AppText weight="bold" style={styles.rowTextDanger}>
            התנתקות
          </AppText>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 56,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.card,
  },
  content: { padding: SPACING.lg, gap: SPACING.md },
  profileCard: { gap: 4 },
  companyName: { fontSize: 16 },
  email: { fontSize: 12.5, color: COLORS.textMuted },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: SPACING.lg,
  },
  rowTextDanger: { color: COLORS.dangerText, fontSize: 14.5 },
});
