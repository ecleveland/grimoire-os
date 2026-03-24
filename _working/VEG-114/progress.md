# VEG-114: Add Prettier configuration

## Ticket
- **Key:** VEG-114
- **Title:** Add Prettier configuration
- **Branch:** VEG-114/add-prettier-configuration
- **Milestone:** M2: Developer Experience & Quality Foundation
- **Selected Approach:** A — Per-package Prettier with shared root `.prettierrc` JSON

## Acceptance Criteria

- [x] A shared `.prettierrc` config file exists at the project root
- [x] A `.prettierignore` file exists to exclude build artifacts, node_modules, etc.
- [x] Backend `package.json` has a `format` script (prettier --write)
- [x] Backend `package.json` has a `format:check` script (prettier --check)
- [x] Frontend `package.json` has a `format` script (prettier --write)
- [x] Frontend `package.json` has a `format:check` script (prettier --check)
- [x] `format:check` passes on backend (all files formatted)
- [x] `format:check` passes on frontend (all files formatted)

## TDD Cycle Log

| Cycle | Criterion | RED | GREEN | REFACTOR | Status |
|-------|-----------|-----|-------|----------|--------|
| 1 | .prettierrc exists at root | bf95291 | fc1921b | skip | Done |
| 2 | .prettierignore exists | c5e6887 | 73f85ac | skip | Done |
| 3 | Backend format scripts | 4dadd0f | a5344c9 | skip | Done |
| 4 | Frontend format scripts | ad63024 | db12bc8 | skip | Done |
| 5 | Backend format:check passes | 2212b55 | 537332a | skip | Done |
| 6 | Frontend format:check passes | 70ab945 | 900706b | skip | Done |
