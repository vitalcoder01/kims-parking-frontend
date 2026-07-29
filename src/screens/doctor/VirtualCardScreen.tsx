import React, {useRef, useEffect} from 'react';
import {View, Text, StyleSheet, Animated} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {Icon} from '../../components/Icon';

export function VirtualCardScreen() {
  const {user} = useAuth();
  const {colors} = useTheme();
  const navigation = useNavigation<any>();
  const glow = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {toValue: 1, duration: 1800, useNativeDriver: true}),
        Animated.timing(glow, {toValue: 0, duration: 1800, useNativeDriver: true}),
      ])
    ).start();
  }, []);

  const glowOpacity = glow.interpolate({inputRange: [0, 1], outputRange: [0.4, 0.9]});

  const digits = (user?.cardCode ?? '---').split('');

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <PressableScale
        style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}
        onPress={() => navigation.navigate('Home')}
      >
        <Icon name="back" size={18} color={colors.textPrimary} />
      </PressableScale>
      <View style={s.center}>

        <Text style={[s.heading, {color: colors.textPrimary}]}>Your Valet Card</Text>
        <Text style={[s.sub, {color: colors.textSecondary}]}>
          Show this code to the valet when you arrive
        </Text>

        {/* Card */}
        <View style={[s.card, {backgroundColor: colors.primary}]}>
          <Animated.View style={[s.glowLayer, {opacity: glowOpacity}]} />

          <View style={s.cardTop}>
            <View>
              <Text style={s.hospitalName}>KIMS Hospital</Text>
              <Text style={s.cardSub}>Valet Parking</Text>
            </View>
            <View style={s.cardIconWrap}>
              <Icon name="hospital" size={20} color="#fff" />
            </View>
          </View>

          <View style={s.codeRow}>
            {digits.map((d, i) => (
              <View key={i} style={s.digitBox}>
                <Text style={s.digit}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={s.cardBottom}>
            <View>
              <Text style={s.nameLabel}>NAME</Text>
              <Text style={s.name}>{user?.name}</Text>
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={s.nameLabel}>DEPT</Text>
              <Text style={s.name}>{user?.department ?? user?.role?.toUpperCase()}</Text>
            </View>
          </View>

          <View style={s.cardStripe} />
        </View>

        {/* Instructions */}
        <View style={[s.infoBox, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          {[
            {step: '1', text: 'Arrive at the hospital entrance'},
            {step: '2', text: 'Hand your car keys to the valet'},
            {step: '3', text: 'Show this 3-digit code for identification'},
            {step: '4', text: 'Track your car live in the Parking tab'},
          ].map(({step, text}) => (
            <View key={step} style={s.step}>
              <View style={[s.stepNum, {backgroundColor: colors.primary + '18'}]}>
                <Text style={[s.stepNumTxt, {color: colors.primary}]}>{step}</Text>
              </View>
              <Text style={[s.stepText, {color: colors.textSecondary}]}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.empId, {color: colors.textMuted}]}>
          Employee ID: {user?.employeeId}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  backBtn: {width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginLeft: 16},
  center: {flex: 1, padding: 24, paddingTop: 12, alignItems: 'center'},
  heading: {fontSize: 22, fontWeight: '900', marginBottom: 6},
  sub: {fontSize: 13, textAlign: 'center', marginBottom: 32, lineHeight: 18},

  card: {width: '100%', borderRadius: 24, padding: 24, marginBottom: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: {width: 0, height: 12}, shadowOpacity: 0.3, shadowRadius: 20, elevation: 16},
  glowLayer: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.06)'},
  cardTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32},
  hospitalName: {color: '#fff', fontSize: 16, fontWeight: '900'},
  cardSub: {color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginTop: 2},
  cardIconWrap: {width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center'},
  codeRow: {flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 32},
  digitBox: {width: 70, height: 80, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)'},
  digit: {color: '#fff', fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums']},
  cardBottom: {flexDirection: 'row', justifyContent: 'space-between'},
  nameLabel: {color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5},
  name: {color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 2},
  cardStripe: {position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.15)'},

  infoBox: {width: '100%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, marginBottom: 16},
  step: {flexDirection: 'row', alignItems: 'center', gap: 12},
  stepNum: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  stepNumTxt: {fontSize: 13, fontWeight: '800'},
  stepText: {fontSize: 13, fontWeight: '500', flex: 1},
  empId: {fontSize: 11, fontWeight: '600'},
});
