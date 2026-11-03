// הודעת שגיאה קטנה שרועדת כשהיא מופיעה (קובץ לא מתאים, מספר שגוי...)
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DKText, STATUS } from '../driverKit';

/** A fixable mistake stays on the form: a red note that shakes each time it changes. */
export function ShakeNote({ text }: { text: string }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    x.setValue(0);
    Animated.sequence([10, -8, 6, -4, 0].map((to) => Animated.timing(x, { toValue: to, duration: 60, useNativeDriver: true }))).start();
  }, [text, x]);
  return (
    <Animated.View style={[styles.note, { transform: [{ translateX: x }] }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Ionicons name="alert-circle" size={16} color={STATUS.expired.fg} />
      <DKText variant="caption" color={STATUS.expired.fg} style={styles.text}>{text}</DKText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: STATUS.expired.soft },
  text: { flex: 1 },
});
