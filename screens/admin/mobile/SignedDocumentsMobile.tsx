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
};

const DUE_COLLAPSED = 4;

function checklistSubtitle(t: SigningTemplate): string {
  const months = readForm(t.form_content)?.repeatMonths ?? 0;
  return months ? `רשימת סעיפים · מפגש ${repeatLabel(months)}` : `רשימת סעיפים · נוצר ב-${formatDate(t.created_at)}`;
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

  const own = (p.templates ?? []).filter((t) => t.company_id === p.companyId);
  const shared = (p.templates ?? []).filter((t) => t.company_id === null);
  const isOwn = !!template && template.company_id === p.companyId;

  const openSheet = (t: SigningTemplate) => {
    setTemplate(t);
    setMode('actions');
    setMessage('');
    setBusy('');
    setOpen(true);
  };
  const { openMeeting, onMeetingOpened, templates } = p;
  useEffect(() => {
    if (!openMeeting || !templates) return;
    const target = templates.find((t) => t.id === openMeeting);
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
    }, 'פתיחת המסמך נכשלה. נסו שוב.');
  const download = () => run('download', () => downloadSigningTemplate(template!), 'הורדת המסמך נכשלה. נסו שוב.');
  const askDelete = () =>
    run('check', async () => {
      setWaiting(await countWaitingSigners(p.companyId, template!.id));
      setMode('confirm');
    }, 'לא ניתן למחוק כרגע. נסו שוב.');
  const doDelete = () =>
    run('delete', async () => {
      await deleteCompanyTemplate(p.companyId, template!.id);
      setOpen(false);
      p.onDeleted(template!);
    }, 'מחיקת המסמך נכשלה. נסו שוב.');

  const count = own.length + shared.length;
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      refreshing={p.refreshing}
      onRefresh={p.onRefresh}
      hero={<HeroTitle title="מסמכים חתומים" subtitle={p.templates ? (count ? `${count === 1 ? 'מסמך אחד' : `${count} מסמכים`} שאפשר לשלוח לנהגים` : 'טפסים שהנהגים חותמים עליהם') : ' '} onBack={p.onBack} />}
      overlay={
        <KitSheet
          visible={open}
          onClose={close}
          dismissable={busy !== 'delete' && !send.sending}
          icon={mode === 'confirm' ? 'trash' : mode === 'send' ? 'paper-plane' : mode === 'meet' ? 'people' : checklist ? 'list' : 'document-text'}
          tone={mode === 'confirm' ? 'danger' : 'accent'}
          title={mode === 'confirm' ? 'למחוק את המסמך?' : mode === 'send' ? 'שליחה לנהגים' : mode === 'meet' ? 'עם מי המפגש?' : template?.title ?? ''}
          subtitle={
            mode === 'confirm'
              ? deleteTemplateMessage(waiting)
              : mode === 'meet'
                ? templatePlan.size ? 'מי שהמפגש שלו קרוב מופיע ראשון. לוחצים על השם, והטופס נפתח.' : 'לוחצים על שם הנהג, והטופס נפתח למילוי.'
              : mode === 'send'
                ? `${template?.title ?? ''} · הנהגים יקבלו את המסמך באפליקציה ויחתמו בה`
                : template
                  ? checklist
                    ? `${checklistSubtitle(template)} · ממלאים אותה במפגש עם הנהג`
                    : isOwn ? `נוצר ב-${formatDate(template.created_at)}` : 'מוכן מהמערכת · אפשר לשלוח אותו כמו שהוא'
                  : undefined
          }
          footer={
            mode === 'send' ? (
              <SendFooter s={send} onCancel={() => setMode('actions')} onDone={() => setOpen(false)} />
            ) : mode === 'meet' ? (
              <PrimaryAction label="חזרה" tone="ghost" onPress={() => setMode('actions')} />
            ) : mode === 'confirm' ? (
              <SheetActions>
                <PrimaryAction label="ביטול" tone="ghost" onPress={() => setMode('actions')} disabled={busy === 'delete'} style={styles.flex} />
                <PrimaryAction label="מחיקה" icon="trash" tone="destructive" onPress={() => void doDelete()} loading={busy === 'delete'} style={styles.flex} />
              </SheetActions>
            ) : checklist ? (
              <PrimaryAction label="מפגש חדש עם נהג" icon="add-circle-outline" onPress={() => setMode('meet')} disabled={!!busy} />
            ) : (
              <PrimaryAction label="שליחה לנהגים" icon="paper-plane" onPress={() => setMode('send')} disabled={!!busy} />
            )
          }
        >
          {!!message && <Banner tone="expired">{message}</Banner>}
          {mode === 'send' ? (
            <SendBody s={send} />
          ) : mode === 'meet' ? (
            <View style={styles.actions}>
              {!send.drivers ? (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>טוען נהגים…</DKText>
              ) : !send.drivers.length ? (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>אין עדיין נהגים פעילים בחברה.</DKText>
              ) : (
                meetDrivers.map((d, index) => (
                  <Pressy
                    key={d.id}
                    onPress={() => {
                      setOpen(false);
                      p.onStartMeeting(template!.id, d.id);
                    }}
                    accessibilityLabel={`מפגש עם ${d.name}`}
                    pressScale={0.985}
                  >
                    <View style={[styles.driver, index > 0 && styles.divider]}>
                      <Ionicons name="person-circle-outline" size={28} color={DK.accent} />
                      <View style={styles.flex}>
                        <DKText variant="label" numberOfLines={1}>{d.name}</DKText>
                        {d.state === 'pending' && <DKText variant="caption" color={DK.muted}>ממתין לחתימת הנהג</DKText>}
                      </View>
                      {templatePlan.get(d.id) && <DuePill nextDue={templatePlan.get(d.id)!.nextDue} firstMeeting={templatePlan.get(d.id)!.firstMeeting} />}
                      <Ionicons name="chevron-back" size={18} color={DK.faint} />
                    </View>
                  </Pressy>
                ))
              )}
            </View>
          ) : mode === 'actions' ? (
            <View style={styles.actions}>
              <ActionRow icon="eye-outline" label={busy === 'view' ? 'פותח…' : checklist ? 'צפייה בטופס' : 'צפייה במסמך'} hint={checklist ? 'הטופס הריק, כמו שיודפס' : 'כך הנהג יראה אותו, עם מקומות החתימה'} onPress={() => void view()} disabled={!!busy} />
              <ActionRow icon="download-outline" label={busy === 'download' ? 'מוריד…' : 'הורדה'} hint="שמירה בקבצים או שיתוף" onPress={() => void download()} disabled={!!busy} first={false} />
              {isOwn && (
                <ActionRow icon="trash-outline" tone="danger" label={busy === 'check' ? 'בודק…' : 'מחיקת המסמך'} onPress={() => void askDelete()} disabled={!!busy} first={false} />
              )}
            </View>
          ) : null}
        </KitSheet>
      }
    >
      {p.loading ? (
        <LoadingPanel />
      ) : p.error && !p.templates ? (
        <ErrorPanel message={p.error} hint={p.companyId ? 'בדקו את החיבור לאינטרנט ונסו שוב.' : undefined} onRetry={p.companyId ? p.onRetry : undefined} />
      ) : (
        <>
          <Reveal index={0}>
            <Banner tone="info" icon="desktop-outline">
              מסמך חדש יוצרים מהמחשב, ב־icar-app.com. מכאן אפשר לצפות, להוריד, לשלוח ולמחוק.
            </Banner>
          </Reveal>
          {dueRows.length > 0 && (
            <Reveal index={1}>
              <KitSection
                title="מפגשים שצריך לקיים"
                trailing={<DKText variant="caption" color={DK.muted}>{dueRows.length === 1 ? 'נהג אחד' : `${dueRows.length} נהגים`}</DKText>}
              >
                {(dueExpanded ? dueRows : dueRows.slice(0, DUE_COLLAPSED)).map((row, index) => (
                  <ListRow
                    key={`${row.templateId}:${row.driverId}`}
                    first={index === 0}
                    icon="people"
                    title={row.driverName}
                    subtitle={row.firstMeeting ? `${row.title} · מפגש ראשון` : row.title}
                    trailing={<DuePill nextDue={row.nextDue} />}
                    onPress={() => p.onStartMeeting(row.templateId, row.driverId)}
                  />
                ))}
                {dueRows.length > DUE_COLLAPSED && (
                  <Pressy onPress={() => setDueExpanded((v) => !v)} accessibilityLabel={dueExpanded ? 'הצגת פחות' : 'הצגת כל הנהגים'} pressScale={0.985}>
                    <View style={[styles.more, styles.divider]}>
                      <DKText variant="label" color={DK.accent}>{dueExpanded ? 'הצגת פחות' : `הצגת כל ${dueRows.length} הנהגים`}</DKText>
                      <Ionicons name={dueExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={DK.accent} />
                    </View>
                  </Pressy>
                )}
              </KitSection>
            </Reveal>
          )}
          <Reveal index={2}>
            <KitSection title="המסמכים של החברה" trailing={own.length ? <DKText variant="micro" color={DK.muted}>{own.length === 1 ? 'מסמך אחד' : `${own.length} מסמכים`}</DKText> : undefined}>
              {own.length ? (
                own.map((t, index) => (
                  <ListRow key={t.id} first={index === 0} leading={<TemplateThumb template={t} />} title={t.title} subtitle={isChecklistTemplate(t) ? checklistSubtitle(t) : `נוצר ב-${formatDate(t.created_at)}`} onPress={() => openSheet(t)} />
                ))
              ) : (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>
                  עדיין אין מסמכים של החברה. יוצרים אותם מהמחשב, והם יופיעו כאן.
                </DKText>
              )}
            </KitSection>
          </Reveal>
          {shared.length > 0 && (
            <Reveal index={3}>
              <KitSection title="מסמכים מוכנים מהמערכת" trailing={<DKText variant="micro" color={DK.muted}>אפשר לשלוח כמו שהם</DKText>}>
                {shared.map((t, index) => (
                  <ListRow key={t.id} first={index === 0} leading={<TemplateThumb template={t} />} title={t.title} subtitle="מוכן מהמערכת" onPress={() => openSheet(t)} />
                ))}
              </KitSection>
            </Reveal>
          )}
        </>
      )}
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
});
