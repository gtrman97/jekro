# ADR-0005: SQL-first data access with Kysely and versioned SQL migrations

**Status:** Proposed
**Date:** 2026-11-16

## Context

Version 1 used Sequelize, with the schema created by `sync()` and no migrations. Jekro's design leans directly on transactions, conditional updates, `SKIP LOCKED`, constraints, and possibly row-level security.

## Options considered

1. **Sequelize,** carried over.
2. **Prisma.**
3. **Drizzle.**
4. **Kysely with plain SQL migration files.**
5. **Raw `pg` queries.**

## Decision (proposed)

Option 4. Kysely provides typed queries, while constraints, indexes, and policies live in versioned SQL migrations instead of application models. Migrations run in CI against a fresh database and against the previous schema.

## Consequences

- Locking, conditional updates, and row-level security are first-class instead of workarounds.
- More hands-on SQL and fewer conveniences, such as automatic relations.
- A learning curve, which is partly the point.
- Fallback if the friction is too high: Drizzle.
