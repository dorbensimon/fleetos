import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../../lib/theme';
import { formatPhone } from '../../lib/phone';
import {
  DesktopDateField,
  DesktopInput,
  DesktopSelect,
  DLtrText,
  DText,
  HoverPressable,
  prefersReducedMotion,
} from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';

/**
 * Desktop body of the company settings page. Three zones fill the width:
 * a section menu (RTL right) whose highlight glides with the scroll, the
 * form as rounded grouped panels, and — on wide screens — a live company
 * card with a "what's missing" checklist. Saving lives in a floating
 * capsule that rises only while there is something to save or report.
 * Purely presentational — CompanySettingsScreen owns state and saving.
 */

export type CompanyType = 'בע״מ' | 'עוסק מורשה';

export interface CompanyContactForm {
  name: string;
  role: string;
  phone: string;
  email: string;
}

export interface SafetyOfficerForm {
  name: string;
  phone: string;
}

export interface CompanySettingsForm {
  name: string;
  businessId: string;
  companyType: CompanyType | null;
  address: string;
  carrierLicenseExpiry: string | null;
  landline: string;
  mobile: string;
  fax: string;
  email: string;
  filesEmail: string;
  filesEmail2: string;
  reportEmail: string;
  reportAuto: boolean;
  contacts: CompanyContactForm[];
  officers: SafetyOfficerForm[];
  logoUri: string | null;
  stampUri: string | null;
}

type SectionKey = 'details' | 'contact' | 'report' | 'people' | 'safety' | 'branding';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SECTIONS: {
  key: SectionKey;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  {
    key: 'details',
    label: 'פרטי החברה',
    hint: 'השם, ח.פ והפרטים הרשמיים של החברה.',
    icon: 'business-outline',
  },
  {
    key: 'contact',
    label: 'תקשורת ודוא״ל',
    hint: 'איך אפשר להשיג את החברה ולאן לשלוח קבצים.',
    icon: 'call-outline',
  },
  {
    key: 'report',
    label: 'דוח ספידומטר חודשי',
    hint: 'ב-1 לכל חודש יישלח למייל הזה קובץ אקסל עם הקילומטראז׳ של כל הרכבים.',
    icon: 'speedometer-outline',
  },
  {
    key: 'people',
    label: 'אנשי קשר',
    hint: 'האנשים שאפשר לפנות אליהם בחברה.',
    icon: 'people-outline',
  },
  {
    key: 'safety',
    label: 'קציני בטיחות',
    hint: 'החברה הבודקת ואנשי הקשר שלה.',
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'branding',
    label: 'לוגו וחותמת',
    hint: 'PNG או JPG. רקע שקוף ייראה הכי טוב על מסמכים.',
    icon: 'image-outline',
  },
];

const COMPANY_TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: 'בע״מ', label: 'חברה בע״מ' },
  { value: 'עוסק מורשה', label: 'עוסק מורשה' },
];

// The grouped background is the app's own canvas, so the page flows with the rest of the site.
const GROUPED_BG = DESKTOP_COLORS.canvas;
const PANEL_SHADOW = '0 1px 2px rgba(16,24,40,0.04), 0 6px 20px rgba(16,24,40,0.05)';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Critically damped (ratio ≈ 1, response ≈ 0.35s): glides and settles with no bounce. */
const SPRING = {
  stiffness: 320,
  damping: 36,
  mass: 1,
  useNativeDriver: false,
} as const;
const NAV_STEP = 50; // item height 46 + gap 4
const PREVIEW_MIN_WIDTH = 1320; // window width where the company card fits beside the form
const COMPACT_HEIGHT = 860; // below this window height the company card tightens to fit without scrolling

