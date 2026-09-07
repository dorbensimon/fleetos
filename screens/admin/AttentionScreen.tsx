import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { getAttentionSummary, type AttentionSummary } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Attention'>;
const EMPTY: AttentionSummary = { license: 0, insurance: 0, unassignedVehicles: 0, missingLicenseDocuments: 0 };
export default function AttentionScreen({ navigation }: Props) {
  const { companyId } = useCompany(); const insets = useSafeAreaInsets(); const [data, setData] = useState<AttentionSummary>(EMPTY); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{ if(!companyId){setError('לא נמצאה חברה משויכת');setLoading(false);return;} setLoading(true);setError(null);try{setData(await getAttentionSummary(companyId));}catch(e:any){setError(e?.message??'טעינת המשימות נכשלה');}finally{setLoading(false);}},[companyId]);
  useEffect(()=>{load();},[load]); const total=Object.values(data).reduce((a,b)=>a+b,0);
  const rows=[
    {count:data.license,icon:'card-outline' as const,title:'רישיונות נהיגה דורשים טיפול',detail:'רישיונות שפגו או יפוגו בתוך 30 יום'},
    {count:data.insurance,icon:'shield-outline' as const,title:'רכבים ללא ביטוח חובה בתוקף',detail:'ביטוח חסר או שתוקפו פג'},
    {count:data.unassignedVehicles,icon:'car-outline' as const,title:'רכבים ללא נהג משויך',detail:'אין לרכב שיוך פעיל של נהג'},
    {count:data.missingLicenseDocuments,icon:'document-outline' as const,title:'נהגים ללא רישיון מאומת',detail:'חסר צילום קדמי, אחורי או תוקף רישיון'},
  ].filter((x)=>x.count>0);
  return <View style={s.screen}><AdminGradientBackground/><View style={[s.header,{paddingTop:insets.top+18}]}><TouchableOpacity onPress={()=>navigation.goBack()} style={s.back}><Ionicons name="chevron-forward" size={22} color="#102A42"/></TouchableOpacity><View><AppText weight="bold" style={s.title}>דורש טיפול</AppText><AppText style={s.sub}>מה צריך לטפל בו היום</AppText></View><View style={s.spacer}/></View>{loading?<LoadingState/>:error?<ErrorState message={error} onRetry={load}/>:<ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>{total===0?<EmptyState icon="checkmark-circle-outline" title="הכול מטופל" hint="אין כרגע משימות פתוחות בצי"/>:<><View style={s.summary}><AppText weight="bold" style={s.number}>{total}</AppText><AppText style={s.summaryText}>משימות דורשות את תשומת לבך</AppText></View>{rows.map((row)=><View key={row.title} style={s.card}><View style={s.count}><AppText weight="bold" style={s.countText}>{row.count}</AppText></View><View style={s.copy}><AppText weight="bold" style={s.cardTitle}>{row.title}</AppText><AppText style={s.detail}>{row.detail}</AppText></View><Ionicons name={row.icon} size={23} color="#C47A00"/></View>)}</>}</ScrollView>}</View>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#F1F4F7'},header:{paddingHorizontal:18,paddingBottom:18,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},back:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(255,255,255,.55)',alignItems:'center',justifyContent:'center'},spacer:{width:42},title:{fontSize:20,color:'#102A42',textAlign:'center'},sub:{fontSize:12,color:'rgba(16,42,66,.58)',marginTop:2,textAlign:'center'},content:{padding:18,gap:11,paddingBottom:42,flexGrow:1},summary:{backgroundColor:'rgba(255,247,223,.9)',borderRadius:22,padding:20,alignItems:'center',marginBottom:4},number:{fontSize:34,color:'#A96300'},summaryText:{fontSize:14,color:'#744600',marginTop:3},card:{backgroundColor:'rgba(255,255,255,.92)',borderRadius:20,padding:16,flexDirection:'row-reverse',alignItems:'center',gap:12},count:{width:39,height:39,borderRadius:19.5,backgroundColor:'#FFF0CB',alignItems:'center',justifyContent:'center'},countText:{fontSize:18,color:'#A96300'},copy:{flex:1,alignItems:'flex-end'},cardTitle:{fontSize:15,color:'#102A42',textAlign:'right'},detail:{fontSize:12.5,color:'rgba(16,42,66,.62)',marginTop:4,textAlign:'right'}});
