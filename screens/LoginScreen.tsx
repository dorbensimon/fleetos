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
  cardBg: 'rgba(255, 255, 255, 0.35)',
  cardBorder: 'rgba(255, 255, 255, 0.7)',
  cardBorderStrong: 'rgba(255, 255, 255, 0.85)',
  cardBorderHighlight: 'rgba(255, 255, 255, 1)',
  inputBg: 'rgba(255, 255, 255, 0.25)',
  inputBorder: 'rgba(255, 255, 255, 0.7)',
  text: '#1D1D1F',
};

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

          {/* כרטיס זכוכית */}
          <BlurView intensity={90} tint="light" style={styles.card}>
            <Text style={styles.label}>מייל או טלפון</Text>
            <BlurView intensity={35} tint="light" style={styles.inputWrap}>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color={COLORS.grayLight} />
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
              </View>
            </BlurView>

            <Text style={[styles.label, { marginTop: 18 }]}>סיסמה</Text>
            <BlurView intensity={35} tint="light" style={styles.inputWrap}>
              <View style={styles.inputRow}>
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
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.grayLight} />
              </View>
            </BlurView>

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
    borderRadius: 32,
    padding: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: COLORS.cardBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 40,
    elevation: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.gray,
    textAlign: 'right',
    marginBottom: 8,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.inputBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
    marginRight: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
    marginRight: 10,
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
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
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
