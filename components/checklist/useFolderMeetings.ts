import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSigningTemplateSourceUrl, type SignatureRequest, type SigningTemplate } from '../../lib/docuseal';
import { isChecklistTemplate, listDriverMeetings, type MeetingRow } from '../../lib/checklistForms';

/**
 * A driver's meetings on one "רשימת סעיפים" folder: drafts still being
 * filled, and which signing request belongs to which meeting (so a request
 * can offer "הנהג חותם עכשיו", or show that it was cancelled).
 */
export function useFolderMeetings(driverId: string | null | undefined, template: SigningTemplate | null | undefined, requests: SignatureRequest[] = []) {
  const checklist = isChecklistTemplate(template);
  // A deleted form's signed meetings still need their meeting, so they can be
  // deleted the meeting's way.
  const hasRequests = requests.length > 0;
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    if ((!checklist && !hasRequests) || !driverId) {
      setMeetings([]);
      return;
    }
    const current = ++generation.current;
    try {
      const rows = await listDriverMeetings(driverId);
      if (current === generation.current) setMeetings(rows);
    } catch {
      // The folder still shows its signed documents; only drafts are missing.
    }
  }, [checklist, hasRequests, driverId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const requestIds = useMemo(() => new Set(requests.map((r) => r.id)), [requests]);
  const drafts = useMemo(
    () => meetings.filter((m) => m.status === 'draft' && (m.template_id === template?.id || (!m.template_id && m.title === template?.title))),
    [meetings, template?.id, template?.title],
  );
  const byRequest = useMemo(() => {
    const map = new Map<string, MeetingRow>();
    for (const m of meetings) if (m.signature_request_id && requestIds.has(m.signature_request_id)) map.set(m.signature_request_id, m);
    return map;
  }, [meetings, requestIds]);

  return { checklist, drafts, byRequest, reload };
}

/** The blank form as a PDF, for "צפייה" on a checklist folder. */
export async function checklistPreviewTarget(template: SigningTemplate, title: string) {
  const src = await getSigningTemplateSourceUrl(template);
  if (!src) throw new Error('לא הצלחנו לפתוח את הטופס. נסו שוב.');
  return { mode: 'document' as const, src, title };
}
