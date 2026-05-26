# apps/admin/src/vendor/iran-map — attribution

The SVG path data in this directory (`country.ts`) is vendored from the
**simamojtahedi/react-iran-map** project:

- Upstream: https://github.com/simamojtahedi/react-iran-map
- License: **MIT** (Copyright © 2023 Sima Mojtahedi)

The Persian polygon names map one-for-one onto the ISO-3166-2:IR province
codes we use elsewhere; the upstream React components and CSS are not
vendored — only the path strings and `viewBox`. We render the SVG with our
own `motion`-driven components so the drill-down animation, heatmap fill,
tooltip, and reduced-motion fallback can be controlled directly.

Province-level city geometries are NOT vendored — upstream only ships the
country-level outline. Province-mode drill-down therefore degrades to the
side-panel city list (sourced from `/api/v1/admin/insights/regional/provinces/:code`)
rather than a city polygon SVG.

## Full upstream MIT license

```
MIT License

Copyright (c) 2023 Sima Mojtahedi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
