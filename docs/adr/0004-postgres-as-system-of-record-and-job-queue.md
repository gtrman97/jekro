# ADR-0004: PostgreSQL as system of record and job queue (M1)

**Status:** Accepted
**Date:** 2026-11-16

## Context

When an action is approved, its state change and its queued job must succeed or fail together. The expected load is small, and fewer moving parts make the system easier to run and test.

## Options considered

1. **Postgres only,** with a `jobs` table.
2. **Postgres plus Redis** (a library such as BullMQ).
3. **Postgres plus a managed queue service.**

## Decision

Option 1. Workers claim jobs with `FOR UPDATE SKIP LOCKED` and hold a lease with a fencing token (see `docs/architecture.md`, section 9). Jobs are enqueued in the same transaction as the state change.

## Consequences

- Transactional enqueue and a single service to operate.
- Polling adds some latency, and throughput has a ceiling.
- If load or latency ever requires it, jobs can move to a dedicated queue behind the same interface.
- Revisit if queue depth or claim contention becomes visible in metrics.