export function CompanySettingsDesktopView({
  form,
  errors,
  joinedAt,
  dirty,
  saving,
  savedNonce,
  onChange,
  onChangeContact,
  onChangeOfficer,
  onFieldBlur,
  onPickImage,
  onClearImage,
  onSave,
  onDiscard,
}: {
  form: CompanySettingsForm;
  errors: Record<string, string>;
  joinedAt: string | null;
  dirty: boolean;
  saving: boolean;
  /** Bumps on every successful save; each bump plays the "נשמר" confirmation once. */
  savedNonce: number;
  onChange: <K extends keyof CompanySettingsForm>(field: K, value: CompanySettingsForm[K]) => void;
  onChangeContact: (index: number, field: keyof CompanyContactForm, value: string) => void;
  onChangeOfficer: (index: number, field: keyof SafetyOfficerForm, value: string) => void;
  /** Checks one field as the admin leaves it, so a bad phone/email is flagged right away. */
  onFieldBlur: (key: string) => void;
  onPickImage: (kind: 'logo' | 'stamp') => void;
  onClearImage: (kind: 'logo' | 'stamp') => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { width } = useWindowDimensions();
  const showPreview = width >= PREVIEW_MIN_WIDTH;
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  const [current, setCurrent] = useState<SectionKey>('details');
  const jumpAfterSave = useRef(false);

  const jumpTo = (key: SectionKey) => {
    setCurrent(key);
    scrollRef.current?.scrollTo({
      y: Math.max(0, (offsets.current[key] ?? 0) - 24),
      animated: true,
    });
  };

  // The menu follows the page: the last section whose top has passed the
  // upper third is the current one (the last section wins at the bottom).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 4) {
      setCurrent(SECTIONS[SECTIONS.length - 1].key);
      return;
    }
    const probe = contentOffset.y + layoutMeasurement.height / 3;
    let next: SectionKey = SECTIONS[0].key;
    for (const sec of SECTIONS) {
      if ((offsets.current[sec.key] ?? Infinity) <= probe) next = sec.key;
    }
    setCurrent(next);
  };

  const trackLayout = (key: SectionKey) => (e: { nativeEvent: { layout: { y: number } } }) => {
    offsets.current[key] = e.nativeEvent.layout.y;
  };

  // A failed save scrolls to the first section holding an error, so the
  // problem is never out of sight.
  useEffect(() => {
    if (!jumpAfterSave.current) return;
    jumpAfterSave.current = false;
    const first = SECTIONS.find((sec) => sectionErrorCount(errors, sec.key) > 0);
    if (first) jumpTo(first.key);
  }, [errors]);

  const save = () => {
    jumpAfterSave.current = true;
    onSave();
  };

  const sectionProps = (key: SectionKey, index: number) => ({
    k: key,
    index,
    onLayout: trackLayout(key),
  });

  return (
    <View style={styles.root}>
      <SectionNav current={current} errors={errors} onSelect={jumpTo} />

      <View style={styles.main}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          <Section {...sectionProps('details', 0)}>
            <Panel>
              <Cell label="שם החברה" required error={errors.name}>
                <DesktopInput large value={form.name} onChangeText={(v) => onChange('name', v)} hasError={!!errors.name} />
              </Cell>
              <Cell label="ח.פ / ע.מ" required error={errors.businessId}>
                <DesktopInput
                  large
                  value={form.businessId}
                  onChangeText={(v) => onChange('businessId', v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={9}
                  ltr
                  hasError={!!errors.businessId}
                />
              </Cell>
              <Cell label="סוג חברה">
                <DesktopSelect
                  large
                  value={form.companyType}
                  options={COMPANY_TYPE_OPTIONS}
                  onChange={(v) => onChange('companyType', v)}
                  placeholder="בחר סוג חברה"
                  allowClear
                />
              </Cell>
              <Cell label="תוקף רישיון מוביל">
                <DesktopDateField large value={form.carrierLicenseExpiry} onChange={(v) => onChange('carrierLicenseExpiry', v)} />
              </Cell>
              <Cell label="כתובת החברה" wide>
                <DesktopInput
                  large
                  value={form.address}
                  onChangeText={(v) => onChange('address', v)}
                  placeholder="רחוב, מספר, עיר"
                />
              </Cell>
            </Panel>
            <DText style={styles.footnote}>
              <Ionicons name="lock-closed" size={11} color={DESKTOP_COLORS.inkFaint} /> במערכת מאז{' '}
              {joinedAt ? formatDate(joinedAt) : '—'}
            </DText>
          </Section>

          <Section {...sectionProps('contact', 1)}>
            <Panel>
              <Cell label="טלפון קווי" error={errors.landline}>
                <PhoneInput
                  value={form.landline}
                  error={errors.landline}
                  placeholder="03-1234567"
                  onChange={(v) => onChange('landline', v)}
                  onBlur={() => onFieldBlur('landline')}
                />
              </Cell>
              <Cell label="טלפון נייד" error={errors.mobile}>
                <PhoneInput
                  value={form.mobile}
                  error={errors.mobile}
                  onChange={(v) => onChange('mobile', v)}
                  onBlur={() => onFieldBlur('mobile')}
                />
              </Cell>
              <Cell label="פקס" error={errors.fax}>
                <PhoneInput
                  value={form.fax}
                  error={errors.fax}
                  placeholder="03-1234567"
                  onChange={(v) => onChange('fax', v)}
                  onBlur={() => onFieldBlur('fax')}
                />
              </Cell>
              <EmailCell
                label="דוא״ל"
                value={form.email}
                error={errors.email}
                onChange={(v) => onChange('email', v)}
                onBlur={() => onFieldBlur('email')}
              />
              <EmailCell
                label="מייל לשליחת קבצים"
                value={form.filesEmail}
                error={errors.filesEmail}
                onChange={(v) => onChange('filesEmail', v)}
                onBlur={() => onFieldBlur('filesEmail')}
              />
              <EmailCell
                label="מייל נוסף לקבצים"
                value={form.filesEmail2}
                error={errors.filesEmail2}
                onChange={(v) => onChange('filesEmail2', v)}
                onBlur={() => onFieldBlur('filesEmail2')}
              />
            </Panel>
          </Section>

          <Section {...sectionProps('report', 2)}>
            <Panel>
              <ToggleRow
                title="שליחה אוטומטית"
                caption={form.reportAuto ? 'הדוח יישלח ב-1 לכל חודש' : 'הדוח לא נשלח'}
                value={form.reportAuto}
                onValueChange={(v) => onChange('reportAuto', v)}
              />
              <EmailCell
                label="מייל לקבלת הדוח"
                value={form.reportEmail}
                error={errors.reportEmail}
                required={form.reportAuto}
                onChange={(v) => onChange('reportEmail', v)}
                onBlur={() => onFieldBlur('reportEmail')}
                wide
              />
            </Panel>
          </Section>

          <Section {...sectionProps('people', 3)}>
            <View style={styles.panelRow}>
              {form.contacts.map((c, i) => (
                <Panel key={i} title={`איש קשר ${i + 1}`} icon="person-circle-outline" half>
                  <Cell label="שם מלא">
                    <DesktopInput large value={c.name} onChangeText={(v) => onChangeContact(i, 'name', v)} />
                  </Cell>
                  <Cell label="תפקיד">
                    <DesktopInput
                      large
                      value={c.role}
                      onChangeText={(v) => onChangeContact(i, 'role', v)}
                      placeholder="למשל: מנהל תפעול"
                    />
                  </Cell>
                  <Cell label="טלפון" error={errors[`contact${i}Phone`]}>
                    <PhoneInput
                      value={c.phone}
                      error={errors[`contact${i}Phone`]}
                      onChange={(v) => onChangeContact(i, 'phone', v)}
                      onBlur={() => onFieldBlur(`contact${i}Phone`)}
                    />
                  </Cell>
                  <EmailCell
                    label="דוא״ל"
                    value={c.email}
                    error={errors[`contact${i}Email`]}
                    onChange={(v) => onChangeContact(i, 'email', v)}
                    onBlur={() => onFieldBlur(`contact${i}Email`)}
                  />
                </Panel>
              ))}
            </View>
          </Section>

          <Section {...sectionProps('safety', 4)}>
            <View style={styles.panelRow}>
              {form.officers.map((o, i) => (
                <Panel key={i} title={i === 0 ? 'קצין בטיחות' : 'קצין בטיחות נוסף'} icon="shield-half-outline" half>
                  <Cell label="שם">
                    <DesktopInput large value={o.name} onChangeText={(v) => onChangeOfficer(i, 'name', v)} />
                  </Cell>
                  <Cell label="טלפון" error={errors[`officer${i}Phone`]}>
                    <PhoneInput
                      value={o.phone}
                      error={errors[`officer${i}Phone`]}
                      onChange={(v) => onChangeOfficer(i, 'phone', v)}
                      onBlur={() => onFieldBlur(`officer${i}Phone`)}
                    />
                  </Cell>
                </Panel>
              ))}
            </View>
          </Section>

          <Section {...sectionProps('branding', 5)} last>
            <View style={styles.panelRow}>
              <ImageSlot
                title="לוגו החברה"
                uri={form.logoUri}
                icon="image-outline"
                onPick={() => onPickImage('logo')}
                onClear={() => onClearImage('logo')}
              />
              <ImageSlot
                title="חותמת החברה"
                uri={form.stampUri}
                icon="ribbon-outline"
                onPick={() => onPickImage('stamp')}
                onClear={() => onClearImage('stamp')}
              />
            </View>
          </Section>
        </ScrollView>

        <SaveCapsule
          dirty={dirty}
          saving={saving}
          errorCount={Object.keys(errors).length}
          savedNonce={savedNonce}
          onSave={save}
          onDiscard={onDiscard}
        />
      </View>

      {showPreview && <CompanyCard form={form} onJump={jumpTo} />}
    </View>
  );
}

/** Error keys belong to the section that renders their field. */
const SECTION_OF_ERROR: [RegExp, SectionKey][] = [
  [/^(name|businessId)$/, 'details'],
  [/^(landline|mobile|fax|email|filesEmail2?)$/, 'contact'],
  [/^reportEmail$/, 'report'],
  [/^contact\d/, 'people'],
  [/^officer\d/, 'safety'],
];

function sectionErrorCount(errors: Record<string, string>, key: SectionKey): number {
  return Object.keys(errors).filter((e) => SECTION_OF_ERROR.some(([re, s]) => s === key && re.test(e))).length;
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
  }, []);
  return reduce;
}

