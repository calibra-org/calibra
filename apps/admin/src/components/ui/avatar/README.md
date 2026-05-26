# `Avatar`

Tier-2 avatar primitive (Base UI). Three parts: `Avatar` root + `AvatarImage` (with intrinsic fallback when the image errors / hasn't loaded) + `AvatarFallback` (initials, icon, etc.). Default size is 32px; override via `className="size-10"`.

```tsx
<Avatar className="size-10">
    <AvatarImage src={user.avatarUrl} alt={user.displayName} />
    <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
</Avatar>
```

Base UI's `Avatar` handles the loading-state contract internally — the fallback renders until the image's `load` event fires, so there's never a flash of nothing.
