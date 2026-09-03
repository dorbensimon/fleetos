# Handoff: מסך רכב — תיק רכב (עיצוב v2, בתבנית מסך הנהג)

## Overview
Redesign of the FleetOS vehicle screen (tab **כללי** of the vehicle file) rebuilt in the same template as the existing **driver detail** screen: centered avatar hero, identity line, three quick-action tiles, then captioned groups of rows with colored icon tiles, value and chevron. The whole screen is one scroll surface.

Source components in the connected repo (`dorbensimon/fleetos`, branch `main`): `screens/admin/VehicleDetailScreen.tsx` (field set, tabs, expiry logic, actions) and the driver detail screen it borrows its layout from.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes of look and behavior, not production code to copy. Recreate them in the existing FleetOS app (React Native / Expo) using its components (`components/ui`: `Screen`, `Card`, `AppText`, `InfoRow`, `Badge`, `ExpiryBadge`, `SecondaryButton`, `PrimaryButton`), tokens from `lib/theme.ts`, Ionicons, and the existing navigation. Where prototype and codebase conventions conflict, keep the conventions and match the prototype visually.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and shadows below are final. Viewport 393 × 852 logical px, `dir="rtl"`.

## Screens / Views

### תיק רכב (v2)
**Purpose:** identify the vehicle, see compliance status immediately, jump into maintenance / documents / drivers, edit or archive the record.

**Layout** — a single vertical scroll surface (the entire screen scrolls; nothing is pinned), page gutter **20px**.

Background — the sky tint belongs to the top of the *content*, not to the viewport, so it scrolls away with the hero and the rest of the screen reads as flat light grey:

```css
background-color: #F1F4F7;
background-image: linear-gradient(180deg, #CFE7F5 0%, #E4EFF6 190px, #F1F4F7 380px);
background-repeat: no-repeat;
background-attachment: local;   /* scrolls with the content */
background-size: 100% 420px;
```

In React Native: render the gradient (`expo-linear-gradient`, height 420) as the first child *inside* the `ScrollView` content with the ScrollView's own `backgroundColor: '#F1F4F7'` — not as a fixed backdrop behind it.

Scrollbar chrome is hidden: `scrollbar-width: none`, `-ms-overflow-style: none`, `::-webkit-scrollbar { display: none }`.

1. **Nav row** — `padding: 52px 20px 0`, space-between.
   - Back: chevron 24px + `רכבים`, 17px / 600, `#0088CC` → `navigation.goBack()`.
   - Overflow button: 36 × 36, `border-radius: 18px`, `background: rgba(255,255,255,.75)`, three 4 × 4 `#0088CC` dots, `gap: 3px` — holds secondary actions (archive, duplicate, share).
2. **Avatar hero** — `padding: 16px 20px 0`, column, centered.
   - Avatar 104 × 104, `border-radius: 52px`, `background: linear-gradient(180deg, #3FA9E8, #0A7FD0)`, car glyph 46 × 46 stroke 1.5 `#FFF`, halo `box-shadow: 0 0 0 10px rgba(63,169,232,.14), 0 18px 34px rgba(10,127,208,.32)`.
   - Vehicle name = `manufacturer + ' ' + model` — 29px / 700, `letter-spacing: -.6px`, `margin-top: 14px`. Sample `סקודה אוקטביה`.
   - Identity line — 15px / 600, `rgba(14,30,43,.5)`, `gap: 7px`, `margin-top: 3px`: plate (`direction: ltr`, sample `124-56-755`) · type (`VEHICLE_TYPE_LABELS`, sample `פרטי`) · status dot 7 × 7 `#34C759` + status label `#2E8B57` (`VEHICLE_STATUS_LABELS[status]`, sample `פעיל`).
3. **Quick-action tiles** — `padding: 20px 20px 0`, three equal tiles, `gap: 10px`. Each: `background: #FFF`, `border-radius: 18px`, `padding: 14px 6px 13px`, column centered, `gap: 9px`, `box-shadow: 0 8px 22px -12px rgba(20,60,90,.3)`; icon chip 38 × 38 `border-radius: 19px` tinted background with matching stroke color, icon 19 × 19 stroke 1.8; label 14.5px / 700.
   - **נהג משויך** — tint `rgba(94,92,230,.12)`, icon `#5E5CE6`, person glyph → drivers tab / `VehicleDriversEditor`.
   - **תחזוקה** — tint `rgba(255,149,0,.14)`, icon `#E08600`, wrench glyph → maintenance tab.
   - **מסמכים** — tint `rgba(0,136,204,.12)`, icon `#0088CC`, document glyph → `ComplianceSection`.
   These three tiles replace the app's current tab bar (`כללי · תחזוקה · מסמכים · נהגים`); **כללי** becomes the screen itself. If parallel tab navigation must stay for consistency with the rest of the app, keep the tab bar and treat the tiles as shortcuts.
4. **Grouped sections** — `margin-top: 22px`; per section `padding: 0 20px 20px`.
   - Caption — 13.5px / 600, `rgba(14,30,43,.42)`, `padding: 0 4px 7px`.
   - Card — `background: #FFF`, `border-radius: 18px`, `overflow: hidden`, `box-shadow: 0 8px 22px -14px rgba(20,60,90,.3)`.
   - Row — `padding: 11px 14px`, `gap: 12px`, `border-bottom: 1px solid rgba(14,30,43,.07)` except the last row:
     - icon tile 34 × 34, `border-radius: 10px`, solid tint background, white icon 18 × 18 stroke 1.8;
     - label `flex: 1`, 16.5px / 700, `letter-spacing: -.2px`;
     - value 15.5px / 600, default `rgba(14,30,43,.45)`, state color where relevant, `white-space: nowrap`, dates/numbers `direction: ltr`;
     - chevron `‹` 18px, `rgba(60,60,67,.28)`.

   **Section 1 — תוקף ותחזוקה** (first, because it is why the screen gets opened):
   - `ביטוח` — shield icon, tile `#34C759`; value = `formatDate(insurance_mandatory.expiry_date)` or `חסר`, colored by `expiryState()`. Sample `12/09/2027` in `#2E8B57`.
   - `טסט` — check-circle icon, tile `#C0392B`; value = `complianceBadgeLabel(def, item)`, colored by `complianceBadgeState`. Sample `15/08/2026` in `#C0392B`.
   - `טיפול הבא` — wrench icon, tile `#FF9500`; value from `next_service_km − odometer`: `null → 'חסר'`, `≤ 0 → 'חריגה N ק״מ'` (danger), `≤ 1000 → soon`, else `'N ק״מ'`. Sample `10,000 ק״מ`.
   - `מד אוץ` — gauge icon, tile `#5E5CE6`; `odometer.toLocaleString() + ' ק״מ'`. Sample `74,315 ק״מ`. **New on this screen** (it exists in the maintenance tab data) — remove if unwanted.

   **Section 2 — פרטי רכב ורישוי**:
   - `מספר רישוי` — plate icon, tile `#0088CC`, `formatPlate(plate_number)`, ltr. Sample `124-56-755`.
   - `יצרן ודגם` — car icon, tile `#32ADE6`, `manufacturer + ' ' + model`. Sample `סקודה אוקטביה`. **Merged** from the source's two rows (יצרן, דגם) since both already appear in the hero title; split back if the edit flow needs separate rows.
   - `סוג` — tag icon, tile `#8E8E93`, `VEHICLE_TYPE_LABELS[vehicle_type]`. Sample `פרטי`.
   - `שנת ייצור` — calendar icon, tile `#8E8E93`, `production_month/production_year`, ltr. Sample `8/2022`.

   **Section 3 — זיהוי וארגון**:
   - `מספר שילדה` — barcode icon, tile `#8E8E93`, `vin`, ltr. Sample `1636`.
   - `קוד פנימי` — code icon, tile `#8E8E93`, `internal_code`, ltr. Sample `15263`.
   - `מחלקה` — building icon, tile `#5E5CE6`, department name. Sample `נהגי מסע`.
   - `שימוש הרכב` — dash icon, tile `#C7CBD1`, `usage_type` or `—`.
5. **פעולות** — caption in the same grey style, `padding: 0 20px 34px`, row `gap: 10px`, both 52px tall, `border-radius: 16px`, 16.5px / 700, icon 17 × 17 stroke 1.9:
   - `עריכת פרטים` (`flex: 1`) — `#0088CC`, white text, `box-shadow: 0 12px 24px -10px rgba(0,136,204,.6)`, Ionicons `create-outline` → `VehicleForm`.
   - `לארכיון` (126px) — `#FFF`, text/icon `#C0392B`, `box-shadow: 0 8px 22px -14px rgba(20,60,90,.3)`, Ionicons `archive-outline` → existing `confirmArchive` alert (`העברה לארכיון`, destructive confirm → `archiveVehicle` → `goBack`).

## Interactions & Behavior
- Whole screen scrolls as one surface (`ScrollView`); nothing is sticky. Hidden scroll indicators. The sky gradient scrolls with the content — see Background above.
- Every row is tappable: compliance rows open the relevant compliance item, `מספר רישוי` / spec rows open the edit form focused on that field, `מחלקה` opens department selection. Rows with no destination should drop the chevron.
- Quick tiles navigate to the maintenance / documents / drivers views.
- Archive always goes through the confirmation alert. Press feedback: `opacity .6` or scale `.98`, ~120ms.
- Loading / error / not-found states: reuse the existing `LoadingState`, `ErrorState`, "הרכב לא נמצא" under the same header.
- Data loads on focus (`useFocusEffect`) and refreshes after edits.
- Missing values show `—`; missing compliance shows `חסר`.
- Suggested addition (not built): show pending/expiring counts as the value on the מסמכים tile, mirroring `1 ממתינים` on the driver screen.

## State Management
As in `VehicleDetailScreen.tsx`: `vehicle`, `vehicleDrivers`, `driverOptions`, `departments`, `compliance`, `loading`, `loadError`, plus maintenance-edit state where relevant. Derived: `kmToService`, `serviceState`, `serviceLabel`, `insuranceDate`, `testItem` — keep existing thresholds (`≤ 0` expired, `≤ 1000` soon). The v2 layout drops the `tab` state if tiles replace the tab bar; keep it if tabs remain.

## Design Tokens
Colors
- Background gradient `#CFE7F5` → `#E4EFF6` → `#F1F4F7`
- Surface `#FFFFFF`
- Avatar gradient `#3FA9E8` → `#0A7FD0`; halo `rgba(63,169,232,.14)`
- Brand action `#0088CC`
- Icon tiles: green `#34C759`, red `#C0392B`, orange `#FF9500`, indigo `#5E5CE6`, sky `#32ADE6`, grey `#8E8E93`, faint `#C7CBD1`
- Text primary `#0E1E2B`; value `rgba(14,30,43,.45)`; caption `rgba(14,30,43,.42)`; hairline `rgba(14,30,43,.07)`; chevron `rgba(60,60,67,.28)`
- Status ok text `#2E8B57`, dot `#34C759`; danger `#C0392B`

Spacing — 3, 6, 7, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 34, 52 (gutter 20)

Typography — **Assistant** (400/500/600/700), fallback `-apple-system`. 29/700 vehicle name · 17/600 back link · 16.5/700 row label & buttons · 15.5/600 row value · 15/600 identity line · 14.5/700 tile label · 13.5/600 section caption. Tracking -.6px (29), -.2px (16.5).

Radii — 10 (row icon tile), 16 (buttons), 18 (cards, tiles, overflow button), 19 (tile icon chip), 52 (avatar), 34 (device)

Shadows — card `0 8px 22px -14px rgba(20,60,90,.3)`; tile `0 8px 22px -12px rgba(20,60,90,.3)`; avatar `0 0 0 10px rgba(63,169,232,.14), 0 18px 34px rgba(10,127,208,.32)`; primary button `0 12px 24px -10px rgba(0,136,204,.6)`

## Assets
- Font: **Assistant** (Google Fonts).
- Icons: use **Ionicons** already in the app (`create-outline`, `archive-outline`, `car-outline`, `person-outline`, `construct-outline`, `document-text-outline`, `shield-checkmark-outline`, `speedometer-outline`, `business-outline`, `barcode-outline`, `code-outline`, `calendar-outline`, `pricetag-outline`) at 18–19px inside the tiles. The prototype's inline SVG paths are stand-ins at the same optical weight.
- No raster images, no photography.

## Files
- `Vehicle General - iOS v2.dc.html` — this design (driver-screen template).
- `Vehicle General - iOS.dc.html` — the earlier version (sky-gradient hero, tab bar, three-column compliance panel), kept for reference.
- `Documents for Signing - 2A.dc.html` — sibling screen in the same design language.
- Repo reference: `screens/admin/VehicleDetailScreen.tsx`, `screens/admin/VehicleFormScreen.tsx`, `components/ui/index.tsx`, `components/ComplianceSection.tsx`, `components/VehicleDriversEditor.tsx`, `lib/theme.ts`, `lib/compliance.ts`, `lib/plate.ts`.