/**
 * Section menu. One white "platter" glides between items on a critically
 * damped spring — it follows clicks and the page scroll alike, so the eye
 * always sees where it is going. Reduced motion snaps it into place.
 */
function SectionNav({
  current,
  errors,
  onSelect,
}: {
  current: SectionKey;
  errors: Record<string, string>;
  onSelect: (key: SectionKey) => void;
}) {
  const index = SECTIONS.findIndex((s) => s.key === current);
  const y = useRef(new Animated.Value(index * NAV_STEP)).current;
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) y.setValue(index * NAV_STEP);
    else Animated.spring(y, { toValue: index * NAV_STEP, ...SPRING }).start();
  }, [index, reduce, y]);

  return (
    <View style={styles.nav}>
      <DText weight="bold" style={styles.navTitle} accessibilityRole="header">
        הגדרות החברה
      </DText>
      <DText style={styles.navSubtitle}>הפרטים שמופיעים בדוחות, במסמכים ובתקשורת עם החברה.</DText>

      <View style={styles.navList}>
        <Animated.View pointerEvents="none" style={[styles.navPlatter, { transform: [{ translateY: y }] }]} />
        {SECTIONS.map((s) => {
          const selected = s.key === current;
          const flagged = sectionErrorCount(errors, s.key) > 0;
          return (
            <HoverPressable
              key={s.key}
              style={styles.navItem}
              hoverStyle={selected ? undefined : styles.navItemHover}
              onPress={() => onSelect(s.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              aria-selected={selected}
              accessibilityLabel={flagged ? `${s.label}, יש שדות לתיקון` : s.label}
            >
              <View style={[styles.navIcon, selected && styles.navIconActive]}>
                <Ionicons name={s.icon} size={16} color={selected ? '#FFFFFF' : DESKTOP_COLORS.inkMuted} />
              </View>
              <DText
                weight={selected ? 'semiBold' : 'medium'}
                style={[styles.navLabel, selected && styles.navLabelActive]}
                numberOfLines={1}
              >
                {s.label}
              </DText>
              {flagged && <View style={styles.navErrorDot} />}
            </HoverPressable>
          );
        })}
      </View>
    </View>
  );
}

/** A titled block of the one-page form. Sections float up once, staggered, when the page opens. */
function Section({
  k,
  index,
  last,
  onLayout,
  children,
}: {
  k: SectionKey;
  index: number;
  last?: boolean;
  onLayout: (e: { nativeEvent: { layout: { y: number } } }) => void;
  children: React.ReactNode;
}) {
  const meta = SECTIONS.find((s) => s.key === k)!;
  const enter = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: 60 + index * 45,
      easing: EASE_OUT,
      useNativeDriver: false,
    }).start();
  }, [enter, index]);

  const translateY = reduce ? 0 : enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View
      onLayout={onLayout}
      style={[styles.section, last && styles.sectionLast, { opacity: enter, transform: [{ translateY }] }]}
    >
      <View style={styles.sectionHead}>
        <DText weight="bold" style={styles.sectionTitle} accessibilityRole="header">
          {meta.label}
        </DText>
        <DText style={styles.sectionHint}>{meta.hint}</DText>
      </View>
      {children}
    </Animated.View>
  );
}

