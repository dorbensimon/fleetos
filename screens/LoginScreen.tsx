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
import { Ionicons } from '@expo/vector-icons';

// פלטת צבעים
const COLORS = {
  black: '#000000',
  gray: '#666666',
  grayLight: '#979797',
  bg: '#EEEEEE',
  blue: '#0088CC',
  white: '#FFFFFF',
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
            <View style={styles.logoBox}>
              <Ionicons name="bus" size={32} color={COLORS.white} />
            </View>
            <Text style={styles.appName}>FleetOS</Text>
            <Text style={styles.appSubtitle}>ניהול צי רכבים</Text>
          </View>

          {/* כרטיס */}
          <View style={styles.card}>
            <Text style={styles.label}>מייל או טלפון</Text>
            <View style={styles.inputWrap}>
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

            <Text style={[styles.label, { marginTop: 18 }]}>סיסמה</Text>
            <View style={styles.inputWrap}>
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
            </View>

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
          </View>

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
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: COLORS.black,
  },
  appName: { fontSize: 26, fontWeight: '700', color: COLORS.black },
  appSubtitle: { fontSize: 13, color: COLORS.gray, marginTop: 4 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'right',
    marginBottom: 8,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 10,
    backgroundColor: COLORS.white,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.black,
  },
  passwordRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.black,
    marginRight: 8,
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  footerText: {
    textAlign: 'center',
    color: COLORS.gray,
    fontSize: 11,
    marginTop: 28,
    lineHeight: 18,
  },
});