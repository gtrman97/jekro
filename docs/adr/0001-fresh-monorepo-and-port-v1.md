# ADR-0001: Start a fresh monorepo and port the v1 code

**Status:** Accepted
**Date:** 2026-11-16

## Context

Version 1 was two separate repositories, a React frontend and an Express backend, started as coursework and extended later. The backend has a thoughtful per-project permission model. It has no tests, CI, migrations, or TypeScript, and several frontend screens still show hardcoded data.

Jekro needs strict TypeScript, types shared between the API and the web app, one CI pipeline, and tests and migrations from the first commit.

## Options considered

1. **Refactor both repositories in place.** Keeps history, but retrofits every practice after the fact.
2. **Merge the two repositories, with history, into one.** One repository, but the old structure and history come along.
3. **Create a new monorepo and port the code file by file,** using the old code as the specification.

## Decision

Option 3. The new repository starts with strict TypeScript, a workspace layout, CI, and Docker Compose. Backend logic is ported with tests written first. Frontend components, the auth context, and the API client are copied over and converted gradually. The old repositories are archived as v1 and linked from the README.

## Consequences

- Clean history and strict configuration from the first commit.
- The API and web app can share types.
- Porting costs some effort, but the backend is small.
- Working code is kept. The point is a clean container, not a rewrite of things that already work.
