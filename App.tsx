import { useEffect, useState } from 'react';
import { View, AppState, Platform } from 'react-native';
import { BrandLoader } from './components/ui/BrandLoader';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  createNavigationContainerRef,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  useFonts,
  Assistant_400Regular,
  Assistant_500Medium,
  Assistant_600SemiBold,
  Assistant_700Bold,
} from '@expo-google-fonts/assistant';
import {
  Heebo_400Regular,
  Heebo_500Medium,
  Heebo_600SemiBold,
  Heebo_700Bold,
  Heebo_800ExtraBold,
} from '@expo-google-fonts/heebo';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { syncWebThemeColor } from './lib/webThemeColor';
import LoginScreen from './screens/LoginScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import OwnerHomeScreen from './screens/OwnerHomeScreen';
import DriverHomeScreen from './screens/DriverHomeScreen';
import CompanyDetailScreen from './screens/CompanyDetailScreen';
import NotificationPreferencesScreen from './screens/NotificationPreferencesScreen';
import FleetScreen from './screens/admin/FleetScreen';
import VehicleDetailScreen from './screens/admin/VehicleDetailScreen';
import VehicleFormScreen from './screens/admin/VehicleFormScreen';
import DriverDetailScreen from './screens/admin/DriverDetailScreen';
import DriverFormScreen from './screens/admin/DriverFormScreen';
import DriverArchiveScreen from './screens/admin/DriverArchiveScreen';
import DepartmentsScreen from './screens/admin/DepartmentsScreen';
import CompanyDocumentsScreen from './screens/admin/CompanyDocumentsScreen';
import AttentionScreen from './screens/admin/AttentionScreen';
import ReportsScreen from './screens/admin/ReportsScreen';
import AdminProfileScreen from './screens/admin/AdminProfileScreen';
import CompanySettingsScreen from './screens/admin/CompanySettingsScreen';
import LegalScreen from './screens/LegalScreen';
import { LegalConsentGate } from './components/legal/LegalConsentGate';
import { LEGAL_DOCUMENTS, isLegalDocId } from './lib/legal/documents';
import SignedDocumentsScreen from './screens/admin/SignedDocumentsScreen';
import ChecklistMeetingScreen from './screens/admin/ChecklistMeetingScreen';
import SafetyInspectionsScreen from './screens/admin/SafetyInspectionsScreen';
import SafetyInspectionScreen from './screens/admin/SafetyInspectionScreen';
import SafetyInspectionSettingsScreen from './screens/admin/SafetyInspectionSettingsScreen';
import NotificationsScreen from './screens/admin/NotificationsScreen';
import AdminDocumentSigningScreen from './screens/admin/AdminDocumentSigningScreen';
import DocusealWebViewScreen from './screens/DocusealWebViewScreen';
import DocumentCategoryScreen from './screens/admin/DocumentCategoryScreen';
import DriverLicenseDocumentsScreen from './screens/admin/DriverLicenseDocumentsScreen';
import DriverPersonalDetailsScreen from './screens/admin/DriverPersonalDetailsScreen';
import DriverVehicleScreen from './screens/driver/DriverVehicleScreen';
import DriverDocumentsScreen from './screens/driver/DriverDocumentsScreen';
import DriverSigningDocumentsScreen from './screens/driver/DriverSigningDocumentsScreen';
import DriverSignDocumentScreen from './screens/driver/DriverSignDocumentScreen';
import DriverProfileScreen from './screens/driver/DriverProfileScreen';
import DriverOdometerScreen from './screens/driver/DriverOdometerScreen';
import DriverAttentionScreen from './screens/driver/DriverAttentionScreen';
import MenuScreen from './screens/MenuScreen';
import SystemSettingsScreen from './screens/SystemSettingsScreen';
import { RootStackParamList } from './navigation/types';
import { refreshBackFallback } from './lib/refreshSafeBack';
import { supabase } from './lib/supabase';
import { resolveRouteForUser, ROLE_ROUTES } from './lib/session';
import { canOpenRoute, isPublicRoute } from './lib/routeAccess';
import { CompanyProvider, useCompany } from './lib/CompanyContext';
import { ToastProvider } from './components/ui';
import { MobileTabBar, TabBarProvider } from './components/driverKit/tabBar';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { flushPendingAssignmentOperations } from './lib/adminApi';
import {
  listenForPushNotificationResponses,
  registerForPushNotifications,
  unregisterPushNotifications,
} from './lib/pushNotifications';
import { navigateToNotificationTarget } from './lib/notificationTargets';
import { reloadAppAsync } from 'expo';
import { getLanguage, layoutDirection, onLanguageChange, readFromDevice, storeOnDevice, type Language } from './lib/i18n';
import { resetLanguageSync, syncLanguageFromAccount } from './lib/i18n/userLanguage';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const WEB_NAVIGATION_STATE_KEY = 'fleetos.web-navigation-state';
// Native starts over after a language change and returns to the screen the
// user was on: saved just before the restart, read once as it starts.
const LANGUAGE_RESTART_STATE_KEY = 'fleetos.language-restart-state';

