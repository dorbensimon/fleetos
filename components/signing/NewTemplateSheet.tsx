import React from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { SG_COLORS, SG_RADIUS, SG_SHADOW, SG_TYPO } from './signingTheme';

export function NewTemplateSheet({
  visible,
  name,
  onChangeName,
  onClose,
  onPickGallery,
  onPickFile,
  busy,
}: {
  visible: boolean;
  name: string;
  onChangeName: (v: string) => void;
  onClose: () => void;
  onPickGallery: () => void;
  onPickFile: () => void;
  busy: 'gallery' | 'file' | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, SG_SHADOW.sheet]}>
        <View style={styles.grabber} />
        <AppText style={[SG_TYPO.sheetTitle, styles.title]}>תבנית חדשה</AppText>
        <AppText style={[SG_TYPO.sub, styles.sub]}>העלה PDF או תמונה, ואז מקם את שדות החתימה.</AppText>

        <View style={styles.field}>
          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder="שם המסמך"
            placeholderTextColor="rgba(14,30,43,0.3)"
            textAlign="right"
            style={styles.input}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy !== null}
            onPress={onPickGallery}
            style={[styles.actionBtn, SG_SHADOW.primaryButton]}
          >
            <LinearGradient colors={[SG_COLORS.accentLine, SG_COLORS.deepSky]} style={StyleSheet.absoluteFill} />
            {busy === 'gallery' ? (
              <Ionicons name="hourglass-outline" size={18} color={SG_COLORS.white} />
            ) : (
              <>
                <Ionicons name="images-outline" size={18} color={SG_COLORS.white} />
                <AppText style={[SG_TYPO.sheetButton, styles.primaryLabel]}>גלריה</AppText>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy !== null}
            onPress={onPickFile}
            style={[styles.actionBtn, styles.fileBtn]}
          >
            {busy === 'file' ? (
              <Ionicons name="hourglass-outline" size={18} color={SG_COLORS.textPrimary} />
            ) : (
              <>
                <Ionicons name="document-attach-outline" size={18} color={SG_COLORS.textPrimary} />
                <AppText style={[SG_TYPO.sheetButton, styles.fileLabel]}>קובץ</AppText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: SG_COLORS.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SG_COLORS.white,
    borderTopLeftRadius: SG_RADIUS.sheetTop,
    borderTopRightRadius: SG_RADIUS.sheetTop,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 36,
  },
  grabber: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(14,30,43,0.15)', alignSelf: 'center', marginBottom: 18 },
  title: { color: SG_COLORS.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  sub: { color: SG_COLORS.textTertiary, textAlign: 'right', writingDirection: 'rtl', marginTop: 4 },
  field: { marginTop: 18, borderBottomWidth: 1.5, borderBottomColor: SG_COLORS.hairline, paddingBottom: 10 },
  input: { fontSize: 17, fontFamily: 'Assistant_400Regular', color: SG_COLORS.textPrimary },
  actions: { flexDirection: 'row-reverse', gap: 10, marginTop: 20 },
  actionBtn: {
    flex: 1,
    height: 54,
    borderRadius: SG_RADIUS.button,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  primaryLabel: { color: SG_COLORS.white },
  fileBtn: { backgroundColor: SG_COLORS.neutralFill },
  fileLabel: { color: SG_COLORS.textPrimary },
});
