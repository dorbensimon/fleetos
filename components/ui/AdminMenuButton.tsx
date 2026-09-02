import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';

/** The admin header's menu button — opens the full-screen menu (profile/departments/settings/logout). */
export function AdminMenuButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('Menu')}
      accessibilityRole="button"
      accessibilityLabel="תפריט"
    >
      <Ionicons name="person-circle-outline" size={26} color={COLORS.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
