# Handoff: מסך רכב — "כללי" (עיצוב iOS מחדש)

## Overview
Redesign of the FleetOS vehicle file screen, tab **כללי** — the screen a fleet admin lands on from the vehicles list. It shows vehicle identity (manufacturer + model, plate, type, status), the three compliance indicators (insurance / annual test / next service), the technical detail list, and the two record actions (edit, archive).

Source component in the connected repo: `screens/admin/VehicleDetailScreen.tsx` (repo `dorbensimon/fleetos`, branch `main`). The redesign changes only presentation — field set, tab set, badge semantics and actions are taken from that file.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes of the intended look and behavior, not production code to copy. The task is to **recreate this design inside the existing FleetOS app** (React Native / Expo) using its own components (`components/ui`: `Screen`, `Card`, `AppText`, `InfoRow`, `Badge`, `ExpiryBadge`, `SecondaryButton`), theme tokens (`lib/theme.ts`), Ionicons, and navigation. Where the prototype conflicts with the codebase's conventions, keep the conventions and match the prototype visually.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and shadows below are final. Target viewport 393 × 852 logical px (iPhone 15/16 class), `dir="rtl"`.

## Screens / Views

### תיק רכב → כללי
**Purpose:** see everything identifying one vehicle, spot an expiring compliance item at a glance, jump to edit or archive.

**Layout** — one surface, full-bleed sky gradient, no page background cards:

`linear-gradient(180deg, #7FC4E8 0%, #A9D9F1 24%, #DCEEF8 46%, #F4FAFC 62%, #F7F9FA 100%)`

Horizontal page padding is **22px** everywhere. Vertical order:

1. **Nav row** — `padding: 52px 22px 0`, flex row, space-between, white content.
   - Back: chevron (25px glyph) + label `רכבים`, 17px. Maps to `ScreenHeader onBack`.
   - Edit button: 38 × 38, `border-radius: 19px`, `background: rgba(255,255,255,.24)`, `backdrop-filter: blur(6px)`, pencil icon 18 × 18 stroke 1.7 (**Ionicons `create-outline`**). Navigates to `VehicleForm`.
2. **Identity block** — `padding: 22px 22px 0`, flex row, space-between, align-start.
   - Title = `manufacturer + ' ' + model` (fallback: formatted plate) — 31px / 600, `letter-spacing: -.6px`, `#FFF`, `text-shadow: 0 2px 14px rgba(20,60,90,.2)`. Sample: `סקודה אוקטביה`.
   - Subtitle = `formatPlate(plate_number) + ' · ' + VEHICLE_TYPE_LABELS[vehicle_type]` — 14.5px / 600, `rgba(255,255,255,.82)`, `margin-top: 3px`. Sample: `124-56-755 · פרטי`.
   - Status pill (`VEHICLE_STATUS_LABELS[status]`) — glass: `rgba(255,255,255,.26)`, `border: 1px solid rgba(255,255,255,.45)`, `blur(8px)`, `border-radius: 14px`, `padding: 5px 11px`, 13px / 700, `#FFF`; leading dot 7 × 7 `#BFF0CE` with `box-shadow: 0 0 0 3px rgba(191,240,206,.28)`. Sample: `פעיל`. (In the current app this badge lives inside the פרטים טכניים card; the redesign promotes it to the header.)
3. **Tab bar** — `padding: 20px 22px 0`, four equal-width tabs, `gap: 4px`, each `padding: 8px 0 9px`, 14.5px / 700, centered, `border-bottom: 2.5px solid`.
   Tabs in order (from `TABS` in the source): **כללי · תחזוקה · מסמכים · נהגים**.
   Active: text `#FFF`, underline `#FFF`. Inactive: text `rgba(255,255,255,.68)`, underline `transparent`.
