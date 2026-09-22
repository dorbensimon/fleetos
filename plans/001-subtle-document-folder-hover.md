# 001 — Replace grey folder hover with a restrained lift

- **Status**: DONE
- **Commit**: f4c82a7
- **Severity**: MEDIUM
- **Category**: Purpose & frequency; performance; accessibility
- **Estimated scope**: 3 files, small style-only change

## Problem

The document-folder tiles are high-frequency desktop controls. On hover they
replace their white surface with the grey list-row colour, which makes the
whole tile look inactive rather than interactive. Both tile families use this
pattern:

```tsx
/* components/ComplianceSection.tsx:467-471 — current */
<HoverPressable
  key={def.itemType}
  style={[styles.folderTile, isOpen && styles.folderTileOpen]}
  hoverStyle={styles.folderTileHover}
  onPress={() => setExpanded(def.itemType)}
>
```

```ts
/* components/ComplianceSection.tsx:708-718 — current */
folderTile: {
  width: 150,
  borderWidth: 1,
  borderColor: COLORS.divider,
  borderRadius: RADIUS.md,
  padding: 10,
  gap: 6,
  backgroundColor: COLORS.card,
  ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease' }),
},
folderTileHover: { backgroundColor: DESKTOP_COLORS.rowHover },
```

The free-form vehicle folders have the same grey hover at
`components/desktop/VehicleDetailDesktopView.tsx:920` and
`components/desktop/VehicleDetailDesktopView.tsx:1093-1102`. The shared
`HoverPressable` transitions only `transform` in 100ms at
`components/desktop/primitives.tsx:53-58`; the compliance tiles do not provide
any press feedback.

## Target

Keep every tile's white background on hover. Desktop pointer hover should lift
the tile by 2px and make only its border blue; it must not change the tile's
background. Use the icon/thumbnail container, not the entire tile, for the
pale-blue emphasis when the tile has no document thumbnail.

```ts
/* target values for a folder tile */
folderTile: {
  // retain existing layout properties
  backgroundColor: COLORS.card,
  ...webOnly({
    transition: 'transform 150ms ease, border-color 150ms ease',
  }),
},
folderTileHover: {
  borderColor: DESKTOP_COLORS.brand,
  transform: 'translateY(-2px)',
},
folderTilePress: { transform: 'scale(0.97)' },
```

On the web, apply hover movement only when both `(hover: hover)` and
`(pointer: fine)` match. With `prefers-reduced-motion: reduce`, retain the
border colour feedback but remove `translateY(-2px)` and the press scale.

The two explicit timing values are intentional: 150ms `ease` for a hover
colour/motion transition, and `scale(0.97)` as immediate press feedback. Do
not introduce opacity, blur, a grey fill, keyframes, or `transition: all`.

## Repo conventions to follow

- Use the existing `HoverPressable` component from
  `components/desktop/primitives.tsx`, which combines a base style,
  `hoverStyle`, and optional `pressStyle`.
- Keep all web-only CSS in `webOnly({ ... })`, as shown at
  `components/desktop/VehicleDetailDesktopView.tsx:1100`.
- Use `DESKTOP_COLORS.brand` for desktop focus/interactive blue, as already
  done by the shared primitive at `components/desktop/primitives.tsx:56`.

## Steps

1. In `components/desktop/primitives.tsx`, add an opt-in way for a caller to
   supply desktop hover motion that is guarded by `(hover: hover) and
   (pointer: fine)`, and have it respect `prefersReducedMotion()`. Preserve
   all current callers and cursor/focus behavior. Do not make hover movement a
   global default for every `HoverPressable`.
2. In `components/ComplianceSection.tsx`, replace the grey
   `folderTileHover` fill with the blue-border / `translateY(-2px)` target.
   Add a `folderTilePress: { transform: 'scale(0.97)' }` style and pass it as
   `pressStyle` to the `HoverPressable` at line 467. The tile must stay white.
   Add a subtle pale-blue background only to the no-thumbnail icon wrapper
   while hovered; if the current component API cannot target that child,
   leave this optional accent out rather than recolouring the entire tile.
3. In `components/desktop/VehicleDetailDesktopView.tsx`, apply the same
   no-grey hover, 2px lift, blue border, and 0.97 press scale to the
   `DocumentFolderGrid` tile at line 920. Its existing `pressDown` may already
   meet the target; inspect it and reuse it only if it is exactly
   `transform: 'scale(0.97)'`.
4. Ensure the reduced-motion path retains the blue border but has no transform
   movement. Ensure touch devices never receive a hover transform.

## Boundaries

- Do NOT change document loading, modal behavior, tile dimensions, copy, or
  the expiry badge states.
- Do NOT apply this animation to rows, forms, alerts, or unrelated buttons.
- Do NOT add dependencies, keyframes, shadows, filters, or `transition: all`.
- If the referenced code has changed since commit `f4c82a7`, stop and report
  the drift instead of applying the plan by guesswork.

## Verification

- **Mechanical**: run `npm run typecheck` and `npm run lint`; both should pass
  without new warnings.
- **Feel check**: on desktop web, hover a document tile repeatedly. It remains
  white, moves upward by only 2px, and its border becomes blue within 150ms.
  Move the pointer rapidly between tiles: transitions should retarget without
  jumping or replaying.
- **Press check**: hold and release a folder tile. It scales to 0.97 only
  while pressed and returns immediately on release.
- **Accessibility check**: emulate a coarse pointer: no hover movement. Enable
  `prefers-reduced-motion: reduce`: the blue-border feedback remains, but no
  lift or scale occurs.
- **Done when**: both the compliance and free-form document folder grids give
  a quiet, white-surface interactive cue with consistent pointer, press, and
  reduced-motion behavior.
