import React, {useEffect} from 'react';
import {StatusBar, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider, useTheme} from './src/context/ThemeContext';
import {AuthProvider} from './src/context/AuthContext';
import {AppStateProvider} from './src/context/AppStateContext';
import {AppNavigator} from './src/navigation/AppNavigator';
import {UpdateGate} from './src/components/UpdateGate';
import {DialogProvider} from './src/components/AppDialog';
import {initNotifications} from './src/services/notifications';
import {installCrashReporting} from './src/services/crashReporting';
import {ErrorBoundary} from './src/components/ErrorBoundary';

/*
 * Installed at module scope, not in an effect.
 *
 * A fault thrown during the very first render happens before any effect has
 * run, and that is precisely the crash worth catching — an app that dies on
 * launch reports nothing and looks, from the outside, like a phone problem.
 */
installCrashReporting();

function AppContent() {
  const {isDark} = useTheme();

  // Set up OS notification channels & request permission once on launch.
  useEffect(() => {
    initNotifications();
  }, []);
  return (
    <View style={{flex: 1}}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      {/* No in-app notification overlay. Alerts fire on the OS notification
          tray (via notifee — see src/services/notifications.ts) which is
          where iOS/Android natively show them; the app itself stays clean. */}
      <UpdateGate>
        {/* Inside the gate, not around it: a screen crashing must never take
            down the update prompt, which is the only route out of a broken
            build. */}
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
      </UpdateGate>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppStateProvider>
            <ThemeProvider>
              <DialogProvider>
                <AppContent />
              </DialogProvider>
            </ThemeProvider>
          </AppStateProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
