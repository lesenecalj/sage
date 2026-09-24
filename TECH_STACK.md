# Technology Stack

## Current Foundation

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4
- Backend: Node.js 22+, TypeScript, Express 5, native ESM
- API validation: Zod 4 with strict request schemas
- Persistence: in-memory notes repository for the current MVP slice
- Testing: Vitest and Supertest

PostgreSQL, Prisma, OpenAI, Redis, background workers, and Docker Compose are planned technologies. They are not yet installed or configured.

## Frontend

- React (tailwind)
- TypeScript
- Vite

## Backend

- Node.js
- TypeScript
- Express

## Database

- PostgreSQL

## ORM

- Prisma

## AI

- OpenAI API

## Embeddings

- OpenAI Embeddings

## Cache

- Redis

## Background Processing

Initial:
- In-process worker

Future:
- Dedicated worker process if needed

## Testing

- Vitest

## Deployment

- Docker Compose

## Architecture

- Modular Monolith

## Current API Practices

- Routes own HTTP concerns: request parsing, status codes, and response serialization.
- Services own application use cases and input validation; they do not depend on Express.
- Repositories own data access behind explicit interfaces.
- Dependencies are composed in the application entry point and injected into routes and services.
- Zod schemas validate untrusted request bodies at runtime and reject unknown fields.
- Tests cover both HTTP contracts with Supertest and service behavior in isolation with Vitest.

The current Notes flow follows `route -> service -> repository`. The in-memory repository is intentionally temporary and will be replaced by a Prisma implementation when durable persistence is introduced.

## Guiding Principles

Prefer:

- Simplicity
- Clear boundaries
- Explicit dependencies
- Readable code

Avoid introducing unless justified:

- Microservices
- Event sourcing
- CQRS
- Kafka
- RabbitMQ
- Kubernetes

Reason:

The project should remain understandable and maintainable by a single developer.

Complexity must solve a real problem before being introduced.