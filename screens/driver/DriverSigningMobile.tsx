import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, PrimaryAction, Pressy, Reveal, STATUS, Surface, type Status } from '../../components/driverKit';
import { ErrorState, LoadingState } from '../../components/ui';
import { signingFolderStatus, type SigningFolder } from '../../lib/signingFolders';
import type { SignatureRequest } from '../../lib/docuseal';

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string;
  fatal: boolean;
  /** Present when a single folder is open; otherwise the folder list shows. */
  folder: SigningFolder | null;
  folderMode: boolean;
  folders: SigningFolder[];
  opening: string;
  onBack: () => void;
  onRetry: () => void;
  onOpenFolder: (folder: SigningFolder) => void;
  onOpenRequest: (request: SignatureRequest) => void;
};

const time = (date: string) => new Date(date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

const FOLDER_STATUS: Record<ReturnType<typeof signingFolderStatus>, { status: Status; label: string }> = {
  pending: { status: 'soon', label: 'מחכה לחתימה שלך' },
  completed: { status: 'ok', label: 'נחתם' },
  failed: { status: 'expired', label: 'דורש טיפול של מנהל הצי' },
  empty: { status: 'missing', label: 'ריק' },
};

/**
 * What the driver has to sign, first and loudest; what's signed, calmly
 * below. Each document says in words what it's waiting for.
 */
export function DriverSigningMobile(p: Props) {
  const pendingCount = p.folders.filter((f) => signingFolderStatus(f) === 'pending').length;
  const title = p.folderMode ? p.folder?.title || 'מסמך' : 'מסמכים לחתימה';
  const subtitle = p.folderMode
    ? 'פתח את המסמך כדי לחתום או לצפות'
    : pendingCount
      ? `${pendingCount} ${pendingCount === 1 ? 'מסמך מחכה' : 'מסמכים מחכים'} לחתימה שלך`
      : 'אין מסמכים שמחכים לחתימה';

  return (
    <DriverPage insetTop={p.insetTop} insetBottom={p.insetBottom} hero={<HeroTitle title={title} subtitle={subtitle} onBack={p.onBack} />}>
      {p.loading ? (
        <Surface>
          <LoadingState />
        </Surface>
      ) : p.fatal ? (
        <Surface>
          <ErrorState message={p.error || 'המסמכים לא נטענו'} onRetry={p.onRetry} />
        </Surface>
      ) : (
        <>
          {!!p.error && (
            <View style={styles.banner} accessibilityLiveRegion="polite">
              <Ionicons name="information-circle" size={18} color={STATUS.soon.fg} />
              <DKText variant="caption" color={STATUS.soon.fg} style={styles.flex}>
                {p.error}
              </DKText>
            </View>
          )}
          {p.folderMode ? <FolderView {...p} /> : <FolderList {...p} />}
        </>
      )}
    </DriverPage>
  );
}

function FolderList(p: Props) {
  if (p.folders.length === 0) {
    return (
      <Reveal>
        <Surface style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="document-text-outline" size={30} color={DK.accent} />
          </View>
          <DKText variant="heading" style={styles.center}>
            עוד לא נשלחו אליך מסמכים
          </DKText>
          <DKText variant="body" color={DK.muted} style={styles.center}>
            כשמנהל הצי ישלח טופס לחתימה, הוא יופיע כאן ותקבל התראה.
          </DKText>
        </Surface>
      </Reveal>
    );
  }
  const order = { pending: 0, failed: 1, completed: 2, empty: 3 } as const;
  const sorted = [...p.folders].sort((a, b) => order[signingFolderStatus(a)] - order[signingFolderStatus(b)]);
  return (
    <>
      {sorted.map((folder, index) => {
        const meta = FOLDER_STATUS[signingFolderStatus(folder)];
        const s = STATUS[meta.status];
        const pending = meta.status === 'soon';
        return (
          <Reveal key={folder.id} index={index}>
            <Pressy onPress={() => p.onOpenFolder(folder)} accessibilityLabel={`${folder.title}, ${meta.label}`} pressScale={0.98}>
              <Surface style={[styles.folder, pending && styles.folderPending]}>
                <View style={[styles.docIcon, { backgroundColor: s.soft }]}>
                  <Ionicons name={pending ? 'create' : meta.status === 'ok' ? 'checkmark-done' : meta.status === 'expired' ? 'alert' : 'folder-outline'} size={22} color={s.fg} />
                </View>
                <View style={styles.flex}>
                  <DKText variant="label" numberOfLines={2}>
                    {folder.title}
                  </DKText>
                  <DKText variant="caption" color={pending ? s.fg : DK.muted}>
                    {meta.label}
                  </DKText>
                </View>
                {pending ? (
                  <View style={styles.signPill}>
                    <DKText variant="micro" color="#FFFFFF">
                      לחתימה
                    </DKText>
                  </View>
                ) : (
                  <Ionicons name="chevron-back" size={18} color={DK.faint} />
                )}
              </Surface>
            </Pressy>
          </Reveal>
        );
      })}
    </>
  );
}

function FolderView(p: Props) {
  if (!p.folder) {
    return (
      <Surface style={styles.empty}>
        <DKText variant="heading" style={styles.center}>
          התיקייה אינה זמינה
        </DKText>
      </Surface>
    );
  }
  if (p.folder.requests.length === 0) {
    return (
      <Surface style={styles.empty}>
        <DKText variant="heading" style={styles.center}>
          אין כאן מסמכים
        </DKText>
      </Surface>
    );
  }
  return (
    <>
      {p.folder.requests.map((item, index) => {
        const ready = item.status === 'pending' && !!item.docuseal_submitter_slug;
        const done = item.status === 'completed';
        const status: Status = done ? 'ok' : ready ? 'soon' : 'expired';
        const s = STATUS[status];
        const meta = done
          ? `נחתם ${time(item.completed_at || item.created_at)}`
          : ready
            ? `נשלח אליך ${time(item.sent_at || item.created_at)}`
            : item.status === 'declined'
              ? 'החתימה נדחתה'
              : 'השליחה לא הושלמה — מנהל הצי יכול לשלוח שוב';
        return (
          <Reveal key={item.id} index={index}>
            <Surface style={styles.request}>
              <View style={styles.requestHead}>
                <View style={[styles.docIcon, { backgroundColor: s.soft }]}>
                  <Ionicons name={done ? 'checkmark-done' : ready ? 'create' : 'alert'} size={22} color={s.fg} />
                </View>
                <View style={styles.flex}>
                  <DKText variant="label" numberOfLines={2}>
                    {item.template_title || p.folder!.title}
                  </DKText>
                  <DKText variant="caption" color={DK.muted}>
                    {meta}
                  </DKText>
                </View>
              </View>
              {(done || ready) && (
                <PrimaryAction
                  label={done ? 'צפייה במסמך החתום' : 'חתימה על המסמך'}
                  icon={done ? 'eye-outline' : 'create-outline'}
                  tone={done ? 'ghost' : 'accent'}
                  loading={p.opening === item.id}
                  onPress={() => p.onOpenRequest(item)}
                />
              )}
            </Surface>
          </Reveal>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  banner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: STATUS.soon.soft,
  },
  folder: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, padding: DK_SPACE.md, minHeight: 76, borderRadius: 24 },
  folderPending: { borderWidth: 1.5, borderColor: 'rgba(255,174,26,0.45)' },
  docIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  signPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: DK.accent },
  request: { padding: DK_SPACE.md, gap: 14, borderRadius: 24 },
  requestHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 26 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
