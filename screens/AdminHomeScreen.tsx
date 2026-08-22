import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AdminTabParamList } from '../navigation/types';
import { COLORS, FONT } from '../lib/theme';
import DashboardScreen from './admin/DashboardScreen';
import VehiclesScreen from './admin/VehiclesScreen';
import DriversScreen from './admin/DriversScreen';
import MoreScreen from './admin/MoreScreen';

const Tab = createBottomTabNavigator<AdminTabParamList>();

const ICONS: Record<keyof AdminTabParamList, { on: any; off: any }> = {
  Dashboard: { on: 'grid', off: 'grid-outline' },
  Vehicles: { on: 'car', off: 'car-outline' },
  Drivers: { on: 'people', off: 'people-outline' },
  More: { on: 'ellipsis-horizontal', off: 'ellipsis-horizontal-outline' },
};

const LABELS: Record<keyof AdminTabParamList, string> = {
  Dashboard: 'דשבורד',
  Vehicles: 'רכבים',
  Drivers: 'נהגים',
  More: 'עוד',
};

export default function AdminHomeScreen() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textFaint,
        tabBarLabel: LABELS[route.name],
        tabBarLabelStyle: { fontFamily: FONT.bold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopWidth: 0,
          height: 84,
          paddingTop: 8,
          paddingBottom: 26,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={focused ? ICONS[route.name].on : ICONS[route.name].off}
            size={size ?? 22}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Vehicles" component={VehiclesScreen} />
      <Tab.Screen name="Drivers" component={DriversScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
