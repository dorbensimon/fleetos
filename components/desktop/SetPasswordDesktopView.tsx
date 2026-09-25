import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';
import { BrandLogo } from '../ui/Brand';

type Props = {
  voluntary: boolean;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  errors: Record<string, string>;
  generalError: string;
  saving: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: () => void;
  onCancel: () => void;
};

/** Desktop-only security workspace. The mobile flow remains in SetPasswordScreen. */
export function SetPasswordDesktopView({
  voluntary,
  password,
  confirmPassword,
  showPassword,
  errors,
  generalError,
  saving,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
  onSubmit,
  onCancel,
}: Props) {
  const [focused, setFocused] = useState<'password' | 'confirmPassword' | null>(null);
  const requirements = [
    { label: 'לפחות 8 תווים', met: password.length >= 8 },
    { label: 'הסיסמאות תואמות', met: confirmPassword.length > 0 && password === confirmPassword },
  ];

  return (
    <View style={styles.page}>
      <View style={styles.workspace}>
        <View style={styles.securityPanel}>
          <BrandLogo onDark height={26} style={styles.brand} />
          <View style={styles.lockTile}>
            <Ionicons name="lock-closed-outline" size={31} color={DESKTOP_COLORS.brand} />
          </View>
          <View style={styles.securityCopy}>
            <DText weight="bold" style={styles.securityTitle}>אבטחת החשבון</DText>
            <DText style={styles.securityDescription}>
              סיסמה עדכנית וייחודית שומרת על המידע ועל הפעילות של החברה שלך.
            </DText>
          </View>
          <View style={styles.assuranceList}>
            <Assurance icon="shield-checkmark-outline" title="חיבור מוצפן" detail="הסיסמה נשלחת בחיבור מוצפן" />
            <Assurance icon="eye-off-outline" title="רק שלך" detail="הסיסמה החדשה לא מוצגת למנהל הצי" />
            <Assurance icon="key-outline" title="בשליטה שלך" detail="אפשר לעדכן את הסיסמה בכל עת" />
          </View>
          <DText style={styles.helpText}>טיפ: בחרו סיסמה שלא משמשת אתכם בשירותים אחרים.</DText>
        </View>

        <View style={styles.formSurface}>
          <View style={styles.formHeading}>
            <DText weight="bold" style={styles.title}>{voluntary ? 'שינוי סיסמה' : 'קביעת סיסמה קבועה'}</DText>
            <DText style={styles.subtitle}>
              {voluntary ? 'בחרו סיסמה חדשה לחשבון שלכם.' : 'ברוכים הבאים ל-icar. זו הכניסה הראשונה שלכם — בחרו סיסמה קבועה כדי להמשיך.'}
            </DText>
          </View>

          <PasswordField
            label="סיסמה חדשה"
            value={password}
            placeholder="לפחות 8 תווים"
            visible={showPassword}
            focused={focused === 'password'}
            error={errors.password}
            onChangeText={onPasswordChange}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            onToggle={onTogglePassword}
          />
          <PasswordField
            label="אימות סיסמה"
            value={confirmPassword}
            placeholder="הזינו שוב את הסיסמה"
            visible={showPassword}
            focused={focused === 'confirmPassword'}
            error={errors.confirmPassword}
            onChangeText={onConfirmPasswordChange}
            onFocus={() => setFocused('confirmPassword')}
            onBlur={() => setFocused(null)}
            onToggle={onTogglePassword}
          />

          <View style={styles.requirements}>
            {requirements.map((requirement) => (
              <View key={requirement.label} style={styles.requirement}>
                <Ionicons name={requirement.met ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={requirement.met ? DESKTOP_TONES.ok.fg : DESKTOP_COLORS.inkFaint} />
                <DText style={[styles.requirementText, requirement.met && styles.requirementTextMet]}>{requirement.label}</DText>
              </View>
            ))}
          </View>

          {!!generalError && <View style={styles.errorCallout}><Ionicons name="alert-circle-outline" size={17} color={DESKTOP_TONES.bad.fg} /><DText style={styles.generalError}>{generalError}</DText></View>}

          <HoverPressable
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            hoverStyle={!saving ? styles.submitButtonHover : undefined}
            pressMotionStyle={styles.pressDown}
            onPress={onSubmit}
            disabled={saving}
          >
            {saving ? <BrandLoader color="#fff" /> : <><DText weight="semiBold" style={styles.submitText}>עדכון סיסמה</DText><Ionicons name="arrow-back" size={17} color="#fff" /></>}
          </HoverPressable>
          <HoverPressable style={styles.cancelButton} hoverStyle={styles.cancelButtonHover} pressMotionStyle={styles.pressDown} onPress={onCancel} disabled={saving}>
            <DText weight="semiBold" style={styles.cancelText}>{voluntary ? 'ביטול' : 'זה לא אני / התנתקות'}</DText>
          </HoverPressable>
        </View>
      </View>
    </View>
  );
}

function Assurance({ icon, title, detail }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string }) {
  return <View style={styles.assurance}><View style={styles.assuranceIcon}><Ionicons name={icon} size={18} color={DESKTOP_COLORS.brand} /></View><View style={styles.assuranceCopy}><DText weight="semiBold" style={styles.assuranceTitle}>{title}</DText><DText style={styles.assuranceDetail}>{detail}</DText></View></View>;
}

