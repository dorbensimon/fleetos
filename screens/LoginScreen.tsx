import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { supabase } from '../lib/supabase';
import { resolveRouteForUser } from '../lib/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { webOnly } from '../components/desktop/desktopTheme';

/**
 * Sign-in as starting the truck: a dark instrument cluster that runs its
 * ignition self-test when the screen opens, answers the person typing, and
 * starts with a round start button. The surface brief lives in
 * .impeccable/surfaces/screens-loginscreen-tsx.md.
 */

const CLUSTER = {
  ground: '#0B1016',
  groundDeep: '#070A0E',
  binnacle: '#121922',
  face: '#0D131A',
  window: '#0A0F15',
  field: 'rgba(237,241,244,0.045)',
  fieldFocus: 'rgba(95,193,240,0.07)',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineStrong: 'rgba(255,255,255,0.13)',
  backlight: '#5FC1F0',
  backlightSoft: 'rgba(95,193,240,0.14)',
  ink: '#EDF1F4',
  inkMuted: '#8B98A4',
  tickIdle: 'rgba(237,241,244,0.2)',
  lampIdle: 'rgba(237,241,244,0.24)',
  amber: '#FFB020',
  green: '#34C759',
};

const FONT = {
  regular: 'Heebo_400Regular',
  medium: 'Heebo_500Medium',
  semiBold: 'Heebo_600SemiBold',
  bold: 'Heebo_700Bold',
  extraBold: 'Heebo_800ExtraBold',
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
/** Where the revs needle rests once the engine is idling. */
const IDLE_REVS = 0.09;
/**
 * The wide cluster needs two gauges of at least ~200px beside the 392px
 * display; below this width the phone stack is used (also on iPads in portrait).
 */
const WIDE_MIN_WIDTH = 1000;

const LOGIN_LEGAL_LINKS = [
  { doc: 'terms', label: 'תנאי שימוש' },
  { doc: 'privacy', label: 'מדיניות פרטיות' },
  { doc: 'cookies', label: 'עוגיות' },
  { doc: 'accessibility', label: 'הצהרת נגישות' },
] as const;
/** Smallest gauge (px) the phone layout will shrink to so the login fits the screen. */
const GAUGE_MIN = 124;
const DISPLAY_WIDTH = 392;

/** The browser parts React Native cannot style: selection, caret, autofill, scrollbars. */
const WEB_CSS = `
#cluster-login ::selection { background: rgba(95,193,240,0.32); color: ${CLUSTER.ink}; }
#cluster-login input { caret-color: ${CLUSTER.backlight}; }
#cluster-login input:-webkit-autofill,
#cluster-login input:-webkit-autofill:hover,
#cluster-login input:-webkit-autofill:focus {
  -webkit-text-fill-color: ${CLUSTER.ink};
  -webkit-box-shadow: 0 0 0 1000px #111820 inset;
  transition: background-color 9999s ease-out 0s;
}
/* Lets a field notice the browser autofilling it (see ClusterField). */
@keyframes cluster-autofill { from { opacity: 1; } to { opacity: 1; } }
#cluster-login input:-webkit-autofill { animation: cluster-autofill 1ms; }
#cluster-login { scrollbar-color: #1D2733 transparent; }
#cluster-login ::-webkit-scrollbar { width: 10px; }
#cluster-login ::-webkit-scrollbar-thumb { background: #1D2733; border-radius: 5px; }
`;

function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(value))
      .catch(() => alive && setReduced(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}

function currentClock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Gauge: 240° dial built from rotated tick marks, lit by the same value that
// turns the needle, so the backlight always follows the needle exactly.
// ---------------------------------------------------------------------------

const SWEEP = 240;
const START_ANGLE = -120;

function Gauge({
  size,
  value,
  ticks,
  majorEvery,
  numerals,
  label,
  readout,
  readoutTone,
}: {
  size: number;
  value: Animated.Value;
  ticks: number;
  majorEvery: number;
  numerals?: string[];
  label: string;
  readout: string;
  readoutTone?: string;
}) {
  const needleAngle = value.interpolate({
    inputRange: [0, 1],
    outputRange: [`${START_ANGLE}deg`, `${START_ANGLE + SWEEP}deg`],
    extrapolate: 'clamp',
  });
  const center = size / 2;
  const tickTop = size * 0.075;
  const showNumerals = !!numerals && size >= 180;

  const marks: React.ReactNode[] = [];
  for (let i = 0; i <= ticks; i += 1) {
    const t = i / ticks;
    const major = i % majorEvery === 0;
    const width = major ? 3 : 2;
    const height = major ? size * 0.07 : size * 0.038;
    const lit = value.interpolate({ inputRange: [t - 0.03, t], outputRange: [0, 1], extrapolate: 'clamp' });
    const tick = { left: center - width / 2, top: tickTop, width, height };
    marks.push(
      <View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${START_ANGLE + SWEEP * t}deg` }] }]}>
        <View style={[styles.tick, tick, { backgroundColor: CLUSTER.tickIdle }]} />
        <Animated.View style={[styles.tick, tick, styles.tickLit, { opacity: lit }]} />
      </View>
    );
  }

  // With numerals the window must clear the 0 and top numerals at the lower corners;
  // small gauges show no numerals, so their window can take the width it needs.
  const windowInset = showNumerals ? 0.315 : 0.2;
  const numeralRadius = size * 0.31;
  const numeralBox = size * 0.14;

  return (
    <View
      style={[styles.gauge, { width: size, height: size, borderRadius: size / 2 }]}
      accessible
      accessibilityLabel={`${label}: ${readout}`}
    >
      <View pointerEvents="none" style={[styles.gaugeFace, { top: size * 0.03, left: size * 0.03, right: size * 0.03, bottom: size * 0.03, borderRadius: size / 2 }]} />
      {marks}
      {showNumerals &&
        numerals!.map((numeral, index) => {
          const t = index / (numerals!.length - 1);
          const radians = ((START_ANGLE + SWEEP * t) * Math.PI) / 180;
          return (
            <Text
              key={numeral + index}
              style={[
                styles.numeral,
                {
                  width: numeralBox,
                  left: center + numeralRadius * Math.sin(radians) - numeralBox / 2,
                  top: center - numeralRadius * Math.cos(radians) - 9,
                  fontSize: Math.max(11, size * 0.052),
                },
              ]}
            >
              {numeral}
            </Text>
          );
        })}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: needleAngle }] }]}>
        <View style={[styles.needle, { left: center - 1.75, top: size * 0.115, height: size * 0.445 }]}>
          <View style={[styles.needleTip, { height: size * 0.1 }]} />
        </View>
      </Animated.View>
      <View pointerEvents="none" style={[styles.hub, { width: size * 0.11, height: size * 0.11, borderRadius: size * 0.055, left: center - size * 0.055, top: center - size * 0.055 }]}>
        <View style={styles.hubDot} />
      </View>

      <View pointerEvents="none" style={[styles.readoutWindow, { top: size * 0.66, left: size * windowInset, right: size * windowInset }]}>
        <Text style={[styles.readoutLabel, { fontSize: Math.max(10, size * 0.042) }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.readoutValue, { fontSize: Math.max(12, size * 0.068) }, readoutTone ? { color: readoutTone } : null]} numberOfLines={1}>
          {readout}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tell-tale lamp: dark until its condition holds, like the cluster's warning
// lights. All of them light for a moment during the ignition self-test.
// ---------------------------------------------------------------------------

function TellTale({ icon, lit, tone, label }: { icon: keyof typeof Ionicons.glyphMap; lit: boolean; tone: string; label: string }) {
  return (
    <View
      style={[styles.lamp, lit && { backgroundColor: `${tone}1F`, borderColor: `${tone}55` }]}
      accessible
      accessibilityLabel={`${label}${lit ? '' : ' (כבוי)'}`}
    >
      <Ionicons name={icon} size={15} color={lit ? tone : CLUSTER.lampIdle} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Field on the central display.
// ---------------------------------------------------------------------------

interface ClusterFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  icon: keyof typeof Ionicons.glyphMap;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: 'default' | 'email-address';
  textContentType?: 'username' | 'password';
  autoComplete?: 'username' | 'current-password';
  returnKeyType?: 'next' | 'go';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  hasError?: boolean;
  /** Shorter field for phones where the login must fit the screen. */
  short?: boolean;
}

function ClusterField({
  label,
  value,
  onChangeText,
  icon,
  secureTextEntry,
  onToggleSecure,
  keyboardType = 'default',
  textContentType,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  inputRef,
  hasError,
  short,
}: ClusterFieldProps) {
  const [focused, setFocused] = useState(false);
  const accent = hasError ? CLUSTER.amber : CLUSTER.backlight;
  const ownRef = useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  const latest = useRef({ value, onChangeText });
  latest.current = { value, onChangeText };

  // Web: password managers and browser autofill write the <input> directly,
  // which React's onChange can miss; the next render would then wipe the field.
  // Read the DOM value back into state whenever that happens.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLInputElement | null;
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
      if (event.animationName === 'cluster-autofill') sync();
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
  }, [ref]);

  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      // Not a Tab stop of its own: Tab goes straight into the input.
      tabIndex={-1}
      accessible={false}
      style={[styles.field, short && styles.fieldShort, focused && styles.fieldFocused, (focused || hasError) && { borderColor: `${accent}88` }]}
    >
      <Ionicons name={icon} size={18} color={focused ? CLUSTER.backlight : CLUSTER.inkMuted} />
      <View style={[styles.fieldBody, short && styles.fieldBodyShort]}>
        <Text style={[styles.fieldLabel, focused && { color: CLUSTER.backlight }]}>{label}</Text>
        <TextInput
          ref={ref}
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
          selectionColor={CLUSTER.backlight}
          accessibilityLabel={label}
          textAlign="right"
        />
      </View>
      {onToggleSecure && (
        <Pressable
          onPress={onToggleSecure}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={secureTextEntry ? 'הצגת הסיסמה' : 'הסתרת הסיסמה'}
        >
          <Ionicons name={secureTextEntry ? 'eye-off-outline' : 'eye-outline'} size={19} color={CLUSTER.inkMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Start button: a round engine-start button. Its ring lights once both
// fields are filled and pulses while signing in.
// ---------------------------------------------------------------------------

function StartButton({ onPress, loading, ready, size }: { onPress: () => void; loading: boolean; ready: boolean; size: number }) {
  const press = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!loading) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 520, easing: EASE_IN_OUT, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 520, easing: EASE_IN_OUT, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulse]);

  const lit = ready || loading || focused;
  const ringColor = lit ? CLUSTER.backlight : hovered ? 'rgba(95,193,240,0.45)' : CLUSTER.hairlineStrong;

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      onPressIn={() => Animated.timing(press, { toValue: 0.95, duration: 90, easing: EASE_OUT, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, speed: 24, bounciness: 6, useNativeDriver: true }).start()}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel="התחברות"
      accessibilityState={{ busy: loading, disabled: loading }}
      aria-busy={loading} aria-disabled={loading}
      style={webOnly({ outlineStyle: 'none', cursor: loading ? 'progress' : 'pointer' })}
    >
      <Animated.View style={[styles.startOuter, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: press }] }]}>
        <Animated.View
          style={[
            styles.startRing,
            { borderRadius: size / 2, borderColor: ringColor, opacity: pulse },
            lit && styles.startRingLit,
          ]}
        />
        <View style={[styles.startCore, { width: size - 22, height: size - 22, borderRadius: (size - 22) / 2 }]}>
          <Ionicons name="power" size={Math.round(size * 0.24)} color={lit ? CLUSTER.backlight : CLUSTER.ink} />
          <Text style={styles.startLabel}>{loading ? 'מתחבר…' : 'התחברות'}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_MIN_WIDTH;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [fitHeight, setFitHeight] = useState(0);
  const [gaugeShrink, setGaugeShrink] = useState(0);
  const fitWidth = useRef(width);
  const contentHeight = useRef(0);
  // Phone gauge size before fitting, and how far fitting may take it down.
  const compactGauge = Math.min(172, Math.floor((Math.min(width - 40, 520) - 36 - 14) / 2));
  const maxShrink = Math.max(0, compactGauge - GAUGE_MIN);
  // Gauge row height is the gauge size, so shrinking the gauges by the
  // overflow makes the content fit exactly (settles in one pass).
  const refit = () => {
    if (wide || !fitHeight || !contentHeight.current) return;
    const overflow = contentHeight.current - fitHeight;
    setGaugeShrink((prev) => {
      const next = Math.min(Math.max(prev + overflow, 0), maxShrink);
      return Math.abs(next - prev) < 1 ? prev : Math.ceil(next);
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refit, [fitHeight]);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selfTest, setSelfTest] = useState(true);
  const [clock, setClock] = useState(currentClock);

  const identifierRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const revs = useRef(new Animated.Value(0)).current;
  const readiness = useRef(new Animated.Value(0)).current;
  const displayPower = useRef(new Animated.Value(0.55)).current;
  const revLevel = useRef(0);
  const revTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfTestRef = useRef(true);

  const filled = (identifier.trim() ? 1 : 0) + (password ? 1 : 0);
  const ready = filled === 2;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('cluster-login-css')) return;
    const style = document.createElement('style');
    style.id = 'cluster-login-css';
    style.textContent = WEB_CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(currentClock()), 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (revTimer.current) clearTimeout(revTimer.current);
  }, []);

  // Ignition self-test: every tell-tale on, both needles sweep to full and
  // back, then the revs needle settles at idle. Runs once per visit.
  useEffect(() => {
    if (reduceMotion === null) return;
    let cancelled = false;
    const finish = (result?: { finished: boolean }) => {
      if (cancelled || selfTestRef.current === false) return;
      // A tab opened in the background pauses animation frames; the timer
      // below still ends the test so the cluster never stays mid-sweep.
      if (result && !result.finished) {
        revs.setValue(IDLE_REVS);
        readiness.setValue(0);
        displayPower.setValue(1);
      }
      selfTestRef.current = false;
      setSelfTest(false);
      revLevel.current = IDLE_REVS;
    };
    if (reduceMotion) {
      revs.setValue(IDLE_REVS);
      displayPower.setValue(1);
      finish();
      return;
    }
    const sweepUp = (value: Animated.Value) =>
      Animated.timing(value, { toValue: 1, duration: 640, easing: EASE_OUT, useNativeDriver: true });
    const sweepDown = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, { toValue, duration: 720, easing: EASE_IN_OUT, useNativeDriver: true });
    const test = Animated.parallel([
      Animated.sequence([Animated.delay(140), sweepUp(revs), sweepDown(revs, IDLE_REVS)]),
      Animated.sequence([Animated.delay(200), sweepUp(readiness), sweepDown(readiness, 0)]),
      Animated.timing(displayPower, { toValue: 1, duration: 520, delay: 120, easing: EASE_OUT, useNativeDriver: true }),
    ]);
    test.start(finish);
    const fallback = setTimeout(() => test.stop(), 1900);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      test.stop();
    };
  }, [reduceMotion, revs, readiness, displayPower]);

  // Readiness follows the filled fields once the self-test hands over.
  useEffect(() => {
    if (selfTest) return;
    const target = loading ? 1 : filled / 2;
    if (reduceMotion) {
      readiness.setValue(target);
      return;
    }
    Animated.spring(readiness, { toValue: target, speed: 14, bounciness: 0, useNativeDriver: true }).start();
  }, [filled, loading, selfTest, reduceMotion, readiness]);

  const settleRevs = (toValue: number, duration = 900) => {
    revLevel.current = toValue;
    if (reduceMotion) {
      revs.setValue(toValue);
      return;
    }
    Animated.timing(revs, { toValue, duration, easing: EASE_OUT, useNativeDriver: true }).start();
  };

  // Typing revs the engine a little; it drops back to idle when you pause.
  const rev = () => {
    if (reduceMotion || selfTestRef.current || loading) return;
    revLevel.current = Math.min(0.88, revLevel.current + 0.14);
    Animated.spring(revs, { toValue: revLevel.current, speed: 20, bounciness: 3, useNativeDriver: true }).start();
    if (revTimer.current) clearTimeout(revTimer.current);
    revTimer.current = setTimeout(() => settleRevs(IDLE_REVS), 420);
  };

  const handleLogin = async () => {
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
      setErrorMessage('נא למלא מייל וסיסמה');
      return;
    }

    if (revTimer.current) clearTimeout(revTimer.current);
    settleRevs(0.62, 420);
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (authError || !authData.user) {
        settleRevs(IDLE_REVS, 700);
        setErrorMessage('מייל או סיסמה שגויים');
        return;
      }

      settleRevs(1, 380);
      setSuccessMessage('חשבון תקין');

      const result = await resolveRouteForUser(authData.user.id);

      if (!result.ok) {
        settleRevs(IDLE_REVS, 700);
        setSuccessMessage('');
        setErrorMessage(result.error);
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: result.route }] });
    } catch {
      settleRevs(IDLE_REVS, 700);
      setSuccessMessage('');
      setErrorMessage('אירעה שגיאה. נסה שוב מאוחר יותר');
    } finally {
      setLoading(false);
    }
  };

  // Phones: the whole cluster fits the visible screen, with no scrolling.
  // `short` tightens the vertical rhythm; whatever still overflows comes out
  // of the gauges, measured (see `refit`).
  const short = !wide && fitHeight > 0 && fitHeight < 860;
  // Wide: the binnacle (≤1080, 44px sides) holds two gauges and the display with ≥24px between them.
  const gaugeSize = wide
    ? Math.min(262, Math.floor((Math.min(width - 64, 1080) - 88 - DISPLAY_WIDTH - 48) / 2))
    : compactGauge - Math.min(gaugeShrink, maxShrink);
  const startSize = wide ? 112 : short ? 88 : 100;
  const displayWidth = wide ? DISPLAY_WIDTH : undefined;

  const revsGauge = (
    <Gauge
      size={gaugeSize}
      value={revs}
      ticks={27}
      majorEvery={3}
      numerals={['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']}
      label="סל״ד ×1000"
      readout={clock}
    />
  );
  const readinessGauge = (
    <Gauge
      size={gaugeSize}
      value={readiness}
      ticks={20}
      majorEvery={10}
      numerals={['0', '1', '2']}
      label="שדות מוכנים"
      readout={ready ? 'מוכן' : `${filled}/2`}
      readoutTone={ready ? CLUSTER.green : undefined}
    />
  );

  const display = (
    <Animated.View style={[styles.display, short && styles.displayShort, displayWidth ? { width: displayWidth } : null, { opacity: displayPower }]}>
      <Image
        source={require('../images/icar-logo-on-dark.png')}
        style={[styles.logo, !wide && styles.logoCompact, short && styles.logoShort]}
        resizeMode="contain"
        accessibilityLabel="icar"
      />
      <Text style={styles.subtitle}>התחברו כדי להמשיך</Text>

      <View style={[styles.fields, short && styles.fieldsShort]}>
        <ClusterField
          label="מייל"
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            rev();
          }}
          icon="mail-outline"
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          inputRef={identifierRef}
          hasError={!!errorMessage && !identifier.trim()}
          short={short}
        />
        <ClusterField
          label="סיסמה"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            rev();
          }}
          icon="lock-closed-outline"
          secureTextEntry={!showPassword}
          onToggleSecure={() => setShowPassword((current) => !current)}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void handleLogin()}
          inputRef={passwordRef}
          hasError={!!errorMessage && !password}
          short={short}
        />
      </View>

      <View style={[styles.messageSlot, short && styles.messageSlotShort]} accessibilityLiveRegion="polite">
        {!!errorMessage && (
          <View style={styles.messageRow}>
            <Ionicons name="warning" size={15} color={CLUSTER.amber} />
            <Text style={[styles.messageText, { color: CLUSTER.amber }]}>{errorMessage}</Text>
          </View>
        )}
        {!!successMessage && (
          <View style={styles.messageRow}>
            <Ionicons name="checkmark-circle" size={15} color={CLUSTER.green} />
            <Text style={[styles.messageText, { color: CLUSTER.green }]}>{successMessage}</Text>
          </View>
        )}
      </View>

      <View style={[styles.lampRow, short && styles.lampRowShort]}>
        <TellTale icon="mail" label="מייל הוזן" lit={selfTest || !!identifier.trim()} tone={CLUSTER.backlight} />
        <TellTale icon="lock-closed" label="סיסמה הוזנה" lit={selfTest || !!password} tone={CLUSTER.backlight} />
        <TellTale icon="checkmark-circle" label="מוכן להתחברות" lit={selfTest || ready || !!successMessage} tone={CLUSTER.green} />
        <TellTale icon="warning" label="שגיאה" lit={selfTest || !!errorMessage} tone={CLUSTER.amber} />
      </View>
    </Animated.View>
  );

  // The start button sits on the binnacle's lower edge, half on the cluster and half on the dash.
  const startButton = (
    <View style={[styles.startDock, { marginTop: -startSize / 2 }]}>
      <StartButton onPress={() => void handleLogin()} loading={loading} ready={ready} size={startSize} />
    </View>
  );

  const footer = (
    <View style={[styles.footer, short && styles.footerShort]}>
      <Text style={[styles.footerText, short && styles.footerTextShort]}>
        הגישה למערכת מנוהלת על ידי מנהל הצי.{'\n'}
        לפתיחת חשבון פנה למנהל המערכת שלך.
      </Text>
      <Text style={styles.contactText}>
        לפניות:{' '}
        <Text
          style={styles.contactEmail}
          onPress={() => void Linking.openURL('mailto:trytolvex@gmail.com')}
          accessibilityRole="link"
        >
          trytolvex@gmail.com
        </Text>
      </Text>
      <View style={styles.legalRow} accessibilityRole="none">
        {LOGIN_LEGAL_LINKS.map(({ doc, label }, i) => (
          <React.Fragment key={doc}>
            {i > 0 && <Text style={styles.legalDot} importantForAccessibility="no" aria-hidden>·</Text>}
            <Text style={[styles.legalLink, short && styles.legalLinkShort]} accessibilityRole="link" onPress={() => navigation.navigate('Legal', { doc })}>
              {label}
            </Text>
          </React.Fragment>
        ))}
      </View>
    </View>
  );

  const cluster = wide ? (
    <View style={styles.clusterWrap}>
      <View style={[styles.binnacleWide, { paddingBottom: startSize / 2 + 30 }]}>
        {readinessGauge}
        {display}
        {revsGauge}
      </View>
      {startButton}
    </View>
  ) : (
    <View style={[styles.clusterWrap, styles.clusterWrapCompact]}>
      <View style={[styles.binnacleCompact, short && styles.binnacleShort, { paddingBottom: startSize / 2 + (short ? 14 : 22) }]}>
        <View style={[styles.gaugeRow, short && styles.gaugeRowShort]}>
          {readinessGauge}
          {revsGauge}
        </View>
        {display}
      </View>
      {startButton}
    </View>
  );

  const padTop = short ? Math.max(insets.top + 8, 14) : Math.max(insets.top + 12, wide ? 40 : 28);
  const padBottom = short ? Math.max(insets.bottom + 8, 14) : Math.max(insets.bottom + 16, wide ? 40 : 28);

  const content = (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        wide && styles.scrollContentWide,
        // Clear the status bar / Dynamic Island and the home indicator on phones.
        { paddingTop: padTop, paddingBottom: padBottom },
      ]}
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        // The tallest height seen at this width: an open keyboard shrinks the
        // view, and the cluster should scroll above it — not re-fit.
        if (fitWidth.current !== width) {
          fitWidth.current = width;
          setFitHeight(h);
          setGaugeShrink(0);
        } else if (h > fitHeight) setFitHeight(h);
      }}
    >
      {/* Measured on its own: the scroll content stretches to the screen, so
          only this wrapper reports the cluster's natural height. */}
      <View
        style={styles.fitBox}
        onLayout={(e) => {
          contentHeight.current = e.nativeEvent.layout.height + padTop + padBottom;
          refit();
        }}
      >
        {cluster}
        {footer}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container} nativeID="cluster-login">
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: CLUSTER.ground },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  fitBox: { width: '100%', alignItems: 'center' },
  scrollContentWide: { paddingHorizontal: 32, paddingVertical: 40 },

  binnacleWide: {
    width: '100%',
    maxWidth: 1080,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 44,
    paddingTop: 40,
    borderRadius: 56,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: CLUSTER.binnacle,
    borderWidth: 1,
    borderColor: CLUSTER.hairline,
    borderTopColor: 'rgba(255,255,255,0.11)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.5,
    shadowRadius: 60,
    elevation: 18,
  },
  binnacleCompact: {
    width: '100%',
    maxWidth: 520,
    paddingTop: 18,
    paddingHorizontal: 18,
    borderRadius: 32,
    backgroundColor: CLUSTER.binnacle,
    borderWidth: 1,
    borderColor: CLUSTER.hairline,
    borderTopColor: 'rgba(255,255,255,0.11)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 14,
  },
  binnacleShort: { paddingTop: 14 },
  clusterWrap: { width: '100%', maxWidth: 1080, alignItems: 'center' },
  clusterWrapCompact: { maxWidth: 520 },
  startDock: { alignItems: 'center' },
  gaugeRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 16 },
  gaugeRowShort: { marginBottom: 10 },

  gauge: {
    backgroundColor: '#0F161E',
    borderWidth: 1,
    borderColor: CLUSTER.hairlineStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  gaugeFace: {
    position: 'absolute',
    backgroundColor: CLUSTER.face,
    borderWidth: 1,
    borderColor: CLUSTER.hairline,
  },
  tick: { position: 'absolute', borderRadius: 1 },
  // The glow is web-only: dozens of shadowed ticks fading on iOS would render offscreen every frame.
  tickLit: {
    backgroundColor: CLUSTER.backlight,
    ...Platform.select({
      web: { shadowColor: CLUSTER.backlight, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 4 },
      default: {},
    }),
  },
  numeral: {
    position: 'absolute',
    textAlign: 'center',
    color: CLUSTER.inkMuted,
    fontFamily: FONT.semiBold,
    fontVariant: ['tabular-nums'],
  },
  needle: {
    position: 'absolute',
    width: 3.5,
    borderRadius: 2,
    backgroundColor: CLUSTER.ink,
    overflow: 'hidden',
    shadowColor: CLUSTER.backlight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
  },
  needleTip: { backgroundColor: CLUSTER.backlight },
  hub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C2531',
    borderWidth: 1,
    borderColor: CLUSTER.hairlineStrong,
  },
  hubDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: CLUSTER.backlight },
  readoutWindow: {
    position: 'absolute',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: CLUSTER.window,
    borderWidth: 1,
    borderColor: CLUSTER.hairline,
  },
  readoutLabel: { color: CLUSTER.inkMuted, fontFamily: FONT.medium },
  readoutValue: { color: CLUSTER.ink, fontFamily: FONT.bold, fontVariant: ['tabular-nums'], marginTop: 1 },

  display: {
    alignItems: 'stretch',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16,
    borderRadius: 24,
    backgroundColor: CLUSTER.face,
    borderWidth: 1,
    borderColor: 'rgba(95,193,240,0.16)',
  },
  logo: { alignSelf: 'center', width: 200, height: 61 },
  logoCompact: { width: 172, height: 53 },
  logoShort: { width: 150, height: 46 },
  displayShort: { paddingTop: 16, paddingBottom: 12 },
  subtitle: {
    textAlign: 'center',
    color: CLUSTER.inkMuted,
    fontFamily: FONT.medium,
    fontSize: 14,
    marginTop: 8,
  },
  fields: { gap: 12, marginTop: 20 },
  fieldsShort: { gap: 10, marginTop: 14 },
  field: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: CLUSTER.field,
    borderWidth: 1,
    borderColor: CLUSTER.hairline,
  },
  fieldShort: { minHeight: 52 },
  fieldBodyShort: { paddingVertical: 3 },
  fieldFocused: { backgroundColor: CLUSTER.fieldFocus },
  fieldBody: { flex: 1, paddingVertical: 8 },
  fieldLabel: {
    textAlign: 'right',
    color: CLUSTER.inkMuted,
    fontFamily: FONT.medium,
    fontSize: 12,
  },
  fieldInput: {
    color: CLUSTER.ink,
    fontFamily: FONT.medium,
    fontSize: 16,
    paddingVertical: 2,
    paddingHorizontal: 0,
    textAlign: 'right',
  },
  messageSlot: { minHeight: 34, justifyContent: 'center' },
  messageSlotShort: { minHeight: 24 },
  messageRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  messageText: { fontFamily: FONT.semiBold, fontSize: 13.5, textAlign: 'center' },
  lampRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: CLUSTER.hairline,
  },
  lampRowShort: { paddingTop: 10 },
  lamp: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },

  startOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161E28',
    borderWidth: 1,
    borderColor: CLUSTER.hairlineStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 10,
  },
  startRing: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 2,
  },
  startRingLit: {
    shadowColor: CLUSTER.backlight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  startCore: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#1D2633',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  startLabel: { color: CLUSTER.ink, fontFamily: FONT.bold, fontSize: 13.5 },

  footer: { marginTop: 28, alignItems: 'center', gap: 10, maxWidth: 440 },
  footerShort: { marginTop: 12, gap: 4 },
  footerText: {
    textAlign: 'center',
    color: CLUSTER.inkMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  footerTextShort: { fontSize: 12, lineHeight: 17 },
  contactText: { textAlign: 'center', color: CLUSTER.inkMuted, fontFamily: FONT.regular, fontSize: 13 },
  contactEmail: { color: CLUSTER.backlight, fontFamily: FONT.semiBold },
  legalRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 6 },
  legalLink: { color: CLUSTER.inkMuted, fontFamily: FONT.medium, fontSize: 12.5, textDecorationLine: 'underline', paddingVertical: 4 },
  legalDot: { color: CLUSTER.inkMuted, fontSize: 12.5 },
  legalLinkShort: { paddingVertical: 0 },
});
