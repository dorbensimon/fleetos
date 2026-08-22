import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { supabase } from '../lib/supabase';
import { resolveRouteForUser } from '../lib/session';

/**
 * Shown once, right after a first login with an owner/admin-assigned
 * temporary password. Blocks entry to every home screen until the user
 * picks a permanent password of their own (must_change_password=true
 * is the gate — see resolveRouteForUser).
 */

const COLORS = {
  black: '#1D1D1F',
  gray: '#6E6E73',
  grayLight: '#AEAEB2',
  bg: '#F5F5F7',
  blue: '#0071E3',
  white: '#FFFFFF',
  fieldBg: '#FAFAFA',
  fieldBorder: '#E2E2E2',
  red: '#D70015',
};

type Props = NativeStackScreenProps<RootStackParamList, 'SetPassword'>;

export default function SetPasswordScreen({ navigation }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!password) e.password = 'שדה חובה';
    else if (password.length < 6) e.password = 'לפחות 6 תווים';
    if (!confirmPassword) e.confirmPassword = 'שדה חובה';
    else if (confirmPassword !== password) e.confirmPassword = 'הסיסמאות אינן תואמות';
    return e;
  };

  const submit = async () => {
    setGeneralError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      const { data: userData, error: authError } = await supabase.auth.updateUser({ password });
      if (authError || !userData.user) {
        setGeneralError(authError?.message || 'עדכון הסיסמה נכשל');
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', userData.user.id);

      if (profileError) {
        setGeneralError('הסיסמה עודכנה אך שמירת הסטטוס נכשלה. נסה להתחבר שוב');
        return;
      }

      const result = await resolveRouteForUser(userData.user.id);
      if (!result.ok) {
        setGeneralError(result.error);
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: result.route }] });
    } catch {
      setGeneralError('אירעה שגיאה. נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Ionicons name="lock-closed-outline" size={40} color={COLORS.blue} style={styles.icon} />
          <Text style={styles.title}>קביעת סיסמה קבועה</Text>
          <Text style={styles.subtitle}>
            זו הכניסה הראשונה שלך למערכת. קבע סיסמה קבועה משלך כדי להמשיך.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>סיסמה חדשה</Text>
            <View style={[styles.inputRow, !!errors.password && styles.inputError]}>
              <TextInput
                style={styles.inputInRow}
                placeholder="לפחות 6 תווים"
                placeholderTextColor={COLORS.grayLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textAlign="right"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={19}
                  color={COLORS.grayLight}
                />
              </TouchableOpacity>
            </View>
            {!!errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>אימות סיסמה</Text>
            <TextInput
              style={[styles.input, !!errors.confirmPassword && styles.inputError]}
              placeholder="הזן שוב את הסיסמה"
              placeholderTextColor={COLORS.grayLight}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textAlign="right"
            />
            {!!errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword}</Text>}
          </View>

          {!!generalError && <Text style={styles.generalError}>{generalError}</Text>}

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={submit}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>המשך</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  icon: { alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.black, textAlign: 'center', marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.black, textAlign: 'right', marginBottom: 8 },
  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.black,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
    gap: 10,
  },
  inputInRow: {
    flex: 1,
    fontSize: 15,
    color: COLORS.black,
  },
  inputError: { borderColor: COLORS.red },
  fieldError: { fontSize: 11.5, color: COLORS.red, textAlign: 'right', marginTop: 6 },
  generalError: { fontSize: 13, color: COLORS.red, textAlign: 'center', marginBottom: 16 },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});
