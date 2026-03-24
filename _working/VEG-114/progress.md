# VEG-114: Add Prettier configuration

## Ticket
- **Key:** VEG-114
- **Title:** Add Prettier configuration
- **Branch:** VEG-114/add-prettier-configuration
- **Milestone:** M2: Developer Experience & Quality Foundation
- **Selected Approach:** A — Per-package Prettier with shared root `.prettierrc` JSON

## Acceptance Criteria

- [ ] A shared `.prettierrc` config file exists at the project root
- [ ] A `.prettierignore` file exists to exclude build artifacts, node_modules, etc.
- [ ] Backend `package.json` has a `format` script (prettier --write)
- [ ] Backend `package.json` has a `format:check` script (prettier --check)
- [ ] Frontend `package.json` has a `format` script (prettier --write)
- [ ] Frontend `package.json` has a `format:check` script (prettier --check)
- [ ] `format:check` passes on backend (all files formatted)
- [ ] `format:check` passes on frontend (all files formatted)

## TDD Cycle Log

| Cycle | Criterion | RED | GREEN | REFACTOR | Status |
|-------|-----------|-----|-------|----------|--------|
