## Acceptance Criteria Traceability

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| 1 | Global filter returns standardized `{ statusCode, message, error, timestamp, path }` | `all-exceptions.filter.spec.ts::returns standardized response format for unknown errors` | PASS |
| 2 | HttpExceptions forwarded with original status/message | `all-exceptions.filter.spec.ts::forwards HttpException with original status and message` | PASS |
| 3 | Prisma P2025 returns 404 | `all-exceptions.filter.spec.ts::returns 404 for Prisma P2025 record not found` | PASS |
| 4 | Prisma P2002 returns 409 with conflicting fields | `all-exceptions.filter.spec.ts::returns 409 for Prisma P2002 unique constraint with conflicting fields` | PASS |
| 5 | Prisma P2003/P2006 return 400 | `all-exceptions.filter.spec.ts::returns 400 for Prisma P2003 foreign key constraint` | PASS |
| 6 | Unknown errors return 500 without leaking internals | `all-exceptions.filter.spec.ts::returns standardized response format for unknown errors` + `does not leak internal details for unrecognized Prisma errors` | PASS |
| 7 | Filter registered globally in AppModule | `all-exceptions.filter.spec.ts::is registered as a global filter in AppModule` | PASS |
