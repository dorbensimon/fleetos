import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import type { RootStackParamList } from '../../navigation/types';

/** Compatibility for old bookmarks. Sending now lives in the driver dossier. */
export default function AdminDocumentSigningScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AdminDocumentSigning'>) {
  const { profile, loading } = useCompany();
  useEffect(() => {
    if (loading || !profile) return;
    if (profile.role === 'owner') navigation.replace('GlobalSigningTemplates');
    else if (profile.role === 'admin') navigation.replace('AdminHome');
    else navigation.replace('DriverDocuments');
  }, [loading, profile, navigation]);
  return null;
}
