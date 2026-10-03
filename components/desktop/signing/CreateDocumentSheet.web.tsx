import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { SigningTemplate } from '../../../lib/docuseal';
import {
  createTemplateFromEditor,
  createTemplateFromFields,
  newDraftId,
  signedDocumentUrl,
  uploadSigningDraft,
  type EditorBlock,
  type EditorPlacedField,
  type PlacedSigningField,
  type SigningFieldKind,
} from '../../../lib/companySigningTemplates';
import { ConfirmAlert, Sheet, useSheetClose } from './Sheet.web';
import { isFixedFolderTitle, sameDocumentTitle, TAKEN_TITLE_MESSAGE } from '../../../lib/signingSend';
import { DocumentEditor, EditorPagePreview, initialEditorDraft, type DocumentEditorHandle, type EditorDraft } from './DocumentEditor.web';
import { BusyState, FieldPlacer, PdfPageView, UploadDropzone } from './FieldPlacer.web';
import { loadPdf, type LoadedPdf } from './pdf.web';
import { FIELD_META } from './fieldMeta';
import { ChecklistBuilder, ChecklistPaperPreview } from './ChecklistBuilder.web';
import {
  DRIVER_MEETING_TITLE,
  blankChecklistForm,
  createChecklistTemplate,
  driverMeetingForm,
  filledItems,
  formProblem,
  repeatLabel,
  statusOptions,
  STATUS_META,
  type ChecklistForm,
} from '../../../lib/checklistForms';
import { t, dirIcon } from '../../../lib/i18n';

/**
 * "מסמך חדש": name it, choose to write or upload, place the fields, review and
 * save. Four calm steps in one sheet, each with one clear question and one
 * big button forward.
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

export function CreateDocumentSheet({
  companyId,
  takenTitles = [],
  onClosed,
  onCreated,
}: {
  companyId: string;
  /** Names already used by the company's documents; a new one must differ. */
  takenTitles?: string[];
  onClosed: () => void;
  onCreated: (template: SigningTemplate) => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [draftId, setDraftId] = useState(newDraftId);
  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [nameError, setNameError] = useState(false);

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
  const fixedFolderName = isFixedFolderTitle(title);
  const titleTaken = fixedFolderName || takenTitles.some((taken) => sameDocumentTitle(taken, title));
  const takenMessage = fixedFolderName ? t('signing.fixedFolderName') : TAKEN_TITLE_MESSAGE();
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
      if (mode === 'editor' && editorDraft === null) setEditorDraft(initialEditorDraft(title.trim()));
      if (mode === 'checklist' && checklist === null) setChecklist(driverMeetingForm());
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
      const template =
        mode === 'editor'
          ? await createTemplateFromEditor(companyId, draftId, title.trim(), blocks, editorFields)
          : mode === 'checklist'
            ? await createChecklistTemplate(companyId, draftId, title.trim(), checklist!)
            : await createTemplateFromFields(companyId, draftId, title.trim(), fields);
      setCreated(template);
      onCreated(template);
      setStep(3);
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
    setMode(null);
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
        <strong className="sd-b">{step === 0 || !title.trim() ? t('signing.newDocument') : title.trim()}</strong>
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
                {mode === 'checklist' ? t('signing.savingForm') : t('signing.savingDocument')}
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={21} color="#fff" />
                {mode === 'checklist' ? t('signing.saveForm') : t('signing.saveDocument')}
              </>
            )}
          </button>
        )}
      </>
    );

  return (
    <>
      <Sheet closing={closing} onRequestClose={requestClose} label={t('signing.createNewForSigning')} head={head} foot={foot}>
        {step === 0 ? (
          <div className="sd-start sd-stage" key="start">
            <h2 className="sd-q sd-b">{t('signing.whatName')}</h2>
            <p className="sd-q-sub">{t('signing.nameVisibleToDriver')}</p>
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
            <div className="sd-chips" aria-label={t('signing.nameSuggestions')}>
              {nameIdeas().map((idea) => (
                <button key={idea} type="button" className="sd-chip" onClick={() => setTitle(idea)}>
                  {idea}
                </button>
              ))}
            </div>

            <div className="sd-choices" role="radiogroup" aria-label={t('signing.howToCreate')}>
              <ChoiceCard
                selected={mode === 'editor'}
                onPress={() => setMode('editor')}
                icon="create"
                gradient="linear-gradient(160deg,#FFB340,#FF7A00)"
                title={t('signing.method.write')}
                text={t('signing.method.writeText')}
              />
              <ChoiceCard
                selected={mode === 'upload'}
                onPress={() => setMode('upload')}
                icon="cloud-upload"
                gradient="linear-gradient(160deg,#35B8F0,#0075B3)"
                title={t('signing.method.upload')}
                text={t('signing.method.uploadText')}
              />
              <ChoiceCard
                selected={mode === 'checklist'}
                onPress={() => {
                  setMode('checklist');
                  if (!title.trim()) setTitle(DRIVER_MEETING_TITLE);
                }}
                icon="list"
                gradient="linear-gradient(160deg,#4ADE9B,#12805C)"
                title={t('signing.method.checklist')}
                text={t('signing.method.checklistText')}
                badge={t('common.new')}
              />
            </div>
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
              onStartFrom={(which) => {
                setFromTemplate(which === 'template');
                setChecklist(which === 'template' ? driverMeetingForm() : blankChecklistForm());
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
                  <strong className="sd-sb">{mode === 'editor' ? t('signing.writtenHere') : mode === 'checklist' ? t('signing.method.checklist') : t('signing.uploadedFile')}</strong>
                </div>
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
                <div className="sd-row">
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
            <h2 className="sd-xb">{mode === 'checklist' ? t('signing.formSaved') : t('signing.documentSaved')}</h2>
            <p>
              {mode === 'checklist'
                ? t('signing.formReadyHint', { v1: created?.title ?? title.trim() })
                : t('signing.documentReadyHint', { v1: created?.title ?? title.trim() })}
            </p>
            <div className="sd-success-path sd-sb">
              <Ionicons name="person" size={18} color="#0075B3" />
              {t('driver.file')}
              <Ionicons name={dirIcon('chevron-back')} size={16} color="#8B98A4" />
              {t('signing.formsToSign')}
              <Ionicons name={dirIcon('chevron-back')} size={16} color="#8B98A4" />
              {mode === 'checklist' ? t('meeting.new') : t('common.send')}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button type="button" className="sd-btn sd-btn-plain sd-btn-lg" onClick={startOver}>
                <Ionicons name="add" size={20} color="currentColor" />
                {t('signing.createAnother')}
              </button>
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
