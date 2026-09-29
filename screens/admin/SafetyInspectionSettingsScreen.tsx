import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { DesktopModal } from '../../components/desktop/DesktopModal';
import { DesktopInput, DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../../components/desktop/desktopTheme';
import { GroupLabel, pageStyles } from '../../components/desktop/record/RecordPage';
import { InspectionRemindersCard } from '../../components/inspection/InspectionRemindersCard';
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
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

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
      setLoadError(errorMessage(e, t('inspection.settingsLoadFailed')));
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
      setNotice(t('inspection.frequencySaved'));
    } catch (e) {
      setError(errorMessage(e, t('meeting.saveFrequencyFailed')));
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
      setNotice(t('inspection.listSaved'));
    } catch (e) {
      setError(errorMessage(e, t('inspection.listSaveFailed')));
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
      setNotice(t('inspection.backToReady'));
    } catch (e) {
      setResetting(false);
      setError(errorMessage(e, t('inspection.restoreFailed')));
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

  const resetPress = () => {
    if (!custom) {
      setList(copyForm(DEFAULT_INSPECTION_FORM));
      setDirty(false);
      setShowErrors(false);
      setError('');
      return;
    }
    setResetting(true);
  };

  if (isDesktop) {
    return (
      <DesktopShell active="SafetyInspections" breadcrumbs={[t('nav.management'), t('nav.safetyInspections'), t('common.settings')]}>
        <ScrollView style={pageStyles.root} contentContainerStyle={pageStyles.content}>
          <View style={[pageStyles.hero, pageStyles.enter]}>
            <HoverPressable style={desk.back} hoverStyle={desk.backHover} onPress={back} accessibilityLabel={t('common.goBack')}>
              <Ionicons name="arrow-forward" size={18} color={DESKTOP_COLORS.ink} />
            </HoverPressable>
            <View style={pageStyles.heroIdentity}>
              <DText weight="bold" style={pageStyles.heroName} accessibilityRole="header">{t('inspection.settingsTitle')}</DText>
              <DText style={pageStyles.heroSubText}>{t('inspection.settingsSubtitle')}</DText>
            </View>
            {loaded && dirty && (
              <View style={desk.actions}>
                <HoverPressable style={pageStyles.plainBtn} hoverStyle={pageStyles.plainBtnHover} onPress={() => void load()} disabled={!!busy}>
                  <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('inspection.discardChanges')}</DText>
                </HoverPressable>
                <HoverPressable style={[pageStyles.primaryBtn, !!busy && pageStyles.disabled]} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => void saveList()} disabled={!!busy}>
                  <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                  <DText weight="semiBold" style={pageStyles.primaryBtnText}>{busy === 'list' ? t('common.savingEllipsis') : t('inspection.saveList')}</DText>
                </HoverPressable>
              </View>
            )}
          </View>

          {loadError ? (
            <View style={[pageStyles.card, desk.state]}>
              <DText style={desk.error}>{loadError}</DText>
              <HoverPressable style={pageStyles.softBtn} hoverStyle={pageStyles.softBtnHover} onPress={() => void load()}>
                <DText weight="semiBold" style={pageStyles.softBtnText}>{t('common.tryAgain')}</DText>
              </HoverPressable>
            </View>
          ) : !loaded ? (
            <View style={[pageStyles.card, desk.state]}>
              <DText style={pageStyles.mutedText}>{t('common.loadingEllipsis')}</DText>
            </View>
          ) : (
            <>
              {(!!error || !!notice) && (
                <View style={[desk.banner, error ? desk.bannerBad : desk.bannerOk]} accessibilityRole="alert">
                  <Ionicons name={error ? 'alert-circle' : 'checkmark-circle'} size={18} color={error ? DESKTOP_TONES.bad.fg : DESKTOP_TONES.ok.fg} />
                  <DText weight="semiBold" style={[desk.bannerText, { color: error ? DESKTOP_TONES.bad.fg : DESKTOP_TONES.ok.fg }]}>{error || notice}</DText>
                </View>
              )}
              <View style={pageStyles.gridRow}>
                <View style={pageStyles.mainCell}>
                  <GroupLabel
                    action={
                      <DText style={pageStyles.mutedText}>
                        {custom ? t('inspection.companyList') : t('inspection.readyList')} · {itemCount} {t('checklist.itemsWord')}
                      </DText>
                    }
                  >
                    {t('inspection.itemList')}
                  </GroupLabel>
                  <View style={desk.groups}>
                    {list.groups.map((group, gi) => {
                      const titleMissing = showErrors && !group.title.trim() && group.items.some((item) => item.text.trim());
                      return (
                        <View key={group.id} style={[pageStyles.card, pageStyles.listCard]}>
                          <View style={desk.groupHead}>
                            <View style={desk.groupNum}>
                              <DText weight="bold" style={desk.groupNumText}>{gi + 1}</DText>
                            </View>
                            <DesktopInput
                              value={group.title}
                              onChangeText={(title) => updateGroup(gi, { title })}
                              placeholder={t('inspection.groupNamePlaceholder')}
                              maxLength={INSPECTION_LIMITS.groupTitle}
                              hasError={titleMissing}
                              style={desk.groupTitle}
                            />
                            <DeskIcon icon="arrow-up" label={t('inspection.moveGroupUp')} disabled={gi === 0} onPress={() => setGroups(move(list.groups, gi, gi - 1))} />
                            <DeskIcon icon="arrow-down" label={t('inspection.moveGroupDown')} disabled={gi === list.groups.length - 1} onPress={() => setGroups(move(list.groups, gi, gi + 1))} />
                            <DeskIcon icon="trash-outline" label={t('inspection.deleteGroup', { title: group.title })} danger disabled={list.groups.length === 1} onPress={() => setGroups(list.groups.filter((_, i) => i !== gi))} />
                          </View>
                          {group.items.map((item, ii) => (
                            <View key={item.id} style={[desk.item, ii > 0 && pageStyles.rowDivider]}>
                              <DText style={desk.itemNum}>{ii + 1}</DText>
                              <DesktopInput
                                value={item.text}
                                onChangeText={(text) => updateItems(gi, group.items.map((it, i) => (i === ii ? { ...it, text } : it)))}
                                placeholder={t('inspection.whatToCheck')}
                                maxLength={INSPECTION_LIMITS.itemText}
                                style={desk.itemInput}
                              />
                              <DeskIcon icon="arrow-up" label={t('inspection.moveItemUp')} disabled={ii === 0} onPress={() => updateItems(gi, move(group.items, ii, ii - 1))} />
                              <DeskIcon icon="close" label={t('inspection.deleteItem', { text: item.text })} danger onPress={() => updateItems(gi, group.items.filter((_, i) => i !== ii))} />
                            </View>
                          ))}
                          <HoverPressable
                            style={desk.addItem}
                            hoverStyle={pageStyles.rowHover}
                            onPress={() => updateItems(gi, [...group.items, { id: newListId('i'), text: '' }])}
                            disabled={itemCount >= INSPECTION_LIMITS.items}
                            accessibilityLabel={t('inspection.addItemToGroup', { title: group.title })}
                          >
                            <Ionicons name="add" size={17} color={DESKTOP_COLORS.brand} />
                            <DText weight="semiBold" style={pageStyles.linkText}>{t('checklist.addItem')}</DText>
                          </HoverPressable>
                        </View>
                      );
                    })}
                    <HoverPressable
                      style={desk.addGroup}
                      hoverStyle={desk.addGroupHover}
                      onPress={() => setGroups([...list.groups, { id: newListId('g'), title: '', items: [{ id: newListId('i'), text: '' }] }])}
                      disabled={list.groups.length >= INSPECTION_LIMITS.groups}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={DESKTOP_COLORS.brand} />
                      <DText weight="semiBold" style={pageStyles.softBtnText}>{t('inspection.addGroup')}</DText>
                    </HoverPressable>
                    {showErrors && problem && <DText style={desk.error}>{problem}</DText>}
                  </View>
                </View>

                <View style={pageStyles.sideCell}>
                  <GroupLabel>{t('inspection.remindersTitle')}</GroupLabel>
                  <InspectionRemindersCard
                    companyId={companyId}
                    repeatMonths={repeatMonths}
                    onRepeatSaved={(months) => {
                      setRepeatMonths(months);
                      setError('');
                      setNotice(t('inspection.frequencySaved'));
                    }}
                  />
                  <View style={desk.gap} />
                  <View style={[pageStyles.card, pageStyles.listCard, desk.note]}>
                    <Ionicons name="information-circle-outline" size={17} color={DESKTOP_COLORS.inkMuted} />
                    <DText style={desk.noteText}>
                      {t('inspection.listLimitsPrefix')} {INSPECTION_LIMITS.groups} {t('inspection.groupsAnd')}{INSPECTION_LIMITS.items} {t('inspection.itemsDot')}
                    </DText>
                  </View>
                  {(custom || dirty) && (
                    <>
                      <View style={desk.gap} />
                      <HoverPressable style={[pageStyles.card, pageStyles.listCard, desk.reset]} hoverStyle={pageStyles.rowHover} onPress={resetPress} disabled={!!busy}>
                        <Ionicons name="refresh" size={17} color={DESKTOP_COLORS.inkMuted} />
                        <View style={pageStyles.flex}>
                          <DText weight="semiBold" style={desk.resetTitle}>{t('inspection.backToReadyAction')}</DText>
                          <DText style={desk.noteText}>{t('inspection.deletesYourList')}</DText>
                        </View>
                      </HoverPressable>
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>

        <DesktopModal visible={resetting} title={t('inspection.backToReadyQuestion')} onClose={() => setResetting(false)} maxWidth={440}>
          <View style={pageStyles.editBody}>
            <DText style={pageStyles.editHint}>{t('inspection.backToReadyWarning')}</DText>
            <View style={pageStyles.editActions}>
              <HoverPressable style={[pageStyles.plainBtn, pageStyles.editActionBtn]} hoverStyle={pageStyles.plainBtnHover} onPress={() => setResetting(false)}>
                <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('common.cancel')}</DText>
              </HoverPressable>
              <HoverPressable style={[pageStyles.primaryBtn, pageStyles.editActionBtn, desk.danger]} hoverStyle={desk.dangerHover} onPress={() => void resetList()} disabled={busy === 'reset'}>
                <DText weight="semiBold" style={pageStyles.primaryBtnText}>{t('inspection.backToReadyAction')}</DText>
              </HoverPressable>
            </View>
          </View>
        </DesktopModal>
        <DesktopModal visible={!!leaving} title={t('signing.leaveWithoutSaving')} onClose={() => setLeaving(null)} maxWidth={440}>
          <View style={pageStyles.editBody}>
            <DText style={pageStyles.editHint}>{t('inspection.listUnsaved')}</DText>
            <View style={pageStyles.editActions}>
              <HoverPressable style={[pageStyles.plainBtn, pageStyles.editActionBtn]} hoverStyle={pageStyles.plainBtnHover} onPress={() => setLeaving(null)}>
                <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('common.stay')}</DText>
              </HoverPressable>
              <HoverPressable style={[pageStyles.primaryBtn, pageStyles.editActionBtn, desk.danger]} hoverStyle={desk.dangerHover} onPress={discardChanges}>
                <DText weight="semiBold" style={pageStyles.primaryBtnText}>{t('common.exitWithoutSaving')}</DText>
              </HoverPressable>
            </View>
          </View>
        </DesktopModal>
      </DesktopShell>
    );
  }

  const body = (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={<HeroTitle title={t('inspection.settingsTitle')} subtitle={t('inspection.settingsSubtitle')} onBack={back} />}
      footer={
        loaded && dirty ? (
          <PrimaryAction label={t('inspection.saveList')} icon="checkmark" onPress={() => void saveList()} loading={busy === 'list'} disabled={!!busy} />
        ) : undefined
      }
      overlay={
        <>
          <KitSheet
            visible={resetting}
            onClose={() => setResetting(false)}
            icon="refresh"
            title={t('inspection.backToReadyQuestion')}
            subtitle={t('inspection.backToReadyWarning')}
            footer={
              <SheetActions>
                <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={() => setResetting(false)} style={styles.flex} />
                <PrimaryAction label={t('inspection.backToReadyAction')} tone="destructive" onPress={() => void resetList()} loading={busy === 'reset'} style={styles.flex} />
              </SheetActions>
            }
          />
          <KitSheet
            visible={!!leaving}
            onClose={() => setLeaving(null)}
            icon="alert-circle-outline"
            title={t('signing.leaveWithoutSaving')}
            subtitle={t('inspection.listUnsaved')}
            footer={
              <SheetActions>
                <PrimaryAction label={t('common.stay')} tone="ghost" onPress={() => setLeaving(null)} style={styles.flex} />
                <PrimaryAction label={t('common.exitWithoutSaving')} tone="destructive" onPress={discardChanges} style={styles.flex} />
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

          <KitSection title={t('inspection.howOftenEach')}>
            <View style={styles.repeat}>
              {INSPECTION_REPEAT_OPTIONS.map((option) => {
                const on = option.months === repeatMonths;
                return (
                  <Pressy
                    key={option.months}
                    onPress={() => void chooseRepeat(option.months)}
                    disabled={!!busy}
                    accessibilityLabel={`${option.label}${on ? t('common.selectedSuffix') : ''}`}
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
                ? t('inspection.noRemindersHint')
                : t('inspection.nextDateHint')}
            </DKText>
          </KitSection>

          <View>
            <View style={styles.listHead}>
              <DKText variant="heading" accessibilityRole="header" style={styles.flex}>
                {t('inspection.itemList')}
              </DKText>
              <DKText variant="caption" color={DK.muted}>
                {custom ? t('inspection.companyList') : t('inspection.readyList')} · {itemCount} {t('checklist.itemsWord')}
              </DKText>
            </View>
            <DKText variant="caption" color={DK.muted} style={styles.listNote}>
              {t('inspection.listLimitsPrefix')} {INSPECTION_LIMITS.groups} {t('inspection.groupsAnd')}{INSPECTION_LIMITS.items} {t('inspection.itemsDot')}
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
                    placeholder={t('inspection.groupNamePlaceholder')}
                    accessibilityLabel={t('inspection.groupNameN', { v1: gi + 1 })}
                    maxLength={INSPECTION_LIMITS.groupTitle}
                    hasError={titleMissing}
                    style={[styles.flex, styles.groupTitle]}
                  />
                  <IconButton icon="arrow-up" label={t('inspection.moveGroupUp')} disabled={gi === 0} onPress={() => setGroups(move(list.groups, gi, gi - 1))} />
                  <IconButton icon="arrow-down" label={t('inspection.moveGroupDown')} disabled={gi === list.groups.length - 1} onPress={() => setGroups(move(list.groups, gi, gi + 1))} />
                  <IconButton icon="trash-outline" label={t('inspection.deleteGroup', { title: group.title })} danger disabled={list.groups.length === 1} onPress={() => setGroups(list.groups.filter((_, i) => i !== gi))} />
                </View>

                {group.items.map((item, ii) => (
                  <View key={item.id} style={styles.item}>
                    <DKText variant="number" color={DK.muted} style={styles.itemNum}>
                      {ii + 1}
                    </DKText>
                    <KitInput
                      value={item.text}
                      onChangeText={(text) => updateItems(gi, group.items.map((it, i) => (i === ii ? { ...it, text } : it)))}
                      placeholder={t('inspection.whatToCheck')}
                      accessibilityLabel={t('inspection.itemInGroup', { v1: ii + 1, v2: group.title || gi + 1 })}
                      maxLength={INSPECTION_LIMITS.itemText}
                      multiline
                      style={styles.flex}
                    />
                    <IconButton icon="arrow-up" label={t('inspection.moveItemUp')} disabled={ii === 0} onPress={() => updateItems(gi, move(group.items, ii, ii - 1))} />
                    <IconButton icon="close" label={t('inspection.deleteItem', { text: item.text })} danger onPress={() => updateItems(gi, group.items.filter((_, i) => i !== ii))} />
                  </View>
                ))}

                <Pressy
                  onPress={() => updateItems(gi, [...group.items, { id: newListId('i'), text: '' }])}
                  disabled={itemCount >= INSPECTION_LIMITS.items}
                  accessibilityLabel={t('inspection.addItemToGroup', { title: group.title })}
                  style={styles.add}
                  pressScale={0.97}
                >
                  <Ionicons name="add" size={19} color={DK.accent} />
                  <DKText variant="label" color={DK.accent}>
                    {t('checklist.addItem')}
                  </DKText>
                </Pressy>
              </Surface>
            );
          })}

          <PrimaryAction
            label={t('inspection.addGroup')}
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
                label={t('inspection.backToReadyAction')}
                tone="muted"
                hint={t('inspection.deletesYourList')}
                onPress={resetPress}
                disabled={!!busy}
              />
            </Surface>
          )}
        </>
      )}
    </DriverPage>
  );

  return body;
}

