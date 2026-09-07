import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { useCompany } from '../../lib/CompanyContext';
import { listActivityLog, type ActivityLogEntry } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { formatDate } from '../../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ActivityLog'>;
const actionText = { created: 'נוצר', updated: 'עודכן', deleted: 'נמחק' };
const entityText = { department: 'מחלקה', vehicle: 'רכב', driver: 'תיק נהג', profile: 'פרופיל', compliance: 'פריט עמידה בדרישות', document: 'מסמך', assignment: 'שיוך רכב לנהג' };

export default function ActivityLogScreen({ navigation }: Props) {
  const { companyId } = useCompany(); const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ActivityLogEntry[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!companyId) { setError('לא נמצאה חברה משויכת'); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setRows(await listActivityLog(companyId)); } catch (e: any) { setError(e?.message ?? 'טעינת היומן נכשלה'); } finally { setLoading(false); }
  }, [companyId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <View style={s.screen}><AdminGradientBackground />
    <View style={[s.header, { paddingTop: insets.top + 18 }]}><TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Ionicons name="chevron-forward" size={22} color="#102A42" /></TouchableOpacity><View><AppText weight="bold" style={s.title}>יומן פעולות</AppText><AppText style={s.subtitle}>100 הפעולות האחרונות בחברה</AppText></View><View style={s.spacer} /></View>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : <FlatList data={rows} keyExtractor={(x) => x.id} contentContainerStyle={s.list} refreshing={loading} onRefresh={load}
      ListEmptyComponent={<EmptyState icon="time-outline" title="עדיין אין פעולות ביומן" hint="פעולות ניהול יופיעו כאן אוטומטית" />}
      renderItem={({ item }) => <View style={s.card}><View style={s.icon}><Ionicons name={item.action === 'deleted' ? 'trash-outline' : item.action === 'created' ? 'add-circle-outline' : 'create-outline'} size={19} color={item.action === 'deleted' ? '#C53535' : '#0088CC'} /></View><View style={s.content}><AppText weight="bold" style={s.line}>{entityText[item.entity_type]} {item.entity_label ? `· ${item.entity_label}` : ''}</AppText><AppText style={s.detail}>{item.actor?.full_name || 'המערכת'} · {actionText[item.action]}</AppText><AppText style={s.date}>{formatDate(item.created_at)}</AppText></View></View>}
    />}</View>;
}
const s = StyleSheet.create({ screen:{flex:1,backgroundColor:'#F1F4F7'}, header:{paddingHorizontal:18,paddingBottom:18,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}, back:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(255,255,255,.55)',alignItems:'center',justifyContent:'center'}, spacer:{width:42}, title:{fontSize:20,color:'#102A42',textAlign:'center'}, subtitle:{fontSize:12,color:'rgba(16,42,66,.58)',marginTop:2,textAlign:'center'}, list:{padding:18,paddingTop:4,gap:10,paddingBottom:42}, card:{backgroundColor:'rgba(255,255,255,.9)',borderRadius:20,padding:15,flexDirection:'row-reverse',gap:12,shadowColor:'#102A42',shadowOpacity:.1,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:2}, icon:{width:36,height:36,borderRadius:18,backgroundColor:'rgba(0,136,204,.09)',alignItems:'center',justifyContent:'center'}, content:{flex:1,alignItems:'flex-end'}, line:{fontSize:15,color:'#102A42',textAlign:'right'}, detail:{fontSize:13,color:'rgba(16,42,66,.68)',marginTop:3,textAlign:'right'}, date:{fontSize:11,color:'rgba(16,42,66,.48)',marginTop:5,textAlign:'right'} });
