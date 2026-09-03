# Handoff: מסך "מסמכים לחתימה" — עיצוב iOS (2A)

## Overview
Redesign of the FleetOS admin screen **"מסמכים לחתימה"** (documents for signing, DocuSeal-backed). The screen lists signature templates in a horizontal carousel, lets the admin create a new template (PDF/image upload → field placement in DocuSeal), and shows every document already sent for signature with its recipients and status. RTL Hebrew.

Source screen in the repo: `screens/admin/AdminDocumentSigningScreen.tsx` (repo `dorbensimon/fleetos`, branch `main`).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy. The task is to **recreate this design inside the existing FleetOS codebase** (React Native / Expo) using its established components (`components/ui`), theme tokens (`lib/theme.ts`) and navigation. Where the prototype and the codebase's conventions conflict, keep the codebase's conventions and match the prototype visually.

`Documents for Signing - 2A.dc.html` is an HTML prototype; `Documents for Signing - 2A (standalone).html` is the same screen as a single offline file for viewing.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and shadows below are final. Recreate pixel-for-pixel at a 393 × 852 logical viewport (iPhone 15/16 class). Only the illustration background may be re-drawn/replaced with a real asset.

## Screens / Views

### מסמכים לחתימה (Templates home)
**Purpose:** admin scans existing templates, sends one for signature, creates a new one, and monitors sent documents.

**Layout** — single vertical scroll surface, `dir="rtl"`, 393 × 852, `overflow: hidden`, full-bleed background gradient:

`linear-gradient(180deg, #7FC4E8 0%, #A9D9F1 26%, #DCEEF8 52%, #F6FAFC 70%, #FFFFFF 100%)`

Vertical order and offsets (all horizontal page padding = **22px**):

1. **Status/header row** — `padding: 52px 22px 0`, flex row, space-between.
   - Right (RTL start): count badge — 42 × 42, `border-radius: 21px`, `#FFF`, `box-shadow: 0 8px 20px rgba(20,60,90,.18)`, text 17px / 700, `#0E1E2B`. Content: `6`.
   - Left: icon group, `gap: 18px`, color `rgba(255,255,255,.92)` — search glyph 22 × 22 (stroke 1.6) + vertical 3-dot menu (3 × 3.5px squares, `gap: 3.5px`, `border-radius: 2px`).
2. **Title row** — `padding: 26px 22px 0`, flex row, space-between, align center.
   - Title `מסמכים לחתימה` — 29px / 600, `letter-spacing: -.5px`, `#FFF`, `text-shadow: 0 2px 12px rgba(20,60,90,.18)`.
   - "+" button — 40 × 40, `border-radius: 20px`, `background: rgba(255,255,255,.28)`, `border: 1px solid rgba(255,255,255,.5)`, `backdrop-filter: blur(6px)`, glyph 24px / 300, `#FFF`. Opens the new-template sheet.
3. **Template carousel** — flex row, `gap: 12px`, `padding: 22px 22px 0`, `overflow: hidden`, horizontally scrollable (snap to card), plus an edge fade so the trailing card dissolves into the gradient rather than being clipped:
   ```css
   mask-image: linear-gradient(270deg, #000 0%, #000 62%, rgba(0,0,0,.55) 84%, transparent 100%);
   ```
   (In React Native: `MaskedView` + `expo-linear-gradient`, or a matching absolutely-positioned gradient overlay on the leading edge.)
   All cards `height: 132px`, `border-radius: 22px`, `box-sizing: border-box`, **no visible border** — the glass fades downward instead.
   - **Add card** — 64px wide, `background: linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,.14))`, `backdrop-filter: blur(8px)`, centered "+" 30px / 300, `rgba(255,255,255,.9)`. Tap → new-template sheet.
   - **Template card (primary)** — 212px wide, `padding: 18px 20px`, column, space-between.
     `background: linear-gradient(175deg, rgba(255,255,255,.93) 0%, rgba(255,255,255,.72) 62%, rgba(255,255,255,.5) 100%)`, `backdrop-filter: blur(16px)`, `box-shadow: 0 26px 60px -18px rgba(20,60,90,.28)`.
     - Name — 23px / 600, `-.3px`, `#0E1E2B` (e.g. `הצהרת נהג`).
     - Sub — 12.5px, `rgba(14,30,43,.45)` (e.g. `3 שדות חתימה`), `margin-top: 2px`.
     - Signature glyph 24 × 24, stroke 1.5, `#7FC4E8`, top-left of the card.
     - Footer row: label `עודכן` 11px `rgba(14,30,43,.4)` over value 13.5px / 600 `#0E1E2B`; action `שלח ›` 13.5px / 600 `#0088CC`.
   - **Template card (secondary/peeking)** — 150px wide, `padding: 18px 20px`, weaker glass: `linear-gradient(175deg, rgba(255,255,255,.7), rgba(255,255,255,.42) 70%, rgba(255,255,255,.2))`, `box-shadow: 0 26px 55px -22px rgba(20,60,90,.2)`. Same name/sub type ramp.
