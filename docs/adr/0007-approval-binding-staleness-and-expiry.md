# ADR-0007: Approval binding, staleness, and expiry

**Status:** Accepted
**Date:** 2026-11-16

## Context

Agents propose actions and people approve them. An approval must not be reusable for a different change, must not apply to a world that has since changed, and must not stay valid forever.

## Options considered

1. **Approve by action id only.**
2. **Bind approvals to a hash of the proposed change.**
3. **Hash binding plus the ticket version the proposal assumed, plus expiry.**

## Decision

Option 3.
- Approvals bind to `payload_hash`.
- Each proposal records `base_version`. Each action type has a staleness rule (`strict` or `none`), checked at approval and again at execution.
- Proposals expire after a configurable period (default 7 days).
- There is one approval mechanism. The approver is either a person or a policy rule, recorded with the rule's id and version.

## Consequences

- An approval cannot be applied to a different change or to a changed ticket.
- Auto-approval and human approval share a single code path.
- Agents may need to re-propose after a conflict, and there are more states and tests (`expired`, `stale_proposal`).
- The same version number supports undo conflict detection in M2.
