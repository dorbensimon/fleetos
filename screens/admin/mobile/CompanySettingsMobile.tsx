import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, DriverPage, EditField, HeroTitle, KitSection, PrimaryAction, Pressy, Reveal, STATUS, Surface } from '../../../components/driverKit';
import { DateField } from '../../../components/ui/DateField';
import { Select } from '../../../components/ui/Select';
import { LiquidGlassSwitch } from '../../../components/ui/LiquidGlassSwitch';
import type { CompanyContactForm, CompanySettingsForm, CompanyType, SafetyOfficerForm } from '../../../components/desktop/CompanySettingsDesktopView';

type Props = {
  insetTop: number;
  insetBottom: number;
  form: CompanySettingsForm;
  errors: Record<string, string>;
  dirty: boolean;
  saving: boolean;
  onBack: () => void;
  onChange: <K extends keyof CompanySettingsForm>(field: K, value: CompanySettingsForm[K]) => void;
  onChangeContact: (index: number, field: keyof CompanyContactForm, value: string) => void;
  onChangeOfficer: (index: number, field: keyof SafetyOfficerForm, value: string) => void;
  onFieldBlur: (key: string) => void;
  onPickImage: (kind: 'logo' | 'stamp') => void;
  onClearImage: (kind: 'logo' | 'stamp') => void;
  onSave: () => void;
  onDiscard: () => void;
};

const TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: 'בע״מ', label: 'חברה בע״מ' },
  { value: 'עוסק מורשה', label: 'עוסק מורשה' },
];

const digits = (v: string, max = 10) => v.replace(/\D/g, '').slice(0, max);

/**
 * The company's settings on the phone: the same sections as the desktop,
 * one after another. Nothing saves until "שמירה"; the bar that offers it
 * appears only once something changed, with a way to undo.
 */
