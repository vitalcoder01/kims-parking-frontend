import React from 'react';
import {Text, View, ActivityIndicator} from 'react-native';
import {NavigationContainer, DefaultTheme, DarkTheme} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {Icon, IconName} from '../components/Icon';

import {LoginScreen}             from '../screens/auth/LoginScreen';
import {DoctorHomeScreen}        from '../screens/doctor/DoctorHomeScreen';
import {VirtualCardScreen}       from '../screens/doctor/VirtualCardScreen';
import {VehicleSetupScreen}      from '../screens/doctor/VehicleSetupScreen';
import {ParkingScreen}           from '../screens/ParkingScreen';
import {ParkingMapScreen}        from '../screens/ParkingMapScreen';
import {ValetHomeScreen}         from '../screens/valet/ValetHomeScreen';
import {ValetRecordsScreen}      from '../screens/valet/ValetRecordsScreen';
import {ValetMapScreen}          from '../screens/valet/ValetMapScreen';
import {DriverDashboardScreen}   from '../screens/driver/DriverDashboardScreen';
import {DriverJobsScreen}        from '../screens/driver/DriverJobsScreen';
import {AdminDashboardScreen}    from '../screens/admin/AdminDashboardScreen';
import {AdminStaffScreen}        from '../screens/admin/AdminStaffScreen';
import {AdminAttendanceScreen}   from '../screens/admin/AdminAttendanceScreen';
import {SharedSettingsScreen}    from '../screens/shared/SharedSettingsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ic(name: IconName, size: number, color: string) {
  return <Icon name={name} size={size + 2} color={color} />;
}

function tabOpts(colors: any) {
  return {
    headerShown: true,
    headerStyle: {backgroundColor: colors.surface},
    headerTitleStyle: {color: colors.textPrimary, fontWeight: '900' as const, fontSize: 17},
    headerShadowVisible: false,
    tabBarStyle: {backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder, borderTopWidth: 1, height: 62, paddingBottom: 8, paddingTop: 6},
    tabBarActiveTintColor: colors.tabIconActive,
    tabBarInactiveTintColor: colors.tabIconInactive,
    tabBarLabelStyle: {fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.2},
  };
}

// Attendance is admin-only across every role (see AdminAttendanceScreen) —
// it's now marked automatically by real actions (key handover, starting a
// retrieval trip) rather than a manual check-in/out screen, so there's
// nothing for a doctor/staff/valet/driver to manage themselves anymore.
function DoctorNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Home"     component={DoctorHomeScreen}  options={{title:'KIMS Doctor',   tabBarLabel:'Home',    tabBarIcon:({size,color})=>ic('home',size,color)}} />
      {/* Reachable only from the valet-code card on Home — not a bottom tab. */}
      <Tab.Screen name="Card"     component={VirtualCardScreen} options={{headerShown:false, tabBarButton: () => null}} />
      <Tab.Screen name="Parking"  component={ParkingScreen}     options={{title:'My Parking',    tabBarLabel:'Parking', tabBarIcon:({size,color})=>ic('parking',size,color)}} />
      <Tab.Screen name="Setup"    component={VehicleSetupScreen} options={{headerShown:false,     tabBarLabel:'Setup',   tabBarIcon:({size,color})=>ic('car',size,color)}} />
      <Tab.Screen name="Settings" component={SharedSettingsScreen} options={{title:'Settings',   tabBarLabel:'Settings',tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function StaffNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Home"     component={DoctorHomeScreen}  options={{title:'KIMS Staff',    tabBarLabel:'Home',    tabBarIcon:({size,color})=>ic('home',size,color)}} />
      {/* Reachable only from the valet-code card on Home — not a bottom tab. */}
      <Tab.Screen name="Card"     component={VirtualCardScreen} options={{headerShown:false, tabBarButton: () => null}} />
      <Tab.Screen name="Setup"    component={VehicleSetupScreen} options={{headerShown:false,     tabBarLabel:'Setup',   tabBarIcon:({size,color})=>ic('car',size,color)}} />
      <Tab.Screen name="Settings" component={SharedSettingsScreen} options={{title:'Settings',   tabBarLabel:'Settings',tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function ValetNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Queue"    component={ValetHomeScreen}      options={{headerShown:false, tabBarLabel:'Queue',    tabBarIcon:({size,color})=>ic('key',size,color)}} />
      <Tab.Screen name="Records"  component={ValetRecordsScreen}   options={{headerShown:false, tabBarLabel:'Records',  tabBarIcon:({size,color})=>ic('clipboard',size,color)}} />
      <Tab.Screen name="Map"      component={ValetMapScreen}       options={{headerShown:false, tabBarLabel:'Map',      tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Settings" component={SharedSettingsScreen} options={{title:'Settings',      tabBarLabel:'Settings',tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function DriverNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={{...tabOpts(colors), headerShown: false}}>
      <Tab.Screen name="Dashboard" component={DriverDashboardScreen} options={{tabBarLabel:'Dashboard', tabBarIcon:({size,color})=>ic('dashboard',size,color)}} />
      <Tab.Screen name="Jobs"      component={DriverJobsScreen}      options={{tabBarLabel:'My Jobs',   tabBarIcon:({size,color})=>ic('tasks',size,color)}} />
      <Tab.Screen name="Settings"  component={SharedSettingsScreen}  options={{headerShown:true, title:'Settings', tabBarLabel:'Settings',tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function AdminNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Dashboard"   component={AdminDashboardScreen}  options={{title:'Operations', tabBarLabel:'Dashboard',  tabBarIcon:({size,color})=>ic('dashboard',size,color)}} />
      <Tab.Screen name="Staff"       component={AdminStaffScreen}      options={{title:'Staff',      tabBarLabel:'Staff',      tabBarIcon:({size,color})=>ic('staff',size,color)}} />
      <Tab.Screen name="Attendance"  component={AdminAttendanceScreen} options={{title:'Attendance', tabBarLabel:'Attendance', tabBarIcon:({size,color})=>ic('calendar',size,color)}} />
      <Tab.Screen name="Map"         component={ParkingMapScreen}      options={{title:'Live Map',   tabBarLabel:'Map',        tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Settings"    component={SharedSettingsScreen}  options={{title:'Settings',   tabBarLabel:'Settings',   tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function RoleRouter() {
  const {user} = useAuth();
  if (user?.role === 'valet')  return <ValetNavigator />;
  if (user?.role === 'driver') return <DriverNavigator />;
  if (user?.role === 'admin')  return <AdminNavigator />;
  if (user?.role === 'staff')  return <StaffNavigator />;
  return <DoctorNavigator />;
}

export function AppNavigator() {
  const {colors, isDark} = useTheme();
  const {user, isLoading} = useAuth();

  if (isLoading) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background, card: colors.surface,
      text: colors.textPrimary, border: colors.border,
      primary: colors.primary, notification: colors.error,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {user
          ? <Stack.Screen name="App"   component={RoleRouter}  />
          : <Stack.Screen name="Login" component={LoginScreen} />
        }
      </Stack.Navigator>
    </NavigationContainer>
  );
}
