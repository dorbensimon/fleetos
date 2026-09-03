# Handoff: מסמכים לחתימה (עיצוב v3, תבנית תיק הנהג)

## Overview
Redesign of the FleetOS admin screen **מסמכים לחתימה** (DocuSeal signature templates), rebuilt in the same template as the vehicle/driver file screens: centered avatar hero, segmented tabs, a feature card for creating a template, and one grouped card listing the ready templates. The whole screen is a single scroll surface.

Source component in the connected repo (`dorbensimon/fleetos`, branch `main`): `screens/admin/AdminDocumentSigningScreen.tsx`.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes of look and behavior, not production code to copy. Recreate them in the existing FleetOS app (React Native / Expo) with its own components (`components/ui`), tokens from `lib/theme.ts`, Ionicons, and the existing DocuSeal integration. Where prototype and codebase conventions conflict, keep the conventions and match the prototype visually.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and shadows below are final. Viewport 393 × 852 logical px, `dir="rtl"`.

## Screens / Views

### מסמכים לחתימה → תבניות
**Purpose:** create a signature template from a PDF/image, then send an existing template for signature; manage the template list.

**Layout** — one vertical scroll surface (nothing pinned), page gutter **20px**.

Background — the sky tint belongs to the top of the *content*, so it scrolls away with the hero:

```css
background-color: #F1F4F7;
background-image: linear-gradient(180deg, #CFE7F5 0%, #E4EFF6 190px, #F1F4F7 380px);
background-repeat: no-repeat;
background-attachment: local;   /* scrolls with the content */
background-size: 100% 420px;
```

In React Native: render the gradient (`expo-linear-gradient`, height 420) as the first child *inside* the `ScrollView` content, with the ScrollView's own `backgroundColor: '#F1F4F7'`. Scroll indicators hidden.

1. **Nav row** — `padding: 52px 20px 0`. Back only: chevron 24px + `תפריט`, 17px / 600, `#0088CC` → `goBack()`. No trailing action (creation lives in the card below).
2. **Avatar hero** — `padding: 16px 20px 0`, column, centered.
   - Avatar 104 × 104, `border-radius: 52px`, `linear-gradient(180deg, #3FA9E8, #0A7FD0)`, document-with-signature glyph 46 × 46 stroke 1.4 `#FFF`, halo `box-shadow: 0 0 0 10px rgba(63,169,232,.14), 0 18px 34px rgba(10,127,208,.32)`.
   - Title `מסמכים לחתימה` — 29px / 700, `letter-spacing: -.6px`, `margin-top: 14px`.
   - Sub-line — 15px / 600, `rgba(14,30,43,.5)`, `margin-top: 3px`: template count only, e.g. `6 תבניות`.
3. **Segmented control** — `padding: 20px 20px 0`; track `background: rgba(120,120,128,.12)`, `border-radius: 11px`, `padding: 3px`; three equal segments, `padding: 8px 0`, `border-radius: 9px`, 14.5px / 700.
   Active: `background: #FFF`, `color: #0088CC`, `box-shadow: 0 3px 8px rgba(20,60,90,.14), 0 1px 1px rgba(20,60,90,.05)`. Inactive: transparent, `rgba(14,30,43,.6)`.
   Segments: **תבניות · נשלחו · ארכיון** (only תבניות is designed here).
