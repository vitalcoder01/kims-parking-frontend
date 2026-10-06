import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {Surface} from './Surface';
import {AppText} from './Text';
import {Icon, IconName} from '../Icon';
import {useTheme} from '../../context/ThemeContext';

type Trend = {direction: 'up' | 'down' | 'flat'; label: string};

interface Props {
  label: string;
  value: React.ReactNode;
  icon?: IconName;
  hint?: string;
  trend?: Trend;
  emphasis?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** A single KPI tile — icon chip, big value, label, optional trend. */
export function StatTile({label, value, icon, hint, trend, emphasis, onPress, style}: Props) {
  const {colors} = useTheme();
  const ink = emphasis ? colors.textOnPrimary : colors.textPrimary;
  const sub = emphasis ? colors.textOnPrimary + 'B3' : colors.textSecondary;
  const chipBg = emphasis ? 'rgba(255,255,255,0.16)' : colors.cardAlt;

  const trendColor = !trend ? undefined
    : trend.direction === 'up' ? colors.success
    : trend.direction === 'down' ? colors.error : sub;
  const trendIcon: IconName | undefined = !trend ? undefined
    : trend.direction === 'up' ? 'arrowUp'
    : trend.direction === 'down' ? 'arrowDown' : 'trending';

  return (
    <Surface
      elevation="e1"
      onPress={onPress}
      padding={16}
      style={[{gap: 10}, emphasis ? {backgroundColor: colors.primary, borderColor: 'transparent'} : null, style]}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        {icon && (
          <View style={{width: 34, height: 34, borderRadius: 11, backgroundColor: chipBg, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name={icon} size={18} color={emphasis ? colors.textOnPrimary : colors.textSecondary} />
          </View>
        )}
        {trend && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 3}}>
            {trendIcon && <Icon name={trendIcon} size={13} color={trendColor} />}
            <AppText variant="caption" color={trendColor} style={{fontWeight: '700'}}>{trend.label}</AppText>
          </View>
        )}
      </View>
      <View>
        <AppText variant="display" color={ink} numberOfLines={1} style={{fontSize: 30, lineHeight: 34}}>{value}</AppText>
        <AppText variant="caption" color={sub} numberOfLines={1} uppercase style={{marginTop: 3, letterSpacing: 0.4}}>{label}</AppText>
        {hint && <AppText variant="caption" color={sub} numberOfLines={1} style={{marginTop: 4, opacity: 0.85}}>{hint}</AppText>}
      </View>
    </Surface>
  );
}
