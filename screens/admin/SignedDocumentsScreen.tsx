import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { SignedDocumentsDesktopView } from '../../components/desktop/signing/SignedDocumentsDesktopView';
import { DText } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';

/**
 * The company's own signing documents, desktop only (reached from the sidebar):
 * a list of templates and the flow for creating a new one.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SignedDocuments'>;

export default function SignedDocumentsScreen(_props: Props) {
  const { company } = useCompany();
  const isDesktop = useIsDesktop();

  if (!isDesktop) {
    return (
      <View style={styles.mobileOnly}>
        <DText weight="semiBold" style={styles.mobileOnlyText}>מסמכים חתומים זמינים במחשב בלבד</DText>
      </View>
    );
  }

  return (
    <DesktopShell active="SignedDocuments" breadcrumbs={['ניהול', 'מסמכים חתומים']}>
      {company ? <SignedDocumentsDesktopView companyId={company.id} /> : null}
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  mobileOnly: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: DESKTOP_COLORS.canvas },
  mobileOnlyText: { fontSize: 15, textAlign: 'center' },
});