4. **Create-template card** — caption `תבנית חדשה` (13.5px / 600, `rgba(14,30,43,.42)`, `padding: 0 4px 7px`); card `background: #FFF`, `border-radius: 22px`, `padding: 6px 6px 16px`, `overflow: hidden`, `box-shadow: 0 8px 22px -14px rgba(20,60,90,.3)`.
   - **Illustration panel** (tappable, opens the source sheet) — `height: 176px`, `border-radius: 18px`, `background: linear-gradient(170deg, #EAF4FB 0%, #DDEDF7 55%, #F4F9FC 100%)`, laid out as two columns (`display: flex`):
     - Illustration column, fixed 142px, `position: relative`: back sheet 84 × 112, `border-radius: 8px`, `rgba(255,255,255,.7)`, `rotate(6deg)`, `z-index: 0`, `top: 34px`, `right: 14px`; front sheet 96 × 124, `#FFF`, `rotate(-7deg)`, `z-index: 1`, `top: 24px`, `right: 32px`, `padding: 12px 11px`, `box-shadow: 0 12px 26px -12px rgba(20,60,90,.35)`. Inside the front sheet: a 5px title bar (`rgba(14,30,43,.12)`, 70% width) and three 4px text lines (`rgba(14,30,43,.08)`), then the signature-field placeholder — 32px tall, `border-radius: 7px`, `border: 1.5px dashed #0088CC`, `background: rgba(0,136,204,.07)`, label `חתימה` 10.5px / 700 `#0088CC`. This dashed field is the point of the illustration: it shows what "מקם את שדות החתימה" means before the user uploads anything.
     - Text column, `flex: 1`, centered vertically, `padding: 0 16px 0 14px`: heading `יצירת תבנית חדשה` 20px / 700 `-.4px`; body `העלה PDF או תמונה, ואז מקם את שדות החתימה בעורך של DocuSeal.` 13px, `rgba(14,30,43,.55)`, `line-height: 1.4`, `margin-top: 6px`.
     - Keep the two columns as real flex columns — do not overlay independently-absolute text and illustration blocks.
   - **Mini stepper** — `padding: 14px 10px 0`, `gap: 8px`: three steps, each a 19 × 19 circle (active `#0088CC` / `#FFF`; inactive `rgba(118,118,128,.14)` / `rgba(14,30,43,.45)`) 11.5px / 700, plus a label 12.5px / 700 (active `#0E1E2B`, inactive `rgba(14,30,43,.42)`), joined by a 1px `rgba(14,30,43,.1)` rail (no rail after the last step). Steps: **1 העלאה · 2 מיקום שדות · 3 שליחה** — step 1 active.
   - **Name field** — `margin: 14px 10px 0`, 48px, `border-radius: 14px`, `background: rgba(118,118,128,.1)`, `padding: 0 14px`, `gap: 10px`: pencil glyph 17 × 17 `rgba(14,30,43,.32)` + placeholder `שם המסמך` 16px `rgba(14,30,43,.32)`.
   - **Source buttons** — `margin: 12px 10px 0`, `gap: 10px`, both `flex: 1`, 50px, `border-radius: 15px`, 16px / 700, icon 18 × 18 stroke 1.8:
     - `תמונה מהגלריה` — `#0088CC`, white, `box-shadow: 0 12px 24px -10px rgba(0,136,204,.6)`.
     - `PDF או תמונה` — `rgba(118,118,128,.1)`, `#0E1E2B`.
5. **Templates list** — caption row `תבניות מוכנות` + count on the trailing edge (both 13.5px / 600, `rgba(14,30,43,.42)`); card `#FFF`, `border-radius: 18px`, `overflow: hidden`, `box-shadow: 0 8px 22px -14px rgba(20,60,90,.3)`.
   - Row — `padding: 11px 14px`, `gap: 12px`, `border-bottom: 1px solid rgba(14,30,43,.07)` except the last:
     - icon tile 34 × 34, `border-radius: 10px`, `#0088CC`, white document glyph 18 × 18 stroke 1.8;
     - name — 16.5px / 700, `-.2px`, single line with ellipsis; sub-line `תבנית DocuSeal מוכנה לשליחה` — 13.5px, `rgba(14,30,43,.45)`, ellipsis;
     - **שלח** pill — `background: rgba(0,136,204,.1)`, `color: #0088CC`, `border-radius: 10px`, `padding: 7px 11px`, 14.5px / 700, paper-plane glyph 15 × 15 stroke 1.9 → recipient selection, then send via DocuSeal;
     - **delete** tile — 34 × 34, `border-radius: 10px`, `background: rgba(192,57,43,.1)`, trash glyph 16 × 16 `#C0392B` → destructive confirm alert, then delete;
     - chevron `‹` 18px `rgba(60,60,67,.28)` → template detail.
   - Footnote under the card — 13px, `rgba(14,30,43,.4)`, `padding: 8px 4px 0`: `החלקה שמאלה על תבנית — הורדת PDF. מחיקה מבקשת אישור.`
   - Sample template names (from the live app): `iii`, `מסמך חדש חדש`, `Ghh`, `לולו`, `חדשהיום`, `בריאות`.
6. **Source bottom sheet** — scrim `rgba(14,40,60,.3)` + `blur(2px)`; sheet `#FFF`, `border-radius: 26px 26px 0 0`, `padding: 12px 20px 34px`, `box-shadow: 0 -20px 50px rgba(14,40,60,.2)`; grabber 38 × 5 `rgba(14,30,43,.15)`; title `בחירת מקור` 22px / 700 centered; then a grouped card of three rows (same row anatomy, 34px tiles):
   - `תמונה מהגלריה` — tile `#34C759` → image picker.
   - `קובץ PDF` — tile `#0088CC` → document picker.
   - `צילום מסמך` — tile `#5E5CE6` → camera.
   Tapping the scrim closes.