function DeskIcon({
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
    <HoverPressable
      style={[desk.icon, disabled && desk.iconDisabled]}
      hoverStyle={danger ? desk.iconDangerHover : desk.iconHover}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={16} color={disabled ? DESKTOP_COLORS.inkFaint : danger ? DESKTOP_TONES.bad.fg : DESKTOP_COLORS.inkMuted} />
    </HoverPressable>
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

const desk = StyleSheet.create({
  back: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EEF1F4', alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  backHover: { backgroundColor: '#E5E9ED' },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  state: { flexGrow: 0, alignItems: 'center', gap: 10, padding: 32 },
  error: { fontSize: 13.5, color: DESKTOP_TONES.bad.fg },
  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  bannerOk: { backgroundColor: DESKTOP_TONES.ok.bg },
  bannerBad: { backgroundColor: DESKTOP_TONES.bad.bg },
  bannerText: { fontSize: 14, flex: 1 },
  groups: { gap: 12 },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, backgroundColor: DESKTOP_COLORS.surfaceMuted, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  groupNum: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,136,204,0.10)', alignItems: 'center', justifyContent: 'center' },
  groupNumText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  item: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12 },
  itemNum: { width: 28, textAlign: 'center', fontSize: 13, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  itemInput: { flex: 1, borderColor: 'transparent', backgroundColor: 'transparent' },
  addItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft, ...webOnly({ transition: 'background-color 150ms ease' }) },
  addGroup: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(0,117,179,0.35)', ...webOnly({ transition: 'background-color 150ms ease' }) },
  addGroupHover: { backgroundColor: 'rgba(0,136,204,0.06)' },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  iconHover: { backgroundColor: DESKTOP_COLORS.canvas },
  iconDangerHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  iconDisabled: { opacity: 0.45 },
  gap: { height: 10 },
  note: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, padding: 14 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: DESKTOP_COLORS.inkMuted },
  reset: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 14 },
  resetTitle: { fontSize: 14 },
  danger: { backgroundColor: DESKTOP_TONES.bad.fg },
  dangerHover: { backgroundColor: '#A51A15' },
});
