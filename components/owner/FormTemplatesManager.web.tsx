import React, { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteFormTemplate,
  listOwnerFormTemplates,
  reorderFormTemplates,
  setFormTemplateHidden,
  type FormTemplate,
  type OwnerFormTemplate,
} from '../../lib/formTemplates';
import { readForm } from '../../lib/checklistForms';
import { ConfirmAlert, Sheet, useSheetClose } from '../desktop/signing/Sheet.web';
import { CreateDocumentSheet } from '../desktop/signing/CreateDocumentSheet.web';
import { useSigningStyles } from '../desktop/signing/folderCss';
import { t } from '../../lib/i18n';

/**
 * The owner's ready templates (migration 110): documents and checklists a
 * company may start a new form from. A company that picks one gets its own
 * copy to edit; changing or deleting a template here never touches those.
 * Built with the same editor the companies use ("מסמך חדש" in owner mode).
 */

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** "12 סעיפים" / "3 שדות" under a template's name. */
function contentLine(template: OwnerFormTemplate): string {
  if (template.kind === 'checklist') {
    const items = readForm(template.content)?.items.length ?? 0;
    return t('templates.itemsCount', { count: items });
  }
  const fields = Array.isArray((template.content as { fields?: unknown[] }).fields) ? (template.content as { fields: unknown[] }).fields.length : 0;
  return t('templates.fieldsCount', { count: fields });
}

export function FormTemplatesManager({ onClosed }: { onClosed: () => void }) {
  useSigningStyles();
  const { closing, close } = useSheetClose(onClosed);
  const [templates, setTemplates] = useState<OwnerFormTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The editor replaces this window while it is open (two windows would both answer Escape).
  const [editing, setEditing] = useState<FormTemplate | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OwnerFormTemplate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await listOwnerFormTemplates());
      setError(null);
    } catch (err) {
      setError(errorText(err, t('templates.loadFailed')));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, task: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await task();
      await load();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const move = (index: number, by: -1 | 1) => {
    if (!templates) return;
    const next = [...templates];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    setTemplates(next);
    void run('order', () => reorderFormTemplates(next.map((template) => template.id)), t('templates.saveFailed'));
  };

  const remove = (template: OwnerFormTemplate) => {
    setConfirmDelete(null);
    void run(`delete:${template.id}`, async () => {
      await deleteFormTemplate(template.id);
      setNotice(t('templates.deleted', { title: template.title }));
    }, t('templates.deleteFailed'));
  };

  if (editing) {
    return (
      <CreateDocumentSheet
        companyId=""
        takenTitles={(templates ?? []).filter((template) => editing === 'new' || template.id !== editing.id).map((template) => template.title)}
        ownerTemplate={{
          template: editing === 'new' ? null : editing,
          onSaved: () => void load(),
        }}
        onClosed={() => setEditing(null)}
      />
    );
  }

  return (
    <>
      <Sheet
        closing={closing}
        onRequestClose={close}
        label={t('templates.managerTitle')}
        head={
          <>
            <div />
            <div className="sd-sheet-title">
              <strong className="sd-b">{t('templates.managerTitle')}</strong>
            </div>
            <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close}>
              {t('common.close')}
            </button>
          </>
        }
      >
        <div className="fc-manage">
          <p className="fc-manage-intro">{t('templates.managerIntro')}</p>
          <button type="button" className="sd-btn sd-btn-primary" onClick={() => setEditing('new')} style={{ marginBottom: 18 }}>
            <Ionicons name="add" size={20} color="#fff" />
            {t('templates.newTemplate')}
          </button>
          {error ? <div className="fc-note fc-bad" role="alert" style={{ marginBottom: 14 }}>{error}</div> : null}
          {notice ? <div className="fc-note" role="status" style={{ marginBottom: 14 }}>{notice}</div> : null}
          {!templates ? (
            error ? null : <div className="fc-empty"><span className="sd-spinner" /></div>
          ) : !templates.length ? (
            <div className="fc-empty">{t('templates.managerEmpty')}</div>
          ) : (
            templates.map((template, index) => (
              <div key={template.id} className={`fc-folder${template.hidden_at ? ' fc-retired' : ''}`} style={{ ['--i' as string]: index } as React.CSSProperties}>
                <span className="fc-icon">
                  <Ionicons name={template.kind === 'checklist' ? 'list' : 'document-text'} size={20} color="currentColor" />
                </span>
                <div className="fc-text">
                  <strong className="sd-sb">{template.title}</strong>
                  {template.description ? <span>{template.description}</span> : null}
                  <div className="fc-chips">
                    <span className="fc-kind sd-sb">{template.kind === 'checklist' ? t('templates.kindChecklist') : t('templates.kindDocument')}</span>
                    <span className="fc-kind sd-sb">{contentLine(template)}</span>
                    <span className={`fc-kind sd-sb${template.companies ? ' fc-in' : ''}`}>
                      {template.companies === 1 ? t('templates.usedByOne') : t('templates.usedBy', { count: template.companies })}
                    </span>
                    {template.hidden_at ? <span className="fc-kind sd-sb">{t('templates.hidden')}</span> : null}
                  </div>
                </div>
                <div className="fc-tools">
                  <button type="button" className="fc-tool" onClick={() => move(index, -1)} disabled={index === 0 || !!busy} aria-label={t('folders.moveUp')}>
                    <Ionicons name="arrow-up" size={18} color="currentColor" />
                  </button>
                  <button type="button" className="fc-tool" onClick={() => move(index, 1)} disabled={index === templates.length - 1 || !!busy} aria-label={t('folders.moveDown')}>
                    <Ionicons name="arrow-down" size={18} color="currentColor" />
                  </button>
                  <button type="button" className="fc-tool" onClick={() => setEditing(template)} disabled={!!busy} aria-label={t('common.edit')} title={t('common.edit')}>
                    <Ionicons name="create-outline" size={18} color="currentColor" />
                  </button>
                  <button
                    type="button"
                    className="fc-tool"
                    onClick={() => void run(`hide:${template.id}`, () => setFormTemplateHidden(template.id, !template.hidden_at), t('templates.saveFailed'))}
                    disabled={!!busy}
                    aria-label={template.hidden_at ? t('templates.show') : t('templates.hide')}
                    title={template.hidden_at ? t('templates.show') : t('templates.hide')}
                  >
                    {busy === `hide:${template.id}` ? <span className="sd-spinner" /> : <Ionicons name={template.hidden_at ? 'eye-outline' : 'eye-off-outline'} size={18} color="currentColor" />}
                  </button>
                  <button type="button" className="fc-tool fc-danger" onClick={() => setConfirmDelete(template)} disabled={!!busy} aria-label={t('common.deleteAction')} title={t('common.deleteAction')}>
                    <Ionicons name="trash-outline" size={18} color="currentColor" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Sheet>
      {confirmDelete ? (
        <ConfirmAlert
          title={t('templates.deleteQuestion', { title: confirmDelete.title })}
          message={confirmDelete.companies ? t('templates.deleteWarningUsed', { count: confirmDelete.companies }) : t('templates.deleteWarning')}
          cancelLabel={t('common.cancel')}
          confirmLabel={t('common.deleteAction')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
        />
      ) : null}
    </>
  );
}
