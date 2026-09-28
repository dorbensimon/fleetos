import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyLanguage, getLanguage, onLanguageChange } from '../i18n';
import { resetLanguageSync, setUserLanguage, syncLanguageFromAccount } from '../i18n/userLanguage';
import { supabase } from '../supabase';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock') // eslint-disable-line @typescript-eslint/no-require-imports
);
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), getUser: jest.fn(), updateUser: jest.fn() } },
}));

type AuthMock = Record<'getSession' | 'getUser' | 'updateUser', jest.Mock>;
const auth = supabase.auth as unknown as AuthMock;
const user = (id: string, language?: string) => ({ id, user_metadata: language ? { language } : {} });
const onServer = (u: ReturnType<typeof user> | null) =>
  auth.getUser.mockResolvedValue(u ? { data: { user: u }, error: null } : { data: { user: null }, error: new Error('offline') });
const signedInAs = (u: ReturnType<typeof user>) => auth.getSession.mockResolvedValue({ data: { session: { user: u } }, error: null });
const accountSaves = (ok: boolean) => auth.updateUser.mockResolvedValue({ data: {}, error: ok ? null : new Error('offline') });

beforeEach(async () => {
  jest.clearAllMocks();
  resetLanguageSync();
  await AsyncStorage.clear();
  await applyLanguage('he');
  accountSaves(true);
});

describe('the account language', () => {
  it('is taken from the server, which may have it from another device', async () => {
    onServer(user('u1', 'en'));
    await syncLanguageFromAccount(user('u1', 'he') as never);
    expect(getLanguage()).toBe('en');
  });

  it('is checked once per signed-in user, and again after signing out', async () => {
    onServer(user('u1', 'he'));
    await syncLanguageFromAccount(user('u1') as never);
    await syncLanguageFromAccount(user('u1') as never);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    resetLanguageSync();
    await syncLanguageFromAccount(user('u1') as never);
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });

  it('offline, leaves this device on the language it has', async () => {
    await applyLanguage('ru');
    onServer(null);
    await syncLanguageFromAccount(user('u1', 'he') as never);
    expect(getLanguage()).toBe('ru');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("when never chosen, is saved from this device's language", async () => {
    await applyLanguage('ar');
    onServer(user('u1'));
    await syncLanguageFromAccount(user('u1') as never);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { language: 'ar' } });
    expect(getLanguage()).toBe('ar');
  });
});

describe('picking a language', () => {
  it('saves it on the account and switches', async () => {
    signedInAs(user('u1', 'he'));
    await setUserLanguage('en');
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { language: 'en' } });
    expect(getLanguage()).toBe('en');
  });

  it('that the account did not get is sent later, never taken back', async () => {
    signedInAs(user('u1', 'he'));
    accountSaves(false);
    await setUserLanguage('en');
    expect(getLanguage()).toBe('en');

    // Next start: the account still says Hebrew, but this device's newer choice wins and is sent.
    accountSaves(true);
    onServer(user('u1', 'he'));
    await syncLanguageFromAccount(user('u1', 'he') as never);
    expect(getLanguage()).toBe('en');
    expect(auth.updateUser).toHaveBeenLastCalledWith({ data: { language: 'en' } });

    // Once sent, the account leads again.
    resetLanguageSync();
    onServer(user('u1', 'ru'));
    await syncLanguageFromAccount(user('u1') as never);
    expect(getLanguage()).toBe('ru');
  });

  it("by one user is not sent to another user's account", async () => {
    signedInAs(user('u1', 'he'));
    accountSaves(false);
    await setUserLanguage('en');

    accountSaves(true);
    resetLanguageSync();
    onServer(user('u2', 'ru'));
    await syncLanguageFromAccount(user('u2') as never);
    expect(getLanguage()).toBe('ru');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });
});

describe('a language change', () => {
  it('tells whether the choice was stored on the device', async () => {
    const seen: [string, boolean][] = [];
    const stop = onLanguageChange((language, saved) => seen.push([language, saved]));
    await applyLanguage('en');
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await applyLanguage('ar');
    stop();
    expect(seen).toEqual([['en', true], ['ar', false]]);
  });
});
