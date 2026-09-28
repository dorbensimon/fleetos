import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActionRow,
  Banner,
  DK,
  DKText,
  DriverPage,
  ErrorPanel,
  HeroTitle,
  KitInput,
  KitSection,
  KitSheet,
  LoadingPanel,
  PrimaryAction,
  Pressy,
  STATUS,
  SheetActions,
  Surface,
} from '../../components/driverKit';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { useCompany } from '../../lib/CompanyContext';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import {
  DEFAULT_INSPECTION_FORM,
  INSPECTION_LIMITS,
  INSPECTION_REPEAT_OPTIONS,
  formItems,
  getInspectionSettings,
  listProblem,
  newListId,
  saveInspectionSettings,
  type InspectionForm,
} from '../../lib/inspections';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Settings of "בדיקות בטיחות": how often each vehicle is checked, and the
 * company's own list of items (groups and the items in them). An edit to the
 * list applies to inspections started after it; one already open keeps its own.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SafetyInspectionSettings'>;
type Busy = '' | 'repeat' | 'list' | 'reset';

const copyForm = (form: InspectionForm): InspectionForm => ({
  version: 1,
  groups: form.groups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) })),
});

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function SafetyInspectionSettingsScreen({ navigation }: Props) {
  const { company } = useCompany();
  const companyId = company?.id ?? '';
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [repeatMonths, setRepeatMonths] = useState(1);
  const [custom, setCustom] = useState(false);
  const [list, setList] = useState<InspectionForm>(() => copyForm(DEFAULT_INSPECTION_FORM));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [leaving, setLeaving] = useState<null | { go: () => void }>(null);
  const allowLeave = useRef(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const settings = await getInspectionSettings(companyId);
      setRepeatMonths(settings.repeatMonths);
      setCustom(!!settings.form);
      setList(copyForm(settings.form ?? DEFAULT_INSPECTION_FORM));
      setDirty(false);
      setLoadError('');
      setLoaded(true);
    } catch (e) {
      setLoadError((e as Error)?.message || 'טעינת ההגדרות נכשלה');
    }
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowLeave.current || !dirty) return;
        event.preventDefault();
        setLeaving({ go: () => navigation.dispatch(event.data.action) });
      }),
    [dirty, navigation],
  );

  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('SafetyInspections'));

  const edit = (next: InspectionForm) => {
    setList(next);
    setDirty(true);
    setNotice('');
  };
  const setGroups = (groups: InspectionForm['groups']) => edit({ version: 1, groups });
  const updateGroup = (gi: number, patch: Partial<InspectionForm['groups'][number]>) =>
    setGroups(list.groups.map((group, i) => (i === gi ? { ...group, ...patch } : group)));
  const updateItems = (gi: number, items: InspectionForm['groups'][number]['items']) => updateGroup(gi, { items });

  const itemCount = formItems(list).length;
  const problem = listProblem(list);

  const chooseRepeat = async (months: number) => {
    if (months === repeatMonths || busy) return;
    setBusy('repeat');
    setError('');
    setNotice('');
    try {
      const saved = await saveInspectionSettings(companyId, { repeatMonths: months });
      setRepeatMonths(saved.repeatMonths);
      setNotice('התדירות נשמרה');
    } catch (e) {
      setError((e as Error)?.message || 'שמירת התדירות נכשלה');
    } finally {
      setBusy('');
    }
  };

  const saveList = async () => {
    setShowErrors(true);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy('list');
    setError('');
    try {
      const saved = await saveInspectionSettings(companyId, { form: list });
      setCustom(!!saved.form);
      setList(copyForm(saved.form ?? DEFAULT_INSPECTION_FORM));
      setDirty(false);
      setShowErrors(false);
      setNotice('הרשימה נשמרה. היא תשמש מהבדיקה הבאה.');
    } catch (e) {
      setError((e as Error)?.message || 'שמירת הרשימה נכשלה');
    } finally {
      setBusy('');
    }
  };

  const resetList = async () => {
    setBusy('reset');
    setError('');
    try {
      await saveInspectionSettings(companyId, { form: null });
      setCustom(false);
      setList(copyForm(DEFAULT_INSPECTION_FORM));
      setDirty(false);
      setShowErrors(false);
      setResetting(false);
      setNotice('חזרתם לרשימה המוכנה');
    } catch (e) {
      setResetting(false);
      setError((e as Error)?.message || 'השחזור נכשל');
    } finally {
      setBusy('');
    }
  };

  const discardChanges = () => {
    allowLeave.current = true;
    const go = leaving?.go;
    setLeaving(null);
    go?.();
  };

  const body = (
    <DriverPage
      insetTop={isDesktop ? 0 : insets.top}
      insetBottom={isDesktop ? 0 : insets.bottom}
      hero={<HeroTitle title="הגדרות בדיקות בטיחות" subtitle="כל כמה זמן בודקים, ומה בודקים" onBack={back} />}
      footer={
        loaded && dirty ? (
          <PrimaryAction label="שמירת הרשימה" icon="checkmark" onPress={() => void saveList()} loading={busy === 'list'} disabled={!!busy} />
        ) : undefined
      }
      overlay={
        <>
          <KitSheet
            visible={resetting}
            onClose={() => setResetting(false)}
            icon="refresh"
            title="לחזור לרשימה המוכנה?"
            subtitle="הרשימה שערכתם תימחק, ובדיקות חדשות ייפתחו עם הרשימה המוכנה. בדיקות שכבר נעשו לא משתנות."
            footer={
              <SheetActions>
                <PrimaryAction label="ביטול" tone="ghost" onPress={() => setResetting(false)} style={styles.flex} />
                <PrimaryAction label="חזרה לרשימה המוכנה" tone="destructive" onPress={() => void resetList()} loading={busy === 'reset'} style={styles.flex} />
              </SheetActions>
            }
          />
          <KitSheet
            visible={!!leaving}
            onClose={() => setLeaving(null)}
            icon="alert-circle-outline"
            title="לצאת בלי לשמור?"
            subtitle="השינויים ברשימה עוד לא נשמרו."
            footer={
              <SheetActions>
                <PrimaryAction label="להישאר" tone="ghost" onPress={() => setLeaving(null)} style={styles.flex} />
                <PrimaryAction label="יציאה בלי לשמור" tone="destructive" onPress={discardChanges} style={styles.flex} />
              </SheetActions>
            }
          />
        </>
      }
    >
      {loadError ? (
        <ErrorPanel message={loadError} onRetry={() => void load()} />
      ) : !loaded ? (
        <LoadingPanel />
      ) : (
        <>
          {!!error && <Banner tone="expired" title={error} />}
          {!!notice && !error && <Banner tone="ok" title={notice} />}

          <KitSection title="כל כמה זמן בודקים כל רכב">
            <View style={styles.repeat}>
              {INSPECTION_REPEAT_OPTIONS.map((option) => {
                const on = option.months === repeatMonths;
                return (
                  <Pressy
                    key={option.months}
                    onPress={() => void chooseRepeat(option.months)}
                    disabled={!!busy}
                    accessibilityLabel={`${option.label}${on ? ', נבחר' : ''}`}
                    pressScale={0.95}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  >
                    {on && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                    <DKText variant="label" color={on ? '#FFFFFF' : DK.inkSoft}>
                      {option.label}
                    </DKText>
                  </Pressy>
                );
              })}
            </View>
            <DKText variant="caption" color={DK.muted} style={styles.hint}>
              {repeatMonths === 0
                ? 'לא יישלחו תזכורות. תאריך שתקבעו ידנית בכרטיס הרכב עדיין יזכיר.'
                : 'המועד הבא של כל רכב נקבע כשקצין הבטיחות חותם על הבדיקה שלו. שינוי כאן חל מהבדיקה הבאה של כל רכב.'}
            </DKText>
          </KitSection>

          <View>
            <View style={styles.listHead}>
              <DKText variant="heading" accessibilityRole="header" style={styles.flex}>
                רשימת הסעיפים
              </DKText>
              <DKText variant="caption" color={DK.muted}>
                {custom ? 'רשימה של החברה' : 'הרשימה המוכנה'} · {itemCount} סעיפים
              </DKText>
            </View>
            <DKText variant="caption" color={DK.muted} style={styles.listNote}>
              בדיקה שכבר נפתחה שומרת את הרשימה שהייתה כשנפתחה. אפשר עד {INSPECTION_LIMITS.groups} קבוצות ו-{INSPECTION_LIMITS.items} סעיפים.
            </DKText>
          </View>

          {list.groups.map((group, gi) => {
            const titleMissing = showErrors && !group.title.trim() && group.items.some((item) => item.text.trim());
            return (
              <Surface key={group.id} style={styles.group}>
                <View style={styles.groupHead}>
                  <KitInput
                    value={group.title}
                    onChangeText={(title) => updateGroup(gi, { title })}
                    placeholder="שם הקבוצה, לדוגמה: מבחוץ"
                    accessibilityLabel={`שם קבוצה ${gi + 1}`}
                    maxLength={INSPECTION_LIMITS.groupTitle}
                    hasError={titleMissing}
                    style={[styles.flex, styles.groupTitle]}
                  />
                  <IconButton icon="arrow-up" label="הזזת הקבוצה למעלה" disabled={gi === 0} onPress={() => setGroups(move(list.groups, gi, gi - 1))} />
                  <IconButton icon="arrow-down" label="הזזת הקבוצה למטה" disabled={gi === list.groups.length - 1} onPress={() => setGroups(move(list.groups, gi, gi + 1))} />
                  <IconButton icon="trash-outline" label={`מחיקת הקבוצה ${group.title}`} danger disabled={list.groups.length === 1} onPress={() => setGroups(list.groups.filter((_, i) => i !== gi))} />
                </View>

                {group.items.map((item, ii) => (
                  <View key={item.id} style={styles.item}>
                    <DKText variant="number" color={DK.muted} style={styles.itemNum}>
                      {ii + 1}
                    </DKText>
                    <KitInput
                      value={item.text}
                      onChangeText={(text) => updateItems(gi, group.items.map((it, i) => (i === ii ? { ...it, text } : it)))}
                      placeholder="מה בודקים?"
                      accessibilityLabel={`סעיף ${ii + 1} בקבוצה ${group.title || gi + 1}`}
                      maxLength={INSPECTION_LIMITS.itemText}
                      multiline
                      style={styles.flex}
                    />
                    <IconButton icon="arrow-up" label="הזזת הסעיף למעלה" disabled={ii === 0} onPress={() => updateItems(gi, move(group.items, ii, ii - 1))} />
                    <IconButton icon="close" label={`מחיקת הסעיף ${item.text}`} danger onPress={() => updateItems(gi, group.items.filter((_, i) => i !== ii))} />
                  </View>
                ))}

                <Pressy
                  onPress={() => updateItems(gi, [...group.items, { id: newListId('i'), text: '' }])}
                  disabled={itemCount >= INSPECTION_LIMITS.items}
                  accessibilityLabel={`הוספת סעיף לקבוצה ${group.title}`}
                  style={styles.add}
                  pressScale={0.97}
                >
                  <Ionicons name="add" size={19} color={DK.accent} />
                  <DKText variant="label" color={DK.accent}>
                    הוספת סעיף
                  </DKText>
                </Pressy>
              </Surface>
            );
          })}

          <PrimaryAction
            label="הוספת קבוצה"
            icon="add-circle-outline"
            tone="ghost"
            disabled={list.groups.length >= INSPECTION_LIMITS.groups}
            onPress={() => setGroups([...list.groups, { id: newListId('g'), title: '', items: [{ id: newListId('i'), text: '' }] }])}
          />

          {showErrors && problem && (
            <DKText variant="caption" color={STATUS.expired.fg}>
              {problem}
            </DKText>
          )}

          {(custom || dirty) && (
            <Surface>
              <ActionRow
                icon="refresh"
                label="חזרה לרשימה המוכנה"
                tone="muted"
                hint="מוחק את הרשימה שערכתם"
                onPress={() => {
                  if (!custom) {
                    setList(copyForm(DEFAULT_INSPECTION_FORM));
                    setDirty(false);
                    setShowErrors(false);
                    setError('');
                    return;
                  }
                  setResetting(true);
                }}
                disabled={!!busy}
              />
            </Surface>
          )}
        </>
      )}
    </DriverPage>
  );

  return isDesktop ? (
    <DesktopShell active="SafetyInspections" breadcrumbs={['ניהול', 'בדיקות בטיחות', 'הגדרות']}>
      {body}
    </DesktopShell>
  ) : (
    body
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressy onPress={onPress} disabled={disabled} accessibilityLabel={label} style={[styles.iconButton, danger && styles.iconDanger]} pressScale={0.9}>
      <Ionicons name={icon} size={18} color={danger ? STATUS.expired.fg : DK.inkSoft} />
    </Pressy>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  repeat: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, padding: 14 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 999 },
  chipOn: { backgroundColor: DK.accent },
  chipOff: { backgroundColor: DK.surfaceSunk },
  hint: { paddingHorizontal: 16, paddingBottom: 14 },
  listHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginTop: 8 },
  listNote: { paddingHorizontal: 4, marginTop: 4 },
  group: { padding: 14, gap: 10 },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  groupTitle: { fontSize: 17 },
  item: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  itemNum: { width: 22, textAlign: 'center' },
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.surfaceSunk },
  iconDanger: { backgroundColor: STATUS.expired.soft },
  add: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-end', paddingHorizontal: 4 },
});