4. **Compliance panel** (replaces the app's inline badge row; explicitly **not** a carousel) — `padding: 20px 22px 0`; one glass card, `border-radius: 22px`, `padding: 16px 4px`, three equal columns:
   `background: linear-gradient(175deg, rgba(255,255,255,.93) 0%, rgba(255,255,255,.74) 62%, rgba(255,255,255,.54) 100%)`, `backdrop-filter: blur(16px)`, `box-shadow: 0 26px 60px -20px rgba(20,60,90,.26)`.
   - Column: `flex: 1`, `min-width: 0`, `padding: 0 12px`, centered, `gap: 7px`; separator between columns `1px solid rgba(14,30,43,.1)` on the trailing edge (no separator on the first column).
   - Column header: state dot 7 × 7 + label, 13.5px / 600, `rgba(14,30,43,.5)`.
   - Value: 17px / 700, `letter-spacing: -.3px`, `white-space: nowrap`, colored by expiry state; dates render `direction: ltr`, km values `rtl`.
   - Columns and their values come from the source screen unchanged:
     - **ביטוח** — `formatDate(insurance_mandatory.expiry_date)` or `חסר`, state from `expiryState()`. Sample `12/09/2027`.
     - **טסט** — `complianceBadgeLabel(def, item)` / `complianceBadgeState(def, item)`. Sample `15/08/2026`.
     - **טיפול** — `next_service_km − odometer`: `null → 'חסר'` (missing), `≤ 0 → 'חריגה N ק״מ'` (expired), `≤ 1000 → soon`, else `ok`; label `'N ק״מ'`. Sample `10,000 ק״מ`.
   - No extra status copy. The color of the value **is** the status.
5. **Background line art** — decorative SVG 393 × 330, `bottom: 38px`, `opacity: .15`, `z-index: 0`, `pointer-events: none`, stroke `#5E93B5`, width 1, round caps. Motif: car silhouette on a baseline, a document with a folded corner and text lines, a screwdriver squiggle, two hairline rules. Placeholder for a proper illustration asset at the same opacity and position.
6. **Detail region** — `margin-top: 18px`, `height: 406px`, vertical scroll, **no scrollbar chrome** (`scrollbar-width: none`, `-ms-overflow-style: none`, `::-webkit-scrollbar { display:none }`), `z-index: 1`, inner `padding: 0 22px`.
   - Section title `פרטים טכניים` — 24px / 700, `-.5px`, `border-bottom: 2.5px solid #7FC4E8`, `padding-bottom: 2px`; trailing link `עריכה` 13px / 700 `#0088CC` → `VehicleForm`.
   - Spec rows (`InfoRow` equivalent) — `padding: 12px 0`, `border-bottom: 1px solid rgba(14,30,43,.08)`, label 15px `rgba(14,30,43,.5)` on the start edge, value 16px / 700 `letter-spacing: -.2px` on the end edge; numeric/plate values `direction: ltr`. Empty values render `—`.
     Rows, in source order: **מספר רישוי** `formatPlate(plate_number)` · **יצרן** `manufacturer` · **דגם** `model` · **סוג** `VEHICLE_TYPE_LABELS[vehicle_type]` · **שנת ייצור** `production_month/production_year` · **מספר שילדה** `vin` · **קוד פנימי** `internal_code` · **מחלקה** department name · **שימוש הרכב** `usage_type`.
     Sample values: `124-56-755`, `סקודה`, `אוקטביה`, `פרטי`, `8/2022`, `1636`, `15263`, `נהגי מסע`, `—`.
   - Section title `פעולות` — same 24px / 700 + `#7FC4E8` underline, `margin-top: 30px`.
   - Action row — `gap: 11px`, `margin-top: 16px`, both 54px tall, `border-radius: 18px`, 16.5px / 700, icon 17 × 17 stroke 1.8, `gap: 8px`:
     - **עריכת פרטים** (`flex: 1`) — `linear-gradient(180deg, #7FC4E8, #59AEDB)`, `#FFF`, `box-shadow: 0 12px 26px rgba(89,174,219,.4)`, Ionicons `create-outline` → `VehicleForm`.
     - **לארכיון** (132px) — `background: rgba(192,57,43,.09)`, text/icon `#C0392B`, Ionicons `archive-outline` → the existing `confirmArchive` alert (`העברה לארכיון`, destructive confirm, then `archiveVehicle` + `goBack`).

## Interactions & Behavior
- Tab switch is local state; only **כללי** is designed here. תחזוקה / מסמכים / נהגים keep their existing content (`ComplianceSection`, `VehicleDriversEditor`, maintenance form) and should adopt the same header, tab bar and section-title treatment.
- Header and compliance panel stay pinned; only the detail region scrolls.
- Press feedback, iOS style: `opacity .6` or scale `.98`, ~120ms. Archive always goes through the confirmation alert.
- Data loads on screen focus (`useFocusEffect`) — reuse the existing loading / error / not-found states; render them under the same gradient header.
- No new empty states are introduced: missing values show `—`, missing compliance shows `חסר` in the panel.

## State Management
Unchanged from `VehicleDetailScreen.tsx`: `vehicle`, `vehicleDrivers`, `driverOptions`, `departments`, `compliance`, `loading`, `loadError`, `tab`, plus the maintenance-edit state on the תחזוקה tab. Derived for this screen: `kmToService`, `serviceState`, `serviceLabel`, `insuranceDate`, `testItem` — keep the existing thresholds (`≤ 0` expired, `≤ 1000` soon).

## Design Tokens
Colors
- Sky gradient: `#7FC4E8` → `#A9D9F1` → `#DCEEF8` → `#F4FAFC` → `#F7F9FA`
- Accent underline / illustration highlight `#7FC4E8`; deep sky `#59AEDB`; line art `#5E93B5`
- Brand action blue `#0088CC` (from `lib/theme.ts`)
- Text primary `#0E1E2B`; secondary `rgba(14,30,43,.5)`; hairline `rgba(14,30,43,.08–.1)`
- State: ok `#3E9E6B`, danger/expired `#C0392B`, info `#0088CC`, status dot `#BFF0CE`
- Danger surface `rgba(192,57,43,.09)`
- Glass whites: `.93/.74/.54` (panel), `.26` (status pill), `.24` (icon button)

Spacing — 3, 4, 7, 8, 11, 12, 14, 16, 18, 20, 22, 30, 52 (page gutter 22)

Typography — **Assistant** (400/500/600/700), fallback `-apple-system`. 31/600 vehicle title · 24/700 section titles · 17/700 compliance value · 16.5/700 buttons · 16/700 spec value · 15/400 spec label · 14.5/600 subtitle & tabs · 13.5/600 compliance label · 13/700 status pill & edit link. Tracking: -.6px (31), -.5px (24), -.3px (17), -.2px (16).

Radii — 4 (dots), 14 (status pill), 18 (buttons), 19 (icon button), 22 (panel), 34 (device)

Shadows — panel `0 26px 60px -20px rgba(20,60,90,.26)`; primary button `0 12px 26px rgba(89,174,219,.4)`

Blur — `blur(16px)` panel, `blur(8px)` status pill, `blur(6px)` icon button

## Assets
- Font: **Assistant** (Google Fonts).
- Icons: use **Ionicons** already in the app — `create-outline`, `archive-outline`, plus a chevron for back — at the sizes above. The prototype's inline SVGs are stand-ins.
- Background line art: inline SVG placeholder; replace with a real illustration asset at ~15% opacity.
- No raster images.

## Files
- `Vehicle General - iOS.dc.html` — the design source for this screen.
- `Documents for Signing - 2A.dc.html` — the sibling screen this visual language came from (same gradient, glass, underlined section titles, line art).
- Repo reference: `screens/admin/VehicleDetailScreen.tsx`, `screens/admin/VehicleFormScreen.tsx`, `components/ui/index.tsx`, `lib/theme.ts`, `lib/compliance.ts`, `lib/plate.ts`.