function PasswordField({ label, value, placeholder, visible, focused, error, onChangeText, onFocus, onBlur, onToggle }: {
  label: string; value: string; placeholder: string; visible: boolean; focused: boolean; error?: string;
  onChangeText: (value: string) => void; onFocus: () => void; onBlur: () => void; onToggle: () => void;
}) {
  return <View style={styles.field}><DText weight="semiBold" style={styles.label}>{label}</DText><View style={[styles.inputWrap, focused && styles.inputWrapFocused, !!error && styles.inputWrapError]}><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={DESKTOP_COLORS.inkFaint} secureTextEntry={!visible} autoCapitalize="none" textAlign="right" onFocus={onFocus} onBlur={onBlur} style={styles.input} /><HoverPressable style={styles.visibilityButton} hoverStyle={styles.visibilityButtonHover} onPress={onToggle} accessibilityLabel={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}><Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={18} color={DESKTOP_COLORS.inkMuted} /></HoverPressable></View>{!!error && <DText style={styles.fieldError}>{error}</DText>}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: DESKTOP_COLORS.canvas, justifyContent: 'center', padding: 40 },
  workspace: { width: '100%', maxWidth: 1160, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'stretch', gap: 24 },
  securityPanel: { flex: 1, minHeight: 530, borderRadius: 16, backgroundColor: DESKTOP_COLORS.ink, padding: 38, justifyContent: 'center', ...webOnly({ boxShadow: '0 18px 42px rgba(22,34,46,0.16)' }) },
  // Pinned to the panel's top corner so the centred security copy doesn't move.
  brand: { position: 'absolute', top: 34, right: 38 },
  lockTile: { width: 68, height: 68, borderRadius: 20, backgroundColor: 'rgba(95,193,240,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  securityCopy: { maxWidth: 430 },
  securityTitle: { fontSize: 28, color: '#fff', letterSpacing: -0.45 },
  securityDescription: { color: '#C5D0D9', fontSize: 15, lineHeight: 23, marginTop: 9 },
  assuranceList: { marginTop: 34, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  assurance: { flexDirection: 'row-reverse', alignItems: 'center', gap: 13, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  assuranceIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.09)', alignItems: 'center', justifyContent: 'center' },
  assuranceCopy: { flex: 1 }, assuranceTitle: { color: '#fff', fontSize: 13.5 }, assuranceDetail: { color: '#AAB9C5', fontSize: 12, marginTop: 1 },
  helpText: { color: '#AAB9C5', fontSize: 11.5, lineHeight: 18, marginTop: 25 },
  formSurface: { width: 470, borderRadius: 16, padding: 38, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, justifyContent: 'center' },
  formHeading: { marginBottom: 28 }, title: { fontSize: 26, letterSpacing: -0.4, color: DESKTOP_COLORS.ink }, subtitle: { color: DESKTOP_COLORS.inkMuted, fontSize: 13.5, lineHeight: 21, marginTop: 7 },
  field: { marginBottom: 18 }, label: { fontSize: 13, color: DESKTOP_COLORS.ink, marginBottom: 8 },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', height: 50, paddingHorizontal: 8, borderRadius: 12, backgroundColor: DESKTOP_COLORS.surfaceMuted, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, ...webOnly({ transition: 'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease' }) },
  inputWrapFocused: { backgroundColor: '#fff', borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(0,136,204,0.14)' }) }, inputWrapError: { borderColor: DESKTOP_TONES.bad.fg },
  input: { flex: 1, height: '100%', paddingHorizontal: 8, fontSize: 14, color: DESKTOP_COLORS.ink, ...webOnly({ outlineStyle: 'none' }) }, visibilityButton: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, visibilityButtonHover: { backgroundColor: DESKTOP_COLORS.canvas, ...webOnly({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: DESKTOP_COLORS.brand, outlineOffset: 2 }) }, fieldError: { color: DESKTOP_TONES.bad.fg, fontSize: 11.5, marginTop: 6 },
  requirements: { flexDirection: 'row-reverse', gap: 18, marginTop: 1, marginBottom: 24 }, requirement: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }, requirementText: { color: DESKTOP_COLORS.inkFaint, fontSize: 11.5 }, requirementTextMet: { color: DESKTOP_TONES.ok.fg },
  errorCallout: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: DESKTOP_TONES.bad.bg, padding: 11, marginBottom: 16 }, generalError: { flex: 1, color: DESKTOP_TONES.bad.fg, fontSize: 12, textAlign: 'right' },
  submitButton: { height: 50, borderRadius: 12, backgroundColor: DESKTOP_COLORS.brand, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 }, submitButtonHover: { backgroundColor: DESKTOP_COLORS.brandHover }, submitButtonDisabled: { opacity: 0.72 }, submitText: { color: '#fff', fontSize: 14 },
  cancelButton: { alignSelf: 'center', marginTop: 14, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center', borderRadius: 8 }, cancelButtonHover: { opacity: 0.68, ...webOnly({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: DESKTOP_COLORS.brand, outlineOffset: 2 }) }, cancelText: { color: DESKTOP_COLORS.inkMuted, fontSize: 12.5 }, pressDown: webOnly({ transform: 'scale(0.97)' }),
});
