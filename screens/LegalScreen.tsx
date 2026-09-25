import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverPage, HeroTitle } from '../components/driverKit';
import { LegalDocumentBody } from '../components/legal/LegalDocumentBody';
import { LEGAL_DOCUMENTS, isLegalDocId } from '../lib/legal/documents';
import { resolveRouteForUser } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

/**
 * A legal page — terms, privacy, cookies or the accessibility statement.
 * Reachable by address (/legal/privacy) without signing in, from the login
 * screen, and from the menu. One reading layout on the phone and desktop.
 */
export default function LegalScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const doc = LEGAL_DOCUMENTS[isLegalDocId(route.params?.doc) ? route.params.doc : 'privacy'];

  // Opened by address there is nothing to go back to: go to the user's home,
  // or to the login screen when nobody is signed in.
  const back = async () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const result = userId ? await resolveRouteForUser(userId) : null;
    navigation.reset({ index: 0, routes: [{ name: result?.ok ? result.route : 'Login' } as never] });
  };

  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={<HeroTitle title={doc.title} subtitle={`${doc.summary}\nעודכן לאחרונה: ${doc.updated}`} onBack={() => void back()} />}
    >
      <LegalDocumentBody doc={doc} onOpenDoc={(id) => navigation.push('Legal', { doc: id })} />
    </DriverPage>
  );
}
