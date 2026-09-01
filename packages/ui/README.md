# @fold-run/ui

fold's design system, in one place: the tokens, the four self-hosted font
subsets with their provenance, and the wordmark.

It exists because there are two consoles and there was one design system
maintained twice:

| | |
| --- | --- |
| `fold-run/fold-console` | the OSS gateway's `/console` page, vendored into every fold binary |
| `fold-run/fold-cloud` `services/console` | the hosted control plane |

They had already drifted. The fonts were byte-identical but only one repo
carried the provenance; the wordmark path was identical but only one repo had
the transform helper; and the token for a drawn relationship was `--fold-line:
#6E6E6E` in one and `--wire: #707070` in the other — the same concept, two
names, two values, and two rationales, one of which had the arithmetic wrong.

## What is in it

| | |
| --- | --- |
| `tokens.css` | the `:root` token set and the four `@font-face` rules |
| `public/fonts/` | the four woff2 subsets, plus `OFL.txt` |
| `fonts-src/sources.json` | upstream releases pinned by tag and sha256 |
| `scripts/subset-fonts.py` | regenerates the subsets; refuses a download that does not match |
| `src/Wordmark.tsx` | the mark, and `wordmarkTransform` for placing it in a drawing |

## Consuming it

Inside this repo it is a workspace dependency (`workspace:*`) and needs
nothing else.

From outside, pnpm resolves it out of the repo by path, pinned to a commit —
the same discipline fold uses for `CONSOLE_COMMIT` and `CONFORMANCE_COMMIT`,
and for the same reason: a tag is mutable, and the safety property is that
what you build is a function of an immutable upstream point.

```jsonc
// fold-cloud/services/console/package.json
"dependencies": {
  "@fold-run/ui": "github:fold-run/fold-console#<40-hex>&path:/packages/ui"
}
```

Then:

```css
@import '@fold-run/ui/tokens.css';
```

```tsx
import { Wordmark } from '@fold-run/ui/Wordmark'
```

The package ships **source**, not a build. Both consumers are Vite + Preact
and compile it themselves, which is why there is no build step here and no
registry to publish to.

### The fonts need a copy step

`tokens.css` references the faces at root-absolute `url(/fonts/…)`, so they
are public assets rather than module imports — deliberately, and the reason is
in the comment above the `@font-face` block: a module import lets the bundler
rename them or content-address them into a single deduplicated file, and fold's
vendoring manifest pins those four filenames exactly.

So a consumer has to place `public/fonts/` at its own root. In this repo that
is `publicDir` in `vite.config.ts` pointed straight at the package. A consumer
that already uses its own `public/` for other things copies them in a prebuild
step instead.

## Changing a token

A change here changes both consoles. That makes it a change to how the product
looks, not to one page's stylesheet — so it wants the same review a visual
change gets, and a rebuild of both consumers.

Contrast numbers in the comments are load-bearing and have been wrong before.
Recompute rather than copying a claim forward; WCAG 1.4.11 asks 3:1 of any
graphic required to understand the content, and axe does not evaluate stroke
contrast, so nothing in CI will catch a false one for you.
