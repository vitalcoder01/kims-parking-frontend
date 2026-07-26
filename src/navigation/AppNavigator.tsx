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
import {ParkingScreen}           from '../screens/ParkingScreen';
import {ParkingMapScreen}        from '../screens/ParkingMapScreen';
import {AttendanceScreen}        from '../screens/AttendanceScreen';
import {ValetHomeScreen}         from '../screens/valet/ValetHomeScreen';
import {ValetAttendanceScreen}   from '../screens/valet/ValetAttendanceScreen';
import {DriverHomeScreen}        from '../screens/driver/DriverHomeScreen';
import {DriverAttendanceScreen}  from '../screens/driver/DriverAttendanceScreen';
import {AdminDashboardScreen}    from '../screens/admin/AdminDashboardScreen';
import {AdminStaffScreen}        from '../screens/admin/AdminStaffScreen';
import {SharedSettingsScreen}    from '../screens/shared/SharedSettingsScreen';
import {LiveTrackingScreen}      from '../screens/shared/LiveTrackingScreen';

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

function DoctorNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Home"       component={DoctorHomeScreen}  options={{title:'KIMS Doctor',   tabBarLabel:'Home',       tabBarIcon:({size,color})=>ic('home',size,color)}} />
      <Tab.Screen name="Card"       component={VirtualCardScreen} options={{title:'My Valet Card', tabBarLabel:'My Card',    tabBarIcon:({size,color})=>ic('userCard',size,color)}} />
      <Tab.Screen name="Parking"    component={ParkingScreen}     options={{title:'My Parking',    tabBarLabel:'Parking',    tabBarIcon:({size,color})=>ic('parking',size,color)}} />
      <Tab.Screen name="Map"        component={ParkingMapScreen}  options={{title:'Live Map',      tabBarLabel:'Map',        tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Attendance" component={AttendanceScreen}  options={{title:'Attendance',    tabBarLabel:'Attendance', tabBarIcon:({size,color})=>ic('calendar',size,color)}} />
    </Tab.Navigator>
  );
}

function StaffNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Home"       component={DoctorHomeScreen}  options={{title:'KIMS Staff',    tabBarLabel:'Home',       tabBarIcon:({size,color})=>ic('home',size,color)}} />
      <Tab.Screen name="Card"       component={VirtualCardScreen} options={{title:'My Valet Card', tabBarLabel:'My Card',    tabBarIcon:({size,color})=>ic('userCard',size,color)}} />
      <Tab.Screen name="Map"        component={ParkingMapScreen}  options={{title:'Live Map',      tabBarLabel:'Map',        tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Attendance" component={AttendanceScreen}  options={{title:'Attendance',    tabBarLabel:'Attendance', tabBarIcon:({size,color})=>ic('calendar',size,color)}} />
      <Tab.Screen name="Settings"   component={SharedSettingsScreen} options={{title:'Settings',   tabBarLabel:'Settings',   tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function ValetNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Queue"      component={ValetHomeScreen}       options={{title:'Valet Station',  tabBarLabel:'Queue',      tabBarIcon:({size,color})=>ic('key',size,color)}} />
      <Tab.Screen name="Map"        component={ParkingMapScreen}      options={{title:'Parking Map',    tabBarLabel:'Map',        tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Attendance" component={ValetAttendanceScreen} options={{title:'Attendance',     tabBarLabel:'Attendance', tabBarIcon:({size,color})=>ic('calendar',size,color)}} />
      <Tab.Screen name="Settings"   component={SharedSettingsScreen}  options={{title:'Settings',       tabBarLabel:'Settings',   tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function DriverNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Tasks"      component={DriverHomeScreen}       options={{title:'My Tasks',    tabBarLabel:'Tasks',      tabBarIcon:({size,color})=>ic('tasks',size,color)}} />
      <Tab.Screen name="Track"      component={LiveTrackingScreen}     options={{title:'Live Track',  tabBarLabel:'Track',      tabBarIcon:({size,color})=>ic('track',size,color)}} />
      <Tab.Screen name="Attendance" component={DriverAttendanceScreen} options={{title:'Attendance',  tabBarLabel:'Attendance', tabBarIcon:({size,color})=>ic('calendar',size,color)}} />
      <Tab.Screen name="Settings"   component={SharedSettingsScreen}   options={{title:'Settings',    tabBarLabel:'Settings',   tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function AdminNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} options={{title:'Operations', tabBarLabel:'Dashboard', tabBarIcon:({size,color})=>ic('dashboard',size,color)}} />
      <Tab.Screen name="Staff"     component={AdminStaffScreen}     options={{title:'Staff',     tabBarLabel:'Staff',     tabBarIcon:({size,color})=>ic('staff',size,color)}} />
      <Tab.Screen name="Map"       component={ParkingMapScreen}     options={{title:'Live Map',  tabBarLabel:'Map',       tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Settings"  component={SharedSettingsScreen} options={{title:'Settings',  tabBarLabel:'Settings',  tabBarIcon:({size,color})=>ic('settings',size,color)}} />
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
