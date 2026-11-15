# Jekro: Product Requirements Document (PRD)

**Project:** Jekro, an AI-native issue tracker with a built-in trust and reliability layer (the ledger)
**Status:** Draft v0.3, 2026-11-14
**Owner:** Andrew

| Milestone | Target | Theme |
|---|---|---|
| M1 | 2026-12-31 | A working tracker where a scripted agent takes tickets, proposes changes, and a human approves them |
| M2 | 2027-01-31 | Ledger hardening: undo, verifiable audit log, failure injection, reliability tests |
| M3 | 2027-03-31 | A real AI coding agent that investigates bugs, runs tests in a sandbox, and opens pull requests through the ledger |

These are planning targets, not commitments.

### Changes from v0.2

- The project is now named Jekro. The trust layer is simply "the ledger," a package inside the repository.
- Section 9 is reframed as technology choices and rationale.
- Smaller wording cleanups throughout.

---

## 1. Summary

An AI-native issue tracker where humans and AI agents collaborate on software tickets. An agent can take a ticket, investigate the bug, run tests, and open a pull request for human review.

**The ledger** is the trust and reliability layer underneath. Every agent action is proposed, approved by a person where the policy requires it, executed safely, recorded in an audit trail, and, where the action allows it, reversible.

The agent's "brain" is deliberately pluggable (scripted, LLM-driven, or an external coding agent). What this project builds is the tracker, the permission model, the runner and sandbox boundary, and the ledger that makes agent work trustworthy.

This is a portfolio project. It is a reference implementation, not a Jira replacement and not a startup.

## 2. Problem and context

- AI agents are starting to take real actions in work systems: changing statuses, editing records, opening pull requests. When one is wrong, a team needs to know what happened, who allowed it, and how to recover.
- Per their public material, products such as Linear, GitHub, and Atlassian are moving toward agents as assignees and teammates. This project builds a small version of that workflow with accountability designed in from the start.
- The hard problems are engineering problems that do not depend on how capable the model is: partial failures, retries, uncertain outcomes after a crash, authorization, untrusted input, and audit integrity.

## 3. Goals and non-goals

### Goals

| ID | Goal |
|---|---|
| G1 | A working tracker (projects, tickets, project-scoped roles) that someone can try in a browser. |
| G2 | Agents as first-class, permission-scoped users who can be assigned tickets. |
| G3 | The ledger: propose, approve, execute, record, and (later) undo, with honest guarantees about what can and cannot be promised. |
| G4 | A real AI coding agent workflow (M3): investigate a bug, run tests in isolation, open a pull request for review. |
| G5 | Professional engineering practice from the first commit: strict TypeScript, tests, CI, migrations, observability, written decisions. |
| G6 | Build with a modern, widely used stack and document why each significant choice was made (section 9). |
| G7 | Produce evidence: test results, failure-injection results, evaluation results on seeded bugs, and a short write-up. |

### Non-goals

- Not a general-purpose Jira or Linear competitor: no sprints, custom workflows, billing, SSO, mobile app, or email in scope.
- Not a new coding agent. The project does not compete on how well an agent writes code; it makes agent work controllable and verifiable.
- No real LLM in M1. A scripted agent comes first, for determinism and zero cost.
- No claims of novelty. The README describes this as a reference implementation with modest, measured claims.
- No multi-region or high-availability setups beyond what is cheap to demonstrate.

## 4. Users and roles

Roles are per project (a person can be an Admin on one project and a Submitter on another), carried over from v1.

| Role | Who | Can do |
|---|---|---|
| Admin | Project owner | Everything in the project, including members and deleting the project. Only an Admin can grant the Admin role. |
| Manager | Team lead | Manage tickets, manage members (except granting Admin), approve or reject agent actions. |
| Developer | Contributor | Create and update tickets, assign work. |
| Submitter | Reporter | Create tickets and comment. |
| Agent | Non-human principal | Acts only within its scoped permissions. Every action goes through the ledger. |
| Approver | Capability, not a role | Admins and Managers by default; approves or rejects pending agent actions. |

## 5. Core demo scenarios

### Scenario A (M1): triage with a scripted agent

1. Alice (Admin) creates a project and a ticket: "Login button unresponsive on Safari."
2. She assigns it to "Triage Agent," an agent allowed to comment, set priority, and propose closing tickets in this project.
3. The agent proposes three actions: add a comment, set priority to high, close a suspected duplicate.
4. Adding a comment and setting priority are on the project's auto-approve list. Closing a ticket requires approval.
5. Alice sees the exact proposed change as a diff and approves it. The approval is tied to that exact change.
6. The system executes the actions. A retried request does not apply an action twice.
7. Every step appears in the ticket's action history: who proposed, who approved, what changed, and the outcome.

### Scenario B (M2): recovery

8. Alice undoes the close. If someone changed the ticket since, the undo refuses to overwrite their change and reports a conflict.
9. A worker is killed mid-action. After restart, the system reaches a consistent state, the action is either completed or parked for review, and the audit log still verifies.

### Scenario C (M3): coding agent

