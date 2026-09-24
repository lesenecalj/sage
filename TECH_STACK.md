# Technology Stack

## Current Foundation

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4
- Backend: Node.js 22+, TypeScript, Express 5, native ESM
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