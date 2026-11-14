---
name: SAGE API and backend conventions
description: Apply SAGE backend architecture, validation, persistence, and testing conventions when changing API or worker code.
applyTo: "apps/api/**/*.ts"
---
# Backend instructions

- Keep Express-specific request parsing, HTTP status codes, and response serialization in routers. Keep application use cases and input validation in services; services must not depend on Express.
- Keep database access behind repository interfaces. Compose concrete dependencies at the application entry point and inject them into routes and services.
- Validate untrusted input at runtime with Zod. Keep shared API response schemas and inferred types in `packages/contracts` when they are consumed by both the API and web app.
- Keep long-running URL generation in the existing BullMQ worker flow. Preserve explicit job progress, retry behavior, idempotent persistence, and graceful shutdown when changing that flow.
- Keep related behavior together unless a new module creates a meaningful ownership, dependency, or reuse boundary. Do not add a file or abstraction just to wrap one function or relocate code.
- Keep test helpers local by default. Extract shared test support only when multiple tests have a real need for the same behavior and the abstraction makes those tests simpler.
- Add or update focused Vitest/Supertest tests for the changed service or HTTP contract. Prefer the existing in-memory and stub implementations in tests over adding infrastructure.
- Follow the existing native ESM import conventions, including `.js` extensions in TypeScript imports.
- While SAGE is pre-production, change Prisma models directly and synchronize the local database with `prisma db push`; do not create or maintain migration files. Establish a migration-based workflow and baseline when production is planned. Inspect possible data loss before destructive schema changes.