# `Input`

Tier-2 text-input primitive. Plain `<input>` styled to the admin's field language; pair with `Label` and (eventually) a `Field` tier-3 primitive that handles error + helper text bundling.

```tsx
<Input type="email" placeholder={t("placeholder")} aria-invalid={!!error} />
```

`aria-invalid` flips the border + focus ring to the destructive tone — the canonical way to indicate validation state without adding props.
