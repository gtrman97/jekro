# ADR-0008: Execution classes and the "outcome unknown" state

**Status:** Accepted
**Date:** 2026-11-16

## Context

Exactly-once execution cannot be promised for every effect. When an action touches an external system, a crash can leave it unclear whether the effect happened.

## Options considered

1. **Promise exactly-once everywhere.** Not achievable across external systems.
2. **Retry everything and accept duplicates.** Simple, but unsafe for actions like opening a pull request.
3. **Classify actions by where their effects happen and state the guarantee per class.**

## Decision

Option 3.
- **Class A (internal):** atomic within Jekro's Postgres.
- **Class B (external, provider-idempotent):** safe to retry with the provider's idempotency key.
- **Class C (external, needs reconciliation):** after an uncertain outcome, check the external system before retrying.

Add `outcome_unknown` and `needs_review` states, so the system never reports a success it cannot prove.

## Consequences

- Guarantees are honest and testable, and each action type documents its class.
- The executor and UI are more complex.
- M1 implements class A only. Classes B and C arrive in M2 (against a fake service) and M3 (against GitHub).
