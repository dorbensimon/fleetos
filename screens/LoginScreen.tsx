// מסך הכניסה: אזור מותג כהה עם הלוגו, וטופס נקי
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { supabase } from '../lib/supabase';
import { resolveRouteForUser } from '../lib/session';
import { webOnly } from '../components/desktop/desktopTheme';
import { DK, DK_FONT } from '../components/driverKit/theme';
import { isFocusVisible } from '../components/driverKit';
import { t } from '../lib/i18n';

/**
 * Sign-in: the brand's night (logo, name, one line on what icar is) beside
 * or above a quiet white form. Motion is restrained — the page settles in
 * once, the button answers the press, a wrong password gets one short shake.
 *
 * Follows the usual sign-in rules: visible labels, autocomplete for password
 * managers, a show/hide toggle, 16px inputs (no iOS zoom), one generic error
 * that clears as soon as the person edits, and a button never disabled
 * while waiting for input.
 */

// מתחת לרוחב הזה: מותג למעלה וטופס מתחת
const SPLIT_MIN_WIDTH = 1000;
const NATIVE_DRIVER = Platform.OS !== 'web';
// עקומת אנימציה
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const LOGO = require('../images/icar-logo-on-dark.png');
const RING = require('../images/icar-loader-ring.png');
// יחס הלוגו (רוחב לגובה)
const LOGO_RATIO = 900 / 254;

const ERROR = '#C8322B';
const SUCCESS = '#12805C';
const FIELD_BORDER = '#D8DFE9';

// קישורים לדפים המשפטיים
const LOGIN_LEGAL_LINKS = [
  { doc: 'terms', get label() { return t('legal.terms'); } },
  { doc: 'privacy', get label() { return t('legal.privacyPolicyShort'); } },
  { doc: 'cookies', get label() { return t('legal.cookies'); } },
  { doc: 'accessibility', get label() { return t('legal.accessibilityStatement'); } },
] as const;

// עיצוב דפדפן: בחירה, סמן ומילוי אוטומטי
const WEB_CSS = `
#icar-login ::selection { background: rgba(47,91,255,0.2); }
#icar-login input { caret-color: ${DK.accent}; }
#icar-login input:-webkit-autofill,
#icar-login input:-webkit-autofill:hover,
#icar-login input:-webkit-autofill:focus {
  -webkit-text-fill-color: ${DK.ink};
  -webkit-box-shadow: 0 0 0 1000px ${DK.surfaceSunk} inset;
  transition: background-color 9999s ease-out 0s;
}
/* Lets a field notice the browser autofilling it (see LoginField). */
@keyframes icar-autofill { from { opacity: 1; } to { opacity: 1; } }
#icar-login input:-webkit-autofill { animation: icar-autofill 1ms; }
`;

// האם המשתמש ביקש פחות אנימציות
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduced(value), () => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------

interface LoginFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: 'default' | 'email-address';
  textContentType?: 'username' | 'password';
  autoComplete?: 'username' | 'current-password';
  returnKeyType?: 'next' | 'go';
  onSubmitEditing?: () => void;
  inputRef: React.RefObject<TextInput | null>;
  hasError?: boolean;
}

