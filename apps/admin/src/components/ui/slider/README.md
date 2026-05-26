# `Slider`

Tier-2 single / range slider. Wraps Radix Slider (Base UI 1.4.1 doesn't expose Slider yet; Radix is in the catalog and already used by other primitives).

```tsx
{/* Single */}
<Slider value={[volume]} onValueChange={([v]) => setVolume(v)} min={0} max={100} />

{/* Range */}
<Slider value={[low, high]} onValueChange={([lo, hi]) => setRange(lo, hi)} min={0} max={100} />
```

Thumb count is inferred from the value-array length. The thumb uses `bg-background` (was `bg-white` in the flat file) so it adapts to dark mode without lifting a brand-coloured circle out of the track.
