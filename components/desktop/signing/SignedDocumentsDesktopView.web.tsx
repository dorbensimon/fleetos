import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getSigningTemplateSourceUrl, listSigningTemplates, type SigningTemplate } from '../../../lib/docuseal';
import { errorMessage, requestErrorDetails, type RequestErrorDetails } from '../../../lib/requestError';
import { countWaitingSigners, deleteCompanyTemplate, deleteTemplateMessage } from '../../../lib/signingSend';
import { formatDate } from '../../../lib/theme';
import { SIGNING_CSS } from './signingCss';
import { CreateDocumentSheet, type FormFolder } from './CreateDocumentSheet.web';
import { AddCatalogFolderSheet, AfterReplaceSheet, EmptyCatalogFolderSheet, FormVersionsSheet, useRemoveCatalogFolder } from './FolderCatalogSheets.web';
import { listCompanyFolders, type CompanyFolder } from '../../../lib/folderCatalog';
import { ConfirmAlert, Sheet, useSheetClose } from './Sheet.web';
import { SendToDriversSheet } from './SendToDriversSheet.web';
import { PdfPageView } from './FieldPlacer.web';
import { loadPdf, renderPage, type LoadedPdf } from './pdf.web';
import { StartMeetingSheet } from './StartMeetingSheet.web';
import { isChecklistTemplate, readForm, repeatLabel } from '../../../lib/checklistForms';
import { isDueSoon, loadMeetingPlan, planByDriver, setFormRepeat, type PlanRow } from '../../../lib/meetingPlan';
import { MeetingsDue } from './MeetingsDue.web';
import { RepeatChoice } from './ChecklistBuilder.web';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../lib/i18n';

/**
 * Desktop "מסמכים חתומים": the company's own signing documents, the shared
 * ones the system provides, and the "new document" flow.
 */

const pdfCache = new Map<string, Promise<LoadedPdf>>();
function templatePdf(template: SigningTemplate): Promise<LoadedPdf> {
  let cached = pdfCache.get(template.id);
  if (!cached) {
    cached = getSigningTemplateSourceUrl(template).then((url) => {
      if (!url) throw new Error('no source');
      return loadPdf(url);
    });
    cached.catch(() => pdfCache.delete(template.id));
    pdfCache.set(template.id, cached);
  }
  return cached;
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function TemplateCard({ template, index, fresh, onOpen }: { template: SigningTemplate; index: number; fresh?: boolean; onOpen: () => void }) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'idle' | 'ready' | 'none'>('idle');

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !template.source_file_path) {
      setState('none');
      return;
    }
    let cancelled = false;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      templatePdf(template)
        .then((pdf) => (canvasRef.current && !cancelled ? renderPage(pdf.doc, 1, canvasRef.current, 200) : undefined))
        .then(() => !cancelled && setState('ready'))
        .catch(() => !cancelled && setState('none'));
    }, { rootMargin: '200px' });
    io.observe(card);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [template]);

  // A gentle tilt toward the pointer, like a card held in the hand.
  const onMove = (event: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion()) return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(-4px)`;
  };
  const onLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = '';
  };

  const isGlobal = template.company_id === null;
  return (
    <button
      ref={cardRef}
      type="button"
      className="sd-card"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms`, ...(fresh ? { boxShadow: '0 0 0 3px rgba(48,177,88,0.55), var(--sd-depth-3)' } : null) }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onOpen}
      aria-label={t('common.openTitle', { title: template.title })}
    >
      <div className="sd-thumb">
        <canvas ref={canvasRef} style={{ opacity: state === 'ready' ? 1 : 0, transition: 'opacity 300ms ease' }} />
        {state !== 'ready' ? (
          <div className="sd-thumb-placeholder">
            <Ionicons name="document-text" size={44} color="currentColor" />
          </div>
        ) : null}
        <div className="sd-thumb-shine" />
      </div>
      <h4 className="sd-b">{template.title}</h4>
      <div className="sd-card-meta">
        {isChecklistTemplate(template) && !fresh ? (
          <span className="sd-badge sd-sb" style={{ color: '#12805C' }}>
            <Ionicons name="list" size={14} color="#12805C" />
            {readForm(template.form_content)?.repeatMonths ? repeatLabel(readForm(template.form_content)!.repeatMonths) : t('checklist.checklist')}
          </span>
        ) : isGlobal ? (
          <span className="sd-badge sd-sb">
            <Ionicons name="checkmark-circle" size={14} color="#1E8E45" />
            {t('signing.builtIn')}
          </span>
        ) : fresh ? (
          <span className="sd-badge sd-sb">
            <Ionicons name="sparkles" size={14} color="#1E8E45" />
            {t('common.new')}
          </span>
        ) : (
          <span className="sd-num">{t('common.createdOnPrefix')}{formatDate(template.created_at)}</span>
        )}
      </div>
    </button>
  );
}

