import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { SigningTemplate } from '../../../lib/docuseal';
import {
  createTemplateFromEditor,
  createTemplateFromFields,
  newDraftId,
  signedDocumentUrl,
  type FormTarget,
  uploadSigningDraft,
  type EditorBlock,
  type EditorPlacedField,
  type PlacedSigningField,
  type SigningFieldKind,
} from '../../../lib/companySigningTemplates';
import { ConfirmAlert, Sheet, useSheetClose } from './Sheet.web';
import { isFixedFolderTitle, sameDocumentTitle, TAKEN_TITLE_MESSAGE } from '../../../lib/signingSend';
import { DocumentEditor, EditorPagePreview, editorDraftFromContent, initialEditorDraft, type DocumentEditorHandle, type EditorDraft } from './DocumentEditor.web';
import { BusyState, FieldPlacer, PdfPageView, UploadDropzone } from './FieldPlacer.web';
import { loadPdf, type LoadedPdf } from './pdf.web';
import { FIELD_META } from './fieldMeta';
import { ChecklistBuilder, ChecklistPaperPreview } from './ChecklistBuilder.web';
import {
  DRIVER_MEETING_TITLE,
  blankChecklistForm,
  cleanForm,
  createChecklistTemplate,
  driverMeetingForm,
  filledItems,
  readForm,
  formProblem,
  repeatLabel,
  statusOptions,
  STATUS_META,
  type ChecklistForm,
} from '../../../lib/checklistForms';
import {
  createFormTemplate,
  listFormTemplates,
  updateFormTemplate,
  type FormTemplate,
} from '../../../lib/formTemplates';
import { t, dirIcon } from '../../../lib/i18n';

/**
 * "מסמך חדש": name it, choose to write or upload (or start from one of the
 * owner's ready templates), place the fields, review and save. Four calm
 * steps in one sheet, each with one clear question and one big button forward.
 *
 * The same window saves a new version of a form ("replace"), and, for the
 * platform owner, builds one of the ready templates (`ownerTemplate`): written
 * in the editor or as a checklist, never an uploaded file.
 */

type Mode = 'editor' | 'upload' | 'checklist';
type Step = 0 | 1 | 2 | 3;

const nameIdeas = () => [t('signing.suggest.safetyProcedure'), DRIVER_MEETING_TITLE, t('signing.suggest.vehicleHandover'), t('signing.suggest.vehicleCare')];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const stepNames = () => [t('signing.stepName.nameAndMethod'), t('signing.stepName.contentAndFields'), t('signing.stepName.reviewAndSave')];

function fieldSummary(kinds: SigningFieldKind[]) {
  const counts = new Map<SigningFieldKind, number>();
  kinds.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  return [...counts.entries()];
}

/** The platform owner building (or editing) one of the ready templates. */
export type OwnerTemplateTarget = {
  /** null: a new template. */
  template: FormTemplate | null;
  onSaved: (template: FormTemplate) => void;
};

