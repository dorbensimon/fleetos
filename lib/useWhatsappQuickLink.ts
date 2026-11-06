// כפתור "שלח בוואטסאפ": יוצר קישור ופותח את הוואטסאפ של המנהל
import { useState } from 'react';
import { Platform } from 'react-native';
import { openWhatsapp, whatsappNumber } from '../components/companyDetail/CompanyDetailSheets';
import { useToast } from '../components/ui';
import { prepareQuickLink, type QuickLinkRequest } from './driverQuickLinks';
import { t } from './i18n';
import { isPhoneBrowser } from './openAppLink';

export function useWhatsappQuickLink() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  /** `request` may be a step that runs first (e.g. sending the form), inside the same click. */
  const send = (request: QuickLinkRequest | (() => Promise<QuickLinkRequest>), phoneHint?: string | null) =>
    sendPrepared(async () => prepareQuickLink(typeof request === 'function' ? await request() : request), phoneHint);

  /** Same flow, with the phone and message built by the caller (e.g. several links in one message). */
  const sendPrepared = async (prepare: () => Promise<{ phone: string; message: string }>, phoneHint?: string | null) => {
    if (busy) return;
    if (phoneHint !== undefined && !whatsappNumber(phoneHint)) {
      showToast(t('quickLink.noPhone'), 'warning');
      return;
    }
    // On a phone browser, WhatsApp opens straight from this page once the
    // link is ready (no blank tab). On a computer a browser allows a new tab
    // only during the click itself, so the tab opens now and is filled later.
    const phoneWeb = isPhoneBrowser();
    const tab = Platform.OS === 'web' && !phoneWeb ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const { phone, message } = await prepare();
      const number = whatsappNumber(phone);
      if (!number) {
        tab?.close();
        showToast(t('quickLink.noPhone'), 'warning');
        return;
      }
      if (phoneWeb) window.location.href = `whatsapp://send?phone=${number}&text=${encodeURIComponent(message)}`;
      else if (tab) tab.location.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
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

  return { send, sendPrepared, busy };
}
