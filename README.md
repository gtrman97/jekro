# jekro
An AI-native issue tracker where people and AI agents work tickets side by side, with a built-in ledger that records, approves, and safely executes every agent action.

## Database verification

Use Node 24 and `npm ci`. Run `node apps/api/scripts/migrate.mjs` with
`DATABASE_URL` pointing at the database to migrate. The runner applies
`db/migrations` in filename order under a PostgreSQL advisory transaction
lock. It records applied versions and checksums. A failed batch rolls back
pending changes. Investigate failures against a backup or disposable copy
before retrying an upgrade.

For local tests, use disposable PostgreSQL 17 databases and bind them to
localhost. Set `DATABASE_URL` for `jekro`, `TEST_DATABASE_URL` for
`jekro_test`, and `MIGRATION_DATABASE_URL` for `jekro_migration_test`.
Apply migrations to the first two databases. The migration suite manages its
own schema in the third. Run `npm test` and `npm run test:integration`.

When upgrading from migration 0002, the runner converts historical
`closed` tickets to `done` and increments their versions. The conversion
and migration 0003's final status constraint commit together. Use the
migration runner for this upgrade and retain a backup if the original status
values may be needed for recovery.

The ledger approval service compiles typed Kysely statements against the
approval schema projection in `packages/ledger/src/database.ts`. Update that
projection when a migration changes a column used by approval. The caller
owns the PostgreSQL pool. Authorization and target-version locking use the
same checked-out transaction client as the approval writes. The API owns the
tracker-specific lookup and locks the ticket by project and ticket ID.