function PreviewSheet({
  template,
  companyId,
  folder,
  onClosed,
  onSend,
  onDeleted,
  onChanged,
  onReplace,
  onVersions,
  onRemoveFolder,
}: {
  template: SigningTemplate;
  companyId: string;
  /** The catalog folder this form belongs to: it is replaced or removed with its folder, never deleted. */
  folder?: CompanyFolder | null;
  onClosed: () => void;
  onSend: () => void;
  onDeleted: () => void;
  onChanged: (template: SigningTemplate) => void;
  onReplace?: () => void;
  onVersions?: () => void;
  onRemoveFolder?: () => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const checklistForm = isChecklistTemplate(template) ? readForm(template.form_content) : null;
  const [repeat, setRepeat] = useState(checklistForm?.repeatMonths ?? 0);
  const [repeatSaving, setRepeatSaving] = useState(false);
  const [repeatError, setRepeatError] = useState('');
  const changeRepeat = async (months: number) => {
    if (months === repeat || repeatSaving) return;
    const before = repeat;
    setRepeat(months);
    setRepeatSaving(true);
    setRepeatError('');
    try {
      await setFormRepeat(companyId, template.id, months);
      onChanged({ ...template, form_content: { ...(template.form_content as object), repeatMonths: months } });
    } catch (error) {
      setRepeat(before);
      setRepeatError(errorMessage(error, t('meeting.saveFrequencyFailedRetry')));
    } finally {
      setRepeatSaving(false);
    }
  };
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [failed, setFailed] = useState(false);
  // Deleting: 'ask' shows the confirmation (with how many drivers are still waiting to sign).
  const [confirm, setConfirm] = useState<{ waiting: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const own = template.company_id === companyId;

  const askDelete = async () => {
    setDeleteError('');
    setConfirm({ waiting: await countWaitingSigners(companyId, template.id) });
  };
  const doDelete = async () => {
    setConfirm(null);
    setDeleting(true);
    try {
      await deleteCompanyTemplate(companyId, template.id);
      pdfCache.delete(template.id);
      onDeleted();
      close();
    } catch (error) {
      setDeleteError(errorMessage(error, t('documents.deleteFailedRetry')));
      setDeleting(false);
    }
  };

  useEffect(() => {
    templatePdf(template).then(setPdf).catch(() => setFailed(true));
  }, [template]);

  return (
    <Sheet
      closing={closing}
      onRequestClose={close}
      label={template.title}
      head={
        <>
          <div />
          <div className="sd-sheet-title">
            <strong className="sd-b">{template.title}</strong>
            <div className="sd-progress-label">
              {folder ? `${t('folders.versionN', { version: template.version ?? 1 })} · ` : ''}
              {pdf ? `${pdf.pages.length} ${pdf.pages.length === 1 ? t('common.page') : t('common.pages')}` : ' '}
            </div>
          </div>
          <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close}>
            {t('common.close')}
          </button>
        </>
      }
      foot={
        <>
          {own && folder ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="sd-btn sd-btn-tinted sd-btn-lg" onClick={() => { onReplace?.(); close(); }}>
                <Ionicons name="swap-horizontal" size={19} color="currentColor" />
                {t('folders.replaceForm')}
              </button>
              <button type="button" className="sd-btn sd-btn-plain sd-btn-lg" onClick={() => { onVersions?.(); close(); }}>
                <Ionicons name="time" size={19} color="currentColor" />
                {t('folders.versionsTitle')}
              </button>
              <button type="button" className="sd-btn sd-btn-plain sd-danger sd-btn-lg" onClick={() => { onRemoveFolder?.(); close(); }}>
                <Ionicons name="folder-open" size={19} color="#FF453A" />
                {t('folders.removeFolder')}
              </button>
            </div>
          ) : own ? (
            <button type="button" className="sd-btn sd-btn-plain sd-danger sd-btn-lg" onClick={() => void askDelete()} disabled={deleting}>
              <Ionicons name="trash" size={19} color="#FF453A" />
              {deleting ? t('common.deleting') : t('documents.deleteDocument')}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={onSend} disabled={deleting} style={{ minWidth: 200 }}>
            <Ionicons name={isChecklistTemplate(template) ? 'add-circle' : 'paper-plane'} size={20} color="#fff" />
            {isChecklistTemplate(template) ? t('meeting.newWithDriver') : t('signing.sendToDrivers')}
          </button>
        </>
      }
    >
      {deleteError ? (
        <div className="sd-inline-error" role="alert">
          <Ionicons name="alert-circle" size={20} color="currentColor" />
          {deleteError}
        </div>
      ) : null}
      {confirm ? (
        <ConfirmAlert
          title={t('documents.deleteQuestion')}
          message={deleteTemplateMessage(confirm.waiting, isChecklistTemplate(template))}
          confirmLabel={t('common.deleteAction')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {failed ? (
        <div className="sd-busy">
          <Ionicons name="alert-circle" size={48} color="#FF3B30" />
          <h3 className="sd-b">{t('documents.couldNotDisplay')}</h3>
          <p>{t('common.closeAndReopen')}</p>
        </div>
      ) : !pdf ? (
        <div className="sd-busy" role="status">
          <div className="sd-spinner" />
        </div>
      ) : (
        <div className="sd-preview-pages" style={{ maxWidth: 880, margin: '0 auto' }}>
          {checklistForm && own ? (
            <div className="sd-repeat-bar">
              <h3 className="sd-b" id="sd-repeat-label">{t('meeting.howOften')}</h3>
              <RepeatChoice value={repeat} onChange={(months) => void changeRepeat(months)} labelledBy="sd-repeat-label" disabled={repeatSaving} />
              <p role={repeatError ? 'alert' : undefined} style={repeatError ? { color: '#C4281C' } : undefined}>
                {repeatError || (repeatSaving ? t('common.savingEllipsis') : repeat ? t('meeting.remindWeekBefore') : t('meeting.noRemindersFillWhenNeeded'))}
              </p>
            </div>
          ) : null}
          {pdf.pages.map((_, i) => (
            <PdfPageView key={i} pdf={pdf} pageNumber={i + 1} fields={[]} readOnly />
          ))}
        </div>
      )}
    </Sheet>
  );
}

function HeroArt() {
  return (
    <div className="sd-art" aria-hidden="true">
      <div className="sd-paper sd-paper-back-2" />
      <div className="sd-paper sd-paper-back-1" />
      <div className="sd-paper sd-paper-front">
        <i className="sd-t" />
        <i />
        <i />
        <i className="sd-s" />
        <i />
        <i className="sd-s" />
        <div className="sd-paper-sign">
          <svg viewBox="0 0 150 40" preserveAspectRatio="none">
            <path d="M6 28 C 14 8, 22 6, 24 22 S 34 36, 40 18 S 52 6, 56 24 C 58 32, 64 30, 70 20 C 76 12, 82 14, 84 24 C 86 30, 96 30, 104 18 C 110 10, 118 12, 122 20 L 144 16" />
          </svg>
        </div>
        <div className="sd-paper-check">
          <Ionicons name="checkmark" size={24} color="#fff" />
        </div>
      </div>
    </div>
  );
}

export function SignedDocumentsDesktopView({
  companyId,
  openMeetingTemplateId,
  onMeetingOpened,
}: {
  companyId: string;
  /** Opens "מפגש חדש" on this form, e.g. from a "meetings due" notification. */
  openMeetingTemplateId?: string;
  onMeetingOpened?: () => void;
}) {
  const [templates, setTemplates] = useState<SigningTemplate[] | null>(null);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [error, setError] = useState<RequestErrorDetails | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<SigningTemplate | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [sendingTemplate, setSendingTemplate] = useState<SigningTemplate | null>(null);
  // Folders for every driver's file (lib/folderCatalog.ts).
  const [catalog, setCatalog] = useState<CompanyFolder[]>([]);
  const [addingFolder, setAddingFolder] = useState(false);
  const [emptyFolder, setEmptyFolder] = useState<CompanyFolder | null>(null);
  const [creatingFor, setCreatingFor] = useState<FormFolder | null>(null);
  const [replacing, setReplacing] = useState<SigningTemplate | null>(null);
  const [afterReplace, setAfterReplace] = useState<{ template: SigningTemplate; pendingOld: number } | null>(null);
  const [versionsOf, setVersionsOf] = useState<SigningTemplate | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const load = useCallback(async () => {
    try {
      setError(null);
      const [rows, folders] = await Promise.all([
        listSigningTemplates(companyId),
        // The folders are extra: the page still works when they fail to load.
        listCompanyFolders(companyId).then((result) => result.folders).catch(() => [] as CompanyFolder[]),
      ]);
      setTemplates(rows);
      setCatalog(folders);
    } catch (error) {
      setError(requestErrorDetails(error, t('documents.loadFailed')));
    }
  }, [companyId]);
  const removeFolder = useRemoveCatalogFolder(companyId, () => void load());

  useEffect(() => {
    void load();
  }, [load]);

  // Who needs a meeting: fresh every time the page is shown (after a meeting, too).
  const loadPlan = useCallback(() => {
    loadMeetingPlan(companyId).then(setPlan).catch(() => setPlan([]));
  }, [companyId]);
  useFocusEffect(loadPlan);

  useEffect(() => {
    if (!openMeetingTemplateId || !templates) return;
    const target = templates.find((entry) => entry.id === openMeetingTemplateId);
    if (target) setSendingTemplate(target);
    onMeetingOpened?.();
  }, [openMeetingTemplateId, templates, onMeetingOpened]);

  const dueRows = plan.filter((row) => isDueSoon(row));
  const own = (templates ?? []).filter((entry) => entry.company_id === companyId && !entry.catalog_folder_id);
  const addedFolders = catalog.filter((folder) => folder.added);
  const folderOf = (template: SigningTemplate) => catalog.find((folder) => folder.id === template.catalog_folder_id) ?? null;
  const formFolder = (folder: CompanyFolder): FormFolder => ({ catalogId: folder.id, title: folder.title, kind: folder.kind, defaultRepeatMonths: folder.default_repeat_months });
  const shared = (templates ?? []).filter((entry) => entry.company_id === null);

  return (
    <div className="sd-root sd-scroll">
      <style>{SIGNING_CSS}</style>
      <div className="sd-page">
        <section className="sd-hero">
          <div className="sd-aurora">
            <span />
            <span />
            <span />
          </div>
          <div className="sd-hero-grain" />
          <div>
            <h1 className="sd-xb">{t('nav.signedDocuments')}</h1>
            <p>{t('signing.intro')}</p>
            <div className="sd-hero-actions">
              <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => setCreating(true)}>
                <Ionicons name="add" size={22} color="#fff" />
                {t('signing.newDocument')}
              </button>
            </div>
          </div>
          <HeroArt />
        </section>

        <div className="sd-steps">
          {[
            { title: t('signing.step.writeOrUpload'), text: t('signing.step.writeOrUploadText') },
            { title: t('signing.step.markSign'), text: t('signing.step.markSignText') },
            { title: t('signing.step.send'), text: t('signing.step.sendText') },
          ].map((s, i) => (
            <div className="sd-step" key={s.title} style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="sd-step-num sd-b">{i + 1}</span>
              <div>
                <h3 className="sd-b">{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <MeetingsDue rows={dueRows} onStart={(row) => navigation.navigate('ChecklistMeeting', { driverId: row.driverId, templateId: row.templateId })} />

        <section className="sd-section" aria-labelledby="sd-folders">
          <div className="sd-section-head">
            <h2 id="sd-folders" className="sd-b">{t('folders.sectionTitle')}</h2>
            <button type="button" className="sd-btn sd-btn-tinted" onClick={() => setAddingFolder(true)} style={{ minHeight: 40 }}>
              <Ionicons name="add" size={19} color="currentColor" />
              {t('folders.addButton')}
            </button>
          </div>
          {removeFolder.error ? (
            <div className="sd-inline-error" role="alert">
              <Ionicons name="alert-circle" size={20} color="currentColor" />
              {removeFolder.error}
            </div>
          ) : null}
          {!templates ? null : addedFolders.length === 0 ? (
            <div className="sd-empty" style={{ padding: '28px 20px' }}>
              <Ionicons name="folder-open" size={44} color="#2F5BFF" />
              <h3 className="sd-b">{t('folders.noneAdded')}</h3>
              <p>{t('folders.noneAddedHint')}</p>
            </div>
          ) : (
            <div className="sd-grid">
              {addedFolders.map((folder, i) => {
                const form = folder.form ? (templates ?? []).find((entry) => entry.id === folder.form!.id) : null;
                return form ? (
                  <TemplateCard key={folder.id} template={form} index={i} fresh={form.id === freshId} onOpen={() => setPreviewing(form)} />
                ) : (
                  <button key={folder.id} type="button" className="sd-card sd-card-new" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }} onClick={() => setEmptyFolder(folder)}>
                    <span className="sd-card-new-icon">
                      <Ionicons name="folder-open" size={30} color="#2F5BFF" />
                    </span>
                    <span className="sd-b">{folder.title}</span>
                    <span style={{ fontSize: 14, color: 'var(--sd-ink-2)' }}>{t('folders.noFormYetCreate')}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="sd-section" aria-labelledby="sd-own">
          <div className="sd-section-head">
            <h2 id="sd-own" className="sd-b">{t('signing.companyDocuments')}</h2>
            {templates && own.length ? <span className="sd-num">{own.length === 1 ? t('documents.oneDocument') : t('documents.count', { length: own.length })}</span> : null}
          </div>
          {error ? (
            <div className="sd-empty">
              <Ionicons name={error.icon} size={46} color="#FF9F0A" />
              <h3 className="sd-b">{error.message}</h3>
              {error.hint ? <p>{error.hint}</p> : null}
              <button type="button" className="sd-btn sd-btn-tinted sd-btn-lg" onClick={() => void load()}>
                {t('common.tryAgainPlural')}
              </button>
            </div>
          ) : !templates ? (
            <div className="sd-grid">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="sd-skeleton" />
              ))}
            </div>
          ) : own.length === 0 ? (
            <div className="sd-empty">
              <Ionicons name="documents" size={52} color="#0075B3" />
              <h3 className="sd-b">{t('signing.noCompanyDocs')}</h3>
              <p>{t('signing.createFirstHint')}</p>
              <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => setCreating(true)}>
                <Ionicons name="add" size={22} color="#fff" />
                {t('signing.createFirst')}
              </button>
            </div>
          ) : (
            <div className="sd-grid">
              <button type="button" className="sd-card sd-card-new" onClick={() => setCreating(true)}>
                <span className="sd-card-new-icon">
                  <Ionicons name="add" size={32} color="#0075B3" />
                </span>
                <span className="sd-b">{t('signing.newDocument')}</span>
              </button>
              {own.map((entry, i) => (
                <TemplateCard key={entry.id} template={entry} index={i + 1} fresh={entry.id === freshId} onOpen={() => setPreviewing(entry)} />
              ))}
            </div>
          )}
        </section>

        {shared.length ? (
          <section className="sd-section" aria-labelledby="sd-shared">
            <div className="sd-section-head">
              <h2 id="sd-shared" className="sd-b">{t('signing.builtInDocuments')}</h2>
              <span>{t('signing.canSendAsIs')}</span>
            </div>
            <div className="sd-grid">
              {shared.map((entry, i) => (
                <TemplateCard key={entry.id} template={entry} index={i} onOpen={() => setPreviewing(entry)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {creating ? (
        <CreateDocumentSheet
          companyId={companyId}
          takenTitles={[...(templates ?? []).map((entry) => entry.title), ...catalog.filter((folder) => !folder.retired_at).map((folder) => folder.title)]}
          onClosed={() => setCreating(false)}
          onCreated={(template) => {
            setFreshId(template.id);
            setTemplates((prev) => [template, ...(prev ?? []).filter((entry) => entry.id !== template.id)]);
          }}
        />
      ) : null}
      {addingFolder ? (
        <AddCatalogFolderSheet
          companyId={companyId}
          onClosed={() => setAddingFolder(false)}
          onAdded={(folder, templateId) => {
            void load();
            // A new folder with no form: straight to its window, where "צור טופס" is.
            if (!templateId) setEmptyFolder({ ...folder, added: true });
          }}
        />
      ) : null}
      {emptyFolder ? (
        <EmptyCatalogFolderSheet
          companyId={companyId}
          folder={emptyFolder}
          onCreate={() => setCreatingFor(formFolder(emptyFolder))}
          onClosed={() => setEmptyFolder(null)}
          onChanged={() => void load()}
        />
      ) : null}
      {creatingFor || replacing ? (
        <CreateDocumentSheet
          companyId={companyId}
          folder={creatingFor ?? undefined}
          replace={replacing ?? undefined}
          onClosed={() => {
            setCreatingFor(null);
            setReplacing(null);
          }}
          onCreated={(template, pendingOld) => {
            pdfCache.delete(template.id);
            setFreshId(template.id);
            if (replacing) setAfterReplace({ template, pendingOld: pendingOld ?? 0 });
            void load();
          }}
        />
      ) : null}
      {afterReplace ? (
        <AfterReplaceSheet
          companyId={companyId}
          template={afterReplace.template}
          pendingOld={afterReplace.pendingOld}
          onPickDrivers={() => setSendingTemplate(afterReplace.template)}
          onClosed={() => setAfterReplace(null)}
        />
      ) : null}
      {versionsOf ? (
        <FormVersionsSheet
          companyId={companyId}
          template={versionsOf}
          onClosed={() => setVersionsOf(null)}
          onRestored={(template, pendingOld) => {
            pdfCache.delete(template.id);
            setAfterReplace({ template, pendingOld });
            void load();
          }}
        />
      ) : null}
      {removeFolder.dialog}
      {previewing ? (
        <PreviewSheet
          template={previewing}
          companyId={companyId}
          folder={folderOf(previewing)}
          onReplace={() => setReplacing(previewing)}
          onVersions={() => setVersionsOf(previewing)}
          onRemoveFolder={() => {
            const folder = folderOf(previewing);
            if (folder) removeFolder.start(folder.id, folder.title);
          }}
          onClosed={() => setPreviewing(null)}
          onSend={() => {
            setSendingTemplate(previewing);
            setPreviewing(null);
          }}
          onDeleted={() => setTemplates((prev) => (prev ?? []).filter((entry) => entry.id !== previewing.id))}
          onChanged={(changed) => {
            setTemplates((prev) => (prev ?? []).map((entry) => (entry.id === changed.id ? changed : entry)));
            loadPlan();
          }}
        />
      ) : null}
      {sendingTemplate && isChecklistTemplate(sendingTemplate) ? (
        <StartMeetingSheet
          companyId={companyId}
          template={sendingTemplate}
          plan={planByDriver(plan, sendingTemplate.id)}
          onClosed={() => setSendingTemplate(null)}
          onPick={(driverId) => navigation.navigate('ChecklistMeeting', { driverId, templateId: sendingTemplate.id })}
        />
      ) : sendingTemplate ? (
        <SendToDriversSheet companyId={companyId} template={sendingTemplate} onClosed={() => setSendingTemplate(null)} />
      ) : null}
    </div>
  );
}
