import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { deleteSigningRecord, getSigningTemplateSourceUrl, listSignatureRequests, listSigningTemplates, type SigningTemplate } from '../../../lib/docuseal';
import { formatDate } from '../../../lib/theme';
import { SIGNING_CSS } from './signingCss';
import { CreateDocumentSheet } from './CreateDocumentSheet.web';
import { ConfirmAlert, Sheet, useSheetClose } from './Sheet.web';
import { SendToDriversSheet } from './SendToDriversSheet.web';
import { PdfPageView } from './FieldPlacer.web';
import { loadPdf, renderPage, type LoadedPdf } from './pdf.web';

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
      aria-label={`פתיחת ${template.title}`}
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
        {isGlobal ? (
          <span className="sd-badge sd-sb">
            <Ionicons name="checkmark-circle" size={14} color="#1E8E45" />
            מוכן מהמערכת
          </span>
        ) : fresh ? (
          <span className="sd-badge sd-sb">
            <Ionicons name="sparkles" size={14} color="#1E8E45" />
            חדש
          </span>
        ) : (
          <span className="sd-num">נוצר ב-{formatDate(template.created_at)}</span>
        )}
      </div>
    </button>
  );
}

function PreviewSheet({
  template,
  companyId,
  onClosed,
  onSend,
  onDeleted,
}: {
  template: SigningTemplate;
  companyId: string;
  onClosed: () => void;
  onSend: () => void;
  onDeleted: () => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [failed, setFailed] = useState(false);
  // Deleting: 'ask' shows the confirmation (with how many drivers are still waiting to sign).
  const [confirm, setConfirm] = useState<{ waiting: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const own = template.company_id === companyId;

  const askDelete = async () => {
    setDeleteError('');
    const requests = await listSignatureRequests(companyId).catch(() => []);
    setConfirm({ waiting: requests.filter((r) => r.template_id === template.id && r.status === 'pending').length });
  };
  const doDelete = async () => {
    setConfirm(null);
    setDeleting(true);
    try {
      await deleteSigningRecord(companyId, 'template', template.id, 'company-delete');
      pdfCache.delete(template.id);
      onDeleted();
      close();
    } catch (error) {
      setDeleteError((error as Error)?.message || 'מחיקת המסמך נכשלה. נסו שוב.');
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
            <div className="sd-progress-label">{pdf ? `${pdf.pages.length} ${pdf.pages.length === 1 ? 'עמוד' : 'עמודים'}` : ' '}</div>
          </div>
          <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close}>
            סגירה
          </button>
        </>
      }
      foot={
        <>
          {own ? (
            <button type="button" className="sd-btn sd-btn-plain sd-danger sd-btn-lg" onClick={() => void askDelete()} disabled={deleting}>
              <Ionicons name="trash" size={19} color="#FF453A" />
              {deleting ? 'מוחק…' : 'מחיקת המסמך'}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={onSend} disabled={deleting} style={{ minWidth: 200 }}>
            <Ionicons name="paper-plane" size={20} color="#fff" />
            שליחה לנהגים
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
          title="למחוק את המסמך?"
          message={`המסמך יימחק לצמיתות, גם מ-DocuSeal.${confirm.waiting ? ` ${confirm.waiting === 1 ? 'נהג אחד עוד לא חתם עליו, והבקשה שלו תבוטל.' : `${confirm.waiting} נהגים עוד לא חתמו עליו, והבקשות שלהם יבוטלו.`}` : ''} מסמכים שנהגים כבר חתמו עליהם יישארו בתיק הנהג.`}
          confirmLabel="מחיקה"
          cancelLabel="ביטול"
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {failed ? (
        <div className="sd-busy">
          <Ionicons name="alert-circle" size={48} color="#FF3B30" />
          <h3 className="sd-b">לא הצלחנו להציג את המסמך</h3>
          <p>נסו לסגור ולפתוח שוב בעוד רגע.</p>
        </div>
      ) : !pdf ? (
        <div className="sd-busy" role="status">
          <div className="sd-spinner" />
        </div>
      ) : (
        <div className="sd-preview-pages" style={{ maxWidth: 880, margin: '0 auto' }}>
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

export function SignedDocumentsDesktopView({ companyId }: { companyId: string }) {
  const [templates, setTemplates] = useState<SigningTemplate[] | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<SigningTemplate | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [sendingTemplate, setSendingTemplate] = useState<SigningTemplate | null>(null);

  const load = useCallback(async () => {
    try {
      setError(false);
      setTemplates(await listSigningTemplates(companyId));
    } catch {
      setError(true);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const own = (templates ?? []).filter((t) => t.company_id === companyId);
  const shared = (templates ?? []).filter((t) => t.company_id === null);

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
            <h1 className="sd-xb">מסמכים חתומים</h1>
            <p>כאן יוצרים טפסים שהנהגים חותמים עליהם, כמו הצהרת בריאות או נוהל בטיחות. כותבים או מעלים קובץ, מסמנים איפה חותמים, וזהו.</p>
            <div className="sd-hero-actions">
              <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => setCreating(true)}>
                <Ionicons name="add" size={22} color="#fff" />
                מסמך חדש
              </button>
            </div>
          </div>
          <HeroArt />
        </section>

        <div className="sd-steps">
          {[
            { title: 'כותבים או מעלים', text: 'כותבים את המסמך כאן, או מעלים קובץ PDF, וורד או תמונה.' },
            { title: 'מסמנים איפה חותמים', text: 'מוסיפים חתימה, תאריך ושדות נוספים במקום הנכון.' },
            { title: 'שולחים לנהגים', text: 'לוחצים על המסמך ובוחרים נהג אחד, כמה נהגים או את כולם. המסמך החתום נשמר בתיק הנהג.' },
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

        <section className="sd-section" aria-labelledby="sd-own">
          <div className="sd-section-head">
            <h2 id="sd-own" className="sd-b">המסמכים של החברה</h2>
            {templates && own.length ? <span className="sd-num">{own.length === 1 ? 'מסמך אחד' : `${own.length} מסמכים`}</span> : null}
          </div>
          {error ? (
            <div className="sd-empty">
              <Ionicons name="cloud-offline" size={46} color="#FF9F0A" />
              <h3 className="sd-b">לא הצלחנו לטעון את המסמכים</h3>
              <p>בדקו את החיבור לאינטרנט ונסו שוב.</p>
              <button type="button" className="sd-btn sd-btn-tinted sd-btn-lg" onClick={() => void load()}>
                נסו שוב
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
              <Ionicons name="documents" size={52} color="#0088CC" />
              <h3 className="sd-b">עדיין אין מסמכים של החברה</h3>
              <p>צרו את המסמך הראשון. זה לוקח כמה דקות, וכל שלב מוסבר על המסך.</p>
              <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => setCreating(true)}>
                <Ionicons name="add" size={22} color="#fff" />
                יצירת המסמך הראשון
              </button>
            </div>
          ) : (
            <div className="sd-grid">
              <button type="button" className="sd-card sd-card-new" onClick={() => setCreating(true)}>
                <span className="sd-card-new-icon">
                  <Ionicons name="add" size={32} color="#0088CC" />
                </span>
                <span className="sd-b">מסמך חדש</span>
              </button>
              {own.map((t, i) => (
                <TemplateCard key={t.id} template={t} index={i + 1} fresh={t.id === freshId} onOpen={() => setPreviewing(t)} />
              ))}
            </div>
          )}
        </section>

        {shared.length ? (
          <section className="sd-section" aria-labelledby="sd-shared">
            <div className="sd-section-head">
              <h2 id="sd-shared" className="sd-b">מסמכים מוכנים מהמערכת</h2>
              <span>אפשר לשלוח אותם כמו שהם</span>
            </div>
            <div className="sd-grid">
              {shared.map((t, i) => (
                <TemplateCard key={t.id} template={t} index={i} onOpen={() => setPreviewing(t)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {creating ? (
        <CreateDocumentSheet
          companyId={companyId}
          onClosed={() => setCreating(false)}
          onCreated={(template) => {
            setFreshId(template.id);
            setTemplates((prev) => [template, ...(prev ?? []).filter((t) => t.id !== template.id)]);
          }}
        />
      ) : null}
      {previewing ? (
        <PreviewSheet
          template={previewing}
          companyId={companyId}
          onClosed={() => setPreviewing(null)}
          onSend={() => {
            setSendingTemplate(previewing);
            setPreviewing(null);
          }}
          onDeleted={() => setTemplates((prev) => (prev ?? []).filter((t) => t.id !== previewing.id))}
        />
      ) : null}
      {sendingTemplate ? <SendToDriversSheet companyId={companyId} template={sendingTemplate} onClosed={() => setSendingTemplate(null)} /> : null}
    </div>
  );
}
