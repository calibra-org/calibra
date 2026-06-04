# `RadioGroup` + `Radio`

Tier-2 single-choice control. `RadioGroup` owns the selection state; `Radio` instances inside it set their `value` prop.

```tsx
<RadioGroup value={status} onValueChange={setStatus}>
    <Label className="gap-2"><Radio value="draft" /> {t("status.draft")}</Label>
    <Label className="gap-2"><Radio value="published" /> {t("status.published")}</Label>
    <Label className="gap-2"><Radio value="archived" /> {t("status.archived")}</Label>
</RadioGroup>
```

- Indicator stays mounted (`keepMounted`) so the scale-in / scale-out animation can actually play.
- Touch target is expanded via `after:inset-[-6px]` so the click hit area is 16×16 + 12px margin.
- Folder rename: the legacy `radio.tsx` flat file now re-exports from `radio-group/`.
