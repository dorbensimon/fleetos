/**
 * The business behind icar, as it appears in the legal pages. Details still
 * missing are `null` and are simply left out of the pages until filled in.
 */
export const BUSINESS = {
  name: 'טולוקס (Tolvex)',
  type: 'עוסק פטור',
  /** מספר עוסק — to be provided. */
  registrationNumber: null as string | null,
  /** Registered address — to be provided. */
  address: null as string | null,
  phone: '052-676-8544',
  phoneHref: 'tel:+972526768544',
  email: 'trytolvex@gmail.com',
  site: 'icar-app.com',
} as const;

export const ACCESSIBILITY_COORDINATOR = {
  name: 'דור',
  phone: BUSINESS.phone,
  phoneHref: BUSINESS.phoneHref,
  email: BUSINESS.email,
} as const;

/** One line for footers: "טולוקס (Tolvex) · עוסק פטור 123456789 · כתובת". */
export function businessLine(): string {
  return [
    BUSINESS.name,
    BUSINESS.registrationNumber ? `${BUSINESS.type} ${BUSINESS.registrationNumber}` : BUSINESS.type,
    BUSINESS.address,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The same details inside a sentence: "טולוקס (Tolvex), עוסק פטור מס׳ 123456789, כתובת". */
export function businessSentence(): string {
  const type = BUSINESS.registrationNumber ? `${BUSINESS.type} מס׳ ${BUSINESS.registrationNumber}` : BUSINESS.type;
  return [BUSINESS.name, type, BUSINESS.address].filter(Boolean).join(', ');
}
