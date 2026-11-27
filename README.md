# jekro
An AI-native issue tracker where people and AI agents work tickets side by side, with a built-in ledger that records, approves, and safely executes every agent action.

## API development

Build the shared schemas with `npm run build -w @jekro/shared`, then start
the Express API with `npm start -w @jekro/api`. It listens on
`127.0.0.1:3000`. `GET /health` reports process liveness, and
`HEAD /health` reports the same status with an empty response body. Express
matches routes by pathname regardless of query parameters, path case, or a
trailing slash. It also answers `OPTIONS` for known routes.

`POST /tickets` expects `Content-Type: application/json` and accepts bodies
up to 100 KiB. Missing or unsupported media types return 415, and oversized
JSON bodies return 413. Malformed JSON returns 400 with `Invalid JSON request`.
JSON that fails validation against `@jekro/shared` returns 400 with
`Invalid ticket data`. Valid input returns 501 while ticket creation is
pending. API errors use the JSON `{ "error": "…" }` envelope.

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

## Proposal lifecycle

The ledger takes the target version used to build the payload and preview.
It verifies that version under the target lock before recording a new proposal.
The action handler registers either `strict` or `none` for staleness.
Strict actions require the same locked target version at approval and execution.
A stale approval returns a conflict and leaves the proposal pending.
A stale execution records a terminal failure with cause `stale_proposal`.

Pass a positive proposal lifetime in seconds to `DefaultLedgerService` to
override the seven-day default. PostgreSQL sets and checks the deadline.
Expiry applies to pending proposals. To run the expiry sweep, build
`@jekro/ledger`, set `DATABASE_URL`, and run `npm start -w @jekro/worker`.
The worker sweeps one batch of up to 100 proposals each minute. The approval
transaction also expires and audits overdue proposals it encounters.

The application supplies the approval authorizer and action handlers. Human
and policy callers use `approveAction` with the hash they reviewed. The audit
event records the person ID or the policy rule ID and version. Action
handlers execute PostgreSQL effects on the transaction client supplied by
the ledger. The Express action routes and production handler registration
are pending in the tracker application.