async function takeLanguageRestartState(): Promise<object | undefined> {
  const saved = await readFromDevice(LANGUAGE_RESTART_STATE_KEY);
  if (!saved) return undefined;
  await storeOnDevice(LANGUAGE_RESTART_STATE_KEY, null);
  try {
    const { at, state } = JSON.parse(saved) as { at: number; state: object };
    // Only straight after that restart, never on a later launch.
    return Date.now() - at < 60_000 ? state : undefined;
  } catch {
    return undefined;
  }
}

// Web navigation normally restores from the URL. The development server can
// retain the root URL, though, so also retain the in-app stack for a browser
// refresh from that root. A non-root URL always takes precedence for direct
// links and browser history.
// React Native also defines `window`, without location or sessionStorage, so
// these web-only paths check the platform itself.
const getWebInitialNavigationState = () => {
  if (Platform.OS !== 'web' || window.location.pathname !== '/' || window.location.search) return undefined;
  try {
    const savedState = window.sessionStorage.getItem(WEB_NAVIGATION_STATE_KEY);
    return savedState ? JSON.parse(savedState) : undefined;
  } catch {
    return undefined;
  }
};

// On web this maps every in-app screen to a URL and lets React Navigation
// synchronize its stack with the browser History API. Without it, Safari's
// back button only knows the page that opened the app, not its inner screens.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['fleetos://'],
  config: {
    screens: {
      Login: 'login',
      Legal: 'legal/:doc',
      SetPassword: 'set-password',
      OwnerHome: 'owner',
      AdminHome: 'fleet',
      DriverHome: 'driver',
      CompanyDetail: 'companies/:companyId',
      VehicleDetail: 'vehicles/:vehicleId',
      VehicleForm: 'vehicles/edit/:vehicleId?',
      DriverDetail: 'drivers/:driverId',
      DriverArchive: 'drivers/archive',
      DriverPersonalDetails: 'drivers/:driverId/personal-details',
      DriverForm: 'drivers/edit/:driverId?',
      Departments: 'departments',
      CompanyDocuments: 'company-documents',
      Attention: 'attention',
      Reports: 'reports',
      AdminProfile: 'admin/profile',
      CompanySettings: 'admin/company-settings',
      SignedDocuments: 'signed-documents',
      ChecklistMeeting: 'drivers/:driverId/meeting',
      SafetyInspections: 'safety-inspections',
      SafetyInspectionSettings: 'safety-inspections/settings',
      SafetyInspection: 'vehicles/:vehicleId/safety-inspection',
      Notifications: 'notifications',
      AdminDocumentSigning: 'documents/signing',
      DocusealWebView: 'documents/view',
      NotificationPreferences: 'notification-preferences',
      DocumentCategory: 'documents/:ownerType/:ownerId/:category',
      DriverLicenseDocuments: 'drivers/:driverId/license-documents',
      DriverVehicle: 'my-vehicle',
      DriverDocuments: 'my-documents',
      DriverSigningDocuments: 'my-documents/signing',
      DriverSignDocument: 'my-documents/sign',
      DriverProfile: 'my-profile',
      DriverOdometer: 'my-vehicle/odometer/:vehicleId',
      DriverAttention: 'my-attention',
      Menu: 'menu',
      SystemSettings: 'settings',
    },
  },
};

