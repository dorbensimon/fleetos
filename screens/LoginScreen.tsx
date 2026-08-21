import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

// פלטת צבעים בהשראת Apple
const COLORS = {
  black: '#1D1D1F',
  gray: '#6E6E73',
  grayLight: '#AEAEB2',
  bg: '#F5F5F7',
  blue: '#0071E3',
  white: '#FFFFFF',
  cardBg: 'rgba(90, 100, 120, 0.16)',
  cardBorder: 'rgba(255, 255, 255, 0.6)',
  inputBg: 'rgba(90, 100, 120, 0.12)',
  inputBorder: 'rgba(255, 255, 255, 0.55)',
  text: '#1D1D1F',
};

interface AnimatedFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  icon: keyof typeof Ionicons.glyphMap;
  secureTextEntry?: boolean;
  showToggle?: boolean;
  onToggle?: () => void;
  showPassword?: boolean;
  keyboardType?: 'default' | 'email-address';
}

function AnimatedField({
  label,
  value,
  onChangeText,
  icon,
  secureTextEntry,
  showToggle,
  onToggle,
  showPassword,
  keyboardType = 'default',
}: AnimatedFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isFocused || value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [isFocused, value]);

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [17, 6] });
  const labelFontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [15, 12] });

  return (
    <View style={[styles.inputWrap, isFocused && styles.inputWrapFocused]}>
      <View style={styles.inputRow}>
        <Ionicons name={icon} size={18} color={isFocused ? COLORS.blue : COLORS.grayLight} />
        <View style={styles.inputTextArea}>
          <Animated.Text
            style={[
              styles.floatingLabel,
              {
                top: labelTop,
                fontSize: labelFontSize,
                color: isFocused ? COLORS.blue : COLORS.gray,
              },
            ]}
          >
            {label}
          </Animated.Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
            textAlign="right"
          />
        </View>
        {showToggle && (
          <TouchableOpacity onPress={onToggle}>
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={19}
              color={COLORS.grayLight}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ShimmerButton({ onPress, disabled, label }: { onPress: () => void; disabled: boolean; label: string }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
      <Animated.View
        pointerEvents="none"
        style={[styles.shimmer, { transform: [{ translateX }, { rotate: '20deg' }] }]}
      />
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async () => {
    // TODO: לחבר כאן ל-Supabase Auth (signInWithPassword)
    setLoading(true);
    try {
      // await supabase.auth.signInWithPassword({ email: identifier, password })
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* לוגו */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../images/TOLVEX-LOGO.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* כרטיס */}
          <BlurView intensity={90} tint="light" style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={28} color={COLORS.blue} />
              </View>
              <Text style={styles.cardTitle}>ברוכים השבים</Text>
              <Text style={styles.cardSubtitle}>התחברו כדי להמשיך</Text>
            </View>

            <AnimatedField
              label="מייל או טלפון"
              value={identifier}
              onChangeText={setIdentifier}
              icon="mail-outline"
              keyboardType="email-address"
            />

            <View style={{ height: 14 }} />

            <AnimatedField
              label="סיסמה"
              value={password}
              onChangeText={setPassword}
              icon="lock-closed-outline"
              secureTextEntry={!showPassword}
              showToggle
              showPassword={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />

            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <Text style={styles.rememberText}>זכור אותי</Text>
            </TouchableOpacity>

            <ShimmerButton
              onPress={handleLogin}
              disabled={loading}
              label={loading ? 'מתחבר...' : 'התחברות'}
            />
          </BlurView>

          <Text style={styles.footerText}>
            הגישה למערכת מנוהלת על ידי מנהל הצי.{'\n'}
            לפתיחת חשבון פנה למנהל המערכת שלך.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoImage: {
    width: 220,
    height: 90,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  appSubtitle: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  card: {
    borderRadius: 24,
    padding: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
    elevation: 14,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 113, 227, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.gray,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  inputWrapFocused: {
    borderColor: COLORS.blue,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 58,
  },
  inputTextArea: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'flex-end',
    height: '100%',
  },
  floatingLabel: {
    position: 'absolute',
    right: 0,
    fontWeight: '500',
  },
  input: {
    fontSize: 15,
    color: COLORS.text,
    paddingBottom: 8,
    textAlign: 'right',
  },
  rememberRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.inputBorder,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  rememberText: {
    fontSize: 14,
    color: COLORS.gray,
    marginRight: 8,
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 26,
    overflow: 'hidden',
    shadowColor: COLORS.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  shimmer: {
    position: 'absolute',
    top: -30,
    width: 60,
    height: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  buttonText: { color: COLORS.white, fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
  footerText: {
    textAlign: 'center',
    color: COLORS.gray,
    fontSize: 12,
    marginTop: 28,
    lineHeight: 18,
  },
});
