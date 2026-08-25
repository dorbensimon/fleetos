jest.mock('../supabase', () => ({
  supabase: {
    storage: { from: jest.fn() },
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    base64: jest.fn().mockResolvedValue('ZmFrZQ=='),
  })),
}));

jest.mock('base64-arraybuffer', () => ({
  decode: jest.fn(() => new ArrayBuffer(3)),
}));

import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { pickAndUploadLogo } from '../uploadLogo';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickAndUploadLogo', () => {
  it('throws a Hebrew error when media library permission is denied', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });

    await expect(pickAndUploadLogo()).rejects.toThrow('נדרשת הרשאת גישה לתמונות כדי להעלות לוגו');
  });

  it('returns null when the user cancels the picker', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });

    const result = await pickAndUploadLogo();
    expect(result).toBeNull();
  });

  it('uploads to the company-logos bucket and returns the public URL', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://logo.png', mimeType: 'image/png' }],
    });
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/logo.png' } });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, getPublicUrl });

    const result = await pickAndUploadLogo();

    expect(result).toBe('https://cdn/logo.png');
    expect(supabase.storage.from).toHaveBeenCalledWith('company-logos');
    const [fileName, bytes, options] = upload.mock.calls[0];
    expect(fileName).toMatch(/^\d+-[a-z0-9]+\.png$/);
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(options).toEqual({ contentType: 'image/png', upsert: false });
  });

  it('propagates a storage upload error', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://logo.png', mimeType: 'image/png' }],
    });
    const upload = jest.fn().mockResolvedValue({ error: { message: 'quota exceeded' } });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, getPublicUrl: jest.fn() });

    await expect(pickAndUploadLogo()).rejects.toEqual({ message: 'quota exceeded' });
  });
});
