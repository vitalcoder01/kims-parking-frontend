import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import notifee, {EventType} from '@notifee/react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerBackgroundPushHandler} from './src/services/pushMessaging';
import {stopAssignmentAlarm} from './src/services/notifications';

// Must be registered at module scope (not inside a component): Android
// invokes this with the app killed — including redelivery after a reboot —
// which is what turns an FCM push into the full assignment alarm.
registerBackgroundPushHandler();

// Dismissing/tapping the alarm notification from the background stops the
// looping sound/vibration instead of leaving it ringing.
notifee.onBackgroundEvent(async ({type}) => {
  if (type === EventType.DISMISSED || type === EventType.PRESS) {
    await stopAssignmentAlarm();
  }
});

AppRegistry.registerComponent(appName, () => App);
