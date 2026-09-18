import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, EmptyState, ErrorState, LoadingState, BackButton } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { getAttentionSummary, type AttentionSummary } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';
import { CONTENT_MAX_WIDTH, COLORS, FONT_SIZE, BRAND } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { AttentionDesktopView } from '../../components/desktop/AttentionDesktopView';

type Props = NativeStackScreenProps<RootStackParamList, 'Attention'>;
const EMPTY: AttentionSummary = { license: 0, insurance: 0, unassignedVehicles: 0, missingLicenseDocuments: 0 };
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type AttentionRow = { count: number; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string };

/** Fades + rises in on mount, staggered by index, instead of popping in with the rest of the list. */
function AttentionCard({ row, index }: { row: AttentionRow; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 200, delay: index * 45, easing: EASE_OUT, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);
  return (
    <Animated.View style={[s.card, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      <View style={s.count}><AppText weight="bold" style={s.countText}>{row.count}</AppText></View>
      <View style={s.copy}><AppText weight="bold" style={s.cardTitle}>{row.title}</AppText><AppText style={s.detail}>{row.detail}</AppText></View>
      <Ionicons name={row.icon} size={23} color={COLORS.warnText} />
    </Animated.View>
  );
}
export default function AttentionScreen({ navigation }: Props) {
  const { companyId } = useCompany(); const insets = useSafeAreaInsets(); const [data, setData] = useState<AttentionSummary>(EMPTY); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const isDesktop = useIsDesktop();
  const load=useCallback(async()=>{ if(!companyId){setError('לא נמצאה חברה משויכת');setLoading(false);return;} setLoading(true);setError(null);try{setData(await getAttentionSummary(companyId));}catch(e:any){setError(e?.message??'טעינת המשימות נכשלה');}finally{setLoading(false);}},[companyId]);
  useEffect(()=>{load();},[load]); const total=Object.values(data).reduce((a,b)=>a+b,0);
  const rows=[
    {count:data.license,icon:'card-outline' as const,title:'רישיונות נהיגה דורשים טיפול',detail:'רישיונות שפגו או יפוגו בתוך 30 יום'},
    {count:data.insurance,icon:'shield-outline' as const,title:'רכבים ללא ביטוח חובה בתוקף',detail:'ביטוח חסר או שתוקפו פג'},
    {count:data.unassignedVehicles,icon:'car-outline' as const,title:'רכבים ללא נהג משויך',detail:'אין לרכב שיוך פעיל של נהג'},
    {count:data.missingLicenseDocuments,icon:'document-outline' as const,title:'נהגים ללא רישיון מאומת',detail:'חסר צילום קדמי, אחורי או תוקף רישיון'},
  ].filter((x)=>x.count>0);

  if (isDesktop) {
    return (
      <DesktopShell active="Attention" breadcrumbs={['ניהול', 'דורש טיפול']}>
        {loading ? null : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <AttentionDesktopView rows={rows} total={total} />
        )}
      </DesktopShell>
    );
  }

  return <View style={s.screen}><AdminGradientBackground/><View style={[s.header,{paddingTop:insets.top+18}]}><BackButton onPress={() => navigation.goBack()} /><View><AppText weight="bold" style={s.title}>דורש טיפול</AppText><AppText style={s.sub}>מה צריך לטפל בו היום</AppText></View><View style={s.spacer}/></View>{loading?<LoadingState/>:error?<ErrorState message={error} onRetry={load}/>:<ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>{total===0?<EmptyState icon="checkmark-circle-outline" title="הכול מטופל" hint="אין כרגע משימות פתוחות בצי"/>:<><View style={s.summary}><AppText weight="bold" style={s.number}>{total}</AppText><AppText style={s.summaryText}>משימות דורשות את תשומת לבך</AppText></View>{rows.map((row,i)=><AttentionCard key={row.title} row={row} index={i} />)}</>}</ScrollView>}</View>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:BRAND.screenBg},header:{paddingHorizontal:18,paddingBottom:18,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',width:'100%',maxWidth:CONTENT_MAX_WIDTH,alignSelf:'center'},back:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(255,255,255,.55)',alignItems:'center',justifyContent:'center'},spacer:{width:42},title:{fontSize: FONT_SIZE.xxl,color:BRAND.ink,textAlign:'center'},sub:{fontSize: FONT_SIZE.sm,color:'rgba(16,42,66,.58)',marginTop:2,textAlign:'center'},content:{padding:18,gap:11,paddingBottom:42,flexGrow:1,width:'100%',maxWidth:CONTENT_MAX_WIDTH,alignSelf:'center'},summary:{backgroundColor:'rgba(255,247,223,.9)',borderRadius:22,padding:20,alignItems:'center',marginBottom:4},number:{fontSize:34,color:COLORS.warnText},summaryText:{fontSize: FONT_SIZE.md,color:'#744600',marginTop:3},card:{backgroundColor:'rgba(255,255,255,.92)',borderRadius:20,padding:16,flexDirection:'row-reverse',alignItems:'center',gap:12},count:{width:39,height:39,borderRadius:19.5,backgroundColor:'#FFF0CB',alignItems:'center',justifyContent:'center'},countText:{fontSize: FONT_SIZE.xl,color:COLORS.warnText},copy:{flex:1,alignItems:'flex-end'},cardTitle:{fontSize: FONT_SIZE.lg,color:BRAND.ink,textAlign:'right'},detail:{fontSize: FONT_SIZE.sm,color:'rgba(16,42,66,.62)',marginTop:4,textAlign:'right'}});
