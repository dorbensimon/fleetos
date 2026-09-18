import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS } from './desktopTheme';

/**
 * Desktop body of the reports screen: two export groups (drivers/vehicles),
 * each expanding inline into its category list instead of opening a
 * mobile-style bottom sheet — there's no gesture-driven sheet idiom on
 * desktop. Purely presentational — ReportsScreen owns export logic.
 */

type Category = { value: string; label: string; icon: string };

export function ReportsDesktopView({
  open,
  onToggle,
  driverCategories,
  vehicleCategories,
  exportingCategory,
  onSelectDriverCategory,
  onSelectVehicleCategory,
}: {
  open: 'drivers' | 'vehicles' | null;
  onToggle: (kind: 'drivers' | 'vehicles') => void;
  driverCategories: Category[];
  vehicleCategories: Category[];
  exportingCategory: string | null;
  onSelectDriverCategory: (value: string) => void;
  onSelectVehicleCategory: (value: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <DText style={styles.hint}>בחר את סוג הדוח שברצונך להפיק כקובץ אקסל</DText>

      <ReportGroup
        icon="people-outline"
        title="דוחות נהגים"
        subtitle="רישיונות, תוקפים ונהגים ללא רכב"
        open={open === 'drivers'}
        onPress={() => onToggle('drivers')}
        categories={driverCategories}
        exportingCategory={exportingCategory}
        onSelect={onSelectDriverCategory}
      />
      <ReportGroup
        icon="car-outline"
        title="דוחות רכבים"
        subtitle="ביטוח, טסט, טיפולים וחריגות"
        open={open === 'vehicles'}
        onPress={() => onToggle('vehicles')}
        categories={vehicleCategories}
        exportingCategory={exportingCategory}
        onSelect={onSelectVehicleCategory}
      />
    </View>
  );
}

function ReportGroup({
  icon, title, subtitle, open, onPress, categories, exportingCategory, onSelect,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  open: boolean;
  onPress: () => void;
  categories: Category[];
  exportingCategory: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      <HoverPressable style={styles.groupHeader} hoverStyle={styles.groupHeaderHover} onPress={onPress}>
        <View style={styles.groupIcon}>
          <Ionicons name={icon} size={19} color={DESKTOP_COLORS.brand} />
        </View>
        <View style={styles.groupCopy}>
          <DText weight="bold" style={styles.groupTitle}>{title}</DText>
          <DText style={styles.groupSubtitle}>{subtitle}</DText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={DESKTOP_COLORS.inkFaint} />
      </HoverPressable>

      {open && (
        <View style={styles.categoryList}>
          {categories.map((category) => {
            const exporting = exportingCategory === category.value;
            return (
              <HoverPressable
                key={category.value}
                style={styles.categoryRow}
                hoverStyle={styles.categoryRowHover}
                onPress={() => onSelect(category.value)}
                disabled={!!exportingCategory}
              >
                <Ionicons name={category.icon as never} size={15} color={DESKTOP_COLORS.inkMuted} />
                <DText style={styles.categoryLabel}>{category.label}</DText>
                {exporting && <ActivityIndicator size="small" color={DESKTOP_COLORS.brand} />}
              </HoverPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 14, maxWidth: 640 },
  hint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, marginBottom: 4 },

  group: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 60,
  },
  groupHeaderHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  groupIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCopy: { flex: 1, gap: 2 },
  groupTitle: { fontSize: 13.5 },
  groupSubtitle: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },

  categoryList: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  categoryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 40,
  },
  categoryRowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  categoryLabel: { flex: 1, fontSize: 12.5 },
});