4. **Pager dots** — `padding: 16px 0 0`, centered, `gap: 6px`, 6 × 6, `border-radius: 3px`; active `#FFF`, inactive `rgba(255,255,255,.45)`.
5. **Background line art** — decorative SVG, 393 × 360, positioned `bottom: 96px; left: 0; right: 0`, `opacity: .17`, `z-index: 0`, `pointer-events: none`, stroke `#5E93B5`, `stroke-width: 1`, round caps/joins, no fill. Motif: sheet with folded corner + text lines, clipboard, folder with a signature squiggle, a stamp/seal with rays, a hairline rule at y = 330. All foreground content from step 6 onward sits at `z-index: 1`.
6. **Section header** — `padding: 34px 22px 0`, flex row, space-between.
   - `נשלחו לחתימה` — 26px / 700, `-.5px`, `#0E1E2B`, `border-bottom: 2.5px solid #7FC4E8`, `padding-bottom: 2px` (the underline accent is the section-title signature of this design).
   - Search glyph 20 × 20, stroke 1.7, `rgba(14,30,43,.35)`.
7. **Sent list** — `padding: 16px 22px 0`, column, `gap: 15px`. One row per sent document:
   - Status dot — 9 × 9, `border-radius: 5px`, `padding-top: 7px` optical offset, color = status color.
   - Middle column (`flex: 1`, `min-width: 0`, single-line ellipsis on both text lines):
     - Document name — 16.5px / 700, `-.2px`, `#0E1E2B`.
     - Recipients — 14px / 600, `rgba(14,30,43,.68)`; multiple recipients joined with ` · `, overflow collapsed as `+2`.
     - Timestamp — 12.5px, `rgba(14,30,43,.35)`, `margin-top: 2px`.
   - Status chip — 12.5px / 700, `border-radius: 9px`, `padding: 5px 10px`, `margin-top: 4px`; text color = status color, background = status tint.
8. **Bottom bar** — absolute, `bottom: 0`, height 104px, `padding: 0 22px 18px`, align center.
   - `ארכיון` — 26px / 700, same 2.5px `#7FC4E8` underline.
   - Chart affordance — 132 × 86 panel pinned to the bottom-left corner, `border-radius: 26px 0 0 0`, `background: linear-gradient(160deg, #DCEEF8, #F2F9FD)`, bar-chart glyph 24 × 24, stroke 1.8, `#3E7EA0`.

### Bottom sheet — תבנית חדשה
Overlay `rgba(14,40,60,.3)` + `backdrop-filter: blur(2px)`, sheet pinned to bottom: `#FFF`, `border-radius: 30px 30px 0 0`, `padding: 12px 22px 36px`, `box-shadow: 0 -20px 50px rgba(14,40,60,.2)`.
- Grabber — 38 × 5, `border-radius: 3px`, `rgba(14,30,43,.15)`, centered, `margin-bottom: 18px`.
- Title `תבנית חדשה` — 24px / 700, `-.4px`.
- Sub `העלה PDF או תמונה, ואז מקם את שדות החתימה.` — 13.5px, `rgba(14,30,43,.45)`, `margin-top: 4px`.
- Name field — underline only: `margin-top: 18px`, `border-bottom: 1.5px solid rgba(14,30,43,.12)`, `padding-bottom: 10px`, placeholder 17px `rgba(14,30,43,.3)`, text `שם המסמך`.
- Actions row — `gap: 10px`, `margin-top: 20px`, both 54px tall, `border-radius: 18px`, 16.5px / 700:
  - `גלריה` — `linear-gradient(180deg, #7FC4E8, #59AEDB)`, `#FFF`, `box-shadow: 0 12px 26px rgba(89,174,219,.4)`.
  - `קובץ` — `#F0F5F8`, `#0E1E2B`.

