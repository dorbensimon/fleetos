import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActionRow,
  Banner,
  DK,
  DKText,
  DriverPage,
  ErrorPanel,
  HeroTitle,
  KitSection,
  KitSheet,
  ListRow,
  LoadingPanel,
  PrimaryAction,
  Pressy,
  Reveal,
  SheetActions,
} from '../../../components/driverKit';
import { downloadSigningTemplate, type SigningTemplate } from '../../../lib/docuseal';
import { countWaitingSigners, deleteCompanyTemplate, deleteTemplateMessage } from '../../../lib/signingSend';
import { formatDate } from '../../../lib/theme';
import type { RootStackParamList } from '../../../navigation/types';
import { SendBody, SendFooter, useSendToDrivers } from './SendToDriversMobile';
import { TemplateThumb } from './TemplateThumb';
import { Ionicons } from '@expo/vector-icons';
import { checklistPreviewTarget } from '../../../components/checklist/useFolderMeetings';
import { isChecklistTemplate, readForm, repeatLabel } from '../../../lib/checklistForms';
import { isDueSoon, planByDriver, type PlanRow } from '../../../lib/meetingPlan';
import { DuePill } from '../../../components/checklist/DuePill';
import { t, dirIcon } from '../../../lib/i18n';
import type { CompanyFolder } from '../../../lib/folderCatalog';
import { AddCatalogFolderSheet, EmptyCatalogFolderSheet, useRemoveCatalogFolder } from '../../../components/desktop/signing/FolderCatalogSheets';

type Props = {
  insetTop: number;
  insetBottom: number;
  companyId: string;
  templates: SigningTemplate[] | null;
  loading: boolean;
  error: string;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onBack: () => void;
  /** The blank document as the driver will get it; rejects with a message to show. */
  viewTarget: (template: SigningTemplate) => Promise<RootStackParamList['DocusealWebView']>;
  onOpenViewer: (target: RootStackParamList['DocusealWebView']) => void;
  onDeleted: (template: SigningTemplate) => void;
  /** A "רשימת סעיפים" form: open a new meeting with this driver. */
  onStartMeeting: (templateId: string, driverId: string) => void;
  /** Every driver's next meeting on the company's repeating forms. */
  plan: PlanRow[];
  /** Opens this form's "עם מי המפגש?" list on arrival (from a notification). */
  openMeeting?: string;
  onMeetingOpened: () => void;
  /** The company's catalog folders (lib/folderCatalog.ts). */
  catalog: CompanyFolder[];
  /** After a folder was added, linked or removed. */
  onFoldersChanged: () => void;
};

const DUE_COLLAPSED = 4;

function checklistSubtitle(entry: SigningTemplate): string {
  const months = readForm(entry.form_content)?.repeatMonths ?? 0;
  return months ? t('signing.checklistMeetingRepeat', { months: repeatLabel(months) }) : t('signing.checklistCreatedOn', { v1: formatDate(entry.created_at) });
}

type Mode = 'actions' | 'confirm' | 'send' | 'meet';
type Busy = '' | 'view' | 'download' | 'check' | 'delete';

/**
 * "מסמכים חתומים" on the manager's phone: everything the desktop page does
 * with a document except creating one — view, download, send to drivers and
 * delete. One sheet per document; its content changes step by step.
 */
