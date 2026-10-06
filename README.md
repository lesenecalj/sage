# SAGE

Software Assistant for Guided Engineering: a personal AI learning assistant built as an incremental modular monolith.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Docker Desktop with Docker Compose

## Getting started

```bash
npm install
npm run dev
```

`npm start` is an alias for `npm run dev`. On first start, the bootstrap creates
`apps/api/.env` without overwriting an existing file, starts PostgreSQL and
Ollama with Docker Compose, ensures the configured Ollama model is available,
generates Prisma Client, applies committed migrations, and starts the API and
frontend watchers. Docker keeps database and model data in persistent volumes.
The initial image and model downloads can take a while.

Ollama currently runs in a container and may use CPU inference on macOS, which
is slower than the native Ollama app. Set `OLLAMA_MODEL` in `apps/api/.env` to
select another model. The URL form sends requests to the API, which fetches the
page, generates a summary with Ollama, and saves it as a note.

The frontend is available at `http://localhost:5173`; the API runs at `http://localhost:3000`.
`npm run dev` rebuilds `packages/contracts` when its source changes; the API restarts and Vite serves the updated contract without a manual build.

The Vite development server proxies requests from `/api/*` to the API. Confirm the application is running with `http://localhost:5173/api/health`, which returns `{ "status": "ok" }`. If port `5173` is already in use, Vite selects the next available port and displays it in the terminal.

## Architecture

- `apps/web`: React 19, TypeScript, Vite, and Tailwind CSS 4.
- `apps/api`: Express 5, TypeScript, Prisma, PostgreSQL, and a native Node.js ESM build.
- `packages/contracts`: shared Zod response schemas and inferred types used by the API and web app.
- `apps/api/tsconfig.build.json`: production build configuration; test files are excluded from `dist`.

## Commands

```bash
npm run build  # Build frontend and backend
npm run lint   # Type-check frontend and backend
npm run test   # Run unit tests
npm run db:generate --workspace @sage/api  # Generate Prisma Client
npm run db:migrate --workspace @sage/api   # Create and apply a development migration
npm run db:studio --workspace @sage/api    # Inspect the database with Prisma Studio
```

API behavior is covered by Vitest and Supertest; frontend behavior is covered by Vitest and React Testing Library.

## Current scope

The current V1 slice supports creating and listing notes with PostgreSQL persistence. Update/delete, import, search, Redis, and AI retrieval will be added incrementally with the corresponding roadmap phases.
