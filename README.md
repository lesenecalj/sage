# SAGE

Software Assistant for Guided Engineering: a personal AI learning assistant built as an incremental modular monolith.

## Prerequisites

- Node.js 22 or later
- npm 10 or later

## Getting started

```bash
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`; the API runs at `http://localhost:3000`.

The Vite development server proxies requests from `/api/*` to the API. Confirm the application is running with `http://localhost:5173/api/health`, which returns `{ "status": "ok" }`. If port `5173` is already in use, Vite selects the next available port and displays it in the terminal.

## Architecture

- `apps/web`: React 19, TypeScript, Vite, and Tailwind CSS 4.
- `apps/api`: Express 5, TypeScript, and a native Node.js ESM build.
- `apps/api/tsconfig.build.json`: production build configuration; test files are excluded from `dist`.

## Commands

```bash
npm run build  # Build frontend and backend
npm run lint   # Type-check frontend and backend
npm run test   # Run unit tests
```

The API health endpoint is covered by a Vitest and Supertest integration test. The frontend test command is ready but has no frontend tests yet.

## Current scope

The foundation implements the V1 application boundary: React frontend, Express API, API health check, and development proxy. Notes persistence, Prisma/PostgreSQL, Redis, and AI retrieval will be added incrementally with the corresponding roadmap phases.
