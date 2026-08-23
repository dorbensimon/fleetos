/**
 * Vehicle manufacturers commonly found on Israeli fleets.
 *
 * The field stays free text — an importer or a rare model must still be
 * typeable — but nearly every entry is one of these, and letting people
 * type "טו" and pick "טויוטה" keeps the fleet list from filling up with
 * four spellings of the same brand.
 *
 * Each entry carries the English name too, because plenty of admins type
 * "toyota" on an English keyboard even when the app is in Hebrew.
 */

export interface Manufacturer {
  he: string;
  en: string;
}

export const MANUFACTURERS: Manufacturer[] = [
  // Passenger cars — the volume brands here
  { he: 'טויוטה', en: 'Toyota' },
  { he: 'יונדאי', en: 'Hyundai' },
  { he: 'קיה', en: 'Kia' },
  { he: 'מאזדה', en: 'Mazda' },
  { he: 'סקודה', en: 'Skoda' },
  { he: 'סיאט', en: 'Seat' },
  { he: 'פולקסווגן', en: 'Volkswagen' },
  { he: 'סוזוקי', en: 'Suzuki' },
  { he: 'ניסאן', en: 'Nissan' },
  { he: 'מיצובישי', en: 'Mitsubishi' },
  { he: 'הונדה', en: 'Honda' },
  { he: 'פורד', en: 'Ford' },
  { he: 'שברולט', en: 'Chevrolet' },
  { he: 'רנו', en: 'Renault' },
  { he: 'פיג׳ו', en: 'Peugeot' },
  { he: 'סיטרואן', en: 'Citroen' },
  { he: 'אופל', en: 'Opel' },
  { he: 'פיאט', en: 'Fiat' },
  { he: 'דאצ׳יה', en: 'Dacia' },
  { he: 'סובארו', en: 'Subaru' },
  { he: 'מיני', en: 'Mini' },
  { he: 'ג׳יפ', en: 'Jeep' },
  { he: 'לקסוס', en: 'Lexus' },
  { he: 'ב.מ.וו', en: 'BMW' },
  { he: 'מרצדס-בנץ', en: 'Mercedes-Benz' },
  { he: 'אאודי', en: 'Audi' },
  { he: 'וולוו', en: 'Volvo' },
  { he: 'פורשה', en: 'Porsche' },
  { he: 'לנד רובר', en: 'Land Rover' },
  { he: 'אלפא רומיאו', en: 'Alfa Romeo' },
  { he: 'טסלה', en: 'Tesla' },

  // Chinese brands, now a large share of new Israeli registrations
  { he: 'צ׳רי', en: 'Chery' },
  { he: 'אם.ג׳י', en: 'MG' },
  { he: 'בי.ווי.די', en: 'BYD' },
  { he: 'ג׳ילי', en: 'Geely' },
  { he: 'ג׳אק', en: 'JAC' },
  { he: 'גרייט וול', en: 'Great Wall' },
  { he: 'ליפאן', en: 'Lifan' },
  { he: 'דונגפנג', en: 'Dongfeng' },

  // Commercial vehicles, buses and trucks
  { he: 'איסוזו', en: 'Isuzu' },
  { he: 'איווקו', en: 'Iveco' },
  { he: 'מאן', en: 'MAN' },
  { he: 'סקניה', en: 'Scania' },
  { he: 'דאף', en: 'DAF' },
  { he: 'פוסו', en: 'Fuso' },
  { he: 'יוטונג', en: 'Yutong' },
  { he: 'היגר', en: 'Higer' },
  { he: 'קינג לונג', en: 'King Long' },
  { he: 'גולדן דרגון', en: 'Golden Dragon' },
  { he: 'טמסה', en: 'Temsa' },
  { he: 'אוטוקאר', en: 'Otokar' },
  { he: 'ניאופלן', en: 'Neoplan' },
  { he: 'סטרה', en: 'Setra' },
];

/** Geresh, apostrophe and quote marks all mean the same letter here. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/['’׳"״]/g, '');
}

/**
 * Suggestions for what has been typed so far.
 *
 * Prefix matches come first — typing "מ" should lead with מאזדה, not with
 * a brand that merely contains the letter somewhere in the middle.
 */
export function suggestManufacturers(query: string, limit = 6): Manufacturer[] {
  const q = normalize(query);
  if (!q) return [];

  const prefix: Manufacturer[] = [];
  const contains: Manufacturer[] = [];

  for (const m of MANUFACTURERS) {
    const he = normalize(m.he);
    const en = normalize(m.en);

    if (he.startsWith(q) || en.startsWith(q)) prefix.push(m);
    else if (he.includes(q) || en.includes(q)) contains.push(m);
  }

  return [...prefix, ...contains].slice(0, limit);
}