function legalPageTitle(route: { name: string; params?: object } | undefined): string | null {
  if (route?.name !== 'Legal') return null;
  const doc = (route.params as { doc?: unknown } | undefined)?.doc;
  return isLegalDocId(doc) ? `${LEGAL_DOCUMENTS[doc].title} · icar` : null;
}

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  const [webInitialNavigationState] = useState(getWebInitialNavigationState);
  // The navigation is rebuilt after the first-use consent screen; the stack
  // saved before it (often the login screen) must not come back then.
  const [resumeSavedState, setResumeSavedState] = useState(true);
  const [language, setLanguage] = useState<Language>(getLanguage);
  // Native keeps the screen the user was on when the language changes.
  const [languageNavigationState, setLanguageNavigationState] = useState<object | undefined>();

  const [fontsLoaded] = useFonts({
    Assistant_400Regular,
    Assistant_500Medium,
    Assistant_600SemiBold,
    Assistant_700Bold,
    Heebo_400Regular,
    Heebo_500Medium,
    Heebo_600SemiBold,
    Heebo_700Bold,
    Heebo_800ExtraBold,
    // On web, especially Safari, icon components can render their glyph before
    // their font file is available. Register every icon family used in the app
    // with the same blocking font load as the Hebrew typefaces.
    ...Ionicons.font,
    ...Feather.font,
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const restartState = Platform.OS === 'web' ? undefined : await takeLanguageRestartState();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const userId = data.session?.user.id;

        if (!userId) {
          if (active) setInitialRoute('Login');
          return;
        }

        // The account's language may have changed on another device.
        const [result] = await Promise.all([resolveRouteForUser(userId), syncLanguageFromAccount(data.session?.user)]);
        if (!active) return;
        if (result.ok && restartState) setLanguageNavigationState(restartState);
        setInitialRoute(result.ok ? result.route : 'Login');
      } catch {
        if (active) setInitialRoute('Login');
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const retry = () => { void flushPendingAssignmentOperations().catch(() => undefined); };
    retry();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // The account's saved language follows the user to every device.
      // Deferred: supabase calls made inside this callback would deadlock.
      if (event === 'SIGNED_IN') setTimeout(() => void syncLanguageFromAccount(session?.user), 0);
      if (event === 'SIGNED_OUT') {
        resetLanguageSync();
        void unregisterPushNotifications().catch(() => undefined);
        if (Platform.OS === 'web') {
          try {
            window.sessionStorage.removeItem(WEB_NAVIGATION_STATE_KEY);
          } catch {
            // Storage may be unavailable in private browsing.
          }
        }
        setInitialRoute('Login');
        // A user who signed in during this visit already has 'Login' as the
        // initial route, so the line above changes nothing for them; take
        // every signed-out screen back to the login page directly.
        if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== 'Login') {
          navigationRef.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // A new language starts the app over, since modules build some strings and
  // styles when they load: the web page reloads (the browser restores the page
  // from its URL) and native reloads its JavaScript, back on the same screen.
  // The new language is read back as the app starts; when it could not be
  // stored, a restart would lose it, so the screens are rebuilt in place.
  useEffect(() => onLanguageChange((next, saved) => {
    const state = navigationRef.isReady() ? navigationRef.getRootState() : undefined;
    const rebuild = () => {
      setLanguageNavigationState(state);
      setLanguage(next);
    };
    if (!saved) {
      rebuild();
      return;
    }
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }
    void storeOnDevice(LANGUAGE_RESTART_STATE_KEY, state ? JSON.stringify({ at: Date.now(), state }) : null)
      .then(() => reloadAppAsync('Language changed'))
      .catch(() => undefined)
      // Still running, so the reload did not happen: rebuild in place.
      .finally(() => setTimeout(() => {
        void storeOnDevice(LANGUAGE_RESTART_STATE_KEY, null);
        rebuild();
      }, 3000));
  }), []);

  useEffect(() => {
    if (!initialRoute || initialRoute === 'Login') return;
    void registerForPushNotifications().catch(() => undefined);
    return listenForPushNotificationResponses((target) => {
      if (!navigationRef.isReady()) return;
      if (target) navigateToNotificationTarget(navigationRef, target);
      else navigationRef.navigate('Notifications');
    });
  }, [initialRoute]);

  if (!initialRoute || !fontsLoaded) {
    return (
      <SafeAreaProvider>
        {/* Boot screen — matches the pre-JS splash in public/index.html so
            the web load is one continuous branded frame. */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' }}>
          {/* 83px = the splash's 64px symbol (77-unit frame) in the loader's 100-unit frame. */}
          <BrandLoader size={83} />
        </View>
      </SafeAreaProvider>
    );
  }

  // Layout is authored for Hebrew; a left-to-right language runs the layout
  // engine right-to-left, which mirrors every screen (see layoutDirection).
  const direction = layoutDirection(language);
  const directionProps = Platform.OS === 'web' ? ({ dir: direction } as object) : {};

  return (
    <SafeAreaProvider>
      <View key={language} style={{ flex: 1, direction }} {...directionProps}>
      <ToastProvider>
        <CompanyProvider>
          <FirstProfileGate signedIn={initialRoute !== 'Login'}>
          <LegalConsentGate
            onAccepted={async (userId) => {
              const result = await resolveRouteForUser(userId);
              setResumeSavedState(false);
              setInitialRoute(result.ok ? result.route : 'Login');
            }}
          >
          <TabBarProvider>
          <View style={{ flex: 1 }}>
          <NavigationContainer
            ref={navigationRef}
            linking={linking}
            // Route names are internal English ids ("Login", "AdminHome"), so
            // the browser tab shows the brand instead; a legal page adds its
            // own name, so a bookmarked or shared link says what it is.
            documentTitle={{ formatter: (_options, route) => legalPageTitle(route) ?? 'icar' }}
            initialState={languageNavigationState ?? (initialRoute === 'Login' || !resumeSavedState ? undefined : webInitialNavigationState)}
            onReady={syncWebThemeColor}
            onStateChange={(state) => {
              syncWebThemeColor();
              if (Platform.OS !== 'web') return;
              try {
                window.sessionStorage.setItem(WEB_NAVIGATION_STATE_KEY, JSON.stringify(state));
              } catch {
                // Storage may be unavailable in private browsing; URL linking still works.
              }
            }}
            onUnhandledAction={(action) => {
              if (action.type !== 'GO_BACK' || !navigationRef.isReady()) return;
              const fallback = refreshBackFallback(navigationRef.getCurrentRoute(), initialRoute);
              if (fallback) {
                navigationRef.resetRoot({ index: 0, routes: [fallback as never] });
              }
            }}
          >
            <Stack.Navigator key={initialRoute} screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
              <Stack.Screen name="Legal" component={LegalScreen} />
              <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} />
              <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
              <Stack.Screen name="CompanyDetail" component={CompanyDetailScreen} />

              {/* Shared between admin and driver — reached from the menu
                  screen, same screen instance for both roles. */}
              <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
              <Stack.Screen name="Menu" component={MenuScreen} />
              <Stack.Screen name="SystemSettings" component={SystemSettingsScreen} />

              {/* Admin module — no tab bar; drivers and vehicles are one
                  screen (FleetScreen) that crossfades its body via the
                  segmented control in its header, not a navigation push. */}
              <Stack.Screen name="AdminHome" component={FleetScreen} />
              <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
              <Stack.Screen name="VehicleForm" component={VehicleFormScreen} />
              <Stack.Screen name="DriverDetail" component={DriverDetailScreen} />
              <Stack.Screen name="DriverForm" component={DriverFormScreen} />
              <Stack.Screen name="DriverArchive" component={DriverArchiveScreen} />
              <Stack.Screen name="Departments" component={DepartmentsScreen} />
              <Stack.Screen name="CompanyDocuments" component={CompanyDocumentsScreen} />
              <Stack.Screen name="Attention" component={AttentionScreen} />
              <Stack.Screen name="Reports" component={ReportsScreen} />
              <Stack.Screen name="AdminProfile" component={AdminProfileScreen} />
              <Stack.Screen name="CompanySettings" component={CompanySettingsScreen} />
              <Stack.Screen name="SignedDocuments" component={SignedDocumentsScreen} />
              <Stack.Screen name="ChecklistMeeting" component={ChecklistMeetingScreen} />
              <Stack.Screen name="SafetyInspections" component={SafetyInspectionsScreen} />
              <Stack.Screen name="SafetyInspection" component={SafetyInspectionScreen} />
              <Stack.Screen name="SafetyInspectionSettings" component={SafetyInspectionSettingsScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="AdminDocumentSigning" component={AdminDocumentSigningScreen} />
              <Stack.Screen name="DocusealWebView" component={DocusealWebViewScreen} />
              <Stack.Screen name="DocumentCategory" component={DocumentCategoryScreen} />
              <Stack.Screen name="DriverLicenseDocuments" component={DriverLicenseDocumentsScreen} />
              <Stack.Screen name="DriverPersonalDetails" component={DriverPersonalDetailsScreen} />

              {/* Driver module */}
              <Stack.Screen name="DriverVehicle" component={DriverVehicleScreen} />
              <Stack.Screen name="DriverDocuments" component={DriverDocumentsScreen} />
              <Stack.Screen name="DriverSigningDocuments" component={DriverSigningDocumentsScreen} />
              <Stack.Screen name="DriverSignDocument" component={DriverSignDocumentScreen} />
              <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
              <Stack.Screen name="DriverOdometer" component={DriverOdometerScreen} />
              <Stack.Screen name="DriverAttention" component={DriverAttentionScreen} />
            </Stack.Navigator>
          </NavigationContainer>
          {/* Home and menu at the bottom of every signed-in phone screen. */}
          <MobileTabBar navigationRef={navigationRef} />
          <AnnouncementBanner />
          <RouteRoleGuard />
          </View>
          </TabBarProvider>
          </LegalConsentGate>
          </FirstProfileGate>
        </CompanyProvider>
      </ToastProvider>
      </View>
    </SafeAreaProvider>
  );
}

/**
 * Keeps every account on its own screens. On web the browser's history
 * outlives a sign-out, so after an admin signs out and a driver signs in on
 * the same browser, "back" (or a typed / bookmarked URL) would open the
 * admin's screens with the driver's data. Whenever the current screen is not
 * one the signed-in role may open, go to that role's home; signed out, to
 * the login page. `resetRoot` replaces the current history entry.
 */
function RouteRoleGuard() {
  const { profile, loading, error } = useCompany();
  useEffect(() => {
    const check = () => {
      if (!navigationRef.isReady()) return;
      const route = navigationRef.getCurrentRoute();
      if (!route || isPublicRoute(route.name)) return;
      if (profile) {
        if (!canOpenRoute(profile.role, route.name)) {
          navigationRef.resetRoot({ index: 0, routes: [{ name: ROLE_ROUTES[profile.role] }] });
        }
        return;
      }
      // Still loading (e.g. mid account switch) or a failed load: wait.
      if (loading || error) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session || !navigationRef.isReady()) return;
        const current = navigationRef.getCurrentRoute();
        if (current && !isPublicRoute(current.name)) {
          navigationRef.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
        }
      });
    };
    check();
    const offReady = navigationRef.addListener('ready', check);
    const offState = navigationRef.addListener('state', check);
    return () => {
      offReady();
      offState();
    };
  }, [profile, loading, error]);
  return null;
}

/**
 * A refresh restores the page the user was on, and every screen reads the
 * signed-in profile and company. Until they have loaded once, keep the boot
 * loader up instead of letting a screen conclude there is no company. After
 * the first load the gate stays open, so later reloads (switching account,
 * refresh()) never tear the navigation down.
 */
function FirstProfileGate({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const { loading, profile, error } = useCompany();
  // Signed in: the first "not loading" can come before the stored session is
  // restored, so wait for the profile itself (or a load error).
  const settled = !loading && (!signedIn || !!profile || !!error);
  const [ready, setReady] = useState(settled);
  useEffect(() => {
    if (settled) setReady(true);
  }, [settled]);
  // A session that is gone (expired, signed out elsewhere) has no profile to
  // wait for; and never hold the app longer than a few seconds regardless.
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => alive && !data.session && setReady(true));
    const t = setTimeout(() => alive && setReady(true), 8000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [signedIn]);
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' }}>
        <BrandLoader size={83} />
      </View>
    );
  }
  return <>{children}</>;
}
