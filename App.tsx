import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, Assistant_400Regular, Assistant_700Bold } from '@expo-google-fonts/assistant';
import LoginScreen from './screens/LoginScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import OwnerHomeScreen from './screens/OwnerHomeScreen';
import DriverHomeScreen from './screens/DriverHomeScreen';
import CompanyDetailScreen from './screens/CompanyDetailScreen';
import DriversScreen from './screens/admin/DriversScreen';
import VehiclesScreen from './screens/admin/VehiclesScreen';
import VehicleDetailScreen from './screens/admin/VehicleDetailScreen';
import VehicleFormScreen from './screens/admin/VehicleFormScreen';
import DriverDetailScreen from './screens/admin/DriverDetailScreen';
import DriverFormScreen from './screens/admin/DriverFormScreen';
import DepartmentsScreen from './screens/admin/DepartmentsScreen';
import AdminProfileScreen from './screens/admin/AdminProfileScreen';
import DocumentCategoryScreen from './screens/admin/DocumentCategoryScreen';
import DriverPersonalDetailsScreen from './screens/admin/DriverPersonalDetailsScreen';
import DriverVehicleScreen from './screens/driver/DriverVehicleScreen';
import DriverDocumentsScreen from './screens/driver/DriverDocumentsScreen';
import DriverProfileScreen from './screens/driver/DriverProfileScreen';
import { RootStackParamList } from './navigation/types';
import { supabase } from './lib/supabase';
import { resolveRouteForUser } from './lib/session';
import { CompanyProvider } from './lib/CompanyContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  const [fontsLoaded] = useFonts({ Assistant_400Regular, Assistant_700Bold });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;

      if (!userId) {
        setInitialRoute('Login');
        return;
      }

      const result = await resolveRouteForUser(userId);
      setInitialRoute(result.ok ? result.route : 'Login');
    })();
  }, []);

  if (!initialRoute || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' }}>
        <ActivityIndicator color="#0071E3" />
      </View>
    );
  }

  return (
    <CompanyProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
          <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} />
          <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
          <Stack.Screen name="CompanyDetail" component={CompanyDetailScreen} />

          {/* Admin module — no tab bar; AdminHome (drivers) and Vehicles
              switch to each other via the segmented control in their headers. */}
          <Stack.Screen name="AdminHome" component={DriversScreen} />
          <Stack.Screen name="Vehicles" component={VehiclesScreen} />
          <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
          <Stack.Screen name="VehicleForm" component={VehicleFormScreen} />
          <Stack.Screen name="DriverDetail" component={DriverDetailScreen} />
          <Stack.Screen name="DriverForm" component={DriverFormScreen} />
          <Stack.Screen name="Departments" component={DepartmentsScreen} />
          <Stack.Screen name="AdminProfile" component={AdminProfileScreen} />
          <Stack.Screen name="DocumentCategory" component={DocumentCategoryScreen} />
          <Stack.Screen name="DriverPersonalDetails" component={DriverPersonalDetailsScreen} />

          {/* Driver module */}
          <Stack.Screen name="DriverVehicle" component={DriverVehicleScreen} />
          <Stack.Screen name="DriverDocuments" component={DriverDocumentsScreen} />
          <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </CompanyProvider>
  );
}
