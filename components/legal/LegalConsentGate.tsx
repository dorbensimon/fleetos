import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, DK, DKText, DriverPage, ErrorPanel, HeroTitle, ListRow, PrimaryAction, Reveal, Surface } from '../driverKit';
import { ConsentCheck } from './ConsentCheck';
import { BrandLogo } from '../ui/Brand';
import { BrandLoader } from '../ui/BrandLoader';
import { LegalDocumentBody, LEGAL_DOC_ICONS } from './LegalDocumentBody';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { hasAcceptedCurrentTerms, recordTermsAcceptance } from '../../lib/legal/acceptance';
import { LEGAL_DOCUMENTS, type LegalDocId } from '../../lib/legal/documents';

type State = 'checking' | 'accepted' | 'required' | 'error';

/**
 * Nobody signed in uses the app before accepting the terms of use and the
 * privacy policy — owner, manager or driver, on the phone and the desktop.
 * The screen appears once; a later version of the documents asks again.
 * Until accepted the app is hidden behind it, so no address or deep link
 * can get past it.
 */
export function LegalConsentGate({
  children,
  onAccepted,
}: {
  children: React.ReactNode;
  /** Runs after the acceptance is saved and before the app shows, e.g. to pick the user's home screen. */
  onAccepted?: (userId: string) => Promise<void>;
}) {
  const { profile } = useCompany();
  const userId = profile?.id ?? null;
  const [state, setState] = useState<State>('checking');
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  const check = useCallback(async (id: string) => {
    setState('checking');
    try {
      setState((await hasAcceptedCurrentTerms(id)) ? 'accepted' : 'required');
    } catch {
      setState('error');
    }
    setCheckedFor(id);
  }, []);

  useEffect(() => {
    if (userId && userId !== checkedFor) void check(userId);
  }, [userId, checkedFor, check]);

  // Once accepted, a later profile reload (same user) never hides the app.
  const blocked = !!userId && !(checkedFor === userId && state === 'accepted');
  const checking = checkedFor !== userId || state === 'checking';

  // The app stays mounted (hidden, so nothing in it can be reached) while the
  // terms are checked: unmounting it would rebuild the navigation from its
  // start, and right after signing in that is the login screen again.
  return (
    <>
      <View style={[styles.flex, blocked && styles.hidden]} aria-hidden={blocked}>
        {children}
      </View>
      {blocked && userId &&
        (checking ? (
          <View style={styles.boot}>
            <BrandLoader size={83} />
          </View>
        ) : (
          <ConsentScreen
            error={state === 'error'}
            onRetry={() => void check(userId)}
            onAccepted={async () => {
              await onAccepted?.(userId).catch(() => undefined);
              setState('accepted');
            }}
          />
        ))}
    </>
  );
}

function ConsentScreen({ error, onRetry, onAccepted }: { error: boolean; onRetry: () => void; onAccepted: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [reading, setReading] = useState<LegalDocId | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const accept = async () => {
    if (!terms || !privacy) return;
    setSaving(true);
    setSaveError(null);
    try {
      await recordTermsAcceptance();
    } catch {
      setSaveError('האישור לא נשמר. בדוק את החיבור לאינטרנט ונסה שוב.');
      setSaving(false);
      return;
    }
    await onAccepted();
  };

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut().catch(() => undefined);
    setSigningOut(false);
  };

  if (reading) {
    const doc = LEGAL_DOCUMENTS[reading];
    return (
      <DriverPage
        insetTop={insets.top}
        insetBottom={insets.bottom}
        hero={<HeroTitle title={doc.title} subtitle={`עודכן לאחרונה: ${doc.updated}`} onBack={() => setReading(null)} />}
        footer={<PrimaryAction label="חזרה לאישור" icon="arrow-forward" onPress={() => setReading(null)} />}
      >
        <LegalDocumentBody doc={doc} onOpenDoc={setReading} />
      </DriverPage>
    );
  }

  const ready = terms && privacy;

  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <View style={styles.hero}>
          <BrandLogo height={22} onDark />
          <DKText variant="display" color={DK.onNight} accessibilityRole="header" style={styles.heroTitle}>
            לפני שמתחילים
          </DKText>
          <DKText variant="body" color={DK.onNightMuted}>
            כדי להשתמש ב־icar צריך לקרוא ולאשר את תנאי השימוש ואת מדיניות הפרטיות. עושים את זה פעם אחת בלבד.
          </DKText>
        </View>
      }
      footer={
        error ? undefined : (
          <View style={styles.footer}>
            <PrimaryAction label="אישור והמשך" icon="checkmark" onPress={() => void accept()} loading={saving} disabled={!ready} />
            {!ready && (
              <DKText variant="caption" color={DK.muted} style={styles.center}>
                כדי להמשיך צריך לסמן את שני האישורים
              </DKText>
            )}
          </View>
        )
      }
    >
      {error ? (
        <ErrorPanel message="לא הצלחנו לבדוק את מצב האישור" hint="בדוק את החיבור לאינטרנט ונסה שוב." onRetry={onRetry} />
      ) : (
        <>
          <Reveal index={0}>
            <Surface>
              {(['terms', 'privacy'] as const).map((id, i) => (
                <ListRow
                  key={id}
                  first={i === 0}
                  icon={LEGAL_DOC_ICONS[id]}
                  title={LEGAL_DOCUMENTS[id].title}
                  subtitle={LEGAL_DOCUMENTS[id].summary}
                  onPress={() => setReading(id)}
                />
              ))}
            </Surface>
          </Reveal>

          <Reveal index={1}>
            <Surface style={styles.checks}>
              <ConsentCheck
                value={terms}
                onChange={setTerms}
                label="קראתי את תנאי השימוש ואני מסכים/ה להם, ואני בן/בת 18 ומעלה"
              />
              <View style={styles.rule} />
              <ConsentCheck
                value={privacy}
                onChange={setPrivacy}
                label="קראתי את מדיניות הפרטיות, ואני מסכים/ה שהמידע שלי יישמר וישמש כפי שמתואר בה"
              />
            </Surface>
          </Reveal>

          {!!saveError && (
            <Banner tone="expired" icon="alert-circle" title="האישור לא נשמר">
              {saveError}
            </Banner>
          )}

          <Reveal index={2}>
            <Surface>
              <ListRow first icon={LEGAL_DOC_ICONS.cookies} title={LEGAL_DOCUMENTS.cookies.title} subtitle="בלי עוגיות פרסום או מעקב" onPress={() => setReading('cookies')} />
              <ListRow icon={LEGAL_DOC_ICONS.accessibility} title={LEGAL_DOCUMENTS.accessibility.title} subtitle="ופרטי רכז הנגישות" onPress={() => setReading('accessibility')} />
            </Surface>
          </Reveal>

          <DKText variant="caption" color={DK.muted} style={styles.center}>
            בלי האישור אי אפשר להיכנס למערכת. לא מסכים/ה?
          </DKText>
          <PrimaryAction label="יציאה מהחשבון" icon="log-out-outline" tone="ghost" onPress={() => void signOut()} loading={signingOut} />
        </>
      )}
      {error && <PrimaryAction label="יציאה מהחשבון" icon="log-out-outline" tone="ghost" onPress={() => void signOut()} loading={signingOut} />}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  center: { textAlign: 'center' },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' },
  hero: { gap: 10, paddingTop: 8 },
  heroTitle: { marginTop: 10 },
  footer: { gap: 8 },
  checks: { paddingVertical: 4 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: DK.hairline, marginHorizontal: 16 },
});
