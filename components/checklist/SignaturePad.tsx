import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, Pressy, STATUS } from '../driverKit';
import { SignatureSurface } from './SignatureSurface';
import { t } from '../../lib/i18n';

/**
 * A hand signature: a large white box with a line to sign on, "חתמו כאן"
 * until the first stroke, and a clear button. The signature is handed up as
 * a PNG and never stored on the device; every meeting is signed afresh.
 */
export function SignaturePad({
  title,
  onChange,
  onDrawing,
  disabled = false,
}: {
  title: string;
  onChange: (png: string | null) => void;
  onDrawing?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [clearKey, setClearKey] = useState(0);
  const [ink, setInk] = useState(0);
  const [signed, setSigned] = useState(false);

  const state = signed ? t('common.signedDone') : ink > 0 ? t('signature.continueSigning') : t('signature.notSignedYet');
  return (
    <View style={styles.wrap}>
      <DKText variant="label" color={DK.inkSoft}>
        {title}
      </DKText>
      <View style={[styles.box, signed && styles.boxSigned]} pointerEvents={disabled ? 'none' : 'auto'}>
        <View style={styles.line} pointerEvents="none" />
        {ink === 0 && (
          <View style={styles.placeholder} pointerEvents="none">
            <Ionicons name="finger-print-outline" size={26} color={DK.faint} />
            <DKText variant="body" color={DK.muted}>
              {t('signature.signHereFinger')}
            </DKText>
          </View>
        )}
        <SignatureSurface
          label={t('signature.padLabel', { title })}
          clearKey={clearKey}
          onDrawing={onDrawing}
          onChange={(png, length) => {
            setInk(length);
            setSigned(!!png);
            onChange(png);
          }}
        />
      </View>
      <View style={styles.tools}>
        <View style={styles.state} accessibilityLiveRegion="polite">
          <Ionicons name={signed ? 'checkmark-circle' : 'create-outline'} size={17} color={signed ? STATUS.ok.fg : DK.muted} />
          <DKText variant="caption" color={signed ? STATUS.ok.fg : DK.muted}>
            {state}
          </DKText>
        </View>
        <Pressy
          onPress={() => {
            setClearKey((k) => k + 1);
            setInk(0);
            setSigned(false);
            onChange(null);
          }}
          disabled={disabled || ink === 0}
          accessibilityLabel={t('signature.clearLabel')}
          style={styles.clear}
          pressScale={0.95}
        >
          <Ionicons name="refresh" size={17} color={DK.accent} />
          <DKText variant="label" color={DK.accent}>
            {t('signature.clear')}
          </DKText>
        </Pressy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  box: {
    height: 190,
    borderRadius: 20,
    backgroundColor: DK.surface,
    borderWidth: 2,
    borderColor: 'rgba(47,91,255,0.28)',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  boxSigned: { borderStyle: 'solid', borderColor: 'rgba(11,125,87,0.35)' },
  line: { position: 'absolute', start: 24, end: 24, bottom: 46, height: 1.5, backgroundColor: 'rgba(10,22,38,0.18)' },
  placeholder: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 22 },
  tools: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  state: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  clear: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DK.accentSoft },
});
