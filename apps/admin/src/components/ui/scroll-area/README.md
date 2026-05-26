# `ScrollArea`

Tier-2 styled scrollable container. Wraps Base UI's `ScrollArea`. Replaces the native scrollbar with a slim 8px track that fades in on hover / scroll.

```tsx
<ScrollArea viewportClassName="max-h-[60dvh]">
    {/* long content */}
</ScrollArea>
```

Apply `max-h-*` to `viewportClassName`, not the root, so the scrollbar tracks the scrollable content's height.

For native-scrollbar surfaces that need the same visual language (sticky `<th>` tables in the data grid), use the `.custom-scrollbar` utility class from `globals.css`.
