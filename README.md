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
`apps/api/.env` without overwriting an existing file, starts PostgreSQL with pgvector,
Redis, and Ollama with Docker Compose, ensures the configured chat and embedding
models are available, generates Prisma Client, synchronizes the local database
from the Prisma schema, and starts the API, worker, and frontend watchers. Docker
keeps database, Redis, and model data in persistent volumes. The initial image
and model downloads can take a while.

This project is pre-production: Prisma models are the schema source of truth and
`prisma db push` applies local schema changes without creating migration files.
Back up data before destructive model changes. Establish a migration workflow
when a production deployment is planned.

The embedding model is configured independently with `OLLAMA_EMBEDDING_MODEL`
(default `nomic-embed-text:v1.5`); `OLLAMA_MODEL` continues to select the note
summarization model. PostgreSQL uses a dedicated pgvector volume. Back up and
restore existing database data before changing the PostgreSQL image or volume.

Ollama currently runs in a container and may use CPU inference on macOS, which
is slower than the native Ollama app. Set `OLLAMA_MODEL` in `apps/api/.env` to
select another model. URL-based note generation is submitted as a durable job to
BullMQ in Redis. A separate worker fetches the page, asks Ollama to generate the
note, and saves it to PostgreSQL. The API streams job progress to the frontend
over server-sent events (SSE), so generation continues if the browser closes.

The frontend is available at `http://localhost:5173`; the API runs at
`http://localhost:3000`.
`npm run dev` rebuilds `packages/contracts` when its source changes; the API and
worker restart, and Vite serves the updated contract without a manual build.

The Vite development server proxies requests from `/api/*` to the API. Confirm the application is running with `http://localhost:5173/api/health`, which returns `{ "status": "ok" }`. If port `5173` is already in use, Vite selects the next available port and displays it in the terminal.

## Architecture

- `apps/web`: React 19, TypeScript, Vite, and Tailwind CSS 4.
- `apps/api`: Express 5, TypeScript, Prisma, PostgreSQL, Redis/BullMQ, and a
	native Node.js ESM build. A separate worker process handles URL note generation.
- `packages/contracts`: shared Zod response schemas and inferred types used by the API and web app.
- `apps/api/tsconfig.build.json`: production build configuration; test files are excluded from `dist`.

### URL note generation lifecycle

The API and the BullMQ worker are separate processes. The browser tracks job status, but it does not own the generation work:

1. The web app submits `POST /note-generations`. The [generation router](apps/api/src/notes/generation/note-generation.router.ts) delegates validation and enqueueing to the [BullMQ job adapter](apps/api/src/workers/note-generation.jobs.ts), which stores the job in Redis and returns its current snapshot with `202 Accepted`. The response's `Location` header points to that job's SSE endpoint; the web API client validates that it is same-origin, uses its path for the initial subscription, and adds the `/api` prefix required by the Vite proxy.
2. The [worker process](apps/api/src/workers/note-generation.worker.ts) consumes the job, calls the notes service to read the page and generate its content with Ollama, then persists the note through the Prisma repository. It reports each processing stage to BullMQ. Closing or reloading the browser does not cancel this work.
3. The API's job adapter listens to BullMQ `QueueEvents`. The [SSE handler](apps/api/src/notes/generation/note-generation-events.handler.ts) subscribes to job updates, reads an initial snapshot, and sends both the snapshot and subsequent progress or terminal state to the browser. Updates arriving while the initial snapshot is being loaded are buffered so a state transition is not missed.
4. The [useNotes hook](apps/web/src/hooks/useNotes.ts) loads notes and saved jobs when the page opens, then reconnects to jobs still queued or running. When a job completes, it refreshes the notes list to show the persisted note. The SSE stream closes when the job reaches a terminal state or the browser disconnects.

