## Solution Comparison: VEG-130

| Dimension | Approach A: Single ExceptionFilter | Approach B: Interceptor + Filter |
|---|---|---|
| Architecture Fit | Strong. Follows existing APP_INTERCEPTOR pattern. Additive — no service changes needed. | Good. Also follows existing patterns, but adds 2 pipeline components instead of 1. |
| Performance | Negligible — only runs on error path | Negligible — catchError is no-op on happy path |
| Maintainability | One file, one registration. Prisma code mapping is small (~5 cases), doesn't warrant splitting. | Cleaner separation of concerns, but the Prisma mapping logic is too small to justify the extra file/indirection. |
| Testability | Very easy — mock ArgumentsHost, assert JSON output. No DI needed. | Also easy, but requires testing 2 components independently. |
| Risks | Must preserve ValidationPipe's array-of-errors message field. Must use Prisma meta for helpful P2002 messages. | Same risks plus: execution order between interceptors, interceptors don't catch guard/pipe errors, risk of losing contextual error messages. |
| Complexity | 2 new files (filter + spec), 1 modified (app.module) | 4 new files (interceptor + filter + 2 specs), 1-3 modified files |

### Selected: Approach A — Single Global ExceptionFilter

Reasoning: The Prisma error mapping logic is small enough (~5 error codes) that separating it into its own interceptor adds indirection without meaningful benefit. A single filter is simpler to understand, test, and maintain. It's purely additive and avoids interceptor execution-order subtleties.
