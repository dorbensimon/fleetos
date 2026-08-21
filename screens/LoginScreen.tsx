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
  blueDark: '#0058B8',
  white: '#FFFFFF',
  border: 'rgba(0, 0, 0, 0.08)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',
};

export default function LoginScreen() {
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
            <BlurView intensity={40} tint="light" style={styles.logoBox}>
              <Text style={styles.logoLetter}>F</Text>
            </BlurView>
            <Text style={styles.appName}>FleetOS</Text>
            <Text style={styles.appSubtitle}>ניהול צי רכבים</Text>
          </View>

          {/* כרטיס זכוכית */}
          <BlurView intensity={50} tint="light" style={styles.card}>
            <Text style={styles.label}>מייל או טלפון</Text>
            <BlurView intensity={35} tint="light" style={styles.inputWrap}>
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
            <BlurView intensity={35} tint="light" style={styles.inputWrap}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  logoLetter: {
    fontSize: 32,
    fontWeight: '600',
    color: COLORS.blue,
  },
  appName: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.black,
    letterSpacing: -0.5,
  },
  appSubtitle: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  card: {
    borderRadius: 28,
    padding: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
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
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
    color: COLORS.black,
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
    color: COLORS.black,
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
