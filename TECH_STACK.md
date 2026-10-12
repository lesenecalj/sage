# Technology Stack

## Current Foundation

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4
- Backend: Node.js 22+, TypeScript, Express 5, Prisma 6, native ESM
- API validation: Zod 4 with strict request schemas
- Persistence: PostgreSQL 16 with Prisma migrations, managed locally with Docker Compose
- Testing: Vitest, Supertest, React Testing Library, and jsdom

Ollama powers URL-based note generation. BullMQ stores generation jobs in Redis, and a separate Node.js worker processes them. The API exposes job snapshots and streams progress to the frontend over SSE.

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

- Ollama in a Docker container with a configurable Llama model

## Embeddings

- Embedding provider to be selected when retrieval is implemented

## Cache

- Redis is used by BullMQ for durable job storage; application caching is not implemented yet.

## Background Processing

- BullMQ queue backed by Redis
- Separate worker process for URL note generation
- Exponential retries and job progress reporting

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

The CRUD Notes flow follows `route -> service -> repository`. URL generation is submitted through the API to BullMQ; a separate worker invokes the notes service and Prisma repository. Runtime composition injects dependencies, while tests use in-memory or stubbed implementations.

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