## Interactions & Behavior
- After a source is chosen and the file uploads, navigate to the DocuSeal field-placement editor (existing flow), which is step 2 of the stepper; step 3 is sending.
- `שלח` → recipient selection → DocuSeal submission. Delete → confirmation alert → delete. Swipe-left on a row → download the PDF.
- Row tap (chevron) → template detail.
- Segment switch loads נשלחו / ארכיון lists — same row anatomy; for נשלחו show the recipients and a status value (`נחתם` `#2E8B57` / `ממתין` `#0088CC`) in place of the שלח pill.
- Press feedback: `opacity .6` or scale `.98`, ~120ms. Empty template list: show the create card alone with no placeholder rows.

## State Management
- `tab: 'templates' | 'sent' | 'archive'`
- `sheetOpen: boolean` — source sheet
- `newDocName: string` — the name field
- `templates: { id, name }[]`, `sent: { id, docName, recipients, sentAt, status }[]`
- Uploading / sending / deleting flags for button states; refresh the lists after each mutation and on screen focus.

## Design Tokens
Colors
- Background gradient `#CFE7F5` → `#E4EFF6` → `#F1F4F7`; surface `#FFFFFF`
- Illustration panel `#EAF4FB` → `#DDEDF7` → `#F4F9FC`
- Avatar gradient `#3FA9E8` → `#0A7FD0`; halo `rgba(63,169,232,.14)`
- Brand action `#0088CC`; action tint `rgba(0,136,204,.1)`; danger `#C0392B` on `rgba(192,57,43,.1)`
- Neutral fill `rgba(118,118,128,.1)`; segmented track `rgba(120,120,128,.12)`
- Text primary `#0E1E2B`; secondary `rgba(14,30,43,.5–.55)`; muted `rgba(14,30,43,.45)`; caption `rgba(14,30,43,.42)`; hairline `rgba(14,30,43,.07)`; chevron `rgba(60,60,67,.28)`
- Sheet tiles: green `#34C759`, blue `#0088CC`, indigo `#5E5CE6`

Spacing — 3, 6, 7, 8, 10, 11, 12, 14, 16, 18, 20, 22, 34, 52 (gutter 20)

Typography — **Assistant** (400/500/600/700), fallback `-apple-system`. 29/700 screen title · 22/700 sheet title · 20/700 card heading · 17/600 back link · 16.5/700 row label · 16/700 buttons & field · 15/600 hero sub-line · 14.5/700 segments and שלח pill · 13.5/600 caption · 13.5/400 row sub-line · 13/400 body & footnote · 12.5/700 step label · 10.5/700 signature chip. Tracking: -.6px (29), -.4px (22/20), -.2px (16.5), -.3px.

Radii — 7 (signature chip), 8 (paper), 9/11 (segmented), 10 (icon tiles, pill), 14 (field), 15 (buttons), 18 (cards, panel), 22 (create card), 26 (sheet), 52 (avatar), 34 (device)

Shadows — card `0 8px 22px -14px rgba(20,60,90,.3)`; front paper `0 12px 26px -12px rgba(20,60,90,.35)`; back paper `0 10px 22px -14px rgba(20,60,90,.3)`; primary button `0 12px 24px -10px rgba(0,136,204,.6)`; segmented thumb `0 3px 8px rgba(20,60,90,.14), 0 1px 1px rgba(20,60,90,.05)`; avatar halo as above; sheet `0 -20px 50px rgba(14,40,60,.2)`

## Assets
- Font: **Assistant** (Google Fonts).
- Icons: use **Ionicons** already in the app — `document-text-outline`, `image-outline`, `camera-outline`, `paper-plane-outline`, `trash-outline`, `create-outline`, `download-outline`, chevrons — at the sizes above. The prototype's inline SVG paths are stand-ins.
- The tilted paper illustration is built from plain views (no image asset) and can stay that way.
- No raster images.

## Files
- `Documents for Signing - iOS v3.dc.html` — this design.
- `Documents for Signing - 2A.dc.html` — earlier direction (sky-gradient hero, glass carousel, sent-list) kept for reference.
- `Vehicle General - iOS v2.dc.html` — sibling screen in the same template.
- Repo reference: `screens/admin/AdminDocumentSigningScreen.tsx`, `components/ui/index.tsx`, `lib/theme.ts`.
