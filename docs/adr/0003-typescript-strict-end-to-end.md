# ADR-0003: TypeScript (strict) end to end

**Status:** Accepted
**Date:** 2026-11-16

## Context

The API and web app exchange the same request and response shapes. The ledger's state machine and approval logic are correctness-critical, and types catch whole classes of mistakes early.

## Options considered

1. **Plain JavaScript,** as in v1.
2. **TypeScript in the web app only.**
3. **TypeScript everywhere.**
4. **A Python backend with a TypeScript frontend.**

## Decision

Option 3: strict TypeScript across the API, worker, web app, and packages. zod schemas are the single source of truth for request shapes and are shared through `packages/shared`. Linting and type checking run in CI.

## Consequences

- The API and UI cannot drift apart on shapes without a compile error.
- The port and a compile step cost some effort.
- Type-level cleverness stays modest so the code remains readable.
- A second language can be added later only for a concrete reason, for example evaluation tooling.