// שדה בטופס: תווית מעל, תיבה, ומסגרת מודגשת בפוקוס
function LoginField({
  label,
  value,
  onChangeText,
  secureTextEntry,
  onToggleSecure,
  keyboardType = 'default',
  textContentType,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  inputRef,
  hasError,
}: LoginFieldProps) {
  const [focused, setFocused] = useState(false);
  const latest = useRef({ value, onChangeText });
  latest.current = { value, onChangeText };

  // Web: password managers and browser autofill write the <input> directly,
  // which React's onChange can miss; the next render would then wipe the field.
  // Read the DOM value back into state whenever that happens.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = inputRef.current as unknown as HTMLInputElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Deferred so ordinary typing is handled by onChange first and not twice.
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (node.value !== latest.current.value) latest.current.onChangeText(node.value);
      }, 0);
    };
    const onAnimation = (event: AnimationEvent) => {
      if (event.animationName === 'icar-autofill') sync();
    };
    node.addEventListener('input', sync);
    node.addEventListener('change', sync);
    node.addEventListener('animationstart', onAnimation);
    return () => {
      clearTimeout(timer);
      node.removeEventListener('input', sync);
      node.removeEventListener('change', sync);
      node.removeEventListener('animationstart', onAnimation);
    };
  }, [inputRef]);

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]} onPress={() => inputRef.current?.focus()}>
        {label}
      </Text>
      <View style={[styles.field, focused && styles.fieldFocused, hasError && styles.fieldError]}>
        <TextInput
          ref={inputRef}
          style={[styles.fieldInput, webOnly({ outlineStyle: 'none' })]}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          textContentType={textContentType}
          autoComplete={autoComplete}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          selectionColor={DK.accent}
          accessibilityLabel={label}
          aria-invalid={hasError || undefined}
          textAlign="right"
        />
        {onToggleSecure && (
          <Pressable
            onPress={onToggleSecure}
            hitSlop={12}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={secureTextEntry ? t('password.showThe') : t('password.hideThe')}
          >
            <Ionicons name={secureTextEntry ? 'eye-outline' : 'eye-off-outline'} size={20} color={DK.muted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// כפתור הכניסה
function SignInButton({ onPress, loading, reduce }: { onPress: () => void; loading: boolean; reduce: boolean }) {
  const press = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const to = (toValue: number, duration: number) =>
    !reduce && Animated.timing(press, { toValue, duration, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      onPressIn={() => to(0.98, 100)}
      onPressOut={() => to(1, 220)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={(e) => setFocused(isFocusVisible(e))}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={loading ? t('login.signingIn') : t('login.signIn')}
      accessibilityState={{ busy: loading }}
      style={[styles.buttonHit, focused && styles.buttonFocus, webOnly({ cursor: loading ? 'progress' : 'pointer' })]}
    >
      <Animated.View style={[styles.button, (hovered || loading) && styles.buttonHover, { transform: [{ scale: press }] }]}>
        {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
        <Text style={styles.buttonText}>{loading ? t('login.signingIn') : t('login.signIn')}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// המסך: מייל, סיסמה וכניסה
export default function LoginScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_MIN_WIDTH;
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const identifierRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const brandIn = useRef(new Animated.Value(0)).current;
  const formIn = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('icar-login-css')) return;
    const style = document.createElement('style');
    style.id = 'icar-login-css';
    style.textContent = WEB_CSS;
    document.head.appendChild(style);
  }, []);

  // The page settles in once: the brand first, the form a beat after.
  useEffect(() => {
    const settle = (value: Animated.Value, delay: number) =>
      Animated.timing(value, { toValue: 1, duration: 700, delay, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER });
    const enter = Animated.parallel([settle(brandIn, 40), settle(formIn, 160)]);
    enter.start();
    return () => enter.stop();
  }, [brandIn, formIn]);

  // One short shake, like a wrong passcode on iOS.
  const shakeForm = () => {
    if (reduce) return;
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 0.6, -0.6, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER })
      )
    ).start();
  };

  const fail = (message: string) => {
    setSuccessMessage('');
    setErrorMessage(message);
    shakeForm();
  };

  const handleLogin = async () => {
    if (loading) return;
    setErrorMessage('');
    setSuccessMessage('');

    // Web: an autofill the browser has not reported yet is still in the inputs.
    const domValue = (ref: React.RefObject<TextInput | null>) =>
      Platform.OS === 'web' ? ((ref.current as unknown as HTMLInputElement | null)?.value ?? '') : '';
    const email = identifier || domValue(identifierRef);
    const pass = password || domValue(passwordRef);
    if (email !== identifier) setIdentifier(email);
    if (pass !== password) setPassword(pass);

    if (!email.trim() || !pass) {
      fail(t('login.fillEmailPassword'));
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (authError || !authData.user) {
        // 429: Supabase's per-IP sign-in limit; it clears by itself within 5 minutes.
        fail(t(authError?.status === 429 ? 'login.tooManyAttempts' : 'login.wrongCredentials'));
        return;
      }

      setSuccessMessage(t('login.accountOk'));
      const result = await resolveRouteForUser(authData.user.id, { freshSignIn: true });
      if (!result.ok) {
        fail(result.error);
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: result.route }] });
    } catch {
      fail(t('login.errorLater'));
    } finally {
      setLoading(false);
    }
  };

  // Editing a field takes the error away.
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (errorMessage) setErrorMessage('');
  };

  const rise = (value: Animated.Value, distance: number) => ({
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : distance, 0] }) }],
  });

  const logoWidth = split ? 236 : 164;

  const brand = (
    <Animated.View style={[split ? styles.brandSplit : styles.brandStack, rise(brandIn, 10)]}>
      <Image
        source={LOGO}
        style={{ width: logoWidth, height: logoWidth / LOGO_RATIO }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="icar"
      />
      <Text style={[styles.tagline, split && styles.taglineSplit]}>{t('login.tagline')}</Text>
    </Animated.View>
  );

  const form = (
    <Animated.View style={[styles.form, rise(formIn, 16)]}>
      <Text style={[styles.title, split && styles.titleSplit]} accessibilityRole="header">
        {t('login.welcome')}
      </Text>
      <Text style={styles.subtitle}>{t('login.signInToContinue')}</Text>

      <Animated.View style={[styles.fields, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }]}>
        <LoginField
          label={t('common.emailShort')}
          value={identifier}
          onChangeText={edit(setIdentifier)}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          inputRef={identifierRef}
          hasError={!!errorMessage}
        />
        <LoginField
          label={t('common.password')}
          value={password}
          onChangeText={edit(setPassword)}
          secureTextEntry={!showPassword}
          onToggleSecure={() => setShowPassword((current) => !current)}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void handleLogin()}
          inputRef={passwordRef}
          hasError={!!errorMessage}
        />
      </Animated.View>

      <View style={styles.messageSlot} accessibilityLiveRegion="polite" aria-live="polite">
        {!!errorMessage && (
          <View style={styles.messageRow}>
            <Ionicons name="alert-circle" size={17} color={ERROR} />
            <Text style={[styles.messageText, { color: ERROR }]}>{errorMessage}</Text>
          </View>
        )}
        {!!successMessage && !errorMessage && (
          <View style={styles.messageRow}>
            <Ionicons name="checkmark-circle" size={17} color={SUCCESS} />
            <Text style={[styles.messageText, { color: SUCCESS }]}>{successMessage}</Text>
          </View>
        )}
      </View>

      <SignInButton onPress={() => void handleLogin()} loading={loading} reduce={reduce} />
    </Animated.View>
  );

  const footer = (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        {t('login.accessManaged')} {t('login.openAccount')}
      </Text>
      <Text style={styles.footerText}>
        {t('login.contactColon')}{' '}
        <Text style={styles.footerLink} onPress={() => void Linking.openURL('mailto:trytolvex@gmail.com')} accessibilityRole="link">
          trytolvex@gmail.com
        </Text>
      </Text>
      <View style={styles.legalRow}>
        {LOGIN_LEGAL_LINKS.map(({ doc, label }, i) => (
          <React.Fragment key={doc}>
            {i > 0 && <Text style={styles.legalDot} importantForAccessibility="no" aria-hidden>·</Text>}
            <Text style={styles.legalLink} accessibilityRole="link" onPress={() => navigation.navigate('Legal', { doc })}>
              {label}
            </Text>
          </React.Fragment>
        ))}
      </View>
    </View>
  );

  // The brand's night: the app's gradient, soft light on the web, and the logo's ring, faint.
  const night = (ringSize: number, ringStyle: object) => (
    <>
      <LinearGradient colors={DK.night} locations={[0, 0.6, 1]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
      {Platform.OS === 'web' && <View style={[styles.glow, { pointerEvents: 'none' }]} />}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.Image
          source={RING}
          style={[styles.ring, { width: ringSize, height: ringSize }, ringStyle, { opacity: brandIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }) }]}
        />
      </View>
    </>
  );

  const body = split ? (
    <View style={styles.splitRoot}>
      <ScrollView style={styles.formSide} contentContainerStyle={[styles.formSideContent, { paddingTop: Math.max(insets.top, 40) }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.formColumn, styles.formCenter]}>{form}</View>
        <View style={styles.formColumn}>{footer}</View>
      </ScrollView>
      <View style={styles.brandSide}>
        {night(560, styles.ringSplit)}
        {brand}
      </View>
    </View>
  ) : (
    <ScrollView style={styles.flex} contentContainerStyle={styles.stackContent} keyboardShouldPersistTaps="handled" bounces={false}>
      <View style={[styles.brandTop, { paddingTop: insets.top + 56 }]}>
        {night(300, styles.ringStack)}
        {brand}
      </View>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
        <View style={styles.formColumn}>{form}</View>
        <View style={[styles.formColumn, styles.sheetFooter]}>{footer}</View>
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.container, split && styles.containerSplit]} nativeID="icar-login">
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

