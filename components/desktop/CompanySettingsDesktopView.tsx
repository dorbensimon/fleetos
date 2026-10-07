import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
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
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly, DESKTOP_BRAND_SHADOW } from './desktopTheme';
import { FORM_PAGE_STYLES, heroEnter, useReducedMotion } from './form/RecordFormKit';
import { t, getLocale } from '../../lib/i18n';
import { COMPANY_TYPE_OPTIONS, companyTypeLabel, type CompanyType } from '../../lib/companyType';

/**
 * Desktop body of the company settings page. Three zones fill the width:
 * a section menu (RTL right) whose highlight glides with the scroll, the
 * form as rounded grouped panels, and — on wide screens — a live company
 * card with a "what's missing" checklist. Saving lives in a floating
 * capsule that rises only while there is something to save or report.
 * Purely presentational — CompanySettingsScreen owns state and saving.
 */


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
    get label() { return t('settings.section.company'); },
    get hint() { return t('settings.section.companyHint'); },
    icon: 'business-outline',
  },
  {
    key: 'contact',
    get label() { return t('settings.section.contact'); },
    get hint() { return t('settings.section.contactHint'); },
    icon: 'call-outline',
  },
  {
    key: 'report',
    get label() { return t('settings.section.odometerReport'); },
    get hint() { return t('settings.section.odometerReportHint'); },
    icon: 'speedometer-outline',
  },
  {
    key: 'people',
    get label() { return t('settings.section.contacts'); },
    get hint() { return t('settings.section.contactsHint'); },
    icon: 'people-outline',
  },
  {
    key: 'safety',
    get label() { return t('settings.section.safetyOfficers'); },
    get hint() { return t('settings.section.safetyOfficersHint'); },
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'branding',
    get label() { return t('settings.section.logoStamp'); },
    get hint() { return t('settings.section.logoStampHint'); },
    icon: 'image-outline',
  },
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
const NAV_STEP = 46; // item height 42 + gap 4
const PAGE_TOP = 24; // the page's top padding; section offsets are measured inside the form column

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
    offsets.current[key] = PAGE_TOP + e.nativeEvent.layout.y;
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
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.page}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {/* The menu rides along with the page (sticky), so it always shows where you are. */}
        <View style={styles.navColumn}>
          <SectionNav current={current} errors={errors} onSelect={jumpTo} />
        </View>

        <View style={styles.main}>
          <CompanyOverview form={form} onJump={jumpTo} />

          <Section {...sectionProps('details', 0)}>
            <Panel>
              <Cell label={t('company.name')} required error={errors.name}>
                <DesktopInput value={form.name} onChangeText={(v) => onChange('name', v)} hasError={!!errors.name} />
              </Cell>
              <Cell label={t('company.businessId')} required error={errors.businessId}>
                <DesktopInput
                  value={form.businessId}
                  onChangeText={(v) => onChange('businessId', v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={9}
                  ltr
                  hasError={!!errors.businessId}
                />
              </Cell>
              <Cell label={t('company.type')}>
                <DesktopSelect
                  value={form.companyType}
                  options={COMPANY_TYPE_OPTIONS}
                  onChange={(v) => onChange('companyType', v)}
                  placeholder={t('company.chooseType')}
                  allowClear
                />
              </Cell>
              <Cell label={t('company.carrierLicenseExpiry')}>
                <DesktopDateField value={form.carrierLicenseExpiry} onChange={(v) => onChange('carrierLicenseExpiry', v)} />
              </Cell>
              <Cell label={t('company.address')} wide>
                <DesktopInput
                  value={form.address}
                  onChangeText={(v) => onChange('address', v)}
                  placeholder={t('company.addressPlaceholder')}
                />
              </Cell>
            </Panel>
            <DText style={styles.footnote}>
              <Ionicons name="lock-closed" size={11} color={DESKTOP_COLORS.inkFaint} /> {t('company.inSystemSince')}{' '}
              {joinedAt ? formatDate(joinedAt) : '—'}
            </DText>
          </Section>

          <Section {...sectionProps('contact', 1)}>
            <Panel>
              <Cell label={t('company.landline')} error={errors.landline}>
                <PhoneInput
                  value={form.landline}
                  error={errors.landline}
                  placeholder="03-1234567"
                  onChange={(v) => onChange('landline', v)}
                  onBlur={() => onFieldBlur('landline')}
                />
              </Cell>
              <Cell label={t('common.mobilePhone')} error={errors.mobile}>
                <PhoneInput
                  value={form.mobile}
                  error={errors.mobile}
                  onChange={(v) => onChange('mobile', v)}
                  onBlur={() => onFieldBlur('mobile')}
                />
              </Cell>
              <Cell label={t('company.fax')} error={errors.fax}>
                <PhoneInput
                  value={form.fax}
                  error={errors.fax}
                  placeholder="03-1234567"
                  onChange={(v) => onChange('fax', v)}
                  onBlur={() => onFieldBlur('fax')}
                />
              </Cell>
              <EmailCell
                label={t('common.email')}
                value={form.email}
                error={errors.email}
                onChange={(v) => onChange('email', v)}
                onBlur={() => onFieldBlur('email')}
              />
              <EmailCell
                label={t('company.filesEmail')}
                value={form.filesEmail}
                error={errors.filesEmail}
                onChange={(v) => onChange('filesEmail', v)}
                onBlur={() => onFieldBlur('filesEmail')}
              />
              <EmailCell
                label={t('company.filesEmailExtra')}
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
                title={t('company.autoSend')}
                caption={form.reportAuto ? t('company.reportMonthly') : t('company.reportNotSent')}
                value={form.reportAuto}
                onValueChange={(v) => onChange('reportAuto', v)}
              />
              {form.reportAuto && <NextReportRow email={form.reportEmail} />}
              <EmailCell
                label={t('company.reportEmail')}
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
            <View style={styles.panelStack}>
              {form.contacts.map((c, i) => (
                <Panel key={i} half title={t('company.contactN', { v1: i + 1 })} icon="person-circle-outline">
                  <Cell label={t('common.fullName')}>
                    <DesktopInput value={c.name} onChangeText={(v) => onChangeContact(i, 'name', v)} />
                  </Cell>
                  <Cell label={t('common.role')}>
                    <DesktopInput
                      value={c.role}
                      onChangeText={(v) => onChangeContact(i, 'role', v)}
                      placeholder={t('company.rolePlaceholder')}
                    />
                  </Cell>
                  <Cell label={t('common.phone')} error={errors[`contact${i}Phone`]}>
                    <PhoneInput
                      value={c.phone}
                      error={errors[`contact${i}Phone`]}
                      onChange={(v) => onChangeContact(i, 'phone', v)}
                      onBlur={() => onFieldBlur(`contact${i}Phone`)}
                    />
                  </Cell>
                  <EmailCell
                    label={t('common.email')}
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
            <View style={styles.panelStack}>
              {form.officers.map((o, i) => (
                <Panel key={i} half title={i === 0 ? t('company.safetyOfficer') : t('company.extraSafetyOfficer')} icon="shield-half-outline">
                  <Cell label={t('common.name')}>
                    <DesktopInput value={o.name} onChangeText={(v) => onChangeOfficer(i, 'name', v)} />
                  </Cell>
                  <Cell label={t('common.phone')} error={errors[`officer${i}Phone`]}>
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
            <View style={styles.brandingRow}>
              <View style={styles.brandingSlots}>
              <ImageSlot
                title={t('company.logo')}
                uri={form.logoUri}
                icon="image-outline"
                onPick={() => onPickImage('logo')}
                onClear={() => onClearImage('logo')}
              />
              <ImageSlot
                title={t('company.stamp')}
                uri={form.stampUri}
                icon="ribbon-outline"
                onPick={() => onPickImage('stamp')}
                onClear={() => onClearImage('stamp')}
              />
              </View>
              <LetterheadPreview form={form} />
            </View>
          </Section>
        </View>
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
        {t('nav.companySettings')}
      </DText>
      <DText style={styles.navSubtitle}>{t('settings.detailsIntro')}</DText>

      <View style={styles.navCard}>
      <View style={styles.navList}>
        <Animated.View pointerEvents="none" style={[styles.navPlatter, { transform: [{ translateY: y }] }]} />
        {SECTIONS.map((s) => {
          const selected = s.key === current;
          const errorCount = sectionErrorCount(errors, s.key);
          const flagged = errorCount > 0;
          return (
            <HoverPressable
              key={s.key}
              style={styles.navItem}
              hoverStyle={selected ? undefined : styles.navItemHover}
              onPress={() => onSelect(s.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              aria-selected={selected}
              accessibilityLabel={flagged ? t('settings.sectionHasErrors', { label: s.label }) : s.label}
            >
              <View style={[styles.navIcon, selected && styles.navIconActive]}>
                <Ionicons name={s.icon} size={17} color={selected ? DESKTOP_COLORS.brand : '#FFFFFF'} />
              </View>
              <DText
                weight={selected ? 'semiBold' : 'medium'}
                style={[styles.navLabel, selected && styles.navLabelActive]}
                numberOfLines={1}
              >
                {s.label}
              </DText>
              {flagged && (
                <View style={[styles.navErrorBadge, selected && styles.navErrorBadgeActive]}>
                  <DText weight="bold" style={[styles.navErrorText, selected && styles.navErrorTextActive]}>{errorCount}</DText>
                </View>
              )}
            </HoverPressable>
          );
        })}
      </View>
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
        <View style={styles.sectionGlyph}>
          <Ionicons name={meta.icon} size={16} color="#FFFFFF" />
        </View>
        <View style={styles.sectionHeadText}>
          <DText weight="bold" style={styles.sectionTitle} accessibilityRole="header">
            {meta.label}
          </DText>
          <DText style={styles.sectionHint}>{meta.hint}</DText>
        </View>
      </View>
      {children}
    </Animated.View>
  );
}

/**
 * iOS inset-grouped list: a white rounded platter whose fields are rows
 * split by inset hairlines. The rows sit 1px up so the first row's line
 * hides under the platter's edge.
 */
function Panel({ title, icon, half, children }: { title?: string; icon?: IconName; half?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.panel, half && styles.panelHalf]}>
      {!!title && (
        <View style={styles.panelHead}>
          {!!icon && <Ionicons name={icon} size={17} color={DESKTOP_COLORS.brand} />}
          <DText weight="bold" style={styles.panelTitle}>
            {title}
          </DText>
        </View>
      )}
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

/** One field as an iOS form row: the label on the right, the box on the left; on a narrow window the box drops under its label. */
function Cell({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  /** Kept for call sites; every row is full width now. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.cell}>
      <DText weight="semiBold" style={styles.cellLabel}>
        {label}
        {required && <DText style={styles.required}> *</DText>}
      </DText>
      <View style={styles.cellControl}>
        {children}
        {!!error && (
          <View style={styles.cellError}>
            <Ionicons name="alert-circle" size={15} color={DESKTOP_TONES.bad.fg} />
            <DText style={styles.cellErrorText}>{error}</DText>
          </View>
        )}
      </View>
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
    const timer = setTimeout(() => setSavedFlash(false), 1900);
    return () => clearTimeout(timer);
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
                {t('common.changesSaved')}
              </DText>
            </>
          ) : view === 'errors' ? (
            <>
              <View style={[styles.capsuleBadge, { backgroundColor: DESKTOP_TONES.bad.fg }]}>
                <Ionicons name="alert" size={14} color="#FFFFFF" />
              </View>
              <DText weight="semiBold" style={styles.capsuleText}>
                {errorCount === 1 ? t('settings.oneFieldToFix') : t('settings.fieldsToFix', { errorCount })}
              </DText>
            </>
          ) : (
            <>
              <View style={styles.capsuleDot} />
              <DText weight="semiBold" style={styles.capsuleText}>
                {t('settings.unsavedChanges')}
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
                {t('common.cancel')}
              </DText>
            </HoverPressable>
            <HoverPressable
              style={styles.capsuleCta}
              hoverStyle={saving ? undefined : styles.capsuleCtaHover}
              pressMotionStyle={styles.capsuleCtaPress}
              onPress={onSave}
              disabled={saving}
              accessibilityLabel={saving ? t('common.saving') : t('common.saveChanges')}
            >
              <DText weight="semiBold" style={[styles.capsuleCtaText, saving && styles.busyLabel]}>
                {t('common.saveChanges')}
              </DText>
              {saving && <BrandLoader size="small" color="#FFFFFF" style={StyleSheet.absoluteFill} />}
            </HoverPressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/** Eases a number toward its target (ease-out cubic), for the completion ring. */
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (ratio < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/**
 * The company's identity card, on top of the form: a deep ink platter lit
 * by a brand glow, the company as it is being typed, and a completion ring.
 * Every missing detail is a button that jumps straight to its field. It
 * scrolls away with the page — nothing stays stuck on screen.
 */
function CompanyOverview({ form, onJump }: { form: CompanySettingsForm; onJump: (key: SectionKey) => void }) {
  const initial = form.name.trim().charAt(0) || '?';
  const officer = form.officers[0];
  const checklist: { label: string; done: boolean; section: SectionKey }[] = [
    { label: t('company.logoShort'), done: !!form.logoUri, section: 'branding' },
    { label: t('common.address'), done: !!form.address.trim(), section: 'details' },
    { label: t('company.landline'), done: !!form.landline, section: 'contact' },
    { label: t('common.email'), done: !!form.email, section: 'contact' },
    { label: t('company.safetyOfficer'), done: !!officer?.name.trim() && !!officer?.phone, section: 'safety' },
    { label: t('company.contactPerson'), done: !!form.contacts[0]?.name.trim(), section: 'people' },
    { label: t('company.stampShort'), done: !!form.stampUri, section: 'branding' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const missing = checklist.filter((c) => !c.done);
  const complete = missing.length === 0;
  const pct = useCountUp((doneCount / checklist.length) * 100);
  const ringColor = complete ? '#34C759' : '#5FC1F0';

  return (
    <View style={[styles.hero, heroEnter()]}>
      <View style={styles.heroBody}>
        <View style={styles.heroIdentity}>
          <View style={styles.heroTop}>
            <View style={[styles.heroMark, !!form.logoUri && styles.heroMarkLogo]}>
              {form.logoUri ? (
                <Image source={{ uri: form.logoUri }} accessibilityLabel={t('company.logo')} style={styles.heroLogo} resizeMode="contain" />
              ) : (
                <DText weight="extraBold" style={styles.heroInitial}>{initial}</DText>
              )}
            </View>
            <View style={styles.heroNameBlock}>
              <DText weight="extraBold" style={styles.heroName} numberOfLines={1}>
                {form.name.trim() || t('company.name')}
              </DText>
              <View style={styles.heroIdRow}>
                <DText style={styles.heroIdLabel}>{t('company.businessIdShort')}</DText>
                <DLtrText weight="semiBold" style={[styles.heroIdValue, styles.tabular]}>{form.businessId || '—'}</DLtrText>
                {!!form.companyType && (
                  <View style={styles.heroTag}>
                    <DText weight="semiBold" style={styles.heroTagText}>{companyTypeLabel(form.companyType)}</DText>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.heroChips}>
            <HeroChip icon="location-outline" value={form.address.trim()} />
            <HeroChip icon="call-outline" value={form.landline ? formatPhone(form.landline) : ''} ltr />
            <HeroChip icon="phone-portrait-outline" value={form.mobile ? formatPhone(form.mobile) : ''} ltr />
            <HeroChip icon="mail-outline" value={form.email} ltr />
            <HeroChip
              icon="shield-checkmark-outline"
              value={officer?.name.trim() ? `${officer.name.trim()}${officer.phone ? ` · ${formatPhone(officer.phone)}` : ''}` : ''}
              empty={t('company.noSafetyOfficer')}
            />
          </View>
        </View>

        <View style={styles.heroProgress}>
          <View
            style={[styles.ring, webOnly({ backgroundImage: `conic-gradient(${ringColor} ${pct}%, rgba(255,255,255,0.1) ${pct}%)` })]}
            accessibilityLabel={t('settings.filledOfTotal', { doneCount, length: checklist.length })}
          >
            <View style={styles.ringInner}>
              {complete ? (
                <Ionicons name="checkmark" size={26} color="#34C759" />
              ) : (
                <DLtrText weight="extraBold" style={[styles.ringValue, styles.tabular]}>
                  {doneCount}
                  <DText weight="semiBold" style={styles.ringOf}>/{checklist.length}</DText>
                </DLtrText>
              )}
            </View>
          </View>
          <View style={styles.heroProgressText}>
            <DText weight="bold" style={styles.heroProgressTitle}>
              {complete ? t('settings.allFilled') : missing.length === 1 ? t('settings.oneMissing') : t('settings.missingCount', { length: missing.length })}
            </DText>
            <DText style={styles.heroProgressHint}>
              {complete ? t('settings.reportsComplete') : t('settings.clickToJump')}
            </DText>
            {!complete && (
              <View style={styles.missingRow}>
                {missing.map((c) => (
                  <HoverPressable
                    key={c.label}
                    style={styles.missingPill}
                    hoverStyle={styles.missingPillHover}
                    pressMotionStyle={styles.missingPillPress}
                    onPress={() => onJump(c.section)}
                    accessibilityLabel={t('common.addLabel', { label: c.label })}
                  >
                    <Ionicons name="add" size={15} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={styles.missingPillText}>{c.label}</DText>
                  </HoverPressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function HeroChip({ icon, value, ltr, empty = t('common.notEntered') }: { icon: IconName; value: string; ltr?: boolean; empty?: string }) {
  const Text = ltr && value ? DLtrText : DText;
  return (
    <View style={[styles.heroChip, !value && styles.heroChipEmpty]}>
      <Ionicons name={icon} size={16} color={value ? '#9FD8F5' : 'rgba(255,255,255,0.4)'} />
      <Text weight={value ? 'medium' : 'regular'} style={[styles.heroChipText, !value && styles.heroChipTextEmpty]} numberOfLines={1}>
        {value || empty}
      </Text>
    </View>
  );
}

/** When the monthly report goes out next — the 1st of next month. */
function NextReportRow({ email }: { email: string }) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = next.toLocaleDateString(getLocale(), { month: 'long' });
  return (
    <View style={styles.nextReport}>
      <View style={styles.calTile}>
        <View style={styles.calTileTop}>
          <DText weight="bold" style={styles.calTileMonth}>{month}</DText>
        </View>
        <DText weight="extraBold" style={styles.calTileDay}>1</DText>
      </View>
      <View style={styles.nextReportText}>
        <DText weight="semiBold" style={styles.nextReportTitle}>{t('settings.nextReport', { month, next: next.getFullYear() })}</DText>
        <DText style={styles.nextReportHint} numberOfLines={1}>
          {email ? t('settings.toEmail', { email }) : t('settings.needReportEmail')}
        </DText>
      </View>
    </View>
  );
}

/**
 * A live miniature of a company document: the logo in the letterhead, the
 * company's details under it, and the stamp beside the signature — so it's
 * clear what the two images are for before anything is printed.
 */
function LetterheadPreview({ form }: { form: CompanySettingsForm }) {
  const details = [form.businessId && t('company.businessIdValue', { businessId: form.businessId }), form.address.trim(), form.landline && formatPhone(form.landline)]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <View style={[styles.panel, styles.paperStage]}>
      <View style={styles.paperCaption}>
        <Ionicons name="eye-outline" size={17} color={DESKTOP_COLORS.brand} />
        <DText weight="semiBold" style={styles.paperCaptionText}>{t('settings.documentPreview')}</DText>
      </View>
      <View style={styles.paper}>
        <View style={styles.paperHead}>
          <View style={styles.paperLogo}>
            {form.logoUri ? (
              <Image source={{ uri: form.logoUri }} accessibilityLabel={t('company.logo')} style={styles.paperLogoImage} resizeMode="contain" />
            ) : (
              <DText style={styles.paperPlaceholder}>{t('company.logoShort')}</DText>
            )}
          </View>
          <View style={styles.paperHeadText}>
            <DText weight="bold" style={styles.paperCompany} numberOfLines={1}>{form.name.trim() || t('company.name')}</DText>
            <DText style={styles.paperDetails} numberOfLines={1}>{details || t('settings.previewLine')}</DText>
          </View>
        </View>
        <View style={styles.paperRule} />
        {[92, 100, 84, 96, 70, 88, 58].map((w, i) => (
          <View key={i} style={[styles.paperLine, { width: `${w}%` }]} />
        ))}
        <View style={styles.paperSign}>
          <View style={styles.paperSignLine} />
          <DText style={styles.paperSignLabel}>{t('field.signature')}</DText>
          {form.stampUri ? (
            <Image source={{ uri: form.stampUri }} accessibilityLabel={t('company.stamp')} style={styles.paperStamp} resizeMode="contain" />
          ) : (
            <View style={styles.paperStampEmpty}>
              <DText style={styles.paperPlaceholder}>{t('company.stampShort')}</DText>
            </View>
          )}
        </View>
      </View>
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
  return render(input, error ?? (blocked ? t('validation.emailEnglishOnly') : undefined));
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
    <View style={[styles.panel, styles.slotPanel]}>
      <View style={styles.slotHead}>
        <DText weight="semiBold" style={styles.panelTitle}>
          {title}
        </DText>
        {!!uri && (
          <View style={styles.slotActions}>
            <HoverPressable onPress={onPick} hoverStyle={styles.linkHover} accessibilityLabel={t('common.replaceTitle', { title })}>
              <DText weight="semiBold" style={styles.link}>
                {t('common.replace')}
              </DText>
            </HoverPressable>
            <HoverPressable onPress={onClear} hoverStyle={styles.linkHover} accessibilityLabel={t('common.removeTitle', { title })}>
              <DText weight="semiBold" style={[styles.link, styles.linkDanger]}>
                {t('common.remove')}
              </DText>
            </HoverPressable>
          </View>
        )}
      </View>
      <HoverPressable
        style={[styles.drop, !!uri && styles.dropFilled]}
        hoverStyle={styles.dropHover}
        onPress={onPick}
        accessibilityLabel={uri ? t('common.replaceTitle', { title }) : t('common.uploadTitle', { title })}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.dropImage} resizeMode="contain" />
        ) : (
          <>
            <View style={styles.dropIcon}>
              <Ionicons name={icon} size={22} color={DESKTOP_COLORS.brand} />
            </View>
            <DText weight="semiBold" style={styles.dropText}>
              {t('common.uploadImage')}
            </DText>
            <DText style={styles.dropHint}>{t('common.clickToChooseFile')}</DText>
          </>
        )}
      </HoverPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ...FORM_PAGE_STYLES,
  root: { flex: 1, flexDirection: 'row-reverse', backgroundColor: GROUPED_BG },
  tabular: webOnly({ fontVariantNumeric: 'tabular-nums' }),
  // Compact sizes for this page (the shared form kit stays as is).
  // Fields sit in a grid inside each panel: label above a short box, two or
  // three to a row, so a panel stays short and no box stretches across the page.
  section: { marginBottom: 24 },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 16, letterSpacing: -0.2, lineHeight: 21 },
  sectionHint: { fontSize: 12.5, lineHeight: 17, color: DESKTOP_COLORS.inkMuted },
  panel: { ...FORM_PAGE_STYLES.panel, borderRadius: 12 },
  rows: { flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 16, rowGap: 12, padding: 16 },
  cell: { flexGrow: 1, flexBasis: 220, maxWidth: 320, minWidth: 0, gap: 5 },
  cellLabel: { fontSize: 13, lineHeight: 18, color: DESKTOP_COLORS.inkMuted, textAlign: 'right' },
  required: { color: DESKTOP_COLORS.danger, fontSize: 13 },
  cellErrorText: { fontSize: 12.5, color: DESKTOP_TONES.bad.fg },
  toggleTitle: { fontSize: 14 },
  toggleCaption: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },

  // Section menu — an iOS Settings sidebar: a white list whose blue
  // selection platter glides with the page scroll.
  nav: {},
  navTitle: { fontSize: 19, letterSpacing: -0.3, lineHeight: 25 },
  navSubtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: DESKTOP_COLORS.inkMuted,
    marginTop: 4,
    marginBottom: 14,
  },
  navCard: {
    padding: 5,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ boxShadow: PANEL_SHADOW }),
  },
  navList: { gap: 4 },
  navPlatter: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: NAV_STEP - 4,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({
      boxShadow: DESKTOP_BRAND_SHADOW,
    }),
  },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    height: NAV_STEP - 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...webOnly({ transition: 'background-color 150ms ease-out' }),
  },
  navItemHover: { backgroundColor: 'rgba(120,120,128,0.08)' },
  navIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({ transition: 'background-color 200ms ease-out' }),
  },
  navIconActive: { backgroundColor: '#FFFFFF' },
  navLabel: { flex: 1, fontSize: 14.5, color: DESKTOP_COLORS.ink, ...webOnly({ transition: 'color 200ms ease-out' }) },
  navLabelActive: { color: '#FFFFFF' },
  navErrorBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.danger,
  },
  navErrorBadgeActive: { backgroundColor: '#FFFFFF' },
  navErrorText: { fontSize: 13, color: '#FFFFFF' },
  navErrorTextActive: { color: DESKTOP_TONES.bad.fg },

  // Form column
  page: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 24,
    paddingTop: PAGE_TOP,
    paddingHorizontal: 24,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 1260,
    alignSelf: 'center',
  },
  navColumn: { width: 240, flexShrink: 0, ...webOnly({ position: 'sticky', top: 24 }) },
  main: { flex: 1, minWidth: 0 },
  sectionLast: { marginBottom: 0 },
  sectionGlyph: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ boxShadow: '0 1px 2px rgba(47,91,255,0.2), 0 4px 12px rgba(47,91,255,0.2)' }),
  },
  footnote: {
    fontSize: 12.5,
    color: DESKTOP_COLORS.inkFaint,
    marginTop: 6,
    paddingHorizontal: 4,
  },

  panelRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16 },
  panelStack: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  panelHalf: { flexGrow: 1, flexBasis: 300, minWidth: 0 },
  slotPanel: { padding: 20 },
  panelHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  panelTitle: { fontSize: 14 },
  cellControl: { gap: 5 },

  toggleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 520,
    ...webOnly({
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'opacity 150ms ease-out',
    }),
  },
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
  link: { fontSize: 15, color: DESKTOP_COLORS.brand },
  linkDanger: { color: DESKTOP_TONES.bad.fg },
  linkHover: { opacity: 0.7 },
  drop: {
    height: 150,
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
    backgroundColor: 'rgba(47,91,255,0.04)',
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
  dropText: { fontSize: 16 },
  dropHint: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  dropImage: { width: '100%', height: '100%' },

  // Save capsule
  capsuleDock: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 24,
    alignItems: 'center',
  },
  capsule: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 8,
    paddingEnd: 18,
    paddingStart: 8,
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
  capsuleText: { fontSize: 15.5 },
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
  capsuleGhostText: { fontSize: 15.5, color: DESKTOP_COLORS.inkMuted },
  capsuleCta: {
    height: 44,
    minWidth: 140,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      boxShadow: DESKTOP_BRAND_SHADOW,
      transition: 'background-color 150ms ease-out, transform 100ms ease-out',
    }),
  },
  capsuleCtaHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  capsuleCtaPress: { transform: [{ scale: 0.97 }] },
  capsuleCtaText: { fontSize: 15.5, color: '#FFFFFF' },
  busyLabel: { opacity: 0 },

  // Company hero
  hero: {
    marginBottom: 28,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#12306E',
    ...webOnly({
      backgroundImage:
        'radial-gradient(420px 420px at 100% 0%, rgba(47,91,255,0.42), rgba(47,91,255,0) 70%), radial-gradient(320px 320px at 0% 100%, rgba(25,198,240,0.22), rgba(25,198,240,0) 70%), linear-gradient(180deg, #12306E 0%, #0B1C45 60%, #0A1626 100%)',
      boxShadow: '0 18px 40px -18px rgba(10,22,38,0.55)',
    }),
  },
  heroBody: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 18, padding: 20 },
  heroIdentity: { flexGrow: 1, flexBasis: 320, minWidth: 0, gap: 14 },
  heroTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  heroMark: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...webOnly({ backdropFilter: 'blur(12px)' }),
  },
  heroMarkLogo: { backgroundColor: '#FFFFFF', borderColor: 'rgba(255,255,255,0.6)' },
  heroLogo: { width: 42, height: 42 },
  heroInitial: { fontSize: 20, color: '#FFFFFF' },
  heroNameBlock: { flex: 1, minWidth: 0, gap: 3 },
  heroName: { fontSize: 21, lineHeight: 27, letterSpacing: -0.3, color: '#FFFFFF' },
  heroIdRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  heroIdLabel: { fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  heroIdValue: { fontSize: 13.5, color: '#FFFFFF' },
  heroTag: {
    marginEnd: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    backgroundColor: 'rgba(95,193,240,0.18)',
  },
  heroTagText: { fontSize: 12, color: '#9FD8F5' },
  heroChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  heroChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroChipEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' },
  heroChipText: { fontSize: 13.5, color: '#FFFFFF', flexShrink: 1 },
  heroChipTextEmpty: { color: 'rgba(255,255,255,0.5)' },

  heroProgress: {
    flexGrow: 1,
    flexBasis: 290,
    maxWidth: 400,
    minWidth: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    ...webOnly({ backdropFilter: 'blur(16px) saturate(140%)' }),
  },
  ring: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0D1F4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: { fontSize: 21, color: '#FFFFFF', letterSpacing: -0.5 },
  ringOf: { fontSize: 12.5, color: 'rgba(255,255,255,0.55)' },
  heroProgressText: { flex: 1, minWidth: 0, gap: 4 },
  heroProgressTitle: { fontSize: 15, color: '#FFFFFF' },
  heroProgressHint: { fontSize: 12.5, color: 'rgba(255,255,255,0.65)' },
  missingRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  missingPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingEnd: 8,
    paddingStart: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    ...webOnly({ transition: 'background-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)' }),
  },
  missingPillHover: { backgroundColor: '#E6F4FB' },
  missingPillPress: { transform: [{ scale: 0.96 }] },
  missingPillText: { fontSize: 13, color: DESKTOP_COLORS.ink },

  // Monthly report: next send date
  nextReport: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  calTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    alignItems: 'center',
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 4px 10px rgba(16,24,40,0.06)' }),
  },
  calTileTop: { alignSelf: 'stretch', height: 14, backgroundColor: DESKTOP_COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  calTileMonth: { fontSize: 10.5, color: '#FFFFFF' },
  calTileDay: { fontSize: 18, lineHeight: 28, color: DESKTOP_COLORS.ink },
  nextReportText: { flex: 1, minWidth: 0, gap: 2 },
  nextReportTitle: { fontSize: 14, color: DESKTOP_COLORS.ink },
  nextReportHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },

  // Branding: two upload slots beside a live letterhead
  brandingRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' },
  brandingSlots: { flexGrow: 1, flexBasis: 300, minWidth: 0, gap: 16 },
  paperStage: {
    flexGrow: 1,
    flexBasis: 320,
    minWidth: 0,
    padding: 20,
    alignItems: 'center',
    gap: 16,
    ...webOnly({ backgroundImage: 'radial-gradient(100% 80% at 50% 0%, #FFFFFF 0%, #EEF2F5 100%)' }),
  },
  paperCaption: { alignSelf: 'stretch', flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  paperCaptionText: { fontSize: 16, color: DESKTOP_COLORS.ink },
  paper: {
    width: 270,
    aspectRatio: 210 / 297,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 18,
    gap: 7,
    ...webOnly({
      boxShadow: '0 1px 2px rgba(16,24,40,0.08), 0 18px 40px -8px rgba(22,34,46,0.22)',
      transform: 'perspective(900px) rotateX(4deg)',
    }),
  },
  paperHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  paperLogo: {
    width: 42,
    height: 42,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
  },
  paperLogoImage: { width: 42, height: 42 },
  paperPlaceholder: { fontSize: 10, color: DESKTOP_COLORS.inkFaint },
  paperHeadText: { flex: 1, minWidth: 0, gap: 1 },
  paperCompany: { fontSize: 12.5, color: DESKTOP_COLORS.ink },
  paperDetails: { fontSize: 8.5, color: DESKTOP_COLORS.inkMuted },
  paperRule: { height: 2, borderRadius: 1, backgroundColor: DESKTOP_COLORS.brand, marginVertical: 6 },
  paperLine: { height: 5, borderRadius: 3, backgroundColor: '#EAEEF1', alignSelf: 'flex-end' },
  paperSign: { marginTop: 'auto', flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8 },
  paperSignLine: { width: 80, height: 1, backgroundColor: DESKTOP_COLORS.inkFaint, marginBottom: 12 },
  paperSignLabel: { fontSize: 8.5, color: DESKTOP_COLORS.inkFaint, marginBottom: 8 },
  paperStamp: { width: 64, height: 64, marginEnd: 'auto', transform: [{ rotate: '-10deg' }], opacity: 0.9 },
  paperStampEmpty: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginEnd: 'auto',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D2DA',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
});
