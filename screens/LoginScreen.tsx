import React, { useState } from 'react';
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
  useColorScheme,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

// פלטת צבעים בהשראת Apple - בהיר וכהה
const LIGHT_COLORS = {
  black: '#1D1D1F',
  gray: '#6E6E73',
  grayLight: '#AEAEB2',
  bg: '#F5F5F7',
  blue: '#0071E3',
  white: '#FFFFFF',
  cardBg: 'rgba(255, 255, 255, 0.35)',
  cardBorder: 'rgba(255, 255, 255, 0.7)',
  cardBorderStrong: 'rgba(255, 255, 255, 0.85)',
  cardBorderHighlight: 'rgba(255, 255, 255, 1)',
  inputBg: 'rgba(255, 255, 255, 0.25)',
  inputBorder: 'rgba(255, 255, 255, 0.7)',
  text: '#1D1D1F',
};

const DARK_COLORS = {
  black: '#F5F5F7',
  gray: '#A1A1A6',
  grayLight: '#6E6E73',
  bg: '#000000',
  blue: '#0A84FF',
  white: '#FFFFFF',
  cardBg: 'rgba(255, 255, 255, 0.12)',
  cardBorder: 'rgba(255, 255, 255, 0.2)',
  cardBorderStrong: 'rgba(255, 255, 255, 0.35)',
  cardBorderHighlight: 'rgba(255, 255, 255, 0.55)',
  inputBg: 'rgba(255, 255, 255, 0.08)',
  inputBorder: 'rgba(255, 255, 255, 0.2)',
  text: '#F5F5F7',
};

export default function LoginScreen() {
  const systemScheme = useColorScheme();
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(null);
  const isDark = themeOverride ? themeOverride === 'dark' : systemScheme === 'dark';
  const COLORS = isDark ? DARK_COLORS : LIGHT_COLORS;
  const blurTint = isDark ? 'dark' : 'light';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // TODO: לחבר כאן ל-Supabase Auth (signInWithPassword)
    setLoading(true);
    try {
      // await supabase.auth.signInWithPassword({ email: identifier, password })
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(COLORS);

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
          {/* מחליף מצב תצוגה */}
          <TouchableOpacity
            onPress={() => setThemeOverride(isDark ? 'light' : 'dark')}
            style={styles.themeToggle}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={22}
              color={COLORS.text}
            />
          </TouchableOpacity>

          {/* לוגו */}
          <View style={styles.logoWrap}>
            <Image
              source={
                isDark
                  ? require('../images/TOLVEX-LOGO-DARK.jpg')
                  : require('../images/TOLVEX-LOGO.png')
              }
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* כרטיס זכוכית */}
          <BlurView intensity={90} tint={blurTint} style={styles.card}>
            <Text style={styles.label}>מייל או טלפון</Text>
            <BlurView intensity={35} tint={blurTint} style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="הזן מייל או טלפון"
                placeholderTextColor={COLORS.grayLight}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                keyboardType="email-address"
                textAlign="right"
              />
            </BlurView>

            <Text style={[styles.label, { marginTop: 18 }]}>סיסמה</Text>
            <BlurView intensity={35} tint={blurTint} style={styles.inputWrap}>
              <View style={styles.passwordRow}>
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={19}
                    color={COLORS.grayLight}
                  />
                </TouchableOpacity>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="הזן סיסמה"
                  placeholderTextColor={COLORS.grayLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                />
              </View>
            </BlurView>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.button}
            >
              <Text style={styles.buttonText}>
                {loading ? 'מתחבר...' : 'התחברות'}
              </Text>
            </TouchableOpacity>
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

const createStyles = (COLORS: typeof LIGHT_COLORS) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 40,
    },
    themeToggle: {
      alignSelf: 'flex-end',
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      backgroundColor: COLORS.inputBg,
      borderWidth: 1,
      borderColor: COLORS.inputBorder,
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
      borderRadius: 28,
      padding: 24,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: COLORS.cardBorderStrong,
      borderTopColor: COLORS.cardBorderHighlight,
      borderLeftColor: COLORS.cardBorderHighlight,
      backgroundColor: COLORS.cardBg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.22,
      shadowRadius: 30,
      elevation: 12,
    },
    label: {
      fontSize: 13,
      fontWeight: '500',
      color: COLORS.gray,
      textAlign: 'right',
      marginBottom: 8,
    },
    inputWrap: {
      borderWidth: 1.5,
      borderColor: COLORS.inputBorder,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: COLORS.inputBg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    input: {
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontSize: 15,
      color: COLORS.text,
    },
    passwordRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: 13,
      fontSize: 15,
      color: COLORS.text,
      marginRight: 10,
    },
    button: {
      backgroundColor: COLORS.blue,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 26,
      shadowColor: COLORS.blue,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
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
