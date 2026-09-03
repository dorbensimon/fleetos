import { corsHeaders } from '../_shared/cors.ts';
import { signDocuSealJwt, safeDocusealHost } from '../_shared/docuseal.ts';
import { isSigningTemplateSourcePath } from '../_shared/signingPaths.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

type CompanyLogo = {
  bytes: ArrayBuffer;
  contentType: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function companyLogoPath(logoUrl: string | null, supabaseUrl: string): string | null {
  if (!logoUrl) return null;
  try {
    const parsed = new URL(logoUrl);
    if (parsed.origin !== new URL(supabaseUrl).origin) return null;
    const marker = '/storage/v1/object/public/company-logos/';
    if (!parsed.pathname.startsWith(marker)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(marker.length));
    return path && !path.includes('..') ? path : null;
  } catch {
    return null;
  }
}

async function logoAsPng(logo: CompanyLogo): Promise<ArrayBuffer | null> {
  if (logo.contentType !== 'image/webp') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([logo.bytes], { type: logo.contentType }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    // Deno's Edge type declarations currently narrow getContext('2d') too
    // aggressively, even though the runtime exposes the standard 2D API.
    const context = canvas.getContext('2d') as unknown as {
      drawImage: (image: ImageBitmap, dx: number, dy: number) => void;
    } | null;
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
  } catch {
    return null;
  }
}

/** Adds the company logo and a fixed verification mark before DocuSeal signs the PDF. */
async function prepareSigningPdf(pdfBytes: ArrayBuffer, companyLogo: CompanyLogo | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdf.getPages();
  if (!pages.length) throw new Error('המסמך אינו מכיל עמודים');

  if (companyLogo) {
    const contentType = companyLogo.contentType.toLowerCase();
    let image = null;
    if (contentType === 'image/png') image = await pdf.embedPng(companyLogo.bytes);
    else if (contentType === 'image/jpeg' || contentType === 'image/jpg') image = await pdf.embedJpg(companyLogo.bytes);
    else if (contentType === 'image/webp') {
      const pngBytes = await logoAsPng(companyLogo);
      if (pngBytes) image = await pdf.embedPng(pngBytes);
    }
    if (!image) throw new Error('unsupported company logo');

    // The logo belongs to the company whose manager is creating this template.
    // It is placed in a small, fixed header on the first page and becomes part
    // of the immutable PDF that DocuSeal signs.
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    const maxWidth = Math.min(132, width - 44);
    const maxHeight = Math.min(44, height - 44);
    const scaled = image.scaleToFit(maxWidth, maxHeight);
    const x = width - scaled.width - 22;
    const y = height - scaled.height - 22;
    firstPage.drawRectangle({
      x: x - 4,
      y: y - 4,
      width: scaled.width + 8,
      height: scaled.height + 8,
      color: rgb(1, 1, 1),
      opacity: 0.94,
    });
    firstPage.drawImage(image, { x, y, width: scaled.width, height: scaled.height });
  }

  const page = pages[pages.length - 1];
  const { width } = page.getSize();
  const margin = 18;
  const badgeWidth = Math.min(184, width - margin * 2);
  const badgeHeight = 30;
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = 'DocuSeal Digital Signature';

  page.drawRectangle({
    x: margin,
    y: margin,
    width: badgeWidth,
    height: badgeHeight,
    color: rgb(0.94, 0.99, 0.96),
    borderColor: rgb(0.18, 0.55, 0.34),
    borderWidth: 1,
    opacity: 0.97,
  });
  page.drawCircle({ x: margin + 15, y: margin + 15, size: 8, color: rgb(0.18, 0.55, 0.34) });
  page.drawLine({ start: { x: margin + 10.5, y: margin + 15 }, end: { x: margin + 13.5, y: margin + 11.5 }, thickness: 1.5, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: margin + 13.5, y: margin + 11.5 }, end: { x: margin + 19.5, y: margin + 18.5 }, thickness: 1.5, color: rgb(1, 1, 1) });
  page.drawText(text, { x: margin + 29, y: margin + 10, size: 9, font, color: rgb(0.12, 0.36, 0.22) });

  return pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, title, filePath, fileName } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה ליצור תבנית' }, 403);
    if (typeof title !== 'string' || !title.trim()) return json({ error: 'חסר שם למסמך' }, 400);
    if (!isSigningTemplateSourcePath(companyId, filePath)) {
      return json({ error: 'נתיב המסמך אינו תקין' }, 400);
    }

    const ownerEmail = Deno.env.get('DOCUSEAL_USER_EMAIL');
    if (!ownerEmail) return json({ error: 'חסר DOCUSEAL_USER_EMAIL בהגדרות השרת' }, 503);

    const { data: userData } = await access.adminClient.auth.admin.getUserById(access.callerId);
    const integrationEmail = userData?.user?.email;
    if (!integrationEmail) return json({ error: 'לא נמצאה כתובת המייל של המנהל' }, 400);

    const { data: company, error: companyError } = await access.adminClient
      .from('companies')
      .select('logo_url')
      .eq('id', companyId)
      .single();
    if (companyError || !company) return json({ error: 'פרטי החברה לא נמצאו' }, 404);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) return json({ error: 'הגדרות השרת חסרות' }, 500);
    const logoPath = companyLogoPath(company.logo_url, supabaseUrl);
    if (company.logo_url && !logoPath) {
      return json({ error: 'קובץ הלוגו של החברה אינו תקין. יש להעלות אותו מחדש מתוך פרטי החברה.' }, 400);
    }

    let companyLogo: CompanyLogo | null = null;
    if (logoPath) {
      const { data: logoBlob, error: logoError } = await access.adminClient.storage.from('company-logos').download(logoPath);
      if (logoError || !logoBlob) return json({ error: 'לא ניתן לקרוא את לוגו החברה. נסה להעלות אותו מחדש.' }, 502);
      const contentType = logoBlob.type.toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(contentType)) {
        return json({ error: 'לוגו החברה צריך להיות PNG, JPG או WEBP כדי להופיע במסמך החתימה.' }, 400);
      }
      companyLogo = { bytes: await logoBlob.arrayBuffer(), contentType };
    }

    const { data: signed, error: signedError } = await access.adminClient.storage
      .from('documents')
      .createSignedUrl(filePath, 60 * 30);
    if (signedError || !signed?.signedUrl) return json({ error: 'לא ניתן לקרוא את המסמך שהועלה' }, 400);

    const sourceResponse = await fetch(signed.signedUrl);
    if (!sourceResponse.ok) return json({ error: 'לא ניתן להוריד את המסמך לצורך הטבעת החותמת' }, 502);
    let stampedPdf: Uint8Array;
    try {
      stampedPdf = await prepareSigningPdf(await sourceResponse.arrayBuffer(), companyLogo);
    } catch (error) {
      if (error instanceof Error && error.message === 'unsupported company logo') {
        return json({ error: 'לא הצלחנו להכין את לוגו החברה למסמך. יש להעלות PNG, JPG או WEBP.' }, 400);
      }
      throw error;
    }
    const { error: stampUploadError } = await access.adminClient.storage
      .from('documents')
      .upload(filePath, stampedPdf, { contentType: 'application/pdf', upsert: true });
    if (stampUploadError) return json({ error: 'הטבעת חותמת החתימה במסמך נכשלה' }, 500);

    const { data: stamped, error: stampedUrlError } = await access.adminClient.storage
      .from('documents')
      .createSignedUrl(filePath, 60 * 30);
    if (stampedUrlError || !stamped?.signedUrl) return json({ error: 'לא ניתן לקרוא את המסמך לאחר הטבעת החותמת' }, 500);

    const { data: template, error: insertError } = await access.adminClient
      .from('signing_templates')
      .insert({
        company_id: companyId,
        created_by: access.callerId,
        title: title.trim().slice(0, 200),
        source_file_path: filePath,
        source_file_name: typeof fileName === 'string' ? fileName.slice(0, 255) : null,
      })
      .select('id, title')
      .single();
    if (insertError || !template) return json({ error: 'שמירת טיוטת המסמך נכשלה' }, 500);

    const token = await signDocuSealJwt({
      user_email: ownerEmail,
      integration_email: integrationEmail,
      external_id: template.id,
      name: template.title,
      folder_name: `FleetOS-${companyId}`,
      document_urls: [stamped.signedUrl],
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    return json({ templateId: template.id, token, host: safeDocusealHost() });
  } catch (error) {
    console.error('create-template-builder-session failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'יצירת עורך המסמך נכשלה' }, 500);
  }
});
