import React, { useState } from 'react';
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
  Reveal,
  SheetActions,
} from '../../../components/driverKit';
import { downloadSigningTemplate, type SigningTemplate } from '../../../lib/docuseal';
import { countWaitingSigners, deleteCompanyTemplate, deleteTemplateMessage } from '../../../lib/signingSend';
import { formatDate } from '../../../lib/theme';
import type { RootStackParamList } from '../../../navigation/types';
import { SendBody, SendFooter, useSendToDrivers } from './SendToDriversMobile';
import { TemplateThumb } from './TemplateThumb';

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
};

type Mode = 'actions' | 'confirm' | 'send';
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
  const send = useSendToDrivers(p.companyId, mode === 'send' ? template : null);

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
      const target = await p.viewTarget(template!);
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
          icon={mode === 'confirm' ? 'trash' : mode === 'send' ? 'paper-plane' : 'document-text'}
          tone={mode === 'confirm' ? 'danger' : 'accent'}
          title={mode === 'confirm' ? 'למחוק את המסמך?' : mode === 'send' ? 'שליחה לנהגים' : template?.title ?? ''}
          subtitle={
            mode === 'confirm'
              ? deleteTemplateMessage(waiting)
              : mode === 'send'
                ? `${template?.title ?? ''} · הנהגים יקבלו את המסמך באפליקציה ויחתמו בה`
                : template
                  ? isOwn ? `נוצר ב-${formatDate(template.created_at)}` : 'מוכן מהמערכת · אפשר לשלוח אותו כמו שהוא'
                  : undefined
          }
          footer={
            mode === 'send' ? (
              <SendFooter s={send} onCancel={() => setMode('actions')} onDone={() => setOpen(false)} />
            ) : mode === 'confirm' ? (
              <SheetActions>
                <PrimaryAction label="ביטול" tone="ghost" onPress={() => setMode('actions')} disabled={busy === 'delete'} style={styles.flex} />
                <PrimaryAction label="מחיקה" icon="trash" tone="destructive" onPress={() => void doDelete()} loading={busy === 'delete'} style={styles.flex} />
              </SheetActions>
            ) : (
              <PrimaryAction label="שליחה לנהגים" icon="paper-plane" onPress={() => setMode('send')} disabled={!!busy} />
            )
          }
        >
          {!!message && <Banner tone="expired">{message}</Banner>}
          {mode === 'send' ? (
            <SendBody s={send} />
          ) : mode === 'actions' ? (
            <View style={styles.actions}>
              <ActionRow icon="eye-outline" label={busy === 'view' ? 'פותח…' : 'צפייה במסמך'} hint="כך הנהג יראה אותו, עם מקומות החתימה" onPress={() => void view()} disabled={!!busy} />
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
          <Reveal index={1}>
            <KitSection title="המסמכים של החברה" trailing={own.length ? <DKText variant="micro" color={DK.muted}>{own.length === 1 ? 'מסמך אחד' : `${own.length} מסמכים`}</DKText> : undefined}>
              {own.length ? (
                own.map((t, index) => (
                  <ListRow key={t.id} first={index === 0} leading={<TemplateThumb template={t} />} title={t.title} subtitle={`נוצר ב-${formatDate(t.created_at)}`} onPress={() => openSheet(t)} />
                ))
              ) : (
                <DKText variant="caption" color={DK.muted} style={styles.empty}>
                  עדיין אין מסמכים של החברה. יוצרים אותם מהמחשב, והם יופיעו כאן.
                </DKText>
              )}
            </KitSection>
          </Reveal>
          {shared.length > 0 && (
            <Reveal index={2}>
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
});
