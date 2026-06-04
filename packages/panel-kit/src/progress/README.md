# `Progress`

Tier-2 determinate progress bar. Hardcoded `bg-emerald-500` / `bg-amber-500` / `bg-rose-500` from the flat file moved to semantic `bg-success` / `bg-warning` / `bg-danger` — closes three raw-colour offenders.

```tsx
<Progress value={75} tone="success" aria-label={t("upload.progress")} />
```

Tones: `primary` (default), `success`, `warning`, `danger`, `info`. For indeterminate loading, use `<Spinner />` instead.
