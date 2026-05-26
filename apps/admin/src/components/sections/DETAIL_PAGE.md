# Detail-page layout

Every detail / editor page in `apps/admin` follows the same skeleton so an operator that learns one screen can read the next without re-orienting. This file is the source of truth — read it before adding a new detail surface.

The reference implementation is `apps/admin/src/views/orders/detail/orders-detail.tsx`. The shared primitive is `apps/admin/src/components/sections/detail-page-shell.tsx`.

## Skeleton

```
┌─────────────────────────────────────────────────────────────────────┐
│ Title  [status badge]                              [actions...]     │  ← PageHeader
│ Subtitle (created-at, customer id, etc.)                            │
├─────────────────────────────────────────────────────────────────────┤
│ Optional banner (trashed / locked / archived)                       │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐  ┌────────────────────┐ │
│ │ Main column (1fr, drag + collapse)      │  │ Sidebar (320px)    │ │
│ │ ┌─────────────────────────────────────┐ │  │ ┌────────────────┐ │ │
│ │ │ Card: general                       │ │  │ │ Editor actions │ │ │
│ │ └─────────────────────────────────────┘ │  │ └────────────────┘ │ │
│ │ ┌─────────────────────────────────────┐ │  │ ┌────────────────┐ │ │
│ │ │ Card: discount / items / …          │ │  │ │ Live stats     │ │ │
│ │ └─────────────────────────────────────┘ │  │ └────────────────┘ │ │
│ │   …                                     │  │   …                │ │
│ └─────────────────────────────────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

On `< xl` the columns stack; the sidebar drops below the main column.

## Non-negotiables

- **Use `DetailPageShell`**. Don't hand-roll the layout. The shell wires `PageHeader`, both `DraggableSectionGrid` instances, and the storage keys for you.
- **No sticky bottom bars.** Save / Cancel / status changes live in `headerActions` (and/or a sidebar actions card). Sticky footers shift the page chrome on every save and conflict with the dirty-bar pattern.
- **Two storage keys per page**, derived from a single `storageKeyPrefix`: `<prefix>.main` and `<prefix>.sidebar`. The shell adds the suffixes — you pass the prefix once.
- **Sidebar is for read-mostly cards.** Live stats, related history, audit log, related-customer info. The one exception is the editor's actions card (Save / Cancel / dirty count) — pin it to the top of the sidebar so it's reachable without scrolling.
- **Main column holds the form sections** — general info, discount/value, time, cart constraints, item lists, etc.
- **Inside a card**, use `grid grid-cols-1 md:grid-cols-2 gap-4` for paired inputs. Don't let a single email field stretch across a 1200px viewport.

## Header actions convention

The orders detail uses two header actions:
1. A status flyout (changes the order status with a single click + optimistic update).
2. A `More` dropdown for less-frequent actions (resend confirmation, print, delete).

For editor-style detail pages (the coupon editor), use three:
1. A status switch (active / disabled).
2. A `More` dropdown for related panels (quick test, duplicate, extend expiry, delete).
3. A Save button — primary variant — visible only when the form is dirty.

Reset-layout (`resetSectionGridStorage`) goes into the `More` dropdown so an operator can recover from a confusing reorder.

## Section spec

Each section is a `SectionSpec` from `draggable-section-grid.tsx`:

```ts
{
    id: "general",            // stable, used as the DnD identity + persistence key
    title: t("sections.general"),
    body: <GeneralSection ... />,
    isCollapsible: true,      // default true
    isDraggable: true,        // default true
    defaultCollapsed: false,  // default false — set to true for sections that start empty
    badge: <ErrorChip />,     // optional right-of-title chip
    actions: <PerSectionMenu />, // optional right-side per-section actions
}
```

A `defaultCollapsed: true` rule of thumb: collapse sections whose initial state shows zero data (e.g. the products / categories / brands constraint pickers when the coupon has no constraints yet).

## Example

```tsx
import { DetailPageShell } from "#/components/sections/detail-page-shell";

export function MyDetail({ id }: { id: number }) {
    const { data: entity } = useEntity(id);
    if (entity === undefined) return <Skeleton ... />;

    const mainSections = [
        { id: "general", title: t("sections.general"), body: <GeneralSection entity={entity} /> },
        { id: "items", title: t("sections.items"), body: <ItemsSection entity={entity} /> },
    ];

    const sidebarSections = [
        { id: "actions", title: t("sections.actions"), body: <ActionsCard entity={entity} /> },
        { id: "stats", title: t("sections.stats"), body: <StatsCard entity={entity} /> },
    ];

    return (
        <DetailPageShell
            title={
                <span className="flex items-center gap-3">
                    {t("title", { code: entity.code })}
                    <StatusBadge tone={entity.status} />
                </span>
            }
            subtitle={t("subtitle", { date: formatDateTime(entity.createdAt, locale) })}
            headerActions={<HeaderActions entity={entity} />}
            banner={entity.deletedAt !== null ? <TrashedBanner /> : null}
            mainSections={mainSections}
            sidebarSections={sidebarSections}
            storageKeyPrefix="my.detail"
            labels={{
                grabHandle: t("dnd.grabHandle"),
                collapse: t("dnd.collapse"),
                expand: t("dnd.expand"),
            }}
        />
    );
}
```

## What goes in `headerActions` vs the actions card

| Action                                             | Header | Sidebar actions card |
|----------------------------------------------------|:------:|:--------------------:|
| Status switch / status flyout                      |   ✓    |                      |
| Save changes (only when dirty)                     |   ✓    |          ✓          |
| Cancel changes (only when dirty)                   |        |          ✓          |
| Open companion panel (quick test, duplicate, etc.) |   ✓    |                      |
| Print, export, resend                              |   ✓    |                      |
| Delete (with confirmation)                         |   ✓    |          ✓          |
| Reset section layout                               |   ✓    |                      |

The sidebar actions card duplicates the most common actions so an operator scrolled past the header still has them in reach. The header is the canonical entry point.

## Adopting in a new feature

1. Build your section components first (each is a leaf `<Card>`-shaped piece).
2. Compose them as `SectionSpec[]` in your detail page's client component.
3. Pass them to `DetailPageShell` with a unique `storageKeyPrefix` (`<area>.detail.<entity>`).
4. Add the matching `dnd.grabHandle` / `dnd.collapse` / `dnd.expand` keys to your i18n namespace.

That's it. Don't hand-roll the column layout.

## Migrating an existing detail page

`OrdersDetail` is the model but hasn't been migrated to use `DetailPageShell` yet — it predates the abstraction. Its inner shape (header + banner + 2-col grid + 2 grids) is identical, so the migration is mechanical when someone touches that file next:

```tsx
return (
    <DetailPageShell
        title={...}
        subtitle={...}
        headerActions={...}
        banner={<LockedBanner order={order} />}
        mainSections={mainSections}
        sidebarSections={sidebarSections}
        storageKeyPrefix="orders.detail.sections"
        labels={{ grabHandle: tGrid("grab"), collapse: tGrid("collapse"), expand: tGrid("expand") }}
    />
);
```

Don't pre-emptively refactor — wait until the file needs an unrelated change so the migration rides along instead of churning the diff alone.