```mermaid
sequenceDiagram
	autonumber
	participant UI as Browser / useNotes
	participant Proxy as Vite API proxy
	participant API as Express API
	participant Adapter as BullMQ job adapter
	participant Redis as Redis queue
	participant Worker as Generation worker
	participant Service as NotesService
	participant Page as Source page
	participant Ollama
	participant DB as PostgreSQL
	participant Events as BullMQ QueueEvents
	participant SSE as SSE handler

	UI->>Proxy: POST /api/note-generations
	Proxy->>API: POST /note-generations
	API->>Adapter: submit(input)
	Adapter->>Redis: enqueue job
	Redis-->>Adapter: job
	Adapter->>Redis: read current job snapshot
	Redis-->>Adapter: snapshot
	Adapter-->>API: accepted job snapshot
	API-->>UI: 202 + job + Location
	Note over UI,Proxy: Client uses Location and adds /api for the Vite proxy

	par Browser opens and consumes SSE
		UI->>Proxy: EventSource GET /api/note-generations/{id}/events
		Proxy->>API: GET /note-generations/{id}/events
		API->>SSE: handle request
		SSE->>Adapter: subscribe(id)
		Adapter->>Events: listen for progress/completed/failed
		SSE->>Adapter: get(id)
		Adapter->>Redis: read current job snapshot
		Redis-->>Adapter: snapshot
		Adapter-->>SSE: initial snapshot
		SSE-->>UI: event: job (initial snapshot)
		Note over SSE,Adapter: Subscribe before reading the snapshot; buffer events during setup
		Adapter-->>SSE: progress or terminal update
		SSE-->>UI: event: job (current snapshot)
	and Worker processes the durable job
		Redis-->>Worker: deliver queued job
		Worker->>Service: processGenerationJob(input, reportProgress)
		Service-->>Worker: reportProgress(reading_page)
		Worker->>Redis: job.updateProgress(reading_page)
		Redis-->>Events: progress event
		Events-->>Adapter: matching job progress
		Service->>Page: fetch and extract page content
		Page-->>Service: title, URL, and content
		Service-->>Worker: reportProgress(summarizing)
		Worker->>Redis: job.updateProgress(summarizing)
		Redis-->>Events: progress event
		Events-->>Adapter: matching job progress
		Service->>Ollama: summarize content
		Ollama-->>Service: generated note content
		Service-->>Worker: reportProgress(saving_note)
		Worker->>Redis: job.updateProgress(saving_note)
		Redis-->>Events: progress event
		Events-->>Adapter: matching job progress
		Service->>DB: persist note
		DB-->>Service: saved note
		Service-->>Worker: generated note
		Worker->>Redis: complete job with noteId
		Redis-->>Events: completed event
		Events-->>Adapter: state changed
		Adapter->>Redis: read terminal snapshot
		Redis-->>Adapter: completed snapshot
		Adapter-->>SSE: terminal job update
	end

	opt Job completed successfully
		UI->>Proxy: GET /api/notes
		Proxy->>API: GET /notes
		API->>DB: list persisted notes
		DB-->>API: notes
		API-->>UI: refreshed notes
	end

	opt Browser reloads while a job is active
		UI->>Proxy: GET /api/note-generations
		Proxy->>API: GET /note-generations
		API->>Adapter: list retained jobs
		Adapter->>Redis: read active job snapshots
		Redis-->>Adapter: queued/running jobs
		Adapter-->>UI: job snapshots
		UI->>Proxy: Reopen EventSource for each active job
	end
```

Redis is the durable job state; PostgreSQL is the durable note data. SSE only communicates status to the browser and is not responsible for executing or persisting the generation.

## Commands

```bash
npm run build  # Build frontend and backend
npm run lint   # Type-check frontend and backend
npm run test   # Run unit tests
npm run db:generate --workspace @sage/api  # Generate Prisma Client
npm run db:push --workspace @sage/api      # Synchronize the local database from Prisma
npm run db:studio --workspace @sage/api    # Inspect the database with Prisma Studio
```

API behavior is covered by Vitest and Supertest; frontend behavior is covered by Vitest and React Testing Library.

## Current scope

The current V1 slice supports creating, listing, updating, and deleting notes,
plus asynchronous note generation from URLs. Notes are stored in PostgreSQL;
generation jobs and progress are managed by BullMQ in Redis and delivered to the
frontend over SSE. PostgreSQL has pgvector enabled. LangChain's recursive
splitter, Nomic/Ollama adapter, and PGVectorStore integration are configured,
but asynchronous note indexing is not connected yet. Import, semantic search,
generated answers, and citations remain future work.
