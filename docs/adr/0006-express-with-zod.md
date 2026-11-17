# ADR-0006: Express with zod for the API

**Status:** Proposed
**Date:** 2026-11-16

## Context

The v1 API is Express with zod validation. The port should stay small, and the project's effort belongs in the ledger and its tests, not in a new framework.

## Options considered

1. **Express.**
2. **Fastify.**
3. **NestJS.**

## Decision (proposed)

Option 1: Express 5, where errors from async handlers reach a central error handler, with zod validation at the boundary. Schemas come from `packages/shared`, and an OpenAPI document is generated from them later.

## Consequences

- Familiar, widely used, and a small port.
- Fewer built-in conventions, so error handling, request context, and structure are explicit and tested.
- Revisit if the structure starts to hurt, in which case Fastify is the first alternative to try.
