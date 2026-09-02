import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
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
import DepartmentsScreen from './screens/admin/DepartmentsScreen';
import AdminProfileScreen from './screens/admin/AdminProfileScreen';
import NotificationsScreen from './screens/admin/NotificationsScreen';
import AdminDocumentSigningScreen from './screens/admin/AdminDocumentSigningScreen';
import DocusealWebViewScreen from './screens/DocusealWebViewScreen';
import DocumentCategoryScreen from './screens/admin/DocumentCategoryScreen';
import DriverLicenseDocumentsScreen from './screens/admin/DriverLicenseDocumentsScreen';
import DriverPersonalDetailsScreen from './screens/admin/DriverPersonalDetailsScreen';
import DriverVehicleScreen from './screens/driver/DriverVehicleScreen';
import DriverDocumentsScreen from './screens/driver/DriverDocumentsScreen';
import DriverSigningDocumentsScreen from './screens/driver/DriverSigningDocumentsScreen';
import DriverProfileScreen from './screens/driver/DriverProfileScreen';
import MenuScreen from './screens/MenuScreen';
import { RootStackParamList } from './navigation/types';
import { supabase } from './lib/supabase';
import { resolveRouteForUser } from './lib/session';
import { CompanyProvider } from './lib/CompanyContext';
import { ToastProvider } from './components/ui';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setInitialRoute('Login');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!initialRoute || !fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' }}>
          <ActivityIndicator color="#0071E3" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <CompanyProvider>
          <NavigationContainer>
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
              <Stack.Screen name="Departments" component={DepartmentsScreen} />
              <Stack.Screen name="AdminProfile" component={AdminProfileScreen} />
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
              <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </CompanyProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
