import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ActionRow, DK, DKText, KitSection, ListRow, Reveal, Surface } from '../driverKit';
import { BUSINESS, businessLine } from '../../lib/legal/business';
import { LEGAL_DOC_ORDER, LEGAL_DOCUMENTS, type LegalDocId, type LegalDocument } from '../../lib/legal/documents';

const DOC_ICONS: Record<LegalDocId, React.ComponentProps<typeof ListRow>['icon']> = {
  terms: 'document-text',
  privacy: 'lock-closed',
  cookies: 'server',
  accessibility: 'accessibility',
};

/**
 * One legal document laid out for reading: every section on its own
 * surface, then a way to reach us and the other documents.
 */
export function LegalDocumentBody({
  doc,
  onOpenDoc,
}: {
  doc: LegalDocument;
  /** Opens another document; left out where only this one is shown. */
  onOpenDoc?: (id: LegalDocId) => void;
}) {
  return (
    <>
      {doc.sections.map((section, i) => (
        <Reveal key={section.heading} index={Math.min(i, 6)}>
          <Surface style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={styles.number}>
                <DKText variant="micro" color={DK.accent} ltr>
                  {String(i + 1)}
                </DKText>
              </View>
              <DKText variant="heading" accessibilityRole="header" style={styles.flex}>
                {section.heading}
              </DKText>
            </View>
            {section.body.map((block, j) =>
              typeof block === 'string' ? (
                <DKText key={j} variant="body" color={DK.inkSoft} style={styles.paragraph}>
                  {block}
                </DKText>
              ) : (
                <View key={j} style={styles.list} accessibilityRole="list">
                  {block.list.map((item) => (
                    <View key={item} style={styles.item}>
                      <View style={styles.bullet} />
                      <DKText variant="body" color={DK.inkSoft} style={styles.flex}>
                        {item}
                      </DKText>
                    </View>
                  ))}
                </View>
              )
            )}
          </Surface>
        </Reveal>
      ))}

      <KitSection title="יצירת קשר">
        <ActionRow icon="call" label={`התקשרות · ${BUSINESS.phone}`} onPress={() => void Linking.openURL(BUSINESS.phoneHref)} />
        <ActionRow first={false} icon="mail" label={`שליחת מייל · ${BUSINESS.email}`} onPress={() => void Linking.openURL(`mailto:${BUSINESS.email}`)} />
      </KitSection>

      {!!onOpenDoc && (
        <KitSection title="מסמכים נוספים">
          {LEGAL_DOC_ORDER.filter((id) => id !== doc.id).map((id, i) => (
            <ListRow key={id} first={i === 0} icon={DOC_ICONS[id]} title={LEGAL_DOCUMENTS[id].title} subtitle={LEGAL_DOCUMENTS[id].summary} onPress={() => onOpenDoc(id)} />
          ))}
        </KitSection>
      )}

      <DKText variant="caption" color={DK.muted} style={styles.footer}>
        {businessLine()}
      </DKText>
    </>
  );
}

export { DOC_ICONS as LEGAL_DOC_ICONS };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { padding: 18, gap: 10 },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  number: { width: 26, height: 26, borderRadius: 9, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  paragraph: { maxWidth: 680 },
  list: { gap: 8 },
  item: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, maxWidth: 680 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: DK.accent, marginTop: 9 },
  footer: { textAlign: 'center', paddingTop: 4 },
});
