repo: dorbensimon/fleetos
branch: main

## Last sync
date: 2026-09-01T06:10:00Z

### Updated in this project
- Vehicle general screen redesigned (iOS language) — grounded in VehicleDetailScreen.tsx: tab set, badge row semantics, פרטים טכניים field list, actions.
- Expiry cards now show label + real value only (date / km), colored by expiry state — no invented status copy.
- Documents-for-signing screen redesign (2A) + exploration canvas.

## Screen map
| Screen | Source files |
| --- | --- |
| Vehicle General - iOS.dc.html | screens/admin/VehicleDetailScreen.tsx, lib/theme.ts, components/ui/index.tsx |
| Documents for Signing - 2A.dc.html | screens/admin/AdminDocumentSigningScreen.tsx, lib/theme.ts |
| Documents for Signing - iOS.dc.html (1a/1b/1c/2a/2b) | screens/admin/AdminDocumentSigningScreen.tsx, components/ui/index.tsx, lib/theme.ts |

## Sync history
- 2026-08-31T20:16:35Z — first import: documents-for-signing screen recreation + iOS directions.
