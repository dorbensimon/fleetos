import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { DriverCardIconKey } from './driverCardSections';

const FEATHER_MAP: Partial<Record<DriverCardIconKey, keyof typeof Feather.glyphMap>> = {
  phone: 'phone',
  message: 'message-circle',
  id: 'credit-card',
  sign: 'edit-3',
  doc: 'file-text',
  info: 'info',
  folder: 'folder',
  chat: 'message-square',
  alert: 'alert-triangle',
  users: 'users',
  shield: 'shield',
  award: 'award',
  hazard: 'alert-triangle',
  edit: 'edit-2',
  key: 'key',
};

const MCI_MAP: Partial<Record<DriverCardIconKey, keyof typeof MaterialCommunityIcons.glyphMap>> = {
  car: 'car',
  cap: 'school',
};

export function DriverCardIcon({
  icon,
  size,
  color,
}: {
  icon: DriverCardIconKey;
  size: number;
  color: string;
}) {
  const mciName = MCI_MAP[icon];
  if (mciName) {
    return <MaterialCommunityIcons name={mciName} size={size} color={color} />;
  }
  const featherName = FEATHER_MAP[icon] ?? 'circle';
  return <Feather name={featherName} size={size} color={color} />;
}
