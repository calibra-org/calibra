# `EntityCombobox`

Tier-3 canonical async-multi-select for entity-shaped data (id + label + sublabel + optional image). The foundation every business picker in `components/business/*-picker/` composes on top of.

```tsx
<EntityCombobox
    selectedIds={ids}
    onSelectionChange={setIds}
    onSearch={(q) => searchProducts(q).then((rows) => rows.map(toOption))}
    onResolve={(ids) => fetchProductsByIds(ids).then((rows) => rows.map(toOption))}
    labels={{ placeholder, search, empty, remove, clearAll }}
/>
```

Current implementation re-exports `MultiCombobox` from `#/components/ui/combobox`. The dedicated `EntityCombobox` layer (creatable rows + tree rendering + image fallback chip) is a follow-up extraction; the canonical import path is established now so business pickers can target `#/components/ui/entity-combobox` from day one.

**Load-bearing rule** (mirrored from `combobox/README.md`): never pass `items` to `Combobox.Root` when the parent owns the search. EntityCombobox enforces this structurally — it renders `Item` children directly from the resolved option list.
