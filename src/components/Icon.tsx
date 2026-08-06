import React from 'react';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';

// Semantic icon names → MaterialCommunityIcons glyphs.
// Keeps the rest of the app free of icon-library specifics and guarantees
// one consistent icon family everywhere (no more emoji).
export const ICONS = {
  // navigation / tabs
  home:        'home-variant',
  card:        'card-account-details-outline',
  parking:     'parking',
  map:         'map-marker-radius',
  calendar:    'calendar-check',
  settings:    'cog',
  tasks:       'clipboard-list',
  track:       'crosshairs-gps',
  dashboard:   'view-dashboard',
  staff:       'account-group',
  analytics:   'chart-donut',
  trophy:      'trophy-variant',
  trending:    'trending-up',
  speedometer: 'speedometer',

  // actions / objects
  key:         'key-variant',
  car:         'car',
  carSide:     'car-side',
  ticket:      'ticket-confirmation',
  bell:        'bell-ring',
  bellAlert:   'bell-alert',
  hospital:    'hospital-building',
  phone:       'cellphone',
  user:        'account',
  userCard:    'badge-account-horizontal',
  lock:        'lock',
  eye:         'eye',
  eyeOff:      'eye-off',
  check:       'check-circle',
  checkBold:   'check-bold',
  arrowRight:  'arrow-right',
  arrowUp:     'arrow-up',
  arrowDown:   'arrow-down',
  back:        'arrow-left',
  clock:       'clock-outline',
  timer:       'timer-sand',
  logout:      'logout',
  route:       'road-variant',
  whatsapp:    'whatsapp',
  shield:      'shield-check',
  live:        'access-point',
  slot:        'parking',
  wrench:      'wrench',
  bolt:        'lightning-bolt',

  // driver-only screens
  sun:         'weather-sunny',
  sunset:      'weather-sunset',
  moon:        'weather-night',
  flag:        'flag-checkered',
  history:     'history',
  navigate:    'navigation-variant-outline',
  inbox:       'inbox-arrow-down-outline',
  outbox:      'inbox-arrow-up-outline',
  close:       'close',
  chevronRight:'chevron-right',
  carKey:      'car-key',
  target:      'target',
  sparkle:     'creation',

  pin:         'map-marker',
  alert:       'alert-circle-outline',
  refresh:     'refresh',
  people:      'account-multiple',
  bike:        'motorbike',
  clipboard:   'clipboard-text-outline',
  briefcase:   'briefcase-outline',
  stethoscope: 'stethoscope',
  rocket:      'rocket-launch-outline',
  chat:        'chat-outline',
  info:        'information-outline',
  search:      'magnify',
  filter:      'tune-variant',
  palette:     'palette-outline',
  plus:        'plus',
  help:        'help',
  edit:        'pencil-outline',
  save:        'content-save-outline',
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: any;
}

export function Icon({name, size = 22, color = '#000', style}: Props) {
  return <MCIcon name={ICONS[name]} size={size} color={color} style={style} />;
}