export function CompanySettingsMobile(p: Props) {
  const { form, errors } = p;
  const errorCount = Object.keys(errors).length;
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={<HeroTitle title="הגדרות החברה" subtitle={form.name || 'פרטים, אנשי קשר, לוגו וחותמת'} onBack={p.onBack} />}
      footer={
        p.dirty ? (
          <View style={styles.footer}>
            {errorCount > 0 && (
              <DKText variant="caption" color={STATUS.expired.fg} style={styles.center}>
                {errorCount === 1 ? 'יש שדה אחד שצריך לתקן' : `יש ${errorCount} שדות שצריך לתקן`}
              </DKText>
            )}
            <View style={styles.row}>
              <PrimaryAction label="ביטול השינויים" tone="ghost" onPress={p.onDiscard} disabled={p.saving} style={styles.flex} />
              <PrimaryAction label="שמירה" icon="checkmark" onPress={p.onSave} loading={p.saving} style={styles.flex} />
            </View>
          </View>
        ) : undefined
      }
    >
      <Reveal index={0}>
        <KitSection>
          <EditField first label="שם החברה" required value={form.name} onChangeText={(v) => p.onChange('name', v)} onBlur={() => p.onFieldBlur('name')} error={errors.name} />
          <EditField label="ח.פ / ע.מ" required value={form.businessId} onChangeText={(v) => p.onChange('businessId', digits(v, 9))} onBlur={() => p.onFieldBlur('businessId')} error={errors.businessId} keyboardType="number-pad" ltr hint="9 ספרות" />
          <EditField label="סוג חברה" editor={<Select value={form.companyType} options={TYPE_OPTIONS} onChange={(v) => p.onChange('companyType', v)} allowClear placeholder="לא נבחר" />} />
          <EditField label="תוקף רישיון מוביל" editor={<DateField value={form.carrierLicenseExpiry} onChange={(v) => p.onChange('carrierLicenseExpiry', v)} placeholder="לא הוזן" />} />
          <EditField label="כתובת" value={form.address} onChangeText={(v) => p.onChange('address', v)} />
        </KitSection>
      </Reveal>

      <Reveal index={1}>
        <KitSection title="תקשורת ודוא״ל">
          <EditField first label="טלפון קווי" value={form.landline} onChangeText={(v) => p.onChange('landline', digits(v))} onBlur={() => p.onFieldBlur('landline')} error={errors.landline} keyboardType="phone-pad" ltr />
          <EditField label="טלפון נייד" value={form.mobile} onChangeText={(v) => p.onChange('mobile', digits(v))} onBlur={() => p.onFieldBlur('mobile')} error={errors.mobile} keyboardType="phone-pad" ltr />
          <EditField label="פקס" value={form.fax} onChangeText={(v) => p.onChange('fax', digits(v))} onBlur={() => p.onFieldBlur('fax')} error={errors.fax} keyboardType="phone-pad" ltr />
          <EditField label="דוא״ל" value={form.email} onChangeText={(v) => p.onChange('email', v.trim())} onBlur={() => p.onFieldBlur('email')} error={errors.email} keyboardType="email-address" ltr />
          <EditField label="מייל לשליחת קבצים" value={form.filesEmail} onChangeText={(v) => p.onChange('filesEmail', v.trim())} onBlur={() => p.onFieldBlur('filesEmail')} error={errors.filesEmail} keyboardType="email-address" ltr />
          <EditField label="מייל נוסף לקבצים" value={form.filesEmail2} onChangeText={(v) => p.onChange('filesEmail2', v.trim())} onBlur={() => p.onFieldBlur('filesEmail2')} error={errors.filesEmail2} keyboardType="email-address" ltr />
        </KitSection>
      </Reveal>

      <Reveal index={2}>
        <KitSection title="דוח קילומטראז׳ חודשי">
          <View style={styles.toggle}>
            <View style={styles.flex}>
              <DKText variant="label">שליחה אוטומטית</DKText>
              <DKText variant="caption" color={DK.muted}>
                {form.reportAuto ? 'ב־1 לכל חודש יישלח אקסל עם הקילומטראז׳ של כל הרכבים' : 'הדוח לא נשלח'}
              </DKText>
            </View>
            <LiquidGlassSwitch value={form.reportAuto} onValueChange={(v) => p.onChange('reportAuto', v)} accessibilityLabel="שליחה אוטומטית של דוח הקילומטראז׳" tint={DK.accent} />
          </View>
          <EditField label="מייל לקבלת הדוח" required={form.reportAuto} value={form.reportEmail} onChangeText={(v) => p.onChange('reportEmail', v.trim())} onBlur={() => p.onFieldBlur('reportEmail')} error={errors.reportEmail} keyboardType="email-address" ltr />
        </KitSection>
      </Reveal>

      {form.contacts.map((c, i) => (
        <Reveal key={`contact${i}`} index={3 + i}>
          <KitSection title={`איש קשר ${i + 1}`}>
            <EditField first label="שם מלא" value={c.name} onChangeText={(v) => p.onChangeContact(i, 'name', v)} />
            <EditField label="תפקיד" value={c.role} onChangeText={(v) => p.onChangeContact(i, 'role', v)} placeholder="למשל: מנהל תפעול" />
            <EditField label="טלפון" value={c.phone} onChangeText={(v) => p.onChangeContact(i, 'phone', digits(v))} onBlur={() => p.onFieldBlur(`contact${i}Phone`)} error={errors[`contact${i}Phone`]} keyboardType="phone-pad" ltr />
            <EditField label="דוא״ל" value={c.email} onChangeText={(v) => p.onChangeContact(i, 'email', v.trim())} onBlur={() => p.onFieldBlur(`contact${i}Email`)} error={errors[`contact${i}Email`]} keyboardType="email-address" ltr />
          </KitSection>
        </Reveal>
      ))}

      {form.officers.map((o, i) => (
        <Reveal key={`officer${i}`} index={5 + i}>
          <KitSection title={i === 0 ? 'קצין בטיחות' : 'קצין בטיחות נוסף'}>
            <EditField first label="שם" value={o.name} onChangeText={(v) => p.onChangeOfficer(i, 'name', v)} />
            <EditField label="טלפון" value={o.phone} onChangeText={(v) => p.onChangeOfficer(i, 'phone', digits(v))} onBlur={() => p.onFieldBlur(`officer${i}Phone`)} error={errors[`officer${i}Phone`]} keyboardType="phone-pad" ltr />
          </KitSection>
        </Reveal>
      ))}

      <Reveal index={7}>
        <KitSection title="לוגו וחותמת">
          <View style={styles.slots}>
            <ImageSlot title="לוגו החברה" icon="image-outline" uri={form.logoUri} onPick={() => p.onPickImage('logo')} onClear={() => p.onClearImage('logo')} />
            <ImageSlot title="חותמת" icon="ribbon-outline" uri={form.stampUri} onPick={() => p.onPickImage('stamp')} onClear={() => p.onClearImage('stamp')} />
          </View>
          <DKText variant="caption" color={DK.muted} style={styles.slotHint}>
            PNG או JPG. רקע שקוף ייראה הכי טוב על מסמכים ודוחות.
          </DKText>
        </KitSection>
      </Reveal>
    </DriverPage>
  );
}

function ImageSlot({ title, icon, uri, onPick, onClear }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; uri: string | null; onPick: () => void; onClear: () => void }) {
  return (
    <View style={styles.slot}>
      <Pressy onPress={onPick} accessibilityLabel={uri ? `החלפת ${title}` : `בחירת ${title}`} pressScale={0.97}>
        <Surface style={[styles.slotBox, !uri && styles.slotEmpty]}>
          {uri ? (
            <Image source={{ uri }} accessibilityLabel={title} style={styles.slotImage} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <>
              <Ionicons name={icon} size={26} color={DK.accent} />
              <DKText variant="caption" color={DK.accent}>
                בחירת תמונה
              </DKText>
            </>
          )}
        </Surface>
      </Pressy>
      <View style={styles.slotCaption}>
        <DKText variant="label">{title}</DKText>
        {!!uri && (
          <Pressy onPress={onClear} accessibilityLabel={`הסרת ${title}`} style={styles.slotClear} pressScale={0.9}>
            <DKText variant="caption" color={STATUS.expired.fg}>
              הסרה
            </DKText>
          </Pressy>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row-reverse', gap: 10 },
  footer: { gap: 8 },
  toggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 },
  slots: { flexDirection: 'row-reverse', gap: 12, padding: 16, paddingBottom: 8 },
  slot: { flex: 1, gap: 6 },
  slotBox: { height: 120, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, backgroundColor: DK.surfaceSunk, shadowOpacity: 0, elevation: 0 },
  slotEmpty: { backgroundColor: DK.accentSoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(47,91,255,0.35)' },
  slotImage: { width: '86%', height: '86%' },
  slotCaption: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingHorizontal: 2 },
  slotClear: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6 },
  slotHint: { paddingHorizontal: 16, paddingBottom: 14 },
});
