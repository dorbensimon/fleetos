// כפתור "שלח בוואטסאפ": יוצר קישור ופותח את הוואטסאפ של המנהל
import { useState } from 'react';
import { Platform } from 'react-native';
import { openWhatsapp, whatsappNumber } from '../components/companyDetail/CompanyDetailSheets';
import { useToast } from '../components/ui';
import { prepareQuickLink, type QuickLinkRequest } from './driverQuickLinks';
import { t } from './i18n';

export function useWhatsappQuickLink() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  /** `request` may be a step that runs first (e.g. sending the form), inside the same click. */
  const send = async (request: QuickLinkRequest | (() => Promise<QuickLinkRequest>), phoneHint?: string | null) => {
    if (busy) return;
    if (phoneHint !== undefined && !whatsappNumber(phoneHint)) {
      showToast(t('quickLink.noPhone'), 'warning');
      return;
    }
    // A browser allows a new tab only during the click itself, and the link
    // comes back from the server after it; open the tab now, fill it later.
    const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const { phone, message } = await prepareQuickLink(typeof request === 'function' ? await request() : request);
      const number = whatsappNumber(phone);
      if (!number) {
        tab?.close();
        showToast(t('quickLink.noPhone'), 'warning');
        return;
      }
      if (tab) tab.location.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
      else if (Platform.OS !== 'web') openWhatsapp(number, message);
      else {
        // The browser blocked the new tab: hand the message over to paste.
        await navigator.clipboard?.writeText(message).catch(() => undefined);
        showToast(t('quickLink.copied'), 'warning');
      }
    } catch (error) {
      tab?.close();
      showToast(error instanceof Error ? error.message : t('quickLink.failed'), 'warning');
    } finally {
      setBusy(false);
    }
  };

  return { send, busy };
}
