# Decision records

One record per significant decision, written when the decision is made. Records are not rewritten. A superseded decision gets a new record that links back to it.

| # | Decision | Status |
|---|---|---|
| 0001 | [Start a fresh monorepo and port the v1 code](0001-fresh-monorepo-and-port-v1.md) | Accepted |
| 0002 | [Modular monolith with a separate ledger package](0002-modular-monolith-with-ledger-package.md) | Accepted |
| 0003 | [TypeScript (strict) end to end](0003-typescript-strict-end-to-end.md) | Accepted |
| 0004 | [PostgreSQL as system of record and job queue (M1)](0004-postgres-as-system-of-record-and-job-queue.md) | Accepted |
| 0005 | [SQL-first data access with Kysely and versioned SQL migrations](0005-sql-first-data-access-with-kysely.md) | Proposed |
| 0006 | [Express with zod for the API](0006-express-with-zod.md) | Proposed |
| 0007 | [Approval binding, staleness, and expiry](0007-approval-binding-staleness-and-expiry.md) | Accepted |
| 0008 | [Execution classes and the "outcome unknown" state](0008-execution-classes-and-outcome-unknown.md) | Accepted |

## Template

```
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Superseded by ADR-NNNN
**Date:** YYYY-MM-DD

## Context
## Options considered
## Decision
## Consequences
```