10. A ticket says "Sorting returns the wrong order for ties," and is linked to a small sample repository with a known bug.
11. Alice assigns it to "Fix Agent." The runner starts an isolated sandbox with a read-only copy of the repository.
12. The agent reads the code, runs the test suite, reproduces the failure, and proposes a patch.
13. Test results are attached to the ticket.
14. Opening a pull request is a ledger action that requires approval. Alice reviews the diff and approves.
15. The system opens the pull request on a branch (never on the main branch). If the worker crashes after creating the pull request but before recording it, the system finds the existing pull request instead of creating a second one.
16. Alice reviews and merges the pull request herself.

## 6. Functional requirements

### M1: Must have (target 2026-12-31)

The aim is to prove the full workflow end to end, not to build every safeguard.

| ID | Requirement |
|---|---|
| FR-1 | Register, log in, and restore sessions (JWT). Carried over from v1. |
| FR-2 | Projects with per-project membership and roles. Carried over, plus fixes from the v1 audit: only Admins can grant Admin; ticket assignees must be project members; user listings are scoped to people who share a project. |
| FR-3 | Tickets (create, view, update, delete) with project-scoped authorization, status, and priority. |
| FR-4 | Agent principals: created by an Admin and scoped to a project, authenticated with simple revocable API keys. |
| FR-5 | Action proposals: an agent submits an intended action (type, target, payload). The system stores the intent and a preview diff. |
| FR-6 | Approval policy: a small fixed list of action types that require approval (defined in code for M1, not a configurable policy system). Approvals are bound to a hash of the exact proposed change. |
| FR-7 | Idempotent execution for internal database actions (execution class A, section 7): each action carries a key, and retries never duplicate an effect. |
| FR-8 | A per-ticket action history (who, what, when, outcome). |
| FR-9 | Minimal UI: ticket list and detail wired to real data, and a pending-approvals screen with a diff view. |
| FR-10 | A pluggable agent runner interface with one scripted implementation that triages tickets. |

### M2: Should have (target 2027-01-31)

| ID | Requirement |
|---|---|
| FR-11 | Effect classes (reversible, compensatable, irreversible) and undo with conflict detection. |
| FR-12 | Append-only, hash-chained audit log with an independent verifier. |
| FR-13 | Fault-injection test harness with the invariants in section 7. |
| FR-14 | Execution classes B and C (external effects), with reconciliation, exercised first against a fake external service. |
| FR-15 | Real-time UI updates (server-sent events or WebSocket). |

### M3: Coding agent (target 2027-03-31)

| ID | Requirement |
|---|---|
| FR-16 | Agent runner service: takes assigned tickets, runs agents outside the API process, reports progress to the ticket. |
| FR-17 | Sandboxed execution: each run happens in an isolated container with no network access by default, resource and time limits, and a read-only repository checkout. |
| FR-18 | Repository connector for GitHub with least-privilege access. The agent pushes only to its own branch, never to the main branch. |
| FR-19 | The agent can investigate a bug: read code, run the project's tests, reproduce a failure, and propose a patch. Test results are attached to the ticket. |
| FR-20 | Opening a pull request is a ledger action, with approval and reconciliation after uncertain outcomes (execution class C). |
| FR-21 | A real LLM integration behind the runner interface, with capped usage and cost tracking. |
| FR-22 | MCP server exposing propose, approve, and status, so any MCP-capable agent can act through the ledger. |
| FR-23 | Evaluation suite: a small set of seeded bugs with known fixes, scored for whether the agent produced a correct patch. |

### Later (not scheduled)

Ticket search, Terraform-based deployment, a local Kubernetes setup.

## 7. Non-functional requirements

### Correctness guarantees, tiered by where the effect happens

| Class | Where the effect happens | What can be guaranteed |
|---|---|---|
| A. Internal | Only in the app's own Postgres | Atomic: the effect and its ledger record commit together, so a duplicate is impossible. Enforced with transactions, constraints, and idempotency keys. |
| B. External with provider idempotency | An external API that honors idempotency keys | Safe to retry with the same key. The guarantee depends on the provider and is documented per integration. |
| C. External, needs reconciliation | An external API with no idempotency support (for example, opening a pull request) | After an uncertain outcome, the system checks the external system for evidence (for example, searches for the branch or pull request) before retrying. Duplicates are detected and reconciled, not assumed impossible. |

**Action states.** Every action ends in one of: succeeded, failed (with cause), rejected, compensated, or **outcome unknown, needs review**. An action may legitimately sit pending or need manual intervention. It is never forced into a success state it cannot prove, and it is never silently lost.

**Invariants the harness tests (M2).**
- Class A actions never produce a duplicate effect.
- For classes B and C, any duplicate is prevented or detected and reconciled.
- No action is silently lost: each reaches a terminal state or is explicitly parked for review.
- The audit log verifies.
- Approvals cannot be bypassed or reused for a different change.
- An undo never overwrites a change it did not make.

### Other requirements