export function CreateDocumentSheet({
  companyId,
  takenTitles = [],
  replace,
  startTemplate,
  ownerTemplate,
  onClosed,
  onCreated,
}: {
  /** The company the form is for; empty in owner mode. */
  companyId: string;
  /** Names already used by the company's documents (or the other templates); a new one must differ. */
  takenTitles?: string[];
  /** "החלף טופס": a new version of this form (same name, same kind). */
  replace?: SigningTemplate;
  /** Opens with this ready template already picked ("השתמשו בשבלונה" on the page). */
  startTemplate?: FormTemplate;
  ownerTemplate?: OwnerTemplateTarget;
  onClosed: () => void;
  /** `pendingOld`: after a replace, drivers still waiting to sign the earlier version. */
  onCreated?: (template: SigningTemplate, pendingOld?: number) => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const owner = !!ownerTemplate;
  const editingTemplate = ownerTemplate?.template ?? null;
  // A new version keeps the form's name and kind; an edited template keeps its kind.
  const lockedTitle = replace?.title ?? null;
  const lockedKind = replace ? (replace.form_kind ?? 'document') : editingTemplate?.kind ?? null;
  const [draftId, setDraftId] = useState(newDraftId);
  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState(lockedTitle ?? editingTemplate?.title ?? startTemplate?.title ?? '');
  const [description, setDescription] = useState(editingTemplate?.description ?? '');
  const [mode, setMode] = useState<Mode | null>(
    lockedKind === 'checklist' || startTemplate?.kind === 'checklist'
      ? 'checklist'
      : editingTemplate || startTemplate
        ? 'editor'
        : replace?.editor_content ? 'editor' : null,
  );
  const [nameError, setNameError] = useState(false);

  // The owner's ready templates a company can start from (not for a new version or in owner mode).
  const [templates, setTemplates] = useState<FormTemplate[]>(startTemplate ? [startTemplate] : []);
  const [picked, setPicked] = useState<FormTemplate | null>(startTemplate ?? null);
  useEffect(() => {
    if (owner || replace) return;
    let active = true;
    listFormTemplates()
      .then((rows) => active && setTemplates(startTemplate && !rows.some((row) => row.id === startTemplate.id) ? [startTemplate, ...rows] : rows))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [owner, replace, startTemplate]);
  const target: FormTarget | undefined = replace
    ? { replace: { templateId: replace.id, expectedVersion: replace.version ?? 1 } }
    : picked ? { sourceTemplateId: picked.id } : undefined;

  // editor
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [editorHasSignature, setEditorHasSignature] = useState(false);
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [editorFields, setEditorFields] = useState<EditorPlacedField[]>([]);

  // upload
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fields, setFields] = useState<PlacedSigningField[]>([]);

  // checklist ("רשימת סעיפים")
  const [checklist, setChecklist] = useState<ChecklistForm | null>(null);
  const [fromTemplate, setFromTemplate] = useState(true);

  // save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<SigningTemplate | null>(null);
  const [confirming, setConfirming] = useState(false);

  const dirty = step > 0 || title.trim().length > 0;
  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty && step !== 3) setConfirming(true);
    else close();
  }, [close, dirty, saving, step]);

  const leaveEditor = () => {
    if (mode === 'editor' && editorRef.current) {
      const snap = editorRef.current.snapshot();
      setEditorDraft(snap.draft);
      setBlocks(snap.blocks);
      setEditorFields(snap.placed);
    }
  };

  const onFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t('documents.tooLargeCreate'));
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const path = await uploadSigningDraft(companyId, draftId, file);
      const loaded = await loadPdf(await signedDocumentUrl(path));
      setPdf(loaded);
      setFields([]);
    } catch (error) {
      setUploadError(error instanceof Error && error.message ? error.message : t('common.openFileFailedRetry'));
    } finally {
      setUploading(false);
    }
  };

  // A fixed folder of the driver's file is a name too: two folders alike would confuse.
  const fixedFolderName = !lockedTitle && isFixedFolderTitle(title);
  const titleTaken = !lockedTitle && (fixedFolderName || takenTitles.some((taken) => sameDocumentTitle(taken, title)));
  const takenMessage = fixedFolderName ? t('signing.fixedFolderName') : owner ? t('templates.titleTaken') : TAKEN_TITLE_MESSAGE();

  /** A ready template picked (or unpicked): its kind becomes the method, its name the form's name, and the content starts over from it. */
  const pickTemplate = (template: FormTemplate | null) => {
    if (template?.id === picked?.id) return;
    if (template) {
      setMode(template.kind === 'checklist' ? 'checklist' : 'editor');
      // The name follows the template unless the manager already typed their own.
      if (!title.trim() || (picked && title.trim() === picked.title) || title.trim() === DRIVER_MEETING_TITLE) setTitle(template.title);
    }
    setPicked(template);
    setEditorDraft(null);
    setChecklist(null);
  };
  const chooseMethod = (next: Mode) => {
    if (picked) {
      if (title.trim() === picked.title) setTitle('');
      setPicked(null);
      setEditorDraft(null);
      setChecklist(null);
    }
    setMode(next);
  };
  const canContinue =
    step === 0
      ? title.trim().length > 0 && !titleTaken && !!mode
      : step === 1
        ? mode === 'editor'
          ? editorHasSignature
          : mode === 'checklist'
            ? !!checklist && !formProblem(title, checklist)
            : !!pdf && fields.some((f) => f.kind === 'signature')
        : true;

  const next = () => {
    if (step === 0) {
      if (!title.trim()) {
        setNameError(true);
        document.getElementById('sd-doc-name')?.focus();
        return;
      }
      if (!mode) return;
      if (mode === 'editor' && editorDraft === null) {
        // A template, the text of the version being replaced, or a blank page.
        const source = picked ?? editingTemplate;
        const fromSource = source?.kind === 'document' ? editorDraftFromContent(source.content, title.trim(), source.title) : null;
        const fromReplace = replace?.editor_content ? editorDraftFromContent(replace.editor_content) : null;
        setEditorDraft(fromSource ?? fromReplace ?? initialEditorDraft(title.trim()));
      }
      if (mode === 'checklist' && checklist === null) {
        const source = picked ?? editingTemplate;
        if (source?.kind === 'checklist') setChecklist(readForm(source.content) ?? blankChecklistForm());
        else if (replace) setChecklist(readForm(replace.form_content) ?? blankChecklistForm());
        else setChecklist(driverMeetingForm());
        // "Started from the ready template" is the built-in meeting form, or the picked one.
        setFromTemplate(!replace && !editingTemplate);
      }
      setStep(1);
    } else if (step === 1) {
      leaveEditor();
      setSaveError(null);
      setStep(2);
    }
  };

  const back = () => {
    if (step === 1) leaveEditor();
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (ownerTemplate) {
        const input = {
          title: title.trim(),
          description: description.trim() || null,
          // A template keeps where each field sits in the text (`slot`), so a company's copy opens the same.
          content: mode === 'checklist' ? cleanForm(checklist!) : { blocks, fields: editorFields },
        };
        const savedTemplate = editingTemplate
          ? await updateFormTemplate(editingTemplate.id, input)
          : await createFormTemplate(mode === 'checklist' ? 'checklist' : 'document', input);
        ownerTemplate.onSaved(savedTemplate);
        setStep(3);
        return;
      }
      const saved =
        mode === 'editor'
          ? await createTemplateFromEditor(companyId, draftId, title.trim(), blocks, editorFields, target)
          : mode === 'checklist'
            ? await createChecklistTemplate(companyId, draftId, title.trim(), checklist!, target)
            : await createTemplateFromFields(companyId, draftId, title.trim(), fields, target);
      setCreated(saved.template);
      onCreated?.(saved.template, saved.pendingOld);
      // A new version goes straight to "what to send" (the caller's window).
      if (replace) close();
      else setStep(3);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : t('common.saveFailedRetry'));
    } finally {
      setSaving(false);
    }
  };

  const startOver = () => {
    setDraftId(newDraftId());
    setStep(0);
    setTitle('');
    setDescription('');
    setMode(null);
    setPicked(null);
    setEditorDraft(null);
    setEditorHasSignature(false);
    setBlocks([]);
    setEditorFields([]);
    setPdf(null);
    setFields([]);
    setChecklist(null);
    setFromTemplate(true);
    setCreated(null);
    setSaveError(null);
    setUploadError(null);
  };

  // Every step starts at the top of the sheet.
  const hasPdf = !!pdf;
  useEffect(() => {
    document.querySelector('.sd-sheet-body')?.scrollTo({ top: 0 });
  }, [step, hasPdf]);

  const fieldKinds = useMemo(() => (mode === 'editor' ? editorFields.map((f) => f.kind) : fields.map((f) => f.kind)), [mode, editorFields, fields]);

  const head = (
    <>
      <div>
        {step !== 3 ? (
          <button type="button" className="sd-btn sd-btn-link" onClick={requestClose}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
      <div className="sd-sheet-title">
        <strong className="sd-b">
          {replace
            ? t('folders.newVersionOf', { title: replace.title })
            : step === 0 || !title.trim()
              ? owner ? (editingTemplate ? t('templates.editTemplate') : t('templates.newTemplate')) : t('signing.newDocument')
              : title.trim()}
        </strong>
        {step < 3 ? (
          <>
            <div className="sd-progress" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i <= step ? 'sd-on' : ''} />
              ))}
            </div>
            <div className="sd-progress-label">
              {t('signing.stepLabel')} {step + 1} {t('signing.of3')} {stepNames()[step]}
            </div>
          </>
        ) : null}
      </div>
      <div />
    </>
  );

  const stepNote =
    step === 1 && !canContinue
      ? mode === 'checklist'
        ? checklist ? formProblem(title, checklist) : null
        : mode === 'upload' && !pdf
          ? t('signing.uploadToContinue')
          : t('signing.addSignatureToContinue')
      : step === 0 && titleTaken
        ? takenMessage
      : step === 0 && !mode && title.trim()
        ? t('signing.chooseHowToCreate')
        : null;

  const foot =
    step === 3 ? null : (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {step > 0 ? (
            <button type="button" className="sd-btn sd-btn-plain sd-btn-lg" onClick={back} disabled={saving}>
              <Ionicons name={dirIcon('chevron-forward')} size={20} color="currentColor" />
              {t('common.goBack')}
            </button>
          ) : null}
          {stepNote ? (
            <span className="sd-foot-note sd-warn">
              <Ionicons name="information-circle" size={20} color="#B96A00" />
              {stepNote}
            </span>
          ) : null}
        </div>
        {step < 2 ? (
          <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={next} disabled={!canContinue} style={{ minWidth: 180 }}>
            {t('common.continue')}
            <Ionicons name={dirIcon('chevron-back')} size={20} color="#fff" />
          </button>
        ) : (
          <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => void save()} disabled={saving} style={{ minWidth: 220 }}>
            {saving ? (
              <>
                <span className="sd-spinner" style={{ width: 22, height: 22, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#fff' }} />
                {owner ? t('common.savingEllipsis') : mode === 'checklist' ? t('signing.savingForm') : t('signing.savingDocument')}
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={21} color="#fff" />
                {owner ? t('templates.saveTemplate') : mode === 'checklist' ? t('signing.saveForm') : t('signing.saveDocument')}
              </>
            )}
          </button>
        )}
      </>
    );

  return (
    <>
      <Sheet closing={closing} onRequestClose={requestClose} label={owner ? t('templates.newTemplate') : t('signing.createNewForSigning')} head={head} foot={foot}>
        {step === 0 ? (
          <div className="sd-start sd-stage" key="start">
            {lockedTitle ? (
              <>
                <h2 className="sd-q sd-b">{lockedTitle}</h2>
                <p className="sd-q-sub">
                  {t('folders.replaceIntro')}
                  {replace?.editor_content ? ` ${t('templates.replaceOpensCurrent')}` : ''}
                </p>
              </>
            ) : (
            <>
            <h2 className="sd-q sd-b">{owner ? t('templates.whatName') : t('signing.whatName')}</h2>
            <p className="sd-q-sub">{owner ? t('templates.nameHint') : t('signing.nameVisibleToDriver')}</p>
            <input
              id="sd-doc-name"
              className="sd-name"
              value={title}
              maxLength={120}
              placeholder={t('signing.namePlaceholder')}
              autoFocus
              aria-invalid={nameError || titleTaken}
              aria-describedby={titleTaken ? 'sd-doc-name-taken' : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                setNameError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next();
              }}
            />
            {titleTaken ? (
              <div id="sd-doc-name-taken" className="sd-inline-error" role="alert">
                <Ionicons name="alert-circle" size={20} color="currentColor" />
                {takenMessage}
              </div>
            ) : null}
            {owner ? (
              <label className="sd-desc">
                <span className="sd-sb">{t('templates.descriptionLabel')}</span>
                <textarea
                  value={description}
                  maxLength={300}
                  rows={2}
                  placeholder={t('templates.descriptionPlaceholder')}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            ) : (
              <div className="sd-chips" aria-label={t('signing.nameSuggestions')}>
                {nameIdeas().map((idea) => (
                  <button key={idea} type="button" className="sd-chip" onClick={() => setTitle(idea)}>
                    {idea}
                  </button>
                ))}
              </div>
            )}
            </>
            )}

            <div className="sd-choices" role="radiogroup" aria-label={t('signing.howToCreate')}>
              {lockedKind !== 'checklist' ? (
              <>
              <ChoiceCard
                selected={mode === 'editor' && !picked}
                onPress={() => chooseMethod('editor')}
                icon="create"
                gradient="linear-gradient(160deg,#FFB340,#FF7A00)"
                title={t('signing.method.write')}
                text={t('signing.method.writeText')}
              />
              {!owner ? (
              <ChoiceCard
                selected={mode === 'upload' && !picked}
                onPress={() => chooseMethod('upload')}
                icon="cloud-upload"
                gradient="linear-gradient(160deg,#35B8F0,#2F5BFF)"
                title={t('signing.method.upload')}
                text={t('signing.method.uploadText')}
              />
              ) : null}
              </>
              ) : null}
              {!lockedKind || lockedKind === 'checklist' ? (
              <ChoiceCard
                selected={mode === 'checklist' && !picked}
                onPress={() => {
                  chooseMethod('checklist');
                  if (!title.trim()) setTitle(DRIVER_MEETING_TITLE);
                }}
                icon="list"
                gradient="linear-gradient(160deg,#4ADE9B,#12805C)"
                title={t('signing.method.checklist')}
                text={t('signing.method.checklistText')}
                badge={t('common.new')}
              />
              ) : null}
            </div>

            {!owner && !replace && templates.length ? (
              <section className="sd-tpls" aria-labelledby="sd-tpls-title">
                <div className="sd-tpls-head">
                  <span className="sd-tpls-spark" aria-hidden="true">
                    <Ionicons name="sparkles" size={18} color="#fff" />
                  </span>
                  <div>
                    <h3 id="sd-tpls-title" className="sd-b">{t('templates.orStartFrom')}</h3>
                    <p>{t('templates.copyHint')}</p>
                  </div>
                </div>
                <div className="sd-tpl-list" role="radiogroup" aria-labelledby="sd-tpls-title">
                  {templates.map((template, index) => (
                    <TemplateChoice
                      key={template.id}
                      template={template}
                      index={index}
                      selected={picked?.id === template.id}
                      onPress={() => pickTemplate(picked?.id === template.id ? null : template)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {step === 1 && mode === 'editor' ? (
          <div className="sd-stage" key="editor">
            <DocumentEditor
              ref={editorRef}
              initial={editorDraft ?? initialEditorDraft(title.trim())}
              onSignatureChange={setEditorHasSignature}
            />
          </div>
        ) : null}

        {step === 1 && mode === 'checklist' && checklist ? (
          <div className="sd-stage" key="checklist">
            <ChecklistBuilder
              title={title.trim()}
              form={checklist}
              onChange={setChecklist}
              fromTemplate={fromTemplate}
              templateName={picked?.kind === 'checklist' ? picked.title : undefined}
              onStartFrom={(which) => {
                setFromTemplate(which === 'template');
                const source = picked?.kind === 'checklist' ? readForm(picked.content) : null;
                setChecklist(which === 'template' ? source ?? driverMeetingForm() : blankChecklistForm());
              }}
            />
          </div>
        ) : null}

        {step === 1 && mode === 'upload' ? (
          uploading ? (
            <BusyState title={t('signing.preparingFile')} subtitle={t('signing.preparingFileHint')} />
          ) : pdf ? (
            <div className="sd-stage" key="placer">
              <FieldPlacer pdf={pdf} fields={fields} onFieldsChange={setFields} onReplaceFile={() => {
                setPdf(null);
                setFields([]);
              }} />
            </div>
          ) : (
            <UploadDropzone onFile={(file) => void onFile(file)} error={uploadError} />
          )
        ) : null}

        {step === 2 ? (
          <div className="sd-review sd-stage" key="review">
            <div className="sd-review-preview" aria-hidden="true">
              {mode === 'checklist' && checklist ? (
                <ChecklistPaperPreview title={title.trim()} form={checklist} />
              ) : mode === 'upload' && pdf ? (
                <div style={{ width: '100%', maxWidth: 440, transform: 'rotate(-1.2deg)' }}>
                  <PdfPageView pdf={pdf} pageNumber={1} fields={fields.filter((f) => f.page === 1)} readOnly />
                </div>
              ) : (
                <EditorPagePreview html={editorDraft?.html ?? ''} fields={editorFields} />
              )}
            </div>
            <div>
              <h2 className="sd-b">{t('signing.allReady')}</h2>
              <p className="sd-review-sub">
                {mode === 'checklist'
                  ? t('signing.reviewForm')
                  : t('signing.reviewDocument')}
              </p>
              <div className="sd-list">
                <div className="sd-row">
                  <span>{mode === 'checklist' ? t('signing.formName') : t('signing.documentName')}</span>
                  <strong className="sd-sb">{title.trim()}</strong>
                </div>
                <div className="sd-row">
                  <span>{t('signing.howCreated')}</span>
                  <strong className="sd-sb">
                    {picked ? t('templates.fromTemplate', { title: picked.title }) : mode === 'editor' ? t('signing.writtenHere') : mode === 'checklist' ? t('signing.method.checklist') : t('signing.uploadedFile')}
                  </strong>
                </div>
                {owner ? (
                  <div className="sd-row">
                    <span>{t('templates.whoSees')}</span>
                    <strong className="sd-sb">{t('templates.allCompanies')}</strong>
                  </div>
                ) : null}
                {pdf && mode === 'upload' ? (
                  <div className="sd-row">
                    <span>{t('common.pages')}</span>
                    <strong className="sd-sb sd-num">{pdf.pages.length}</strong>
                  </div>
                ) : null}
                {mode === 'checklist' && checklist ? (
                  <>
                    <div className="sd-row">
                      <span>{t('checklist.itemsWord')}</span>
                      <strong className="sd-sb sd-num">{filledItems(checklist).length}</strong>
                    </div>
                    <div className="sd-row">
                      <span>{t('signing.answers')}</span>
                      <strong className="sd-sb">{statusOptions(checklist).map((k) => STATUS_META[k].label).join(' / ')}</strong>
                    </div>
                    <div className="sd-row">
                      <span>{t('signing.meetingWithEachDriver')}</span>
                      <strong className="sd-sb">{repeatLabel(checklist.repeatMonths)}</strong>
                    </div>
                  </>
                ) : null}
                <div className="sd-row" hidden={owner}>
                  <span>{t('signing.whoSigns')}</span>
                  <strong className="sd-sb">{mode === 'checklist' ? t('signing.officerThenDriver') : t('common.theDriver')}</strong>
                </div>
              </div>

              {mode !== 'checklist' ? <div className="sd-group-label sd-sb" style={{ marginTop: 22 }}>{t('signing.fieldsInDocument')}</div> : null}
              <div className="sd-list" hidden={mode === 'checklist'}>
                {fieldSummary(fieldKinds).map(([kind, count]) => (
                  <div className="sd-row" key={kind}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--sd-ink)' }}>
                      <span className="sd-tool-icon" style={{ background: FIELD_META[kind].color, width: 30, height: 30, borderRadius: 9 }}>
                        <Ionicons name={FIELD_META[kind].icon} size={16} color="#fff" />
                      </span>
                      {FIELD_META[kind].label}
                    </span>
                    <strong className="sd-sb sd-num">{count}</strong>
                  </div>
                ))}
              </div>

              {saveError ? (
                <div className="sd-error" role="alert">
                  <Ionicons name="alert-circle" size={20} color="#C4271E" />
                  <span>{saveError}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="sd-success sd-stage" key="done">
            <div className="sd-success-ring" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" />
                <path d="M38 62 l15 15 l30 -32" />
              </svg>
            </div>
            <h2 className="sd-xb">{owner ? t('templates.saved') : mode === 'checklist' ? t('signing.formSaved') : t('signing.documentSaved')}</h2>
            <p>
              {owner
                ? t('templates.savedHint', { title: title.trim() })
                : mode === 'checklist'
                  ? t('signing.formReadyHint', { v1: created?.title ?? title.trim() })
                  : t('signing.documentReadyHint', { v1: created?.title ?? title.trim() })}
            </p>
            <div className="sd-success-path sd-sb" hidden={owner}>
              <Ionicons name="person" size={18} color="#2F5BFF" />
              {t('driver.file')}
              <Ionicons name={dirIcon('chevron-back')} size={16} color="#8B98A4" />
              {t('signing.formsToSign')}
              <Ionicons name={dirIcon('chevron-back')} size={16} color="#8B98A4" />
              {mode === 'checklist' ? t('meeting.new') : t('common.send')}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {!lockedTitle && !editingTemplate ? (
                <button type="button" className="sd-btn sd-btn-plain sd-btn-lg" onClick={startOver}>
                  <Ionicons name="add" size={20} color="currentColor" />
                  {owner ? t('templates.createAnother') : t('signing.createAnother')}
                </button>
              ) : null}
              <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={close} style={{ minWidth: 160 }}>
                {t('common.done')}
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>

      {confirming ? (
        <ConfirmAlert
          title={t('signing.leaveWithoutSaving')}
          message={t('signing.leaveWarning')}
          cancelLabel={t('signing.keepWorking')}
          confirmLabel={t('common.exit')}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            close();
          }}
        />
      ) : null}
    </>
  );
}

/** One of the owner's ready templates in the "start from a template" list. */
function TemplateChoice({ template, index, selected, onPress }: { template: FormTemplate; index: number; selected: boolean; onPress: () => void }) {
  const checklist = template.kind === 'checklist';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`sd-tpl${selected ? ' sd-selected' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      onClick={onPress}
    >
      <span className={`sd-tpl-icon${checklist ? ' sd-tpl-list-kind' : ''}`} aria-hidden="true">
        <Ionicons name={checklist ? 'list' : 'document-text'} size={22} color="#fff" />
      </span>
      <span className="sd-tpl-text">
        <strong className="sd-sb">{template.title}</strong>
        <span>{template.description || (checklist ? t('templates.kindChecklist') : t('templates.kindDocument'))}</span>
      </span>
      <span className="sd-tpl-check" aria-hidden="true">{selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</span>
    </button>
  );
}

function ChoiceCard({
  selected,
  onPress,
  icon,
  gradient,
  title,
  text,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  gradient: string;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`sd-choice${selected ? ' sd-selected' : ''}`} onClick={onPress}>
      <span className="sd-choice-check">{selected ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}</span>
      <span className="sd-choice-icon" style={{ background: gradient, boxShadow: '0 12px 24px -10px rgba(0,0,0,0.35)' }}>
        <Ionicons name={icon} size={30} color="#fff" />
      </span>
      <h3 className="sd-b">
        {title}
        {badge ? <span className="sd-choice-badge sd-sb">{badge}</span> : null}
      </h3>
      <p>{text}</p>
    </button>
  );
}