/** iOS inset-grouped panel: a white rounded platter on the grouped background. */
function Panel({ title, icon, half, children }: { title?: string; icon?: IconName; half?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.panel, half && styles.panelHalf]}>
      {!!title && (
        <View style={styles.panelHead}>
          {!!icon && <Ionicons name={icon} size={18} color={DESKTOP_COLORS.brand} />}
          <DText weight="semiBold" style={styles.panelTitle}>
            {title}
          </DText>
        </View>
      )}
      <View style={styles.grid}>{children}</View>
    </View>
  );
}

/** One field in a panel's grid: label on top. Cells pair up two to a line and wrap when narrow; `wide` takes the full line. */
function Cell({
  label,
  required,
  error,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.cell, wide && styles.cellWide]}>
      <DText weight="semiBold" style={styles.cellLabel}>
        {label}
        {required && <DText style={styles.required}> *</DText>}
      </DText>
      {children}
      {!!error && (
        <View style={styles.cellError}>
          <Ionicons name="alert-circle" size={13} color={DESKTOP_TONES.bad.fg} />
          <DText style={styles.cellErrorText}>{error}</DText>
        </View>
      )}
    </View>
  );
}

function EmailCell({
  label,
  value,
  error,
  required,
  wide,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  wide?: boolean;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <EmailField
      value={value}
      error={error}
      onChange={onChange}
      onBlur={onBlur}
      render={(input, message) => (
        <Cell label={label} error={message} required={required} wide={wide}>
          {input}
        </Cell>
      )}
    />
  );
}

/**
 * Floating save capsule. It rises on a spring when there is something to
 * save (or a problem to fix), confirms "נשמר" after a save, then sinks away —
 * nothing sits at the bottom of an untouched page. A translucent material
 * keeps the form readable underneath it. Reduced motion fades instead.
 */
type CapsuleMode = 'hidden' | 'dirty' | 'errors' | 'saving' | 'saved';

