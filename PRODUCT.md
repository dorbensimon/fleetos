# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

FleetOS is used by three roles on the same Supabase-backed account system:
- **Admins** (מנהלי צי) — run day-to-day fleet operations for one company: manage drivers and vehicles, track license/compliance document expiry, send documents for digital signature, review activity logs and reports.
- **Owners** (בעלי חברות) — manage multiple companies through the app, including company-level settings and deletion flows.
- **Drivers** (נהגים) — primarily on mobile: view their profile, assigned vehicle, signing documents, and license status. [User-confirmed] drivers also use the desktop/web version at times, not mobile-exclusively — desktop work must not assume "admin-only."

## Product Purpose

A fleet-management tool for Israeli trucking/fleet companies to track drivers, vehicles, and the compliance paperwork (licenses, insurance, tests) that keeps them legal to operate, with built-in digital document signing (DocuSeal) so paperwork doesn't require a separate system.

## Positioning

[Inferred from codebase, not confirmed with the user] Combines fleet/driver/vehicle roster management with compliance-expiry tracking and native e-signature in one Hebrew-first tool, instead of stitching together a spreadsheet, a separate signing tool, and manual expiry reminders.

## Operating Context

- Hebrew, full RTL — all UI, all surfaces.
- One Expo/React Native codebase serves native mobile apps (iOS/Android) and a website via react-native-web; Supabase is the backend.
- Compliance is time-sensitive: license/insurance/test expiry states (ok/soon/expired/missing) drive color-coded urgency throughout the app (`severityFor`/`expiryState` in `lib/theme.ts`).
- Document signing flows through DocuSeal (embedded web view + a desktop-specific layout already exists for it).

## Capabilities and Constraints

- [User-confirmed] The desktop/web surface must become a genuinely different, desktop-native experience — not a stretched phone layout — while the native mobile app's existing UI/UX is left untouched. This is an **adaptive** product: one codebase, two design languages by platform.
- [User-confirmed] Full RTL/Hebrew must be preserved everywhere in the desktop redesign.
- Existing native mobile design system is split across multiple deliberately-separate theme files (`lib/theme.ts`, `lib/colors.ts` (FLEET_COLORS), `driverCardTheme.ts`, `signingTheme.ts`, `ownerTheme.ts`, `driverEditTheme.ts`), several explicitly marked "do not reuse elsewhere" — these encode real product/architecture decisions from prior work and are not to be silently merged. A desktop design system is a new, separate layer, not a migration of these.
- Animation on native mobile uses React Native's core `Animated` API (no Reanimated dependency currently installed). Any UI-library or animation choice for desktop is a separate, web-only decision and does not need to match native's constraints.
- No new dependency should be installed without confirming with the user first (project convention).

## Brand Commitments

- Hebrew name/voice throughout (e.g. "יצירת נהג חדש", "רכב:", "לחתימה"). The product's actual brand name is **Tolvex Fleet** (found in the existing desktop shell's sidebar branding, `components/desktop/DesktopShell.tsx`); "fleetos" is the package/repo id, not the shown brand.

## Evidence on Hand

- No dedicated marketing/desktop-specific assets, logo variants, or brand guidelines found in the repo. Existing icon/asset set is the native app's (`assets/`), sized for mobile — a desktop layout may need new asset treatment, which future work should flag rather than assume.

## Product Principles

1. Desktop is a first-class, distinct surface — not a scaled-up phone screen — but it must not touch or regress the native mobile experience.
2. Compliance urgency (expiring/expired documents) is the product's core visual signal and must stay legible and prominent in any new desktop layout.
3. Hebrew/RTL is not an afterthought — every new desktop layout decision (sidebar side, reading order, icon direction) is made RTL-first.
4. Respect the existing, deliberately-separated native theme architecture; desktop gets its own design system rather than inheriting or merging native tokens.
5. All three roles (admin, owner, and occasionally driver) can land on desktop — the redesign should not silently assume admin-only usage.

## Accessibility & Inclusion

No project-specific accessibility requirement was established beyond standard RTL/Hebrew support. [Open] Should be revisited if the user has a formal a11y/compliance target.
