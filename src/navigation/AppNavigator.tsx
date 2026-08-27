import React, {useState} from 'react';
import {Text, View, ActivityIndicator} from 'react-native';
import {NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef} from '@react-navigation/native';
import {CopilotOverlay} from '../components/copilot/CopilotOverlay';
import {setCurrentScreen} from '../services/crashReporting';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {Icon, IconName} from '../components/Icon';

import {LoginScreen}             from '../screens/auth/LoginScreen';
import {DoctorHomeScreen}        from '../screens/doctor/DoctorHomeScreen';
import {VirtualCardScreen}       from '../screens/doctor/VirtualCardScreen';
import {VehicleSetupScreen}      from '../screens/doctor/VehicleSetupScreen';
import {DoctorHistoryScreen}     from '../screens/doctor/DoctorHistoryScreen';
import {ParkingMapScreen}        from '../screens/ParkingMapScreen';
import {ValetHomeScreen}         from '../screens/valet/ValetHomeScreen';
import {ValetRecordsScreen}      from '../screens/valet/ValetRecordsScreen';
import {ValetMapScreen}          from '../screens/valet/ValetMapScreen';
import {DriverDashboardScreen}   from '../screens/driver/DriverDashboardScreen';
import {DriverJobsScreen}        from '../screens/driver/DriverJobsScreen';
import {AdminDashboardScreen}    from '../screens/admin/AdminDashboardScreen';
import {AdminStaffScreen}        from '../screens/admin/AdminStaffScreen';
import {AdminAttendanceScreen}   from '../screens/admin/AdminAttendanceScreen';
import {AnalyticsScreen}         from '../screens/AnalyticsScreen';
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
      {/* Reachable only from the "View Parking History" link on Home. */}
      <Tab.Screen name="History" component={DoctorHistoryScreen} options={{headerShown:false, tabBarButton: () => null}} />
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
      {/* Reachable only from the "View Parking History" link on Home. */}
      <Tab.Screen name="History" component={DoctorHistoryScreen} options={{headerShown:false, tabBarButton: () => null}} />
      <Tab.Screen name="Setup"    component={VehicleSetupScreen} options={{headerShown:false,     tabBarLabel:'Setup',   tabBarIcon:({size,color})=>ic('car',size,color)}} />
      <Tab.Screen name="Settings" component={SharedSettingsScreen} options={{title:'Settings',   tabBarLabel:'Settings',tabBarIcon:({size,color})=>ic('settings',size,color)}} />
    </Tab.Navigator>
  );
}

function ValetNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator screenOptions={tabOpts(colors)}>
      <Tab.Screen name="Queue"     component={ValetHomeScreen}      options={{headerShown:false, tabBarLabel:'Dashboard', tabBarIcon:({size,color})=>ic('key',size,color)}} />
      <Tab.Screen name="Records"   component={ValetRecordsScreen}   options={{headerShown:false, tabBarLabel:'Jobs',      tabBarIcon:({size,color})=>ic('clipboard',size,color)}} />
      <Tab.Screen name="Map"       component={ValetMapScreen}       options={{headerShown:false, tabBarLabel:'Map',      tabBarIcon:({size,color})=>ic('map',size,color)}} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen}      options={{headerShown:false, tabBarLabel:'Analytics',tabBarIcon:({size,color})=>ic('analytics',size,color)}} />
      <Tab.Screen name="Settings"  component={SharedSettingsScreen} options={{title:'Settings',      tabBarLabel:'Settings',tabBarIcon:({size,color})=>ic('settings',size,color)}} />
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
      <Tab.Screen name="Analytics"   component={AnalyticsScreen}       options={{headerShown:false,  tabBarLabel:'Analytics',  tabBarIcon:({size,color})=>ic('analytics',size,color)}} />
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

const navRef = createNavigationContainerRef();

/*
 * Where the creature is allowed to wander, by role.
 *
 * Opt-in, and deliberately short. The navigator only knows the ROUTE, and
 * several routes host their own internal sub-screens: ValetHomeScreen alone
 * switches between scan, assign, visitor and retrievals entirely in local
 * state, so the route still reads "Queue" while a valet is halfway through
 * assigning a driver. Roaming there on the strength of the route name would
 * put a drifting character over exactly the work it must never cover.
 *
 * So valet keeps the creature on every screen — corner-anchored, still
 * reporting — and only wanders on Analytics, which is a page you read rather
 * than operate. Doctor, driver and admin wander on their genuinely idle
 * screens: a doctor waiting for a car, a driver between jobs, an admin
 * looking at dashboards.
 */
/*
 * The tabs each role actually has.
 *
 * Needed because an insight names a PLACE ('dashboard'), not a route — the
 * same rule serves every role and the route name differs between them. The
 * mapping below resolves place to route, and this validates the result.
 *
 * Without the check, a target that does not exist for the current role
 * navigates nowhere useful: 'map' resolves to 'Map' for a driver, who has
 * no Map tab, and the default 'Home' does not exist for a valet. No rule
 * hits those combinations today, which is luck rather than design — the
 * web port had the same shape and a driver tapping their own unaccepted job
 * landed on the ADMIN dashboard.
 */
const TABS_BY_ROLE: Record<string, readonly string[]> = {
  valet: ['Queue', 'Records', 'Map', 'Analytics', 'Settings'],
  driver: ['Dashboard', 'Jobs', 'Settings'],
  admin: ['Dashboard', 'Staff', 'Attendance', 'Map', 'Analytics', 'Settings'],
  doctor: ['Home', 'Card', 'History', 'Setup', 'Settings'],
  staff: ['Home', 'Card', 'History', 'Setup', 'Settings'],
};

const ROAMS_ON: Record<string, readonly string[]> = {
  valet: ['Analytics'],
  driver: ['Dashboard'],
  admin: ['Dashboard', 'Analytics'],
  doctor: ['Home'],
  staff: ['Home'],
};

export function AppNavigator() {
  const {colors, isDark} = useTheme();
  const {user, isLoading} = useAuth();
  const [route, setRoute] = useState<string | undefined>(undefined);

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

  const roams = user?.role ? ROAMS_ON[user.role] ?? [] : [];

  const trackRoute = () => {
    const name = navRef.isReady() ? navRef.getCurrentRoute()?.name : undefined;
    setRoute(name);
    // Gives every crash report a screen name, so a fault arrives as
    // "ValetRecordsScreen" rather than an anonymous stack.
    setCurrentScreen(name);
  };

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={trackRoute} onStateChange={trackRoute}>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {user
          ? <Stack.Screen name="App"   component={RoleRouter}  />
          : <Stack.Screen name="Login" component={LoginScreen} />
        }
      </Stack.Navigator>

      {/* Only once signed in: there is nothing to observe on the login
          screen, and no session to report a crash against anyway. */}
      {!!user && (
        <CopilotOverlay
          idleScreen={!!route && roams.includes(route)}
          onNavigate={insight => {
            if (!navRef.isReady() || !insight.action) return;
            const target = insight.action.target;
            const wanted =
                target === 'records'   ? (user.role === 'valet' ? 'Records' : 'Home')
              : target === 'dashboard' ? (user.role === 'valet' ? 'Queue' : 'Dashboard')
              : target === 'map'       ? 'Map'
              : 'Home';
            // Only navigate somewhere this role can actually reach. A wrong
            // mapping should be a harmless no-op, never another role's screen.
            if (!(TABS_BY_ROLE[user.role] ?? []).includes(wanted)) return;
            // @ts-expect-error — route names are per-role and not in one union.
            navRef.navigate(wanted);
          }}
        />
      )}
    </NavigationContainer>
  );
}
