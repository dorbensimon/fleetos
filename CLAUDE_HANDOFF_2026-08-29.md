# Claude Handoff - August 29, 2026

This document summarizes the work completed today in `C:\fleetos`, with emphasis on the document-signing flow, vehicle compliance behavior, driver/vehicle assignment fixes, and notification routing.

## Context

- Workspace: `C:\fleetos`
- Date: August 29, 2026
- Stack area touched most today: Expo app, document signing flow, Supabase SQL/function prep
- Important safety note: one new SQL migration was prepared but not applied to production

## Main outcomes

### 1. Admin signing screen loading states were fixed

Problem:
- Tapping `PDF או תמונה` or opening an existing template visually triggered the loading state on the `תמונה מהגלריה` button.
- This happened because the screen used one shared `busy` state for multiple unrelated actions.

Fix:
- Replaced the shared loading flag with separate states for:
  - builder from gallery
  - builder from file/PDF
  - sending template to drivers
  - previewing a template
  - downloading a template
  - opening a signed request
  - downloading a signed request

File:
- `C:\fleetos\screens\admin\AdminDocumentSigningScreen.tsx`

Result:
- Each action now shows only its own loading behavior.
- Opening a template no longer looks like the gallery picker is loading.
- Choosing `PDF או תמונה` no longer visually activates the gallery upload button.

### 2. Template download and signed-document download were changed to open the native share sheet

Requested behavior:
- In signed documents / templates, download should open the device share sheet like iOS share options, instead of a custom alert flow.

Fix:
- Template download now fetches the stored file and opens the native share sheet.
- Signed request download now fetches the completed signed PDF and opens the native share sheet.

Files:
- `C:\fleetos\lib\docuseal.ts`
- `C:\fleetos\screens\admin\AdminDocumentSigningScreen.tsx`

Result:
- Tapping the download icon opens the OS share sheet directly.

### 3. Template preview behavior was updated

Requested behavior:
- For admin users, a ready template should open by tapping the entire card area, without a dedicated preview button.

Fix:
- Template cards were made tappable.
- Tapping a ready template opens the preview/webview flow directly.

Files:
- `C:\fleetos\screens\admin\AdminDocumentSigningScreen.tsx`
- `C:\fleetos\screens\DocusealWebViewScreen.tsx` was already part of the preview/signing flow and continues to be used.

### 4. Image uploads for signing templates now preserve the original uploaded image size

Problem:
- Uploaded images were previously forced into a PDF layout that did not match the original source dimensions.
- The user wanted the signing template to match the exact size of the uploaded document/image.

Fix:
- Added image dimension detection using `Image.getSize`.
- Removed fixed A4 sizing for image-to-PDF conversion.
- Generated PDF now uses the original image `width` and `height`.
- HTML/page size/body/image dimensions all follow the image dimensions.

Files:
- `C:\fleetos\lib\docuseal.ts`
- `C:\fleetos\lib\__tests__\docuseal.test.ts`

Result:
- If the uploaded file is an image, the generated PDF matches the source image size.
- This is appropriate for iPhone screenshots and other image-based documents, because the frame is now derived from the image itself.

### 5. PDF upload failure (`Invalid key`) was fixed

Problem:
- Uploading a PDF sometimes failed with a storage error like:
  - `Invalid key: .../אישור-מסירה.pdf`
- Root cause: the Supabase Storage object path used the raw file name, which could contain Hebrew characters, `/`, or other unsafe path characters.

Fix:
- Added safe filename sanitization for the storage path only.
- The displayed/original filename is still preserved for user-facing use.
- The upload key now uses a normalized ASCII-safe filename.

Files:
- `C:\fleetos\lib\docuseal.ts`
- `C:\fleetos\lib\__tests__\docuseal.test.ts`

Result:
- PDFs with problematic names should now upload successfully.

## Vehicle compliance and inspections

### 6. `בדיקה הבאה` became optional

Requested behavior:
- The app should not require a next inspection date when entering the last inspection date.
- If the user only wants to record the last check, they should be allowed to save.

Fix:
- Added an `optional` expiry state in theme/badge logic.
- Updated compliance helpers and UI to support optional next-date behavior.
- `בדיקה הבאה` label now shows as optional in the compliance editor.

Files:
- `C:\fleetos\lib\theme.ts`
- `C:\fleetos\lib\compliance.ts`
- `C:\fleetos\components\ComplianceSection.tsx`
- `C:\fleetos\components\fleet\VehicleCard.tsx`
- `C:\fleetos\screens\admin\VehicleDetailScreen.tsx`
- `C:\fleetos\screens\driver\DriverVehicleScreen.tsx`
- `C:\fleetos\screens\DriverHomeScreen.tsx`

Result:
- Users can save with only a last inspection date.

### 7. Last inspection date can now drive badge color and expiry logic

Requested behavior:
- For checks like winter check, brakes semiannual, etc., the visible date should be the last check date.
- It should show green while valid, and become red when expired.

Fix:
- Added support for `validityDays` in compliance definitions.
- Added helper functions to derive a target/expiry date from `last_date` when `expiry_date` is missing.
- UI badge label/state can now be based on either:
  - explicit `expiry_date`
  - derived `last_date + validityDays`

Files:
- `C:\fleetos\lib\compliance.ts`
- `C:\fleetos\components\ComplianceSection.tsx`
- `C:\fleetos\components\fleet\VehicleCard.tsx`
- `C:\fleetos\screens\admin\VehicleDetailScreen.tsx`
- `C:\fleetos\screens\driver\DriverVehicleScreen.tsx`
- `C:\fleetos\screens\DriverHomeScreen.tsx`

