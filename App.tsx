import React, {useEffect} from 'react';
import {StatusBar, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider, useTheme} from './src/context/ThemeContext';
import {AuthProvider} from './src/context/AuthContext';
import {AppStateProvider} from './src/context/AppStateContext';
import {AppNavigator} from './src/navigation/AppNavigator';
import {NotificationBanner} from './src/components/NotificationBanner';
import {initNotifications} from './src/services/notifications';

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
      <AppNavigator />
      <NotificationBanner />
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
              <AppContent />
            </ThemeProvider>
          </AppStateProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
