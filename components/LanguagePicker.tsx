import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLanguage, LANGUAGES, t, type Language } from '../lib/i18n';
import { setUserLanguage } from '../lib/i18n/userLanguage';
import { DK, DK_SPACE, DKText, KitSection, Pressy } from './driverKit';
import { DText, HoverPressable } from './desktop/primitives';
import { DESKTOP_COLORS } from './desktop/desktopTheme';

/**
 * The user's own language choice, in system settings. Each language
 * is shown in its own name. The choice is kept on this device and on the
 * user's account, so it follows them to every device they sign in on.
 */
function useLanguageChoice() {
  const [pending, setPending] = useState<Language | null>(null);
  const current = getLanguage();
  const choose = (language: Language) => {
    if (language === current || pending) return;
    setPending(language);
    void setUserLanguage(language).finally(() => setPending(null));
  };
  return { current, pending, choose };
}

function Trailing({ selected, busy, color }: { selected: boolean; busy: boolean; color: string }) {
  if (busy) return <ActivityIndicator size="small" color={color} />;
  return selected ? <Ionicons name="checkmark" size={20} color={color} /> : null;
}

/** Phone layout: a section in the system settings screen. */
export function LanguageSection() {
  const { current, pending, choose } = useLanguageChoice();
  return (
    <KitSection title={t('settings.language')}>
      <View>
        {LANGUAGES.map((language, index) => {
          const selected = language.code === current;
          return (
            <Pressy
              key={language.code}
              onPress={() => choose(language.code)}
              accessibilityLabel={selected ? language.nativeName + t('common.selectedSuffix') : language.nativeName}
              pressScale={0.985}
            >
              <View style={[styles.mobileRow, index > 0 && styles.mobileRowDivider]}>
                <DKText variant="label" color={selected ? DK.accent : DK.ink} style={styles.flex}>
                  {language.nativeName}
                </DKText>
                <Trailing selected={selected} busy={pending === language.code} color={DK.accent} />
              </View>
            </Pressy>
          );
        })}
      </View>
    </KitSection>
  );
}

/** Desktop layout: the rows of a card in the system settings page. */
export function LanguageRows() {
  const { current, pending, choose } = useLanguageChoice();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('settings.language')}>
      {LANGUAGES.map((language, index) => {
        const selected = language.code === current;
        return (
          <HoverPressable
            key={language.code}
            style={[styles.row, index > 0 && styles.rowDivider]}
            hoverStyle={styles.rowHover}
            onPress={() => choose(language.code)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <DText weight={selected ? 'bold' : 'medium'} style={[styles.label, selected && styles.labelSelected]}>
              {language.nativeName}
            </DText>
            <Trailing selected={selected} busy={pending === language.code} color={DESKTOP_COLORS.brand} />
          </HoverPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mobileRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: DK_SPACE.md },
  mobileRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 46 },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  label: { flex: 1, fontSize: 13, color: DESKTOP_COLORS.ink },
  labelSelected: { color: DESKTOP_COLORS.brand },
});