## Interactions & Behavior
- Tap "+" in the title row, or the add card, → open the new-template sheet. Tap the scrim → close. iOS sheet presentation: slide up ~320ms, `cubic-bezier(.32,.72,0,1)`; scrim fades 0 → .3.
- `גלריה` → image picker; `קובץ` → document picker (PDF/image). After upload, navigate to the DocuSeal field-placement editor (existing flow in the repo).
- `שלח ›` on a template card → recipient selection, then send via DocuSeal.
- Template card tap → template detail (signer timeline).
- Carousel: horizontal scroll with snapping; pager dots reflect the active card.
- Sent-list row tap → document status detail. Long-press / swipe → download signed PDF, delete.
- Section search glyph → filters the sent list.
- Buttons use iOS-style press feedback: `opacity .6` / scale `.98`, ~120ms.
- Statuses are only **ממתין** (pending) and **נחתם** (signed). No other status exists in this design.

## State Management
- `sheetOpen: boolean` — new-template sheet visibility.
- `newDocName: string` — sheet text field.
- `templates: { id, name, fieldCount, updatedAt }[]` — carousel source (DocuSeal templates).
- `sent: { id, docName, recipients: string[], sentAt, status: 'pending' | 'signed' }[]` — sent list.
- `activeCard: number` — carousel pager index.
- Data fetching: templates list and submissions list from the existing DocuSeal integration; refresh on screen focus and after a send.

## Design Tokens
Colors
- Sky gradient stops: `#7FC4E8`, `#A9D9F1`, `#DCEEF8`, `#F6FAFC`, `#FFFFFF`
- Accent line / illustration highlight: `#7FC4E8`; deep sky `#59AEDB`; icon slate-blue `#3E7EA0`; line art `#5E93B5`
- Brand action blue (from `lib/theme.ts`): `#0088CC`
- Text primary `#0E1E2B`; secondary `rgba(14,30,43,.68)`; tertiary `rgba(14,30,43,.45)`; quaternary `rgba(14,30,43,.35)`
- Status signed `#3E9E6B` on `rgba(62,158,107,.12)`; status pending `#0088CC` on `rgba(0,136,204,.12)`
- Neutral fill `#F0F5F8`; hairline `rgba(14,30,43,.12)`
- Glass: white at `.93/.72/.5` (primary card), `.7/.42/.2` (secondary), `.34/.14` (add card)

Spacing — 2, 4, 6, 10, 12, 15, 16, 18, 22, 26, 34, 52 (page padding 22; list gap 15; card gap 12)

Typography — **Assistant** (Google Fonts, weights 400/500/600/700), fallback `-apple-system`. Scale: 29/600 screen title · 26/700 section title · 23/600 card title · 17/700 badge · 16.5/700 list title · 16.5/700 sheet buttons · 14/600 recipients · 13.5/600 card meta · 12.5/700 chip · 12.5/400 sub · 11/400 label. Negative tracking on display sizes: -.5px (29/26), -.4px (24), -.3px (23), -.2px (16.5).

Radii — 5 (dot), 9 (chip), 13, 18 (sheet buttons), 20/21 (circles), 22 (cards), 26 (corner panel), 30 (sheet top), 34 (device)

Shadows
- Card primary `0 26px 60px -18px rgba(20,60,90,.28)`
- Card secondary `0 26px 55px -22px rgba(20,60,90,.2)`
- Badge `0 8px 20px rgba(20,60,90,.18)`
- Sheet `0 -20px 50px rgba(14,40,60,.2)`
- Primary button `0 12px 26px rgba(89,174,219,.4)`

Blur — `blur(6px)` (+ button), `blur(8px)` (add card), `blur(14–16px)` (template cards), `blur(2px)` (scrim)

## Assets
- Font: **Assistant** from Google Fonts.
- All icons are inline SVG strokes drawn in the prototype (search, 3-dot menu, signature, download, bar chart, gallery, file, send). Replace with the icon set already used in FleetOS at the same sizes/stroke weights.
- The document line-art background is an inline SVG sketch in the prototype — treat it as a placeholder for a proper illustration asset at the same opacity (~17%) and position.
- No raster images, no photography.

## Files
- `Documents for Signing - 2A.dc.html` — the design source for this screen.
- `Documents for Signing - 2A (standalone).html` — single-file offline copy for viewing.
- `Documents for Signing - iOS.dc.html` — full exploration canvas: `1a` recreation of the current screen, `1b` grouped-list iOS version, `1c` swipe-actions version, `2a` this design, `2b` signer-timeline detail screen.
- Repo reference: `screens/admin/AdminDocumentSigningScreen.tsx`, `components/ui/index.tsx`, `lib/theme.ts`.
