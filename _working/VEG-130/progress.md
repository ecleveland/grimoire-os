# VEG-130: Add global exception filter

## Ticket
- **Key:** VEG-130
- **Title:** Add global exception filter
- **Branch:** VEG-130/add-global-exception-filter
- **Milestone:** M4: Code Quality & Architecture

## Acceptance Criteria

- [ ] Global exception filter catches all unhandled exceptions and returns standardized response format: `{ statusCode, message, error, timestamp, path }`
- [ ] Standard NestJS HttpExceptions are forwarded with their original status code and message in the standardized format
- [ ] Prisma `P2025` (record not found) errors return 404 with a clear message
- [ ] Prisma `P2002` (unique constraint violation) errors return 409 with the conflicting field(s) in the message
- [ ] Prisma validation errors (e.g., `P2003` foreign key constraint, `P2006` invalid value) return 400 with a clear message
- [ ] Unknown/unexpected errors return 500 without leaking internal details (stack trace, query, etc.)
- [ ] Filter is registered globally in the NestJS app module

## Selected Approach
**Approach A: Single Global ExceptionFilter** — one `AllExceptionsFilter` registered via `APP_FILTER` in `app.module.ts`.

## TDD Cycle Log

| Cycle | Criterion | RED | GREEN | REFACTOR | Status |
|-------|-----------|-----|-------|----------|--------|
