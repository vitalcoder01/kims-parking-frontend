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
