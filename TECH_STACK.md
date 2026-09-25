# Technology Stack

## Current Foundation

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4
- Backend: Node.js 22+, TypeScript, Express 5, Prisma 6, native ESM
- API validation: Zod 4 with strict request schemas
- Persistence: PostgreSQL 16 with Prisma migrations, managed locally with Docker Compose
- Testing: Vitest, Supertest, React Testing Library, and jsdom

OpenAI, Redis, and background workers are planned technologies. They are not yet installed or configured.

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

The current Notes flow follows `route -> service -> repository`. Runtime composition injects the Prisma repository; tests inject the in-memory repository for isolation.

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