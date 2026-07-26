import React from 'react';
import {ScrollView,View,Text,StyleSheet,SafeAreaView,TouchableOpacity} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {Card} from '../components/Card';
import {Badge} from '../components/Badge';

const NOTIFS = [
  {id:'1',icon:'✅',bgL:'#E8F8EE',bgD:'#0D2A1C',title:'Vehicle Parked at A-203',sub:'Block A · 2nd Floor · Suresh Kumar',time:'9:52'},
  {id:'2',icon:'🚗',bgL:'#E8F8EE',bgD:'#0D2A1C',title:'Driver Assigned',sub:'Suresh Kumar is collecting your vehicle',time:'9:46'},
  {id:'3',icon:'📍',bgL:'#E8F0FE',bgD:'#0D1F3A',title:'Attendance Marked',sub:'Check-in at 8:03 AM recorded',time:'8:03'},
];

const QUICK = [{icon:'🏖️',label:'Leave'},{icon:'📋',label:'History'},{icon:'🔔',label:'Alerts'},{icon:'📞',label:'Help'}];

export function HomeScreen() {
  const {colors,isDark} = useTheme();
  const {user} = useAuth();
  const initials = (user?.name ?? 'DR').split(' ').map((w:string) => w[0]).join('').slice(0,2);

  return (
    <SafeAreaView style={[s.safe,{backgroundColor:colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Top band */}
        <View style={[s.band,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}>
          <View style={{flex:1}}>
            <Text style={[s.greeting,{color:colors.textSecondary}]}>Good morning 👋</Text>
            <Text style={[s.name,{color:colors.textPrimary}]}>{user?.name ?? 'Doctor'}</Text>
            <Text style={[s.role,{color:colors.textMuted}]}>{user?.department} · {user?.employeeId}</Text>
          </View>
          <View style={[s.avatar,{backgroundColor:colors.primary+'18',borderColor:colors.primary+'40'}]}>
            <Text style={[s.avatarTxt,{color:colors.primary}]}>{initials}</Text>
          </View>
        </View>

        <View style={s.pad}>

          {/* Parking card */}
          <View style={[s.parkCard,{backgroundColor:isDark?'#1A0A00':'#FFF4EE',borderColor:colors.primary+'38'}]}>
            <View style={s.pcHead}>
              <View>
                <Text style={[s.eyebrow,{color:colors.primary+'AA'}]}>YOUR VEHICLE</Text>
                <Text style={[s.pcReg,{color:colors.textPrimary}]}>MH-02-AB-1234</Text>
                <Text style={[s.pcModel,{color:colors.textSecondary}]}>Maruti Swift Dzire · White</Text>
              </View>
              <Badge label="Parked" variant="success" dot />
            </View>

            <View style={[s.slotRow,{borderColor:colors.primary+'22'}]}>
              <View>
                <Text style={[s.slotLbl,{color:colors.textMuted}]}>SLOT</Text>
                <Text style={[s.slot,{color:colors.textPrimary}]}>A-<Text style={{color:colors.primary}}>203</Text></Text>
                <Text style={[s.slotSub,{color:colors.textSecondary}]}>Block A · 2nd Floor</Text>
              </View>
              <View style={{alignItems:'flex-end'}}>
                <Text style={[s.slotLbl,{color:colors.textMuted}]}>PARKED AT</Text>
                <Text style={[s.slotTime,{color:colors.textPrimary}]}>9:52 AM</Text>
                <Text style={[s.slotSub,{color:colors.textSecondary}]}>1h 22 min ago</Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.82} style={[s.retBtn,{backgroundColor:colors.primary}]}>
              <Text style={s.retTxt}>Request Retrieval</Text>
              <Text style={s.retArrow}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            {[{v:'8:03 AM',l:'Checked In',c:colors.success},{v:'—',l:'Checked Out',c:colors.textMuted},{v:'14',l:'Days / Jul',c:'#1A72E8'}].map(st => (
              <View key={st.l} style={[s.statCard,{backgroundColor:colors.card,borderColor:colors.border}]}>
                <Text style={[s.statN,{color:st.c}]}>{st.v}</Text>
                <Text style={[s.statL,{color:colors.textMuted}]}>{st.l}</Text>
              </View>
            ))}
          </View>

          {/* Quick actions */}
          <Text style={[s.sec,{color:colors.textMuted}]}>QUICK ACTIONS</Text>
          <View style={s.qaRow}>
            {QUICK.map(q => (
              <TouchableOpacity key={q.label} activeOpacity={0.7} style={[s.qa,{backgroundColor:colors.card,borderColor:colors.border}]}>
                <Text style={s.qaIc}>{q.icon}</Text>
                <Text style={[s.qaLbl,{color:colors.textSecondary}]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Activity */}
          <Text style={[s.sec,{color:colors.textMuted}]}>TODAY'S ACTIVITY</Text>
          <Card>
            {NOTIFS.map((n,i) => (
              <View key={n.id} style={[s.notif,{borderBottomColor:colors.divider},i===NOTIFS.length-1&&{borderBottomWidth:0}]}>
                <View style={[s.notifIc,{backgroundColor:isDark?n.bgD:n.bgL}]}>
                  <Text style={{fontSize:15}}>{n.icon}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={[s.notifT,{color:colors.textPrimary}]}>{n.title}</Text>
                  <Text style={[s.notifS,{color:colors.textSecondary}]}>{n.sub}</Text>
                </View>
                <Text style={[s.notifTm,{color:colors.textMuted}]}>{n.time}</Text>
              </View>
            ))}
          </Card>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1}, scroll:{paddingBottom:32},
  band:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1},
  greeting:{fontSize:12,fontWeight:'500'},
  name:{fontSize:20,fontWeight:'900',letterSpacing:-0.5,marginTop:2},
  role:{fontSize:11,marginTop:3},
  avatar:{width:44,height:44,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  avatarTxt:{fontSize:14,fontWeight:'900'},
  pad:{padding:16},
  parkCard:{borderRadius:20,borderWidth:1.5,padding:16,marginBottom:12,shadowColor:'#FF6200',shadowOffset:{width:0,height:4},shadowOpacity:0.12,shadowRadius:12,elevation:4},
  pcHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14},
  eyebrow:{fontSize:9,fontWeight:'800',letterSpacing:1.5,textTransform:'uppercase',marginBottom:4},
  pcReg:{fontSize:18,fontWeight:'900',letterSpacing:-0.3},
  pcModel:{fontSize:11,marginTop:3},
  slotRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',borderTopWidth:1,borderBottomWidth:1,paddingVertical:14,marginBottom:14},
  slotLbl:{fontSize:9,fontWeight:'800',letterSpacing:1.5,textTransform:'uppercase',marginBottom:4},
  slot:{fontSize:36,fontWeight:'900',letterSpacing:-1},
  slotSub:{fontSize:11,marginTop:4},
  slotTime:{fontSize:22,fontWeight:'900'},
  retBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:12,paddingVertical:12},
  retTxt:{fontSize:14,fontWeight:'900',color:'#fff'},
  retArrow:{fontSize:16,color:'#fff',fontWeight:'900'},
  statsRow:{flexDirection:'row',gap:8,marginBottom:14},
  statCard:{flex:1,borderRadius:14,borderWidth:1,paddingVertical:12,alignItems:'center'},
  statN:{fontSize:16,fontWeight:'900'},
  statL:{fontSize:9,fontWeight:'600',marginTop:4,textTransform:'uppercase',letterSpacing:0.5},
  sec:{fontSize:10,fontWeight:'700',letterSpacing:1.3,textTransform:'uppercase',marginBottom:8,marginTop:2},
  qaRow:{flexDirection:'row',gap:8,marginBottom:16},
  qa:{flex:1,borderRadius:14,borderWidth:1,paddingVertical:14,alignItems:'center',gap:6},
  qaIc:{fontSize:20},
  qaLbl:{fontSize:9,fontWeight:'700',textTransform:'uppercase',letterSpacing:0.4},
  notif:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:10,borderBottomWidth:1},
  notifIc:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',flexShrink:0},
  notifT:{fontSize:13,fontWeight:'700'},
  notifS:{fontSize:11,marginTop:2,lineHeight:15},
  notifTm:{fontSize:11,flexShrink:0,marginTop:2},
});
