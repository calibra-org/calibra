# `StickyActionBar`

Tier-3 floating bottom-center action surface. Slides up + fades in on `open=true`, pins to viewport center, injects bottom padding onto `<main>` so the last row of content stays reachable.

For the standard "N selected → cancel + delete" shape, use the tier-3 `BulkSelectionBar` (composes this primitive with the shared count badge + button cluster).

z-layer (`z-40` default) is intentionally below toasts (`z-[1090]`) and dialog backdrops (`z-50`) so a modal opening over the bar wins the layering fight.
