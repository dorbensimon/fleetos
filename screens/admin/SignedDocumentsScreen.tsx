import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverPage, EmptyPanel, HeroTitle } from '../../components/driverKit';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { SignedDocumentsDesktopView } from '../../components/desktop/signing/SignedDocumentsDesktopView';

/**
 * The company's own signing documents, desktop only (reached from the sidebar):
 * a list of templates and the flow for creating a new one.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SignedDocuments'>;

export default function SignedDocumentsScreen({ navigation }: Props) {
  const { company } = useCompany();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();

  // Building a form (placing signature fields on a page) needs a big screen.
  if (!isDesktop) {
    return (
      <DriverPage insetTop={insets.top} insetBottom={insets.bottom} hero={<HeroTitle title="תבניות לחתימה" subtitle="יצירה ועריכה של טפסים" onBack={() => navigation.goBack()} />}>
        <EmptyPanel
          icon="desktop-outline"
          title="עורכים את זה במחשב"
          body="יצירת טופס ומיקום שדות החתימה דורשים מסך גדול. היכנסו ל־icar-app.com מהמחשב. שליחת טופס לנהג אפשרית גם מכאן — מתוך תיק הנהג."
        />
      </DriverPage>
    );
  }

  return (
    <DesktopShell active="SignedDocuments" breadcrumbs={['ניהול', 'מסמכים חתומים']}>
      {company ? <SignedDocumentsDesktopView companyId={company.id} /> : null}
    </DesktopShell>
  );
}