export function SignedDocumentsMobile(p: Props) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<SigningTemplate | null>(null);
  const [mode, setMode] = useState<Mode>('actions');
  const [busy, setBusy] = useState<Busy>('');
  const [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState(0);
  const send = useSendToDrivers(p.companyId, mode === 'send' || mode === 'meet' ? template : null);
  const checklist = isChecklistTemplate(template);

  const [dueExpanded, setDueExpanded] = useState(false);
  const dueRows = useMemo(() => p.plan.filter((row) => isDueSoon(row)), [p.plan]);
  const templatePlan = useMemo(() => (template ? planByDriver(p.plan, template.id) : new Map<string, PlanRow>()), [p.plan, template]);
  const meetDrivers = useMemo(() => {
    const rows = send.drivers ?? [];
    if (!templatePlan.size) return rows;
    return [...rows].sort((a, b) => (templatePlan.get(a.id)?.nextDue ?? '9999').localeCompare(templatePlan.get(b.id)?.nextDue ?? '9999'));
  }, [send.drivers, templatePlan]);

  const own = (p.templates ?? []).filter((entry) => entry.company_id === p.companyId && !entry.catalog_folder_id);
  const shared = (p.templates ?? []).filter((entry) => entry.company_id === null);
  const isOwn = !!template && template.company_id === p.companyId;
  // A folder's form is removed with its folder, never deleted (forms are made and replaced on a computer).
  const folderOfTemplate = template?.catalog_folder_id ? p.catalog.find((folder) => folder.id === template.catalog_folder_id) ?? null : null;
  const addedFolders = p.catalog.filter((folder) => folder.added);
  const [addingFolder, setAddingFolder] = useState(false);
  const [emptyFolder, setEmptyFolder] = useState<CompanyFolder | null>(null);
  const removeFolder = useRemoveCatalogFolder(p.companyId, p.onFoldersChanged);

  const openSheet = (entry: SigningTemplate) => {
    setTemplate(entry);
    setMode('actions');
    setMessage('');
    setBusy('');
    setOpen(true);
  };
  const { openMeeting, onMeetingOpened, templates } = p;
  useEffect(() => {
    if (!openMeeting || !templates) return;
    const target = templates.find((entry) => entry.id === openMeeting);
    if (target) {
      setTemplate(target);
      setMode('meet');
      setMessage('');
      setBusy('');
      setOpen(true);
    }
    onMeetingOpened();
  }, [openMeeting, templates, onMeetingOpened]);

  const close = () => {
    if (busy === 'delete' || send.sending) return;
    setOpen(false);
  };
  const run = async (kind: Busy, task: () => Promise<void>, fallback: string) => {
    setBusy(kind);
    setMessage('');
    try {
      await task();
    } catch (error) {
      setMessage((error as Error)?.message || fallback);
    } finally {
      setBusy('');
    }
  };

  const view = () =>
    run('view', async () => {
      const target = checklist ? await checklistPreviewTarget(template!, template!.title) : await p.viewTarget(template!);
      // The sheet goes first, so it never sits over the viewer.
      setOpen(false);
      p.onOpenViewer(target);
    }, t('signing.openFailedRetry'));
  const download = () => run('download', () => downloadSigningTemplate(template!), t('signing.downloadFailedRetry'));
  const askDelete = () =>
    run('check', async () => {
      setWaiting(await countWaitingSigners(p.companyId, template!.id));
      setMode('confirm');
    }, t('signing.cannotDeleteNow'));
  const doDelete = () =>
    run('delete', async () => {
      await deleteCompanyTemplate(p.companyId, template!.id);
      setOpen(false);
      p.onDeleted(template!);
    }, t('documents.deleteFailedRetry'));

  const count = own.length + shared.length;
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      refreshing={p.refreshing}
      onRefresh={p.onRefresh}
      hero={<HeroTitle title={t('nav.signedDocuments')} subtitle={p.templates ? (count ? t('signing.canSendToDrivers', { v1: count === 1 ? t('documents.oneDocument') : t('documents.countN', { count }) }) : t('signing.formsDriversSign')) : ' '} onBack={p.onBack} />}
      overlay={
        <KitSheet
          visible={open}
          onClose={close}
          dismissable={busy !== 'delete' && !send.sending}
          icon={mode === 'confirm' ? 'trash' : mode === 'send' ? 'paper-plane' : mode === 'meet' ? 'people' : checklist ? 'list' : 'document-text'}
          tone={mode === 'confirm' ? 'danger' : 'accent'}
          title={mode === 'confirm' ? t('documents.deleteQuestion') : mode === 'send' ? t('signing.sendToDrivers') : mode === 'meet' ? t('meeting.withWhom') : template?.title ?? ''}
          subtitle={
            mode === 'confirm'
              ? deleteTemplateMessage(waiting, checklist)
              : mode === 'meet'
                ? templatePlan.size ? t('signing.closestFirst') : t('meeting.clickDriverName')
              : mode === 'send'
                ? t('signing.driversGetInApp', { v1: template?.title ?? '' })
                : template
                  ? checklist
                    ? t('signing.fillInMeeting', { template: checklistSubtitle(template) })
                    : isOwn ? t('signing.createdOnV1', { v1: formatDate(template.created_at) }) : t('signing.builtInSendAsIs')
                  : undefined
          }
          footer={
            mode === 'send' ? (
              <SendFooter s={send} onCancel={() => setMode('actions')} onDone={() => setOpen(false)} />
            ) : mode === 'meet' ? (
              <PrimaryAction label={t('common.goBack')} tone="ghost" onPress={() => setMode('actions')} />
            ) : mode === 'confirm' ? (
              <SheetActions>
                <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={() => setMode('actions')} disabled={busy === 'delete'} style={styles.flex} />
                <PrimaryAction label={t('common.deleteAction')} icon="trash" tone="destructive" onPress={() => void doDelete()} loading={busy === 'delete'} style={styles.flex} />
              </SheetActions>
            ) : checklist ? (
              <PrimaryAction label={t('meeting.newWithDriver')} icon="add-circle-outline" onPress={() => setMode('meet')} disabled={!!busy} />
            ) : (
              <PrimaryAction label={t('signing.sendToDrivers')} icon="paper-plane" onPress={() => setMode('send')} disabled={!!busy} />
            )
          }
        >
          {!!message && <Banner tone="expired">{message}</Banner>}
          {mode === 'send' ? (
            <SendBody s={send} />
          ) : mode === 'meet' ? (
            <View style={styles.actions}>
              {!send.drivers ? (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>{t('driver.loadingDrivers')}</DKText>
              ) : !send.drivers.length ? (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>{t('driver.noActiveDriversDot')}</DKText>
              ) : (
                meetDrivers.map((d, index) => (
                  <Pressy
                    key={d.id}
                    onPress={() => {
                      setOpen(false);
                      p.onStartMeeting(template!.id, d.id);
                    }}
                    accessibilityLabel={t('meeting.withName', { name: d.name })}
                    pressScale={0.985}
                  >
                    <View style={[styles.driver, index > 0 && styles.divider]}>
                      <Ionicons name="person-circle-outline" size={28} color={DK.accent} />
                      <View style={styles.flex}>
                        <DKText variant="label" numberOfLines={1}>{d.name}</DKText>
                        {d.state === 'pending' && <DKText variant="caption" color={DK.muted}>{t('common.awaitingDriverSignature')}</DKText>}
                      </View>
                      {templatePlan.get(d.id) && <DuePill nextDue={templatePlan.get(d.id)!.nextDue} firstMeeting={templatePlan.get(d.id)!.firstMeeting} />}
                      <Ionicons name={dirIcon('chevron-back')} size={18} color={DK.faint} />
                    </View>
                  </Pressy>
                ))
              )}
            </View>
          ) : mode === 'actions' ? (
            <View style={styles.actions}>
              <ActionRow icon="eye-outline" label={busy === 'view' ? t('common.opening') : checklist ? t('signing.viewForm') : t('signing.viewDocument')} hint={checklist ? t('signing.blankAsPrinted') : t('signing.asDriverSees')} onPress={() => void view()} disabled={!!busy} />
              <ActionRow icon="download-outline" label={busy === 'download' ? t('common.downloading') : t('common.download')} hint={t('signing.saveOrShare')} onPress={() => void download()} disabled={!!busy} first={false} />
              {isOwn && folderOfTemplate ? (
                <ActionRow
                  icon="folder-open-outline"
                  tone="danger"
                  label={t('folders.removeFolder')}
                  onPress={() => {
                    setOpen(false);
                    removeFolder.start(folderOfTemplate.id, folderOfTemplate.title);
                  }}
                  disabled={!!busy}
                  first={false}
                />
              ) : isOwn ? (
                <ActionRow icon="trash-outline" tone="danger" label={busy === 'check' ? t('common.checking') : t('documents.deleteDocument')} onPress={() => void askDelete()} disabled={!!busy} first={false} />
              ) : null}
            </View>
          ) : null}
        </KitSheet>
      }
    >
      {p.loading ? (
        <LoadingPanel />
      ) : p.error && !p.templates ? (
        <ErrorPanel message={p.error} onRetry={p.companyId ? p.onRetry : undefined} />
      ) : (
        <>
          <Reveal index={0}>
            <Banner tone="info" icon="desktop-outline">
              {t('signing.createOnComputer')}
            </Banner>
          </Reveal>
          {dueRows.length > 0 && (
            <Reveal index={1}>
              <KitSection
                title={t('meeting.dueList')}
                trailing={<DKText variant="caption" color={DK.muted}>{dueRows.length === 1 ? t('common.oneDriver') : t('common.driversLength', { length: dueRows.length })}</DKText>}
              >
                {(dueExpanded ? dueRows : dueRows.slice(0, DUE_COLLAPSED)).map((row, index) => (
                  <ListRow
                    key={`${row.templateId}:${row.driverId}`}
                    first={index === 0}
                    icon="people"
                    title={row.driverName}
                    subtitle={row.firstMeeting ? t('signing.firstMeetingTitle', { title: row.title }) : row.title}
                    trailing={<DuePill nextDue={row.nextDue} />}
                    onPress={() => p.onStartMeeting(row.templateId, row.driverId)}
                  />
                ))}
                {dueRows.length > DUE_COLLAPSED && (
                  <Pressy onPress={() => setDueExpanded((v) => !v)} accessibilityLabel={dueExpanded ? t('common.showLess') : t('signing.showAllDrivers')} pressScale={0.985}>
                    <View style={[styles.more, styles.divider]}>
                      <DKText variant="label" color={DK.accent}>{dueExpanded ? t('common.showLess') : t('meeting.showAllDrivers', { length: dueRows.length })}</DKText>
                      <Ionicons name={dueExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={DK.accent} />
                    </View>
                  </Pressy>
                )}
              </KitSection>
            </Reveal>
          )}
          <Reveal index={2}>
            <KitSection
              title={t('folders.sectionTitle')}
              trailing={
                <Pressy onPress={() => setAddingFolder(true)} accessibilityLabel={t('folders.addButton')} pressScale={0.95}>
                  <View style={styles.addFolder}>
                    <Ionicons name="add" size={16} color={DK.accent} />
                    <DKText variant="label" color={DK.accent}>{t('folders.addShort')}</DKText>
                  </View>
                </Pressy>
              }
            >
              {!!removeFolder.error && <Banner tone="expired">{removeFolder.error}</Banner>}
              {addedFolders.length ? (
                addedFolders.map((folder, index) => {
                  const form = folder.form ? (p.templates ?? []).find((entry) => entry.id === folder.form!.id) : null;
                  return form ? (
                    <ListRow
                      key={folder.id}
                      first={index === 0}
                      leading={<TemplateThumb template={form} />}
                      title={folder.title}
                      subtitle={t('folders.versionN', { version: form.version ?? 1 })}
                      onPress={() => openSheet(form)}
                    />
                  ) : (
                    <ListRow
                      key={folder.id}
                      first={index === 0}
                      icon="folder-open-outline"
                      tint={DK.accent}
                      title={folder.title}
                      subtitle={t('folders.noFormYet')}
                      onPress={() => setEmptyFolder(folder)}
                    />
                  );
                })
              ) : (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>{t('folders.noneAddedHint')}</DKText>
              )}
            </KitSection>
          </Reveal>
          <Reveal index={2}>
            <KitSection title={t('signing.companyDocuments')} trailing={own.length ? <DKText variant="micro" color={DK.muted}>{own.length === 1 ? t('documents.oneDocument') : t('documents.count', { length: own.length })}</DKText> : undefined}>
              {own.length ? (
                own.map((entry, index) => (
                  <ListRow key={entry.id} first={index === 0} leading={<TemplateThumb template={entry} />} title={entry.title} subtitle={isChecklistTemplate(entry) ? checklistSubtitle(entry) : t('signing.createdOnV1', { v1: formatDate(entry.created_at) })} onPress={() => openSheet(entry)} />
                ))
              ) : (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>
                  {t('signing.noCompanyDocsMobile')}
                </DKText>
              )}
            </KitSection>
          </Reveal>
          {shared.length > 0 && (
            <Reveal index={3}>
              <KitSection title={t('signing.builtInDocuments')} trailing={<DKText variant="micro" color={DK.muted}>{t('signing.canSendAsIsShort')}</DKText>}>
                {shared.map((entry, index) => (
                  <ListRow key={entry.id} first={index === 0} leading={<TemplateThumb template={entry} />} title={entry.title} subtitle={t('signing.builtIn')} onPress={() => openSheet(entry)} />
                ))}
              </KitSection>
            </Reveal>
          )}
        </>
      )}
      {addingFolder && (
        <AddCatalogFolderSheet
          companyId={p.companyId}
          onClosed={() => setAddingFolder(false)}
          onAdded={(folder, templateId) => {
            p.onFoldersChanged();
            if (!templateId) setEmptyFolder({ ...folder, added: true });
          }}
        />
      )}
      {emptyFolder && (
        <EmptyCatalogFolderSheet companyId={p.companyId} folder={emptyFolder} onClosed={() => setEmptyFolder(null)} onChanged={p.onFoldersChanged} />
      )}
      {removeFolder.dialog}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { borderRadius: 18, backgroundColor: DK.surfaceSunk, overflow: 'hidden' },
  empty: { textAlign: 'center', padding: 20 },
  driver: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8 },
  more: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  addFolder: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, minHeight: 32, paddingHorizontal: 6 },
});
