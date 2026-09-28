export type LicenseSide = 'front' | 'back';

/** The title each license photo is saved under and found by. Stored data, so it stays the same in every UI language. */
export const LICENSE_SIDE_STORED_TITLE: Record<LicenseSide, string> = { front: 'צד קדמי', back: 'צד אחורי' };

/** Whether photos of both sides of the license are among these documents. */
export function hasBothLicenseSides(docs: readonly { title: string | null }[]): boolean {
  return docs.some((doc) => doc.title === LICENSE_SIDE_STORED_TITLE.front) && docs.some((doc) => doc.title === LICENSE_SIDE_STORED_TITLE.back);
}
