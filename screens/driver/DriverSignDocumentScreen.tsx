import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Banner, DK, DKText, DriverPage, HeroTitle, PrimaryAction, Reveal, Surface } from '../../components/driverKit';
import { SignaturePad } from '../../components/checklist/SignaturePad';
import { useToast } from '../../components/ui';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { submitDriverSignature } from '../../lib/docuseal';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverSignDocument'>;

/**
 * A document that only needs the driver's signature, signed on the same pad
 * the manager signs a meeting on: read it, sign in the box, send.
 * Documents with other things to fill in open in DocuSeal's form instead
 * (see `open` in DriverSigningDocumentsScreen).
 */
export default function DriverSignDocumentScreen({ navigation, route }: Props) {
  const { requestId, title, documentUrl } = route.params;
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { showToast } = useToast();
  const [signature, setSignature] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const read = () => {
    if (!documentUrl) return;
    navigation.navigate('DocusealWebView', { mode: 'document', title, src: documentUrl });
  };

  const send = async () => {
    if (!signature || sending) return;
    setSending(true);
    setError('');
    try {
      await submitDriverSignature(requestId, signature);
      showToast('המסמך נחתם ונשלח');
      navigation.reset({ index: 1, routes: [{ name: 'DriverHome' }, { name: 'DriverSigningDocuments' }] });
    } catch (err: any) {
      setError(err?.message || 'שמירת החתימה נכשלה. נסו שוב.');
      setSending(false);
    }
  };

  const page = (
    <DriverPage
      insetTop={isDesktop ? 0 : insets.top}
      insetBottom={isDesktop ? 0 : insets.bottom}
      scrollEnabled={!drawing}
      hero={<HeroTitle title={title} subtitle="חתימה על המסמך" onBack={() => navigation.goBack()} />}
      footer={
        <PrimaryAction
          label="חתימה ושליחה"
          icon="checkmark"
          onPress={() => void send()}
          loading={sending}
          disabled={!signature}
        />
      }
    >
      {!!error && <Banner tone="expired">{error}</Banner>}
      {!!documentUrl && (
        <Reveal>
          <Surface style={styles.block}>
            <View style={styles.readRow}>
              <View style={styles.icon}>
                <Ionicons name="document-text" size={24} color={DK.accent} />
              </View>
              <View style={styles.flex}>
                <DKText variant="label">קודם קוראים את המסמך</DKText>
                <DKText variant="caption" color={DK.muted}>
                  אחר כך חוזרים לכאן וחותמים.
                </DKText>
              </View>
            </View>
            <PrimaryAction label="קריאת המסמך" icon="eye-outline" tone="ghost" onPress={read} disabled={sending} />
          </Surface>
        </Reveal>
      )}
      <Reveal index={1}>
        <Surface style={styles.block}>
          <SignaturePad title="החתימה שלך" onChange={setSignature} onDrawing={setDrawing} disabled={sending} />
          <DKText variant="caption" color={DK.muted}>
            החתימה נכנסת למסמך ונשלחת למנהל הצי. היא לא נשמרת במכשיר.
          </DKText>
        </Surface>
      </Reveal>
    </DriverPage>
  );

  return isDesktop ? (
    <DesktopShell active="DriverSigningDocuments" breadcrumbs={['מסמכים לחתימה', title]}>
      {page}
    </DesktopShell>
  ) : (
    page
  );
}

const styles = StyleSheet.create({
  block: { padding: 16, gap: 12 },
  readRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 15, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
