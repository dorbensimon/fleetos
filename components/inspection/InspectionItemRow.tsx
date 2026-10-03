import React, { memo, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DK, DKText, KitInput, Pressy, STATUS } from "../driverKit";
import {
  INSPECTION_LIMITS,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_META,
  type InspectionAnswer,
  type InspectionItem,
  type InspectionStatus,
} from "../../lib/inspections";
import { t } from "../../lib/i18n";

/**
 * The desktop take on InspectionItemCard: one table row per item, with the
 * number, the text, three compact choices and a note button side by side.
 * The note line opens under the row; a defect opens it at once.
 */
export const InspectionItemRow = memo(function InspectionItemRow({
  number,
  item,
  answer,
  onStatus,
  onNote,
  last,
}: {
  number: number;
  item: InspectionItem;
  answer: InspectionAnswer | undefined;
  onStatus: (itemId: string, status: InspectionStatus) => void;
  onNote: (itemId: string, note: string) => void;
  last?: boolean;
}) {
  const status = answer?.status ?? null;
  const note = answer?.note ?? "";
  const defect = status === "not_ok";
  const [editing, setEditing] = useState(false);
  const meta = status ? INSPECTION_STATUS_META[status] : null;

  useEffect(() => {
    if (defect && !note.trim()) setEditing(true);
  }, [defect, note]);

  const missing = defect && !note.trim();

  return (
    <View
      style={[styles.row, !last && styles.divider, defect && styles.rowDefect]}
    >
      <View style={styles.line}>
        <View style={[styles.num, meta && { backgroundColor: meta.soft }]}>
          {meta ? (
            <Ionicons name={meta.icon} size={15} color={meta.fg} />
          ) : (
            <DKText variant="caption" color={DK.inkSoft}>
              {number}
            </DKText>
          )}
        </View>
        <DKText variant="body" style={styles.text}>
          {item.text}
        </DKText>
        <View
          style={styles.options}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("inspection.itemState", {
            number,
            text: item.text,
          })}
        >
          {INSPECTION_STATUSES.map((key) => {
            const on = status === key;
            const m = INSPECTION_STATUS_META[key];
            return (
              <Pressy
                key={key}
                onPress={() => onStatus(item.id, key)}
                pressScale={0.96}
                accessibilityLabel={`${m.label}${on ? t("common.selectedSuffix") : ""}, ${item.text}`}
                style={[
                  styles.option,
                  on
                    ? { backgroundColor: m.fg, borderColor: m.fg }
                    : styles.optionOff,
                ]}
              >
                <Ionicons
                  name={m.icon}
                  size={15}
                  color={on ? "#FFFFFF" : DK.muted}
                />
                <DKText
                  variant="label"
                  color={on ? "#FFFFFF" : DK.inkSoft}
                  numberOfLines={1}
                >
                  {m.label}
                </DKText>
              </Pressy>
            );
          })}
        </View>
        <Pressy
          onPress={() => setEditing((v) => !v || missing)}
          accessibilityLabel={
            note
              ? t("inspection.noteEdit", {
                  v1: defect ? t("inspection.problem") : t("common.note"),
                  note,
                })
              : t("inspection.addNoteFor", { text: item.text })
          }
          style={[
            styles.noteButton,
            (editing || !!note) && styles.noteButtonOn,
          ]}
          pressScale={0.92}
        >
          <Ionicons
            name={note ? "chatbox-ellipses" : "chatbox-ellipses-outline"}
            size={18}
            color={note || editing ? DK.accent : DK.muted}
          />
        </Pressy>
      </View>

      {editing ? (
        <View style={styles.noteEdit}>
          {defect && (
            <DKText variant="label" color={STATUS.expired.fg}>
              {t("inspection.whatsProblemRequired")}
            </DKText>
          )}
          <View style={styles.noteLine}>
            <KitInput
              value={note}
              onChangeText={(text) => onNote(item.id, text)}
              placeholder={
                defect
                  ? t("inspection.problemExample")
                  : t("checklist.notePlaceholder")
              }
              accessibilityLabel={
                defect
                  ? t("inspection.problemIn", { text: item.text })
                  : t("inspection.noteFor", { text: item.text })
              }
              autoFocus={!defect || !note}
              hasError={missing}
              maxLength={INSPECTION_LIMITS.note}
              style={styles.flex}
            />
            {!missing && (
              <Pressy
                onPress={() => setEditing(false)}
                accessibilityLabel={t("common.done")}
                style={styles.noteDone}
                pressScale={0.95}
              >
                <Ionicons name="checkmark" size={18} color={DK.accent} />
                <DKText variant="label" color={DK.accent}>
                  {t("common.done")}
                </DKText>
              </Pressy>
            )}
          </View>
        </View>
      ) : note ? (
        <Pressy
          onPress={() => setEditing(true)}
          accessibilityLabel={t("common.edit")}
          style={styles.noteSaved}
          pressScale={0.99}
        >
          <Ionicons
            name={defect ? "alert-circle" : "chatbox-ellipses-outline"}
            size={16}
            color={defect ? STATUS.expired.fg : DK.inkSoft}
          />
          <DKText
            variant="caption"
            color={defect ? STATUS.expired.fg : DK.inkSoft}
            style={styles.flex}
          >
            {note}
          </DKText>
        </Pressy>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { paddingVertical: 12, paddingHorizontal: 18, gap: 10 },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DK.hairline,
  },
  rowDefect: { backgroundColor: "rgba(255,77,94,0.04)" },
  line: { flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  num: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: DK.surfaceSunk,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, fontSize: 15, lineHeight: 22 },
  options: { flexDirection: "row-reverse", gap: 6 },
  option: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionOff: {
    backgroundColor: DK.surface,
    borderColor: "rgba(10,22,38,0.12)",
  },
  noteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noteButtonOn: { backgroundColor: DK.accentSoft },
  noteEdit: { gap: 6, paddingStart: 42 },
  noteLine: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  noteDone: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: DK.accentSoft,
  },
  noteSaved: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginStart: 42,
    padding: 10,
    borderRadius: 10,
    backgroundColor: DK.surfaceSunk,
  },
});
