jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    base64: jest.fn().mockResolvedValue('ZmFrZQ=='),
    write: jest.fn(),
    uri: 'mock://written-file',
  })),
  Paths: { cache: 'mock-cache-dir' },
}));

jest.mock('base64-arraybuffer', () => ({
  decode: jest.fn(() => new ArrayBuffer(3)),
}));

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { supabase } from '../supabase';
import {
  pickImage,
  captureImage,
  pickFile,
  uploadDocument,
  listDocuments,
  deleteDocument,
  getDocumentUrl,
  downloadDocument,
} from '../documents';
import { DocumentRow } from '../adminApi';

function chain(result: { data: any; error: any }) {
  const builder: any = {};
  ['select', 'eq', 'neq', 'in', 'is', 'order', 'insert', 'update', 'delete', 'upsert'].forEach((m) => {
    builder[m] = jest.fn(() => builder);
  });
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const doc: DocumentRow = {
  id: 'doc1',
  company_id: 'c1',
  owner_type: 'driver',
  owner_id: 'd1',
  compliance_item_id: null,
  category: 'license',
  title: 'רישיון נהיגה',
  file_path: 'c1/driver/d1/123-abc.pdf',
  file_name: 'license.pdf',
  mime_type: 'application/pdf',
  file_size: 3,
  expiry_date: null,
  created_at: '2026-01-01',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickImage', () => {
  it('throws a Hebrew error when media library permission is denied', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });

    await expect(pickImage()).rejects.toThrow('נדרשת הרשאת גישה לתמונות');
  });

  it('returns null when the user cancels the picker', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });

    const result = await pickImage();
    expect(result).toBeNull();
  });

  it('returns the picked asset with sensible fallbacks for name/mimeType', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://scan.png', fileName: null, mimeType: null }],
    });

    const result = await pickImage();
    expect(result).toEqual({
      uri: 'file://scan.png',
      name: expect.stringMatching(/^scan-\d+\.png$/),
      mimeType: 'image/jpeg',
    });
  });
});

describe('captureImage', () => {
  it('throws a Hebrew error when camera permission is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });

    await expect(captureImage()).rejects.toThrow('נדרשת הרשאת גישה למצלמה');
  });
});

describe('pickFile', () => {
  it('returns null when the user cancels the picker', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });

    const result = await pickFile();
    expect(result).toBeNull();
  });

  it('falls back to a generated name and default mime type when missing', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://x', name: null, mimeType: null }],
    });

    const result = await pickFile();
    expect(result?.mimeType).toBe('application/octet-stream');
    expect(result?.name).toMatch(/^file-\d+$/);
  });

  it('keeps browser base64 data so a picked PDF can be uploaded', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: 'blob://document',
        name: 'document.pdf',
        mimeType: 'application/pdf',
        base64: 'cGRm',
      }],
    });

    const result = await pickFile();

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ base64: true }));
    expect(result).toEqual(expect.objectContaining({ base64: 'cGRm' }));
  });
});

describe('uploadDocument', () => {
  const params = {
    companyId: 'c1',
    ownerType: 'driver' as const,
    ownerId: 'd1',
    category: 'license',
    title: 'רישיון נהיגה',
    file: { uri: 'file://scan.pdf', name: 'scan.pdf', mimeType: 'application/pdf' },
  };

  it('uploads the file bytes then inserts the documents row, returning it', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: doc, error: null }));

    const result = await uploadDocument(params);

    expect(result).toEqual(doc);
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, bytes, options] = upload.mock.calls[0];
    expect(path).toMatch(/^c1\/driver\/d1\/\d+-[a-z0-9]+\.pdf$/);
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false });
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(remove).not.toHaveBeenCalled();
  });

  it('uploads browser PDF base64 without reading a blob URI through FileSystem', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: doc, error: null }));

    await uploadDocument({
      ...params,
      file: {
        uri: 'blob://document',
        name: 'scan.pdf',
        mimeType: 'application/pdf',
        base64: 'data:application/pdf;base64,cGRm',
      },
    });

    expect(File).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('throws and never attempts the DB insert when the storage upload fails', async () => {
    const upload = jest.fn().mockResolvedValue({ error: { message: 'storage full' } });
    const remove = jest.fn();
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });

    await expect(uploadDocument(params)).rejects.toEqual({ message: 'storage full' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('removes the orphaned storage file when the DB insert fails', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { message: 'insert failed' } }));

    await expect(uploadDocument(params)).rejects.toEqual({ message: 'insert failed' });
    expect(remove).toHaveBeenCalledTimes(1);
    const [removedPaths] = remove.mock.calls[0];
    expect(removedPaths).toHaveLength(1);
    expect(removedPaths[0]).toMatch(/^c1\/driver\/d1\//);
  });
});

describe('listDocuments', () => {
  it('does not filter by category when none is given', async () => {
    const builder = chain({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(builder);

    await listDocuments('driver', 'd1');

    expect(builder.eq).not.toHaveBeenCalledWith('category', expect.anything());
  });

  it('filters by category when provided', async () => {
    const builder = chain({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(builder);

    await listDocuments('driver', 'd1', 'license');

    expect(builder.eq).toHaveBeenCalledWith('category', 'license');
  });
});

describe('deleteDocument', () => {
  it('deletes the row then removes the underlying storage file', async () => {
    const rowBuilder = chain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(rowBuilder);
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ remove });

    await deleteDocument(doc);

    expect(rowBuilder.delete).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([doc.file_path]);
  });

  it('throws and skips storage removal when the row delete fails', async () => {
    const rowBuilder = chain({ data: null, error: { message: 'delete failed' } });
    (supabase.from as jest.Mock).mockReturnValueOnce(rowBuilder);
    const remove = jest.fn();
    (supabase.storage.from as jest.Mock).mockReturnValue({ remove });

    await expect(deleteDocument(doc)).rejects.toEqual({ message: 'delete failed' });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('getDocumentUrl', () => {
  it('returns the signed URL on success', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: 'https://x/y' }, error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ createSignedUrl });

    const result = await getDocumentUrl(doc);
    expect(result).toBe('https://x/y');
  });

  it('returns null instead of throwing when signing fails', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    (supabase.storage.from as jest.Mock).mockReturnValue({ createSignedUrl });

    const result = await getDocumentUrl(doc);
    expect(result).toBeNull();
  });
});

describe('downloadDocument', () => {
  it('throws a Hebrew error when no signed URL can be obtained', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    (supabase.storage.from as jest.Mock).mockReturnValue({ createSignedUrl });

    await expect(downloadDocument(doc)).rejects.toThrow('לא ניתן להוריד את המסמך כרגע');
  });
});
