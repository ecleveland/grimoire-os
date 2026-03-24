## Solution Comparison: VEG-114

| Dimension | Approach A: Per-Package + Root JSON | Approach B: Root Package.json + ES Module Config |
|---|---|---|
| Architecture Fit | Matches existing pattern | Requires new root package.json |
| Performance | Two invocations, negligible | Single invocation, negligible |
| Maintainability | Simple JSON, no new infra | ES module + root deps to maintain |
| Testability | Per-package format:check | Same |
| Risks | Low — well-established pattern | Medium — new root infra |
| Complexity | Low — 4 files | Medium — 5+ files |

### Selected: Approach A

Per-package Prettier with shared root `.prettierrc` JSON config. Matches existing monorepo conventions.

### Key Decisions
- `.prettierrc` (JSON) at project root
- `.prettierignore` at project root
- Install prettier in frontend devDependencies
- Per-package `format` and `format:check` scripts
- Config: printWidth 100, semi true, singleQuote true, trailingComma es5, arrowParens avoid, tabWidth 2
