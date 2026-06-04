# `NumberField`

Tier-2 numeric input. Wraps Base UI's `NumberField`. Always LTR for editing — digit display in static contexts (money, counts) uses `formatNumber` / `formatMoney` which apply Persian digits under `fa`.

```tsx
<NumberField value={quantity} onValueChange={setQuantity} min={0} step={1} suffix="pcs" />
<NumberField value={priceMinor} onValueChange={setPriceMinor} nullable suffix="﷼" />
```

`nullable=true` — empty input becomes `null`. `nullable=false` (default) — empty input coerces to `0`. The empty-→-zero coercion mirrors `CurrencyInput` semantics so swapping isn't a behavioural regression.

Steppers use chevrons from `#/icons`. Suffix chip is `aria-hidden` (the input's own `aria-label` carries the unit).
