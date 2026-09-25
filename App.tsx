import { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
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
import SignedDocumentsScreen from './screens/admin/SignedDocumentsScreen';
import NotificationsScreen from './screens/admin/NotificationsScreen';
import AdminDocumentSigningScreen from './screens/admin/AdminDocumentSigningScreen';
import GlobalSigningTemplatesScreen from './screens/GlobalSigningTemplatesScreen';
import DocusealWebViewScreen from './screens/DocusealWebViewScreen';
import DocumentCategoryScreen from './screens/admin/DocumentCategoryScreen';
import DriverLicenseDocumentsScreen from './screens/admin/DriverLicenseDocumentsScreen';
import DriverPersonalDetailsScreen from './screens/admin/DriverPersonalDetailsScreen';
import DriverVehicleScreen from './screens/driver/DriverVehicleScreen';
import DriverDocumentsScreen from './screens/driver/DriverDocumentsScreen';
import DriverSigningDocumentsScreen from './screens/driver/DriverSigningDocumentsScreen';
import DriverProfileScreen from './screens/driver/DriverProfileScreen';
import DriverOdometerScreen from './screens/driver/DriverOdometerScreen';
import MenuScreen from './screens/MenuScreen';
import { RootStackParamList } from './navigation/types';
import { refreshBackFallback } from './lib/refreshSafeBack';
import { supabase } from './lib/supabase';
import { resolveRouteForUser } from './lib/session';
import { CompanyProvider } from './lib/CompanyContext';
import { ToastProvider } from './components/ui';
import { flushPendingAssignmentOperations } from './lib/adminApi';
import {
  listenForPushNotificationResponses,
  registerForPushNotifications,
  unregisterPushNotifications,
} from './lib/pushNotifications';
import { navigateToNotificationTarget } from './lib/notificationTargets';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const WEB_NAVIGATION_STATE_KEY = 'fleetos.web-navigation-state';

// Web navigation normally restores from the URL. The development server can
// retain the root URL, though, so also retain the in-app stack for a browser
// refresh from that root. A non-root URL always takes precedence for direct
// links and browser history.
const getWebInitialNavigationState = () => {
  if (typeof window === 'undefined' || window.location.pathname !== '/' || window.location.search) return undefined;
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
      Notifications: 'notifications',
      AdminDocumentSigning: 'documents/signing',
      GlobalSigningTemplates: 'owner/signing-templates',
      DocusealWebView: 'documents/view',
      NotificationPreferences: 'notification-preferences',
      DocumentCategory: 'documents/:ownerType/:ownerId/:category',
      DriverLicenseDocuments: 'drivers/:driverId/license-documents',
      DriverVehicle: 'my-vehicle',
      DriverDocuments: 'my-documents',
      DriverSigningDocuments: 'my-documents/signing',
      DriverProfile: 'my-profile',
      DriverOdometer: 'my-vehicle/odometer/:vehicleId',
      Menu: 'menu',
    },
  },
};

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  const [webInitialNavigationState] = useState(getWebInitialNavigationState);

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
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const userId = data.session?.user.id;

        if (!userId) {
          if (active) setInitialRoute('Login');
          return;
        }

        const result = await resolveRouteForUser(userId);
        if (active) setInitialRoute(result.ok ? result.route : 'Login');
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        void unregisterPushNotifications().catch(() => undefined);
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(WEB_NAVIGATION_STATE_KEY);
        setInitialRoute('Login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <CompanyProvider>
          <NavigationContainer
            ref={navigationRef}
            linking={linking}
            // Route names are internal English ids ("Login", "AdminHome"), so
            // the browser tab always shows the brand instead.
            documentTitle={{ formatter: () => 'icar' }}
            initialState={initialRoute === 'Login' ? undefined : webInitialNavigationState}
            onReady={syncWebThemeColor}
            onStateChange={(state) => {
              syncWebThemeColor();
              if (typeof window === 'undefined') return;
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
              <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} />
              <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
              <Stack.Screen name="CompanyDetail" component={CompanyDetailScreen} />

              {/* Shared between admin and driver — reached from the menu
                  screen, same screen instance for both roles. */}
              <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
              <Stack.Screen name="Menu" component={MenuScreen} />

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
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="AdminDocumentSigning" component={AdminDocumentSigningScreen} />
              <Stack.Screen name="GlobalSigningTemplates" component={GlobalSigningTemplatesScreen} />
              <Stack.Screen name="DocusealWebView" component={DocusealWebViewScreen} />
              <Stack.Screen name="DocumentCategory" component={DocumentCategoryScreen} />
              <Stack.Screen name="DriverLicenseDocuments" component={DriverLicenseDocumentsScreen} />
              <Stack.Screen name="DriverPersonalDetails" component={DriverPersonalDetailsScreen} />

              {/* Driver module */}
              <Stack.Screen name="DriverVehicle" component={DriverVehicleScreen} />
              <Stack.Screen name="DriverDocuments" component={DriverDocumentsScreen} />
              <Stack.Screen name="DriverSigningDocuments" component={DriverSigningDocumentsScreen} />
              <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
              <Stack.Screen name="DriverOdometer" component={DriverOdometerScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </CompanyProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
