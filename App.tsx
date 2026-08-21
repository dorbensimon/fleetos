import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/LoginScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import OwnerHomeScreen from './screens/OwnerHomeScreen';
import AdminHomeScreen from './screens/AdminHomeScreen';
import DriverHomeScreen from './screens/DriverHomeScreen';
import { RootStackParamList } from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
        <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} />
        <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
        <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
