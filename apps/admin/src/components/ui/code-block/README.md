# `CodeBlock`

Tier-3 server-rendered syntax-highlighted code block. Uses [shiki](https://shiki.style) for highlighting at request time — shiki never reaches the client bundle.

```tsx
<CodeBlock code={SAMPLE_TSX} language="tsx" />
```

Languages: `tsx` (default), `ts`, `bash`, `json`, `css`, `html`, `md`.

Renders two HTML payloads (light + dark) and selects the active one via Tailwind's `dark:` modifier — theme switches don't require a re-fetch. The Copy button is a small client wrapper around `navigator.clipboard.writeText`; clipboard blocks are silent no-ops.

Mainly consumed by the `/dev/ds` showcase, but reusable for any doc surface (CLI cheat sheets, release notes, etc.).
