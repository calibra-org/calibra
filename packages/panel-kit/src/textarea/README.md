# `Textarea`

Tier-2 multiline-text primitive. Same visual language as `Input`; `aria-invalid` flips to the destructive tone.

Auto-resize via `field-sizing: content` is intentionally NOT in the base primitive — pass it via `className` when needed (`className="field-sizing-content"`) so the default stays predictable for forms that pre-size their textareas.
