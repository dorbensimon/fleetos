import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SetPasswordScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>קביעת סיסמה קבועה</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' },
  text: { fontSize: 18, fontWeight: '600', color: '#1D1D1F' },
});
