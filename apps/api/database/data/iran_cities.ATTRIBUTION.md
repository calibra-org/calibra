# iran_cities.json — attribution

`iran_cities.json` is derived from the **sajaddp/list-of-cities-in-Iran** dataset:

- Upstream: https://github.com/sajaddp/list-of-cities-in-Iran
- Upstream license: **GPL-3.0** (see https://github.com/sajaddp/list-of-cities-in-Iran/blob/main/LICENSE)
- Snapshot source files: `dist/json/provinces.json` + `dist/json/cities-filtered.json` from the `main` branch.

The list of Iranian city + province names is treated as factual data
(province-by-province administrative subdivisions), which is generally not
copyrightable under most jurisdictions (cf. *Feist v. Rural Telephone*, 499 U.S.
340). The GPL-3.0 license attached to the upstream repository is retained here
out of good faith and explicit attribution.

If you redistribute this repository, treat the contents of `iran_cities.json`
and the transform in `apps/api/scripts/build-iran-cities-data.ts` as the
GPL-3.0-licensed portion of the codebase. The Calibra application code is
otherwise unaffected: nothing in `iran_cities.json` is incorporated into the
shipped admin/web app at build time beyond the city-name strings rendered in
the dashboard's regional-insights widget.

To regenerate `iran_cities.json` from the upstream source:

```
node --import=@poppinss/ts-exec scripts/build-iran-cities-data.ts
```