// עיצוב מסך הכניסה
const styles = StyleSheet.create({
  flex: { flex: 1 },
  // המסך: כהה למעלה, כדי שסרגל הדפדפן והאזור העליון של האייפון יקבלו את צבע המותג
  container: { flex: 1, backgroundColor: DK.night[0] },
  containerSplit: { backgroundColor: DK.surface },

  // טלפון: מותג למעלה, גיליון לבן מתחת
  stackContent: { flexGrow: 1, backgroundColor: DK.surface },
  brandTop: { alignItems: 'center', paddingBottom: 72, overflow: 'hidden' },
  brandStack: { alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  sheet: {
    flexGrow: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: DK.surface,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  sheetFooter: { flexGrow: 1, justifyContent: 'flex-end', marginTop: 36 },
  ringStack: { top: -40, start: -120 },

  // מחשב: טופס בצד אחד, מותג בצד השני
  splitRoot: { flex: 1, flexDirection: 'row' },
  formSide: { flex: 1, backgroundColor: DK.surface },
  formSideContent: { flexGrow: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 32 },
  brandSide: { flex: 1.1, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', padding: 48 },
  brandSplit: { alignItems: 'center', gap: 22, maxWidth: 440 },
  ringSplit: { bottom: -150, end: -150 },

  formColumn: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  formCenter: { flexGrow: 1, justifyContent: 'center' },
  form: { width: '100%' },

  // מותג
  tagline: {
    fontFamily: DK_FONT.medium,
    fontSize: 16,
    lineHeight: 24,
    color: DK.onNightMuted,
    textAlign: 'center',
  },
  taglineSplit: { fontSize: 19, lineHeight: 29 },
  ring: { position: 'absolute' },
  glow: {
    position: 'absolute',
    width: 720,
    height: 720,
    top: -260,
    end: -260,
    backgroundImage: 'radial-gradient(closest-side, rgba(47,91,255,0.34), rgba(47,91,255,0.1) 55%, rgba(47,91,255,0) 100%)',
  } as object,

  // כותרת
  title: { fontFamily: DK_FONT.title, fontSize: 26, lineHeight: 34, color: DK.ink, textAlign: 'right', letterSpacing: -0.3 },
  titleSplit: { fontSize: 30, lineHeight: 38 },
  subtitle: { fontFamily: DK_FONT.regular, fontSize: 16, lineHeight: 24, color: DK.muted, textAlign: 'right', marginTop: 4 },

  // שדות
  fields: { gap: 18, marginTop: 28 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontFamily: DK_FONT.semibold, fontSize: 14, color: DK.inkSoft, textAlign: 'right' },
  fieldLabelFocused: { color: DK.accent },
  field: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: DK.surfaceSunk,
    paddingHorizontal: 16,
    ...webOnly({ transition: 'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease' }),
  },
  fieldFocused: {
    borderColor: DK.accent,
    backgroundColor: DK.surface,
    ...webOnly({ boxShadow: '0 0 0 4px rgba(47,91,255,0.14)' }),
  },
  fieldError: { borderColor: ERROR },
  fieldInput: {
    flex: 1,
    height: '100%',
    fontFamily: DK_FONT.medium,
    fontSize: 16,
    color: DK.ink,
    paddingVertical: 0,
  },
  eye: { paddingStart: 10, height: '100%', justifyContent: 'center' },

  // הודעה
  messageSlot: { minHeight: 30, justifyContent: 'center', marginTop: 10 },
  messageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  messageText: { flex: 1, fontFamily: DK_FONT.semibold, fontSize: 14, lineHeight: 20, textAlign: 'right' },

  // כפתור
  buttonHit: { marginTop: 6, borderRadius: 16, ...webOnly({ outlineStyle: 'none' }) },
  buttonFocus: webOnly({ boxShadow: '0 0 0 3px #FFFFFF, 0 0 0 6px rgba(47,91,255,0.55)' }) as object,
  button: {
    height: 54,
    borderRadius: 14,
    backgroundColor: DK.accent,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...webOnly({ transition: 'background-color 160ms ease', boxShadow: '0 10px 24px -12px rgba(47,91,255,0.7)' }),
  },
  buttonHover: { backgroundColor: DK.accentPress },
  buttonText: { fontFamily: DK_FONT.title, fontSize: 16, color: '#FFFFFF', ...webOnly({ userSelect: 'none' }) },

  // תחתית
  footer: { gap: 8, marginTop: 40, alignItems: 'center' },
  footerText: { fontFamily: DK_FONT.regular, fontSize: 13, lineHeight: 20, color: DK.muted, textAlign: 'center' },
  footerLink: { fontFamily: DK_FONT.semibold, color: DK.accent },
  legalRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 },
  legalLink: { fontFamily: DK_FONT.regular, fontSize: 12.5, color: DK.muted, textDecorationLine: 'underline', paddingVertical: 4 },
  legalDot: { color: DK.faint, fontSize: 12.5 },
});
