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
import { supabase } from '../supabase';
import { createTemplateBuilderSession } from '../docuseal';

const mockUpload = jest.fn();
const mockRemove = jest.fn();

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