Result:
- The app can now represent last-check-driven validity in the UI.

## Notifications

### 8. Notification routing for driver users was improved

Requested behavior:
- When a driver taps a notification, it should open the relevant place where the event occurred.

Fix:
- Added/adjusted deep-link routing for notifications such as:
  - `signature_request_assigned`
  - `vehicle_assignment`
  - `driver_profile_updated_by_manager`
  - `vehicle_inspection_last_date_expiry`

File:
- `C:\fleetos\screens\admin\NotificationsScreen.tsx`

Result:
- Driver notifications now route to the relevant screen more reliably.

### 9. New expiry notification type was added in app code

Requested behavior:
- Admin and assigned driver should get alerts when certain vehicle inspections expire.

Fix in app layer:
- Added notification preference type:
  - `vehicle_inspection_last_date_expiry`
- Added it to admin and driver notification preference lists and labels.

File:
- `C:\fleetos\lib\notificationPreferencesApi.ts`

Important:
- The matching database-side trigger logic was prepared in a migration, but that migration was not applied.

## Driver/vehicle assignment and role-state fixes

### 10. First assigned driver now becomes primary automatically

Requested behavior:
- If a vehicle currently has no assigned driver, and a driver is assigned to it, that driver should become primary automatically without pressing the star manually.

Fix:
- Assignment flow now promotes the first assigned driver to primary.

Files:
- `C:\fleetos\components\VehicleDriversEditor.tsx`
- `C:\fleetos\screens\admin\DriverPersonalDetailsScreen.tsx`

### 11. Role/profile state after user switch was fixed

Problem:
- After switching users, the app could still show the old role/menu/name, for example showing driver UI while logged in as admin.

Fix:
- `CompanyContext` now listens to auth state changes and refreshes role/profile context accordingly.

File:
- `C:\fleetos\lib\CompanyContext.tsx`

### 12. Driver-to-vehicle visibility issue was fixed with an applied migration

Problem:
- A driver could be linked to a vehicle, but the driver UI still said the driver was not currently assigned.

Fix:
- A Supabase migration was applied to make the correct source of truth for vehicle/driver assignment visible under RLS.

Applied migration:
- `C:\fleetos\supabase\sql\41_vehicle_driver_rls_source_of_truth.sql`

Status:
- This one was already applied to the hosted Supabase project.

## Prepared but not applied

### 13. SQL migration for last-check expiry notifications

Prepared file:
- `C:\fleetos\supabase\sql\42_vehicle_last_check_expiry_notifications.sql`

What it does:
- Extends notification type constraints for the new inspection-expiry type
- Updates compliance notification reset logic when `last_date` changes
- Sends expiry notifications to:
  - admins
  - assigned drivers

Status:
- Prepared locally only
- Not applied to production
- Requires explicit approval before any production DB write/apply action

## Tests and verification run today

### Verified successfully

- `npm run typecheck`
- `npx jest lib/__tests__/docuseal.test.ts --runInBand`

### Test coverage added/updated

In `C:\fleetos\lib\__tests__\docuseal.test.ts`:
- image upload keeps original dimensions
- image conversion rejects unexpected multi-page output
- PDF upload bypasses image conversion
- PDF upload sanitizes unsafe filenames before storage upload

## Current behavioral assumptions

### Compliance date behavior

- If `expiry_date` exists, it is the authoritative date.
- If `expiry_date` is missing and the compliance item supports `validityDays`, the app derives effective expiry from `last_date + validityDays`.
- For optional next-date cases, the UI can still show the last inspection date without forcing a next date.

### Signing template/document behavior

- Tapping a template card previews it.
- Tapping the download icon opens native share.
- Sent signed documents show a download icon that opens native share.

## Most relevant files changed today

- `C:\fleetos\screens\admin\AdminDocumentSigningScreen.tsx`
- `C:\fleetos\lib\docuseal.ts`
- `C:\fleetos\lib\__tests__\docuseal.test.ts`
- `C:\fleetos\lib\theme.ts`
- `C:\fleetos\lib\compliance.ts`
- `C:\fleetos\components\ComplianceSection.tsx`
- `C:\fleetos\components\fleet\VehicleCard.tsx`
- `C:\fleetos\screens\admin\VehicleDetailScreen.tsx`
- `C:\fleetos\screens\driver\DriverVehicleScreen.tsx`
- `C:\fleetos\screens\DriverHomeScreen.tsx`
- `C:\fleetos\lib\notificationPreferencesApi.ts`
- `C:\fleetos\screens\admin\NotificationsScreen.tsx`
- `C:\fleetos\components\VehicleDriversEditor.tsx`
- `C:\fleetos\screens\admin\DriverPersonalDetailsScreen.tsx`
- `C:\fleetos\lib\CompanyContext.tsx`
- `C:\fleetos\supabase\sql\42_vehicle_last_check_expiry_notifications.sql`

## Open items Claude should know about

1. The local migration `42_vehicle_last_check_expiry_notifications.sql` still needs explicit approval before applying to production.
2. If any issue remains where template preview opens the wrong content type, the next place to inspect is the URL/source returned into `DocusealWebView`.
3. The image-to-PDF flow now intentionally preserves original image size rather than forcing A4.
4. The PDF upload fix only sanitizes the storage object key, not the displayed filename.

## Recommended next checks

1. Manually test template creation with:
   - an image from gallery
   - an iPhone screenshot
   - a PDF with Hebrew characters in its filename
   - a PDF with slashes or unusual punctuation in its name
2. Manually test preview/open/download on both:
   - ready templates
   - completed signed requests
3. If the user approves it later, apply `42_vehicle_last_check_expiry_notifications.sql` and verify real notification delivery.