function SaveCapsule({
  dirty,
  saving,
  errorCount,
  savedNonce,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  errorCount: number;
  savedNonce: number;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [savedFlash, setSavedFlash] = useState(false);
  const reduce = useReducedMotion();
  const show = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (savedNonce === 0) return;
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1900);
    return () => clearTimeout(t);
  }, [savedNonce]);

  const mode: CapsuleMode = saving ? 'saving' : errorCount > 0 ? 'errors' : dirty ? 'dirty' : savedFlash ? 'saved' : 'hidden';
  // Keep the last visible content while the capsule sinks away.
  const shown = useRef<CapsuleMode>('dirty');
  if (mode !== 'hidden') shown.current = mode;
  const visible = mode !== 'hidden';

  useEffect(() => {
    Animated.spring(show, { toValue: visible ? 1 : 0, ...SPRING }).start();
  }, [visible, show]);

  const view = shown.current;
  const translateY = reduce ? 0 : show.interpolate({ inputRange: [0, 1], outputRange: [110, 0] });
  const scale = reduce ? 1 : show.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <View pointerEvents="box-none" style={styles.capsuleDock}>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.capsule, { opacity: show, transform: [{ translateY }, { scale }] }]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.capsuleStatus}>
          {view === 'saved' ? (
            <>
              <View style={[styles.capsuleBadge, { backgroundColor: DESKTOP_TONES.ok.fg }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
              <DText weight="semiBold" style={styles.capsuleText}>
                השינויים נשמרו
              </DText>
            </>
          ) : view === 'errors' ? (
            <>
              <View style={[styles.capsuleBadge, { backgroundColor: DESKTOP_TONES.bad.fg }]}>
                <Ionicons name="alert" size={14} color="#FFFFFF" />
              </View>
              <DText weight="semiBold" style={styles.capsuleText}>
                {errorCount === 1 ? 'יש שדה אחד לתיקון' : `יש ${errorCount} שדות לתיקון`}
              </DText>
            </>
          ) : (
            <>
              <View style={styles.capsuleDot} />
              <DText weight="semiBold" style={styles.capsuleText}>
                יש שינויים שלא נשמרו
              </DText>
            </>
          )}
        </View>
        {view !== 'saved' && (
          <View style={styles.capsuleActions}>
            <HoverPressable
              style={styles.capsuleGhost}
              hoverStyle={styles.capsuleGhostHover}
              onPress={onDiscard}
              disabled={saving}
            >
              <DText weight="semiBold" style={styles.capsuleGhostText}>
                ביטול
              </DText>
            </HoverPressable>
            <HoverPressable
              style={styles.capsuleCta}
              hoverStyle={saving ? undefined : styles.capsuleCtaHover}
              pressMotionStyle={styles.capsuleCtaPress}
              onPress={onSave}
              disabled={saving}
              accessibilityLabel={saving ? 'שומר' : 'שמור שינויים'}
            >
              <DText weight="semiBold" style={[styles.capsuleCtaText, saving && styles.busyLabel]}>
                שמור שינויים
              </DText>
              {saving && <ActivityIndicator size="small" color="#FFFFFF" style={StyleSheet.absoluteFill} />}
            </HoverPressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Live company card: the company as it is being typed, plus what is still
 * missing. Each missing item jumps to its field's section. The column never
 * scrolls: on shorter screens it tightens, and the checklist rows shrink to
 * fit the height that is left.
 */
function CompanyCard({ form, onJump }: { form: CompanySettingsForm; onJump: (key: SectionKey) => void }) {
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const initial = form.name.trim().charAt(0) || '?';
  const officer = form.officers[0];
  const checklist: { label: string; done: boolean; section: SectionKey }[] = [
    { label: 'לוגו החברה', done: !!form.logoUri, section: 'branding' },
    { label: 'כתובת', done: !!form.address.trim(), section: 'details' },
    { label: 'טלפון קווי', done: !!form.landline, section: 'contact' },
    { label: 'דוא״ל', done: !!form.email, section: 'contact' },
    {
      label: 'קצין בטיחות',
      done: !!officer?.name.trim() && !!officer?.phone,
      section: 'safety',
    },
    {
      label: 'איש קשר',
      done: !!form.contacts[0]?.name.trim(),
      section: 'people',
    },
    { label: 'חותמת', done: !!form.stampUri, section: 'branding' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <View style={[styles.aside, compact && styles.asideCompact]}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        <View style={styles.cardHead}>
          <View style={styles.cardMark}>
            {form.logoUri ? (
              <Image source={{ uri: form.logoUri }} style={styles.cardLogo} resizeMode="contain" />
            ) : (
              <DText weight="bold" style={styles.cardInitial}>
                {initial}
              </DText>
            )}
          </View>
          <View style={styles.cardIdentity}>
            <DText weight="bold" style={styles.cardName} numberOfLines={2}>
              {form.name.trim() || 'שם החברה'}
            </DText>
            <View style={styles.cardIdRow}>
              <DText style={styles.cardMuted}>ח.פ</DText>
              <DLtrText style={[styles.cardMuted, styles.tabular]}>{form.businessId || '—'}</DLtrText>
              {!!form.companyType && (
                <View style={styles.cardChip}>
                  <DText weight="semiBold" style={styles.cardChipText}>
                    {form.companyType}
                  </DText>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.cardLines, compact && styles.cardLinesCompact]}>
          <CardLine icon="location-outline" value={form.address.trim()} />
          <CardLine icon="call-outline" value={form.landline ? formatPhone(form.landline) : ''} ltr />
          <CardLine icon="phone-portrait-outline" value={form.mobile ? formatPhone(form.mobile) : ''} ltr />
          <CardLine icon="mail-outline" value={form.email} ltr />
        </View>

        <View style={[styles.cardFooter, compact && styles.cardFooterCompact]}>
          <DText style={styles.cardFooterLabel}>קצין בטיחות</DText>
          <DText weight="semiBold" style={styles.cardFooterValue} numberOfLines={1}>
            {officer?.name.trim() || '—'}
            {officer?.phone ? `  ·  ${formatPhone(officer.phone)}` : ''}
          </DText>
        </View>

        {!!form.stampUri && <Image source={{ uri: form.stampUri }} style={styles.cardStamp} resizeMode="contain" />}
      </View>
      {!compact && <DText style={styles.asideNote}>שם החברה, ח.פ וקצין הבטיחות מופיעים בדוחות הנהגים והרכבים.</DText>}

      {/* Once nothing is missing, the checklist has no job left and goes away. */}
      {doneCount < checklist.length && (
        <View style={styles.checklist}>
          <View style={styles.checklistHead}>
            <DText weight="semiBold" style={styles.checklistTitle}>
              מה עוד חסר
            </DText>
            <DText style={[styles.cardMuted, styles.tabular]}>
              {doneCount}/{checklist.length}
            </DText>
          </View>
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: `${(doneCount / checklist.length) * 100}%` }]} />
          </View>
          <View style={styles.checkList}>
            {checklist.map((c) => (
              <HoverPressable
                key={c.label}
                style={styles.checkItem}
                hoverStyle={styles.checkItemHover}
                onPress={() => onJump(c.section)}
                accessibilityLabel={`${c.label}${c.done ? ', מולא' : ', חסר'}`}
              >
                <View style={[styles.checkMark, c.done && styles.checkMarkDone]}>
                  {c.done && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                </View>
                <DText style={[styles.checkLabel, c.done && styles.checkLabelDone]}>{c.label}</DText>
                {!c.done && <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.inkFaint} />}
              </HoverPressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function CardLine({ icon, value, ltr }: { icon: IconName; value: string; ltr?: boolean }) {
  const Text = ltr && value ? DLtrText : DText;
  return (
    <View style={styles.cardLine}>
      <Ionicons name={icon} size={15} color={DESKTOP_COLORS.inkFaint} />
      <Text style={[styles.cardLineText, !value && styles.cardLineEmpty]} numberOfLines={1}>
        {value || 'לא הוזן'}
      </Text>
    </View>
  );
}

/**
 * Israeli phone input. The form keeps digits only; the field shows them the
 * way people write them (052-6765344, 03-1234567) and formats as you type.
 */
function PhoneInput({
  value,
  error,
  placeholder = '052-1234567',
  onChange,
  onBlur,
}: {
  value: string;
  error?: string;
  placeholder?: string;
  onChange: (digits: string) => void;
  onBlur?: () => void;
}) {
  return (
    <DesktopInput
      large
      value={formatPhone(value)}
      onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 10))}
      onBlur={onBlur}
      keyboardType="phone-pad"
      maxLength={11}
      placeholder={placeholder}
      ltr
      hasError={!!error}
    />
  );
}

/** Characters an address may hold. Everything else (Hebrew, spaces, emoji) is dropped as it's typed. */
function sanitizeEmail(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._%+\-@]/g, '').toLowerCase();
  const at = cleaned.indexOf('@');
  return at === -1 ? cleaned : cleaned.slice(0, at + 1) + cleaned.slice(at + 1).replace(/@/g, '');
}

/**
 * Email input that only accepts address characters. When a keystroke is
 * dropped (typically a Hebrew keyboard layout), it says so instead of
 * silently ignoring the key.
 */
function EmailField({
  value,
  error,
  onChange,
  onBlur,
  render,
}: {
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  render: (input: React.ReactNode, message?: string) => React.ReactElement;
}) {
  const [blocked, setBlocked] = useState(false);
  const input = (
    <DesktopInput
      large
      value={value}
      onChangeText={(raw) => {
        const clean = sanitizeEmail(raw);
        setBlocked(clean.length < raw.replace(/\s/g, '').length);
        onChange(clean);
      }}
      onBlur={() => {
        setBlocked(false);
        onBlur?.();
      }}
      keyboardType="email-address"
      placeholder="name@company.co.il"
      ltr
      hasError={!!error}
    />
  );
  return render(input, error ?? (blocked ? 'כתובת מייל נכתבת באנגלית בלבד' : undefined));
}

/**
 * iOS-style switch. The knob stretches the moment it's pressed, then glides
 * across on a critically damped spring (no bounce — the tap carries no
 * momentum). Reduced-motion users get an instant change.
 */
const SWITCH_W = 46;
const SWITCH_H = 28;
const KNOB = 24;
const KNOB_STRETCH = 5;
const SWITCH_ON = '#34C759';
const SWITCH_OFF = 'rgba(120,120,128,0.2)';

function AppleSwitch({ value, pressed }: { value: boolean; pressed: boolean }) {
  const on = useRef(new Animated.Value(value ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        reduceMotion.current = r;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion.current) on.setValue(value ? 1 : 0);
    else
      Animated.spring(on, {
        toValue: value ? 1 : 0,
        speed: 18,
        bounciness: 0,
        useNativeDriver: false,
      }).start();
  }, [value, on]);

  useEffect(() => {
    if (reduceMotion.current) press.setValue(0);
    else
      Animated.spring(press, {
        toValue: pressed ? 1 : 0,
        speed: 30,
        bounciness: 0,
        useNativeDriver: false,
      }).start();
  }, [pressed, press]);

  // RTL: "on" sits at the left end, like iOS in Hebrew.
  const offLeft = SWITCH_W - KNOB - 2;
  const stretch = Animated.multiply(press, KNOB_STRETCH);
  const left = Animated.subtract(
    on.interpolate({ inputRange: [0, 1], outputRange: [offLeft, 2] }),
    Animated.multiply(stretch, on.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
  );

  return (
    <Animated.View
      style={[
        styles.switchTrack,
        {
          backgroundColor: on.interpolate({
            inputRange: [0, 1],
            outputRange: [SWITCH_OFF, SWITCH_ON],
          }),
        },
      ]}
    >
      <Animated.View style={[styles.switchKnob, { left, width: Animated.add(KNOB, stretch) }]} />
    </Animated.View>
  );
}

/** A whole-row toggle: the label, its current meaning, and the switch are one target. */
function ToggleRow({
  title,
  caption,
  value,
  onValueChange,
}: {
  title: string;
  caption: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={title}
      style={[styles.toggleRow, hovered && styles.toggleRowHover]}
    >
      <View style={styles.toggleText}>
        <DText weight="semiBold" style={styles.toggleTitle}>
          {title}
        </DText>
        <DText style={[styles.toggleCaption, value && styles.toggleCaptionOn]}>{caption}</DText>
      </View>
      <AppleSwitch value={value} pressed={pressed} />
    </Pressable>
  );
}

function ImageSlot({
  title,
  uri,
  icon,
  onPick,
  onClear,
}: {
  title: string;
  uri: string | null;
  icon: IconName;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <View style={[styles.panel, styles.panelHalf]}>
      <View style={styles.slotHead}>
        <DText weight="semiBold" style={styles.panelTitle}>
          {title}
        </DText>
        {!!uri && (
          <View style={styles.slotActions}>
            <HoverPressable onPress={onPick} hoverStyle={styles.linkHover} accessibilityLabel={`החלפת ${title}`}>
              <DText weight="semiBold" style={styles.link}>
                החלפה
              </DText>
            </HoverPressable>
            <HoverPressable onPress={onClear} hoverStyle={styles.linkHover} accessibilityLabel={`הסרת ${title}`}>
              <DText weight="semiBold" style={[styles.link, styles.linkDanger]}>
                הסרה
              </DText>
            </HoverPressable>
          </View>
        )}
      </View>
      <HoverPressable
        style={[styles.drop, !!uri && styles.dropFilled]}
        hoverStyle={styles.dropHover}
        onPress={onPick}
        accessibilityLabel={uri ? `החלפת ${title}` : `העלאת ${title}`}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.dropImage} resizeMode="contain" />
        ) : (
          <>
            <View style={styles.dropIcon}>
              <Ionicons name={icon} size={22} color={DESKTOP_COLORS.brand} />
            </View>
            <DText weight="semiBold" style={styles.dropText}>
              העלאת תמונה
            </DText>
            <DText style={styles.dropHint}>לחץ כדי לבחור קובץ</DText>
          </>
        )}
      </HoverPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row-reverse', backgroundColor: GROUPED_BG },
  tabular: webOnly({ fontVariantNumeric: 'tabular-nums' }),

  // Section menu
  nav: {
    width: 272,
    flexShrink: 0,
    paddingTop: 36,
    paddingRight: 28,
    paddingLeft: 16,
  },
  navTitle: { fontSize: 28, letterSpacing: -0.6, lineHeight: 34 },
  navSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    color: DESKTOP_COLORS.inkMuted,
    marginTop: 6,
    marginBottom: 24,
  },
  navList: { gap: 4 },
  navPlatter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: NAV_STEP - 4,
    borderRadius: 12,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({
      boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 4px 12px rgba(16,24,40,0.06)',
    }),
  },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    height: NAV_STEP - 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    ...webOnly({ transition: 'background-color 150ms ease-out' }),
  },
  navItemHover: { backgroundColor: 'rgba(120,120,128,0.08)' },
  navIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(120,120,128,0.12)',
    ...webOnly({ transition: 'background-color 200ms ease-out' }),
  },
  navIconActive: { backgroundColor: DESKTOP_COLORS.brand },
  navLabel: { flex: 1, fontSize: 14.5, color: DESKTOP_COLORS.inkMuted },
  navLabelActive: { color: DESKTOP_COLORS.ink },
  navErrorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DESKTOP_COLORS.danger,
  },

  // Form column
  main: { flex: 1, minWidth: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 36, paddingHorizontal: 28, paddingBottom: 140 },
  section: { marginBottom: 40 },
  sectionLast: { marginBottom: 0 },
  sectionHead: { gap: 4, marginBottom: 14, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 22, letterSpacing: -0.4, lineHeight: 28 },
  sectionHint: { fontSize: 14, lineHeight: 20, color: DESKTOP_COLORS.inkMuted },
  footnote: {
    fontSize: 12.5,
    color: DESKTOP_COLORS.inkFaint,
    marginTop: 10,
    paddingHorizontal: 4,
  },

  panelRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16 },
  panel: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 18,
    padding: 22,
    ...webOnly({ boxShadow: PANEL_SHADOW }),
  },
  panelHalf: { flexGrow: 1, flexBasis: 300, minWidth: 0 },
  panelHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  panelTitle: { fontSize: 15.5 },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    columnGap: 18,
    rowGap: 18,
  },
  cell: { flexGrow: 1, flexBasis: 210, minWidth: 0, gap: 7 },
  cellWide: { flexBasis: '100%' },
  cellLabel: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  required: { color: DESKTOP_COLORS.danger, fontSize: 13.5 },
  cellError: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  cellErrorText: { fontSize: 12.5, color: DESKTOP_TONES.bad.fg },

  toggleRow: {
    flexBasis: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: -22,
    marginTop: -22,
    marginBottom: 4,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'background-color 150ms ease-out',
    }),
  },
  toggleRowHover: { backgroundColor: 'rgba(120,120,128,0.05)' },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 15.5 },
  toggleCaption: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  toggleCaptionOn: { color: DESKTOP_TONES.ok.fg },
  switchTrack: {
    width: SWITCH_W,
    height: SWITCH_H,
    borderRadius: SWITCH_H / 2,
  },
  switchKnob: {
    position: 'absolute',
    top: 2,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    ...webOnly({
      boxShadow: '0 2px 5px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.04)',
    }),
  },

  // Branding
  slotHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    marginBottom: 14,
  },
  slotActions: { flexDirection: 'row-reverse', gap: 16 },
  link: { fontSize: 14, color: DESKTOP_COLORS.brand },
  linkDanger: { color: DESKTOP_TONES.bad.fg },
  linkHover: { opacity: 0.7 },
  drop: {
    height: 190,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D1D1D6',
    backgroundColor: '#FAFAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
    ...webOnly({
      transition: 'border-color 150ms ease-out, background-color 150ms ease-out',
    }),
  },
  dropFilled: {
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    backgroundColor: DESKTOP_COLORS.surface,
  },
  dropHover: {
    borderColor: DESKTOP_COLORS.brand,
    backgroundColor: 'rgba(0,136,204,0.04)',
  },
  dropIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropText: { fontSize: 14.5 },
  dropHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  dropImage: { width: '100%', height: '100%' },

  // Save capsule
  capsuleDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  capsule: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 8,
    paddingRight: 18,
    paddingLeft: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    ...webOnly({
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      boxShadow: '0 10px 30px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.06)',
    }),
  },
  capsuleStatus: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  capsuleBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: DESKTOP_TONES.warn.fg,
    marginHorizontal: 6,
  },
  capsuleText: { fontSize: 14.5 },
  capsuleActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  capsuleGhost: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleGhostHover: { backgroundColor: 'rgba(120,120,128,0.12)' },
  capsuleGhostText: { fontSize: 14.5, color: DESKTOP_COLORS.inkMuted },
  capsuleCta: {
    height: 44,
    minWidth: 140,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      transition: 'background-color 150ms ease-out, transform 100ms ease-out',
    }),
  },
  capsuleCtaHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  capsuleCtaPress: { transform: [{ scale: 0.97 }] },
  capsuleCtaText: { fontSize: 14.5, color: '#FFFFFF' },
  busyLabel: { opacity: 0 },

  // Company card
  aside: {
    width: 340,
    flexShrink: 0,
    paddingTop: 36,
    paddingBottom: 24,
    paddingLeft: 28,
    paddingRight: 4,
    gap: 12,
    overflow: 'hidden',
  },
  asideCompact: { paddingTop: 24, paddingBottom: 16, gap: 10 },
  cardCompact: { padding: 16 },
  cardLinesCompact: { marginTop: 12, paddingTop: 12, gap: 6 },
  cardFooterCompact: { marginTop: 10, paddingVertical: 8 },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    ...webOnly({ boxShadow: PANEL_SHADOW }),
  },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  cardMark: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: DESKTOP_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardLogo: { width: 56, height: 56, backgroundColor: DESKTOP_COLORS.surface },
  cardInitial: { color: '#FFFFFF', fontSize: 22 },
  cardIdentity: { flex: 1, minWidth: 0, gap: 4 },
  cardName: { fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  cardIdRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  cardMuted: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  cardChip: {
    marginRight: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(120,120,128,0.12)',
  },
  cardChipText: { fontSize: 11, color: DESKTOP_COLORS.inkMuted },
  cardLines: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: DESKTOP_COLORS.borderSoft,
    gap: 10,
  },
  cardLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  cardLineText: { flex: 1, fontSize: 13.5, color: DESKTOP_COLORS.ink },
  cardLineEmpty: { color: DESKTOP_COLORS.inkFaint },
  cardFooter: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: GROUPED_BG,
    gap: 2,
  },
  cardFooterLabel: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted },
  cardFooterValue: { fontSize: 13.5 },
  cardStamp: {
    position: 'absolute',
    left: 14,
    bottom: 58,
    width: 76,
    height: 76,
    opacity: 0.85,
    transform: [{ rotate: '-8deg' }],
  },
  asideNote: {
    fontSize: 12,
    lineHeight: 17,
    color: DESKTOP_COLORS.inkFaint,
    paddingHorizontal: 6,
  },

  checklist: {
    flexShrink: 1,
    minHeight: 0,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 18,
    padding: 16,
    ...webOnly({ boxShadow: PANEL_SHADOW }),
  },
  checklistHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  checklistTitle: { fontSize: 14.5 },
  meter: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(120,120,128,0.14)',
    marginTop: 10,
    marginBottom: 8,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: DESKTOP_TONES.ok.fg,
    alignSelf: 'flex-end',
    ...webOnly({ transition: 'width 450ms cubic-bezier(0.23, 1, 0.32, 1)' }),
  },
  checkList: { flexShrink: 1, minHeight: 0 },
  // Rows start at 36px and give up height evenly (down to 24px) when the screen is short.
  checkItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexBasis: 36,
    flexShrink: 1,
    minHeight: 24,
    paddingHorizontal: 6,
    borderRadius: 9,
  },
  checkItemHover: { backgroundColor: 'rgba(120,120,128,0.07)' },
  checkMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      transition: 'background-color 200ms ease-out, border-color 200ms ease-out',
    }),
  },
  checkMarkDone: {
    backgroundColor: DESKTOP_TONES.ok.fg,
    borderColor: DESKTOP_TONES.ok.fg,
  },
  checkLabel: { flex: 1, fontSize: 13.5 },
  checkLabelDone: { color: DESKTOP_COLORS.inkFaint },
});
