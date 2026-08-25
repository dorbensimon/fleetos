import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';

/** Driver home screen's menu button — opens the full-screen menu (profile/settings/logout). */
export function DriverMenuButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity style={styles.menuButton} activeOpacity={0.8} onPress={() => navigation.navigate('Menu')}>
      <Ionicons name="person-circle-outline" size={26} color={COLORS.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
