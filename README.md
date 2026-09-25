# SAGE

Software Assistant for Guided Engineering: a personal AI learning assistant built as an incremental modular monolith.

## Prerequisites

- Node.js 22 or later
- npm 10 or later

## Getting started

```bash
npm install
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
npm run db:migrate --workspace @sage/api
npm run dev
```

The frontend is available at `http://localhost:5173`; the API runs at `http://localhost:3000`.

The Vite development server proxies requests from `/api/*` to the API. Confirm the application is running with `http://localhost:5173/api/health`, which returns `{ "status": "ok" }`. If port `5173` is already in use, Vite selects the next available port and displays it in the terminal.

## Architecture

- `apps/web`: React 19, TypeScript, Vite, and Tailwind CSS 4.
- `apps/api`: Express 5, TypeScript, Prisma, PostgreSQL, and a native Node.js ESM build.
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
