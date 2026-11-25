# Jekro: Roadmap

**Status:** Draft v0.1, 2026-11-16
**Related:** `docs/prd.md`, `docs/architecture.md`, `docs/adr/`

All dates are planning targets, not commitments. If a step slips, the cut list (section 4) says what to drop first, so the working slice always comes before the polish.

---

## 1. Milestones

| Milestone | Target | Outcome |
|---|---|---|
| M1 | 2026-12-31 | A working tracker where a scripted agent takes tickets, proposes changes, and a person approves them. The change runs once, and appears in the ticket history. |
| M2 | 2027-01-31 | Undo with conflict detection, a hash-chained audit log with an independent verifier, a fault-injection harness, and reliability tests. |
| M3 | 2027-03-31 | A real coding agent that investigates a bug, runs tests in a sandbox, and opens a pull request through the ledger. |

## 2. The thin vertical slice

The first goal is one complete path through the system, built before anything else is polished:

1. A person creates a ticket.
2. A scripted agent proposes a change to it.
3. The proposal and an audit event are stored.
4. A person sees the proposal and its diff and approves it.
5. Approval enqueues the execution.
6. The worker executes the change.
7. The completed action appears in the ticket history.

Everything else in M1 is added around this slice once it works.

## 3. M1 build order

Each step is done only when its tests pass in CI. Documentation and decision records are updated as part of the step.

| Step | Target | Work | Done when |
|---|---|---|---|
| S0 | 2026-11-22 | Create the repository. Add the docs. Scaffold the monorepo: workspaces, strict TypeScript, lint, Docker Compose with Postgres, and a CI pipeline running lint, type checks, and a smoke test. | CI is green on the main branch. `docker compose up` starts Postgres. Docs are in the repository. |
| S1 | 2026-11-29 | Port authentication, users, projects, and memberships, with migrations. Write tests first for the three known authorization issues, then fix them. Add central error handling. | Integration tests pass against a real Postgres. Each of the three issues has a regression test that failed before the fix. |
| S2 | 2026-12-06 | Project-scoped tickets. Agents and API keys. The action tables. `propose` for `set_priority` and `add_comment`, with payload hash, `base_version`, and a first event. | A scripted agent can propose through the API, and proposals are stored and readable through the API. |
| S3 | 2026-12-13 | **Thin slice complete.** The approve endpoint with the hash check, job enqueue, the worker, the history API, and minimal web screens: ticket list, ticket detail, and a pending-approvals screen with a diff. | The seven-step slice runs end to end in the browser, with a script playing the agent. |
| S4 | 2026-12-20 | Remaining action types. The auto-approval policy through the same approval path. Staleness checks and proposal expiry. The authorization re-check at execution. Job leases with fencing. | Each rule has a test. The policy path uses the same transition as human approval. |
| S5 | 2026-12-31 | The cross-project access test suite for every endpoint. Health endpoints, structured logs, and basic OpenTelemetry traces. Seed data, a demo script, and the README. Deployment if time allows. | The M1 success criteria in the PRD are met, or the gaps are written down. |

## 4. Cut list

If a step runs late, drop things in this order:

1. Deployment (the demo runs locally from one command).
2. OpenTelemetry traces (keep structured logs).
3. Generated OpenAPI documentation.
4. Lease and fencing tests beyond the basic case (keep the design documented).
5. The breadth of the cross-project test suite (keep the core endpoints).
6. Extra action types (keep two or three).

Never cut:
- The thin slice.
- Authorization tests.
- Idempotency.
- The approval hash check.

## 5. M2 outline (January 2027)

- Effect classes and undo with conflict detection, based on the ticket version.
- The hash-chained audit log, an independent verifier, and the latest hash anchored outside the database.
- The fault-injection harness, with the invariants from the PRD.
- Execution classes B and C against a fake external service, with reconciliation.
- Real-time UI updates.

## 6. M3 outline (February to March 2027)

- An agent runner service that runs outside the API process.
- A container sandbox with no network access by default, resource limits, and a read-only checkout.
- A GitHub connector with least-privilege access, where the agent pushes only to its own branch.
- A real LLM integration behind the runner interface, with capped usage.
- The MCP server.
- An evaluation suite on a small set of seeded bugs with known fixes.

The sandbox and the real agent are the largest uncertainty, so M3 dates are the softest.

## 7. Risks

| Risk | Handling |
|---|---|
| The slice takes longer than planned | Cut list. The slice is the priority. |
| Polishing the UI instead of the engineering | The UI stays minimal until the slice works. |
| Scope creep from new ideas | New ideas go to a backlog, not into the current step. |
| Undo and external effects are harder than expected | Classify effects explicitly. M1 handles internal effects only. |

## ADR-0004 Implementation Progress — November 2026

**Status:** Database and ledger infrastructure foundation implemented and locally tested.

### Implemented and tested
- PostgreSQL schema with versioned migrations.
- Transactional approval, audit-event insertion, and job creation.
- Concurrent job claiming with `FOR UPDATE SKIP LOCKED`.
- Worker leases and token-based completion fencing.
- Expired-lease recovery.
- Transactional dead-letter handling with action-state updates and audit events.
- Integration tests covering successful operations and rollback scenarios.

### Remaining work
- Implement production authorization and trusted user identity.
- Complete worker execution with transactional effect recording.
- Implement failure reporting, retry scheduling, and backoff.
- Strengthen isolation and concurrency tests.
- Complete the end-to-end API, worker, and UI workflow.

These remaining tasks are required before declaring the full M1 execution system production-ready.