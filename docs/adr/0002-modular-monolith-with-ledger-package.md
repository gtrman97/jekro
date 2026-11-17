# ADR-0002: Modular monolith with a separate ledger package

**Status:** Accepted
**Date:** 2026-11-16

## Context

Jekro must control what AI agents can do, with strong guarantees about approval, retries, and audit. The system is small, and its main risk is correctness, not scale.

## Options considered

1. **Microservices.** Independent deployment, but heavy operational cost and failure modes unrelated to the problem being solved.
2. **One codebase with ledger logic mixed into the ticket code.** Fast to start, but hard to test in isolation and impossible to reuse.
3. **A modular monolith with a `ledger` package behind a narrow interface.**

## Decision

Option 3. The API, worker, and web app live in one repository. The `ledger` package owns the action lifecycle, approvals, idempotency, and audit events. It has no HTTP code and no knowledge of tickets. The tracker registers its action types and handlers with the ledger.

## Consequences

- Simple to run and test, with one database and one deployment story.
- The ledger can be tested alone, and the harness in M2 can target it directly.
- Boundaries need discipline. An import rule prevents the ledger from importing anything from the apps.
- Splitting a piece into its own service later stays possible.
