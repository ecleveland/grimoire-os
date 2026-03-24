# Prisma Migrations Guide

A quick reference for understanding Prisma migrations, especially if coming from .NET Entity Framework.

## Prisma ↔ Entity Framework Mental Model

| EF Core Concept | Prisma Equivalent |
|---|---|
| DbContext + entity classes (C#) | `schema.prisma` file |
| `Add-Migration` | `prisma migrate dev --name <name>` |
| `Update-Database` | `prisma migrate deploy` |
| `dotnet ef migrations` folder | `prisma/migrations/` folder |
| LINQ queries | Prisma Client (generated TypeScript API) |

## How It Works

### 1. Schema = Source of Truth

In EF you define C# classes and the DbContext. In Prisma, you define models in `schema.prisma`:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  campaigns Campaign[]
}
```

This is equivalent to writing a C# entity class with data annotations.

### 2. Migrations = Versioned SQL Diffs

When you change `schema.prisma`, you run:

```bash
npx prisma migrate dev --name add_user_table
```

This does two things:
- **Diffs** your schema against the current DB state (like `Add-Migration`)
- **Generates a SQL file** in `prisma/migrations/<timestamp>_<name>/migration.sql`
- **Applies it** to your dev database

The key difference from EF: Prisma generates **raw SQL files**, not C# migration classes. You can read and edit the SQL directly. This is actually an advantage — you see exactly what's hitting your database.

### 3. The Migrations Folder is Append-Only History

Each migration is a timestamped folder with a `migration.sql` file. Prisma tracks which ones have been applied in a `_prisma_migrations` table in your database (similar to EF's `__EFMigrationsHistory` table).

```
prisma/migrations/
  20260301_init/migration.sql           -- CREATE TABLE users...
  20260315_add_campaigns/migration.sql  -- CREATE TABLE campaigns...
  20260321_alignment/migration.sql      -- ALTER TABLE...
```

### 4. Prisma Client = Your Query API

After changing the schema, `prisma generate` regenerates a typed TypeScript client (like how EF generates the DbContext). You query with:

```typescript
const user = await prisma.user.findUnique({ where: { id: 1 } });
```

This is analogous to `dbContext.Users.FirstOrDefault(u => u.Id == 1)`.

## Key Commands Cheat Sheet

| Command | When to use |
|---|---|
| `npx prisma migrate dev --name <name>` | You changed `schema.prisma` and want to apply it locally |
| `npx prisma migrate deploy` | Production — applies pending migrations without generating new ones |
| `npx prisma generate` | Regenerate the TypeScript client after schema changes |
| `npx prisma db push` | Quick prototyping — pushes schema to DB **without** creating a migration file (don't use in production) |
| `npx prisma studio` | Opens a GUI to browse your database |
| `npx prisma migrate reset` | **Destructive** — drops DB, re-runs all migrations, re-seeds |

## Important Gotchas Coming from EF

1. **No "down" migrations** — Prisma doesn't generate rollback scripts like EF does. To undo, you create a new migration that reverses the change. In practice this is fine because rollbacks are rarely used in production anyway.

2. **Don't edit old migrations** — Once a migration has been applied (especially if pushed/shared), treat it as immutable. Make a new migration instead. Same rule as EF.

3. **`db push` vs `migrate dev`** — `db push` is like EF's `EnsureCreated()` — great for prototyping but skips migration history. Use `migrate dev` when you want tracked, reproducible changes.

4. **Schema drift** — If you manually change the DB outside of Prisma (raw SQL), Prisma won't know about it. Run `npx prisma db pull` to introspect the DB back into your schema (similar to scaffolding in EF).
