// מפעיל את האפליקציה
import { createElement, useEffect, useState, type ComponentType } from 'react';
import { Platform, View } from 'react-native';
import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react';
import { loadStoredLanguage } from './lib/i18n';
import { BrandLoader } from './components/ui/BrandLoader';

// שולח שגיאות ל-Sentry (באתר בלבד, כשיש כתובת)
// Uncaught errors and rejected promises go to Sentry. No personal data:
// sendDefaultPii stays off and there is no session replay.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (Platform.OS === 'web' && sentryDsn) {
  Sentry.init({ dsn: sentryDsn, environment: __DEV__ ? 'development' : 'production' });
}

// טוען את השפה ואז את האפליקציה
// The saved language is read before the app's screens are loaded, so every
// screen — including strings and styles its modules build at load time —
// starts in the user's language. On web the read is synchronous; on native
// it comes from async storage.
function Root() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    void loadStoredLanguage()
      .catch(() => undefined)
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only after the language is known
      .then(() => setApp(() => require('./App').default as ComponentType));
  }, []);
  if (App) return createElement(App);
  // Same frame as App's boot screen and the pre-JS splash in public/index.html.
  return createElement(
    View,
    { style: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' } },
    createElement(BrandLoader, { size: 83 }),
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
