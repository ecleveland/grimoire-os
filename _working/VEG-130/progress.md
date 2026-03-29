# VEG-130: Add global exception filter

## Ticket
- **Key:** VEG-130
- **Title:** Add global exception filter
- **Branch:** VEG-130/add-global-exception-filter
- **Milestone:** M4: Code Quality & Architecture

## Acceptance Criteria

- [x] Global exception filter catches all unhandled exceptions and returns standardized response format: `{ statusCode, message, error, timestamp, path }`
- [x] Standard NestJS HttpExceptions are forwarded with their original status code and message in the standardized format
- [x] Prisma `P2025` (record not found) errors return 404 with a clear message
- [x] Prisma `P2002` (unique constraint violation) errors return 409 with the conflicting field(s) in the message
- [x] Prisma validation errors (e.g., `P2003` foreign key constraint, `P2006` invalid value) return 400 with a clear message
- [x] Unknown/unexpected errors return 500 without leaking internal details (stack trace, query, etc.)
- [x] Filter is registered globally in the NestJS app module

## Selected Approach
**Approach A: Single Global ExceptionFilter** — one `AllExceptionsFilter` registered via `APP_FILTER` in `app.module.ts`.

## TDD Cycle Log

| Cycle | Criterion | RED | GREEN | REFACTOR | Status |
|-------|-----------|-----|-------|----------|--------|
| 1 | Standardized 500 for unknown errors | 3d42f74 | 28947c9 | — | Done |
| 2 | HttpException forwarding | 9182773 | f8f1bef | — | Done |
| 3 | Prisma P2025 → 404 | 0f09314 | 82ef1f1 | — | Done |
| 4 | Prisma P2002 → 409 | a31f6cc | 017900c | — | Done |
| 5 | Prisma P2003/P2006 → 400 | 07a2a4c | 2475956 | 396cde4 | Done |
| 6 | No internal detail leaks | — | 280a4cc | — | Done |
| 7 | Global registration in AppModule | c90ff83 | 202b7a6 | — | Done |
