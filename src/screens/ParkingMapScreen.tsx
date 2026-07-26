import React, {useState} from 'react';
import {View,Text,StyleSheet,SafeAreaView,ScrollView,TouchableOpacity} from 'react-native';
import {useTheme} from '../context/ThemeContext';

type SS = 'free'|'occupied';
const BLOCKS = [
  {name:'Block A',letter:'A',rows:[['occupied','occupied','free','occupied','occupied','free','free','occupied'],['occupied','free','free','occupied','free','occupied','occupied','free'],['free','occupied','occupied','occupied','free','free','occupied','occupied']]},
  {name:'Block B',letter:'B',rows:[['free','free','occupied','free','occupied','occupied','free','free'],['occupied','occupied','free','free','free','occupied','free','occupied'],['free','occupied','free','occupied','occupied','free','free','free']]},
];
const MY_SLOT = 'A-203';
export function ParkingMapScreen() {
  const {colors,isDark} = useTheme();
  const [picked,setPicked] = useState(MY_SLOT);
  let idx = 0;
  return (
    <SafeAreaView style={[s.safe,{backgroundColor:colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={[s.leg,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}>
          {[{col:colors.primary,lbl:'Your Car'},{col:isDark?'#0D2A1C':'#E8F8EE',tc:colors.success,lbl:'Free'},{col:isDark?'#2A2A2A':'#E8E8E8',tc:colors.textMuted,lbl:'Occupied'}].map(i=>(
            <View key={i.lbl} style={s.legItem}><View style={[s.legDot,{backgroundColor:i.col}]}/><Text style={[s.legTxt,{color:colors.textSecondary}]}>{i.lbl}</Text></View>
          ))}
          <View style={{flex:1}}/>
          <View style={[s.mySlot,{backgroundColor:colors.primary+'15',borderColor:colors.primary+'44'}]}><Text style={[s.mySlotT,{color:colors.primary}]}>📍 {picked}</Text></View>
        </View>
        <View style={s.pad}>
          {BLOCKS.map(bl=>(
            <View key={bl.name} style={s.blkWrap}>
              <Text style={[s.blkName,{color:colors.textPrimary}]}>{bl.name}</Text>
              {bl.rows.map((row,ri)=>(
                <View key={ri} style={s.slotRow}>
                  {row.map((st,ci)=>{
                    idx++;
                    const lbl=`${bl.letter}-${String(idx).padStart(3,'0')}`;
                    const isMe=lbl===MY_SLOT, isSel=lbl===picked;
                    const bg=isMe?colors.primary:isSel?colors.primary+'CC':st==='free'?(isDark?'#0D2A1C':'#DCF5E7'):(isDark?'#252525':'#EFEFEF');
                    const tc=isMe||isSel?'#fff':st==='free'?colors.success:colors.textMuted;
                    return (
                      <TouchableOpacity key={ci} activeOpacity={0.7} onPress={()=>setPicked(lbl)}
                        style={[s.slot,{backgroundColor:bg,borderColor:isSel?colors.primary:colors.border,borderWidth:isSel?2:1}]}>
                        <Text style={[s.slotT,{color:tc}]}>{isMe?'🚗':''}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              <View style={[s.aisle,{backgroundColor:colors.primary+'18'}]}><Text style={[s.aisleTxt,{color:colors.primary}]}>AISLE</Text></View>
            </View>
          ))}
          <View style={[s.stats,{backgroundColor:colors.card,borderColor:colors.border}]}>
            {[{n:'123',l:'Occupied',c:colors.textPrimary},{n:'77',l:'Available',c:colors.success},{n:'200',l:'Total',c:colors.primary},{n:'61%',l:'Occupancy',c:colors.warning}].map(st=>(
              <View key={st.l} style={s.stIt}><Text style={[s.stN,{color:st.c}]}>{st.n}</Text><Text style={[s.stL,{color:colors.textMuted}]}>{st.l}</Text></View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe:{flex:1},scroll:{paddingBottom:32},
  leg:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:10,borderBottomWidth:1,gap:12},
  legItem:{flexDirection:'row',alignItems:'center',gap:5},legDot:{width:12,height:12,borderRadius:3},legTxt:{fontSize:11,fontWeight:'600'},
  mySlot:{paddingHorizontal:10,paddingVertical:4,borderRadius:8,borderWidth:1},mySlotT:{fontSize:11,fontWeight:'800'},
  pad:{padding:16},blkWrap:{marginBottom:20},blkName:{fontSize:14,fontWeight:'900',marginBottom:10},
  slotRow:{flexDirection:'row',gap:4,marginBottom:4},
  slot:{flex:1,height:34,borderRadius:6,alignItems:'center',justifyContent:'center'},slotT:{fontSize:10,fontWeight:'700'},
  aisle:{borderRadius:6,paddingVertical:5,alignItems:'center',marginTop:4},aisleTxt:{fontSize:9,fontWeight:'800',letterSpacing:2},
  stats:{flexDirection:'row',borderRadius:16,borderWidth:1,padding:16,marginTop:4},
  stIt:{flex:1,alignItems:'center'},stN:{fontSize:20,fontWeight:'900'},stL:{fontSize:9,fontWeight:'700',textTransform:'uppercase',letterSpacing:0.5,marginTop:4},
});
