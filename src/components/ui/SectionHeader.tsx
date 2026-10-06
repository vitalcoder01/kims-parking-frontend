import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {AppText} from './Text';
import {Icon, IconName} from '../Icon';
import {useTheme} from '../../context/ThemeContext';

interface Props {
  title: string;
  eyebrow?: string;
  icon?: IconName;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Section heading — optional eyebrow + title left, optional action right. */
export function SectionHeader({title, eyebrow, icon, action, style}: Props) {
  const {colors} = useTheme();
  return (
    <View style={[{flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12}, style]}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1}}>
        {icon && (
          <View style={{width: 28, height: 28, borderRadius: 9, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name={icon} size={16} color={colors.textSecondary} />
          </View>
        )}
        <View style={{flexShrink: 1}}>
          {eyebrow && <AppText variant="overline" tone="muted" uppercase style={{marginBottom: 2}}>{eyebrow}</AppText>}
          <AppText variant="heading" numberOfLines={1}>{title}</AppText>
        </View>
      </View>
      {action && <View>{action}</View>}
    </View>
  );
}