| Area | Requirement |
|---|---|
| Security | Default-deny authorization on every route. Tenant isolation, with Postgres row-level security as defense in depth. No secrets in git. Hashed passwords. Scoped, revocable agent credentials. A short threat model in the docs. |
| Untrusted input | Ticket text and repository contents are untrusted and may contain prompt injection. Agents get least-privilege tokens, never hold long-lived secrets, and cannot reach the network from the sandbox by default. Opening a pull request requires approval. |
| Reliability | Database or worker failure is handled gracefully. No unhandled promise rejections. A health endpoint. |
| Observability | Structured logs carrying request and action IDs. OpenTelemetry traces across propose, approve, and execute. Basic metrics. |
| Quality | TypeScript strict mode, linting, and CI required before merging. Integration tests run against a real Postgres. |
| Performance | Initial target, to validate and not to promise: p95 under 200 ms for ticket reads and writes at about 50 concurrent users on a laptop, measured with k6. |
| Developer experience | One command runs the whole stack locally (Docker Compose), with seed data. |
| Documentation | README with an architecture diagram, a decision record for each significant decision, and a short runbook. |

## 8. Success criteria

### M1 (2026-12-31)

- A clean checkout runs end to end with one command, and the demo script executes steps 1 to 7 of Scenario A.
- CI is green and includes integration tests against a real Postgres.
- Each of the three known authorization issues from the v1 audit has a test that failed before the fix and passes after.
- The docs folder contains the PRD, the technical design, the plan, and a decision record for each major decision made so far.

### M2 (2027-01-31)

- Undo, the hash-chained audit log, and the fault-injection harness work, with the invariants holding across hundreds of randomized failure runs.
- Class C reconciliation is demonstrated against a fake external service.
- A short write-up of what the failure testing found.

### M3 (2027-03-31)

- Scenario C runs end to end on the sample repository, in a sandbox, with a pull request opened through the ledger.
- The evaluation suite reports how often the agent fixes the seeded bugs, with cost and run time.
- A crash during pull request creation recovers without a duplicate pull request.

## 9. Technology choices and rationale

The stack favors widely used, production-proven tools, and each one is added only when the product needs it.

| Technology | Role in Jekro | Priority |
|---|---|---|
| TypeScript (strict) | API, web app, shared types | P0 |
| PostgreSQL (migrations, transactions, constraints, indexes, row-level security) | All data, tenant isolation, outbox | P0 |
| Node.js API with REST and OpenAPI | API | P0 |
| React with TypeScript | Web app | P0 |
| Docker and GitHub Actions | Local stack, CI, sandbox containers | P0 |
| Automated testing (integration, contract, property-based, fault injection) | Test suite and harness | P0 to P1 |
| Event-driven patterns (outbox, idempotency, Postgres-backed jobs) | Ledger execution | P1 |
| Observability (OpenTelemetry, structured logs, k6 load tests) | Whole system | P1 |
| Security (scoped credentials, audit logging, threat modeling, sandboxing) | Auth, ledger, sandbox | P1 |
| Agents and MCP, with human-in-the-loop approvals and evaluation | Agent runner, MCP server, evaluation | P1 to P2 |
| GitHub API integration | Repository connector | P2 |
| Terraform | Deployment | P3 |
| Kubernetes | Local cluster first, managed later | P3 (after M3) |
| Redis, Kafka, ClickHouse, Elasticsearch | Only if a real need appears | P3 |
| Go or Rust | Optional small tool, for example an independent audit-log verifier | P3 |

**Principles**

- Add a technology only when the product needs it.
- Each significant choice gets a decision record in `docs/adr/`.
- Claims about the project stay modest and measured.

## 10. Risks and open questions

| Risk | Mitigation |
|---|---|
| Scope creep, especially polishing the tracker UI | Tracker features are added only when they exercise the ledger or the agent workflow. |
| The coding agent and sandbox (M3) are the largest uncertainty | Keep the agent's brain pluggable. Start with a tiny sample repository and a simple container sandbox. Treat M3 dates as soft. |
| Undo semantics are harder than they look | Classify effects explicitly. Start with reversible and compensatable actions only. |
| Limited solo build time | Scripted agent first. Defer MCP, a real LLM, and deployment polish to later milestones. |
| LLM costs | Scripted agent through M2. Small, capped usage in M3. |
| Prompt injection through tickets or code | Least-privilege tokens, a network-isolated sandbox, and human approval for pull requests. |
| Over-claiming guarantees | State the guarantee class for each action. Never promise exactly-once behavior across external systems. |

**Open questions (each becomes a decision record when settled)**

1. Project name.
2. API framework: Express or Fastify.
3. Data access: Sequelize or a SQL-first approach (Kysely or Drizzle).
4. Job execution: Postgres-backed queue or Redis.
5. How agents connect first: direct API or MCP.
6. Sandbox technology for M3: plain Docker containers, gVisor, or a remote service.
7. GitHub access: a GitHub App or a fine-grained personal token.
8. LLM provider and budget cap for M3.
9. Hosting provider.

## 11. Related documents

- Technical design (to be written)
- Decision records, in `docs/adr/` (one per significant decision, written as decisions are made)
- Milestones and execution plan (to be written)
- Previous work: `gtrman97/Bug-Tracker` and `gtrman97/bug-tracker-back-end`, to be archived as v1
