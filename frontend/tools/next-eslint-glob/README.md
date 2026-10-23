# Next ESLint directory-glob adapter

This private package replaces **only** `fast-glob` below the pinned
`@next/eslint-plugin-next@16.3.8`. It exports the single call used by that
plugin's `dist/utils/get-root-dirs.js`:

```js
globSync(rootDir.replace(/\\/g, '/'), { onlyDirectories: true })
```

It keeps the official Next plugin and all its rules. It does not implement or
advertise the general fast-glob API. Unsupported options fail explicitly so a
future plugin change cannot silently weaken linting.

The unmodified dependency chain reaches `braces@3.0.3`, which has no publisher
fix for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Both the stable Next plugin 16.4.2 and its 16.5.0 canary still depend on
fast-glob 3.3.1 as of 21 October 2026. Downgrading Next lint rules would lose
checks relevant to the installed Next 16 application.

The adapter uses exact, maintained `tinyglobby@0.2.17` and `picomatch@4.0.7`.
It disables tinyglobby's directory expansion and preserves the original
directory-only filtering, relative/absolute path form, explicit `./` prefix,
trailing slashes and globstar base exclusion. Picomatch's final filter retains
the original matcher semantics for parenthesized patterns.

The direct development dependency and version-scoped npm override belong in the
frontend root package manifest:

```json
{
  "devDependencies": {
    "fast-glob": "file:./tools/next-eslint-glob"
  },
  "overrides": {
    "@next/eslint-plugin-next@16.3.8": {
      "fast-glob": "$fast-glob"
    }
  }
}
```

The direct dependency anchors the local package at the frontend project root.
The scoped `$fast-glob` reference makes the Next plugin use that same package,
including npm's dependency validation during a clean install. Keep both entries;
parent-relative replacement paths can produce a working link that fails
`npm ls`. The private package keeps its own name and version, so it does not
claim to implement a published fast-glob release or satisfy other packages'
fast-glob version requirements. A clean `npm ci`, `npm ls`, and the compatibility
test must succeed before accepting changes to the override or package manager.

The repository compatibility test covers directory fixtures whose expected
results were captured from the original fast-glob 3.3.1, plus the actual Next
root helper and the real `no-html-link-for-pages` rule. Include this directory
with the lockfile on any future commit. Remove the override and this package
when the upstream plugin adopts a fixed dependency, after rerunning those
checks. Review the adapter before changing the pinned Next plugin version.

The integration assertions exercise a Pages Router route and an App Router root
page. In the unmodified 16.3.8 plugin, `parseUrlForAppDir` delegates nested
directories to the Pages Router parser; nested App Router link detection has
an upstream limitation. This adapter changes directory discovery only and
does not change that route parser or disable any rule.

References:

- [Next's upstream root helper](https://github.com/vercel/next.js/blob/v16.3.8/packages/eslint-plugin-next/src/utils/get-root-dirs.ts)
- [Next's upstream route parser](https://github.com/vercel/next.js/blob/v16.3.8/packages/eslint-plugin-next/src/utils/url.ts)
- [tinyglobby migration options](https://superchupu.dev/tinyglobby/documentation#expanddirectories)
- [npm dependency overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides)
