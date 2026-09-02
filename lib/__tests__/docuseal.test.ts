jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    base64: jest.fn().mockResolvedValue(uri.includes('image') ? 'aW1hZ2U=' : 'cGRm'),
  })),
  Paths: { cache: 'file://cache' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('base64-arraybuffer', () => ({ decode: jest.fn(() => new ArrayBuffer(3)) }));
jest.mock('../supabase', () => ({
  supabase: {
    storage: { from: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('react-native', () => ({
  Image: {
    getSize: jest.fn((uri: string, success: (width: number, height: number) => void) => {
      success(uri.includes('image') ? 1200 : 595, uri.includes('image') ? 1800 : 842);
    }),
  },
}));

import * as Print from 'expo-print';
import { File } from 'expo-file-system';
import { Image } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../supabase';
import { createTemplateBuilderSession } from '../docuseal';

const mockUpload = jest.fn();
const mockRemove = jest.fn();

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Minimal but structurally valid JPEG: SOI, an APP0/JFIF segment, an SOF0 segment carrying the real
 * dimensions, EOI. Enough for a byte-level dimension parser to read, without needing actual pixel data. */
function buildJpegBytes(width: number, height: number): Uint8Array {
  const app0Payload = [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const app0 = [0xff, 0xe0, ...u16(2 + app0Payload.length), ...app0Payload];
  const sofPayload = [0x08, ...u16(height), ...u16(width), 0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sof = [0xff, 0xc0, ...u16(2 + sofPayload.length), ...sofPayload];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}

/** Minimal PNG: signature + IHDR chunk carrying the real dimensions. */
function buildPngBytes(width: number, height: number): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const length = [0, 0, 0, 13];
  const type = [0x49, 0x48, 0x44, 0x52];
  const rest = [8, 6, 0, 0, 0];
  return new Uint8Array([...signature, ...length, ...type, ...u32(width), ...u32(height), ...rest]);
}

describe('DocuSeal image templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file://document.pdf', numberOfPages: 1 });
    mockUpload.mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload: mockUpload, remove: mockRemove });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { templateId: 'template-1', token: 'jwt', host: 'cdn.docuseal.com' },
      error: null,
    });
  });

  it('keeps an uploaded image at its original size inside the generated PDF', async () => {
    await createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'file://image.jpg',
      name: 'scan.jpg',
      mimeType: 'image/jpeg',
    });

    expect(Print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({
      width: 1200,
      height: 1800,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      html: expect.stringContaining('object-fit: fill'),
    }));
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/\/scan\.pdf$/),
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    );
  });

  it('does not upload an image conversion that unexpectedly spans pages', async () => {
    (Print.printToFileAsync as jest.Mock).mockResolvedValueOnce({ uri: 'file://document.pdf', numberOfPages: 2 });

    await expect(createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'file://image.jpg',
      name: 'scan.jpg',
      mimeType: 'image/jpeg',
    })).rejects.toThrow('לא ניתן להתאים את התמונה לעמוד יחיד');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('uploads an existing PDF without converting it again', async () => {
    await createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'blob://original.pdf',
      name: 'original.pdf',
      mimeType: 'application/pdf',
      base64: 'data:application/pdf;base64,cGRm',
    });

    expect(Print.printToFileAsync).not.toHaveBeenCalled();
    expect(File).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/\/original\.pdf$/),
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    );
  });

  it('sanitizes PDF file names before uploading to storage', async () => {
    await createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'blob://hebrew.pdf',
      name: 'אישור/מסירה final.pdf',
      mimeType: 'application/pdf',
      base64: 'data:application/pdf;base64,cGRm',
    });

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/\/final\.pdf$/),
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    );
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'create-template-builder-session',
      expect.objectContaining({
        body: expect.objectContaining({
          fileName: 'אישור/מסירה final.pdf',
        }),
      })
    );
  });
});

describe('DocuSeal image dimension parsing (bug #12 — content:// URIs from expo-document-picker)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file://document.pdf', numberOfPages: 1 });
    mockUpload.mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload: mockUpload, remove: mockRemove });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { templateId: 'template-1', token: 'jwt', host: 'cdn.docuseal.com' },
      error: null,
    });
  });

  it('reads JPEG dimensions from the file bytes instead of calling Image.getSize, so a Files-app content:// uri works', async () => {
    (decode as jest.Mock).mockImplementation(() => buildJpegBytes(2480, 3508).buffer);

    await createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'content://com.android.providers.downloads.documents/document/17',
      name: 'scan.jpg',
      mimeType: 'image/jpeg',
    });

    expect(Image.getSize).not.toHaveBeenCalled();
    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ width: 2480, height: 3508 })
    );
  });

  it('reads PNG dimensions from the file bytes instead of calling Image.getSize', async () => {
    (decode as jest.Mock).mockImplementation(() => buildPngBytes(1000, 1414).buffer);

    await createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'content://com.android.providers.downloads.documents/document/18',
      name: 'scan.png',
      mimeType: 'image/png',
    });

    expect(Image.getSize).not.toHaveBeenCalled();
    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1000, height: 1414 })
    );
  });

  it('falls back to Image.getSize for image formats it cannot parse from bytes (e.g. HEIC)', async () => {
    (decode as jest.Mock).mockImplementation(() => new ArrayBuffer(10));

    await createTemplateBuilderSession('company-1', 'טופס', {
      uri: 'content://com.android.providers.downloads.documents/document/19',
      name: 'photo.heic',
      mimeType: 'image/heic',
    });

    expect(Image.getSize).toHaveBeenCalled();
  });
});
