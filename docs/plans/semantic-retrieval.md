# Semantic Note Retrieval Plan

Status: Phase 1 complete; Phase 2 not started.
Planning date: 2026-10-14.

This document records the agreed first retrieval increment of the [V1 roadmap](../../ROADMAP.md). Follow the [project context](../../PROJECT_CONTEXT.md) and [architecture](../../TECH_STACK.md); complete and validate one phase at a time before proceeding with the user's approval.

## Goal and Scope

Retrieve relevant passages from English notes through an API. This delivers the Retrieval part of RAG, not generated answers.

Agreed scope:

- English notes and queries.
- API and retrieval evaluation only; no frontend changes.
- Asynchronous indexing with BullMQ, so saving notes does not depend on Ollama availability.
- Preserve existing note CRUD, URL generation, SSE tracking, and public note contracts.

Excluded from this increment: generated answers, quiz generation, lexical or hybrid search, reranking, caching, a separate vector database, and approximate vector indexes.

## Technical Direction

| Concern | Proposed approach | Reason and tradeoff |
| --- | --- | --- |
| Embeddings | Dedicated Ollama model; start by validating `nomic-embed-text:v1.5` | Local English baseline, not a claim that it is the best model for this corpus. |
| Vector storage | PostgreSQL 16 with pgvector | Reuse the existing database rather than introduce a separate vector store. |
| Retrieval | Exact cosine-distance search using `<=>` | Simple baseline; approximate indexes can wait for measured latency constraints. |
| Indexing | Dedicated BullMQ queue and indexing worker | Reuse Redis/BullMQ; adds orchestration and eventual consistency but isolates CRUD from embedding failures. |
| Source representation | Versioned passages linked to their note | Retrieve precise source text and reject stale indexing results. |

Queries and documents must use the same embedding model and compatible pipeline version. Changing the model or chunking strategy requires controlled reindexing; a dimension change may also require a schema migration.

## Phase 1: Validate the Model and Infrastructure

- [x] Call Ollama's `POST /api/embed` with real documents and queries. Verify response shape, vector count, finite nonzero values, dimension, latency, and the deployed context limit.
- [x] Validate `nomic-embed-text:v1.5` with its `search_document:` and `search_query:` prefixes. Its native output is expected to have 768 dimensions; verify before fixing the schema.
- [x] Validate `truncate: false` in model checks to expose inputs that exceed the context rather than silently lose text. The embedding adapter must preserve this setting when implemented; do not assume deployed Ollama context equals the model's maximum advertised context.
- [x] Record the model tag and resolved digest. Define a pipeline version covering chunking and input formatting with the Phase 2 implementation.
- [x] Add `OLLAMA_EMBEDDING_MODEL` to the API environment example and model bootstrap in [dev.mjs](../../dev.mjs). Keep the existing chat model configuration independent.
- [x] Back up PostgreSQL data with `pg_dump` before changing [compose.yaml](../../compose.yaml). Select a pinned pgvector image compatible with PostgreSQL 16 and the host architecture.
- [x] Check locale and collation compatibility when moving from the existing Alpine image. If volume reuse is unsafe, restore the dump to a new volume and retain the original for rollback. Do not delete user data or upgrade the PostgreSQL major version as part of this feature.

Validation completed 2026-10-18:

- PostgreSQL 16.15 now runs `pgvector/pgvector:0.8.1-pg16` at pinned multi-architecture digest `sha256:33198da2828a14c30348d2ccb4750833d5ed9a44c88d840a0e523d7417120337`; `vector` extension version 0.8.1 is active.
- The original `en_US.utf8` database dump was restored to the new volume. All three notes were preserved and verified before the old volume and temporary dump were removed.
- Ollama model `nomic-embed-text:v1.5`, digest `0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`, returned two valid 768-dimensional vectors for prefixed document/query inputs in 344 ms.
- Ollama reports `nomic-bert.context_length=2048` and `num_ctx=8192`. With `truncate: false`, a 1,800-character passage was accepted (206 prompt tokens); a longer input was accepted at 1,118 tokens and an over-limit input was rejected. Chunking must remain within the model's actual limit.

Exit criterion: pgvector is available in real PostgreSQL, existing notes are preserved, and the embedding model works independently of summarization.

## Phase 2: Store and Split Source Passages

- [ ] Extend the [Prisma schema](../../apps/api/prisma/schema.prisma) and add a customized SQL migration enabling the `vector` extension and introducing `NoteChunk`.
- [ ] Store each chunk's note ID, ordinal, exact source text, offsets, source revision, pipeline identity, and embedding. Delete chunks through an `ON DELETE CASCADE` relation.
- [ ] Enforce uniqueness for note/revision/pipeline/ordinal. Represent the vector field with Prisma's unsupported-type mechanism; keep parameterized vector SQL inside the repository.
- [ ] Add internal note-indexing fields: a revision token, indexed revision, pipeline identity, `pending`/`ready`/`failed` status, and a bounded error description. Do not expose them through the existing public note DTO by accident.
- [ ] Persist the pending state atomically with note creation or title/content changes. Use a fresh revision token on edits to distinguish even an A-to-B-to-A edit sequence.
- [ ] Implement deterministic chunking under `notes/retrieval/`, with nearby tests. Initial heuristic: passages up to 1,800 characters, overlap around 200 characters, and paragraph/word boundaries where possible.
- [ ] Preserve exact source slices and offsets. Prepend a bounded title, initially up to 200 characters, only to the embedding input. Handle long unbroken text without dropping content or creating an infinite splitting loop.

Chunk sizes are starting heuristics, not token guarantees. Keep oversized-input errors explicit and adjust these values based on model validation and retrieval evaluation.

Exit criterion: migration and chunking tests pass, CRUD remains compatible, and real PostgreSQL tests cover vector storage and cascading deletion. No HNSW or IVFFlat index yet.

## Phase 3: Index Asynchronously and Recover Safely

- [ ] Add a dedicated Ollama embedding adapter following existing timeout and response-validation conventions. Validate vector counts, dimensions, finite values, and nonzero vectors.
- [ ] Add a BullMQ indexing queue and dedicated worker under `workers/`. Update startup/watch scripts and dependency composition. Start indexing concurrency at one, with bounded batches, retries, and graceful shutdown.
- [ ] Enqueue after manual creation, edits, and generated-note persistence. A queue failure must not turn a successful note save into a failed CRUD response: leave the persisted pending marker for recovery.
- [ ] Preserve `createGenerated` idempotency: redelivery of a generation job must not reset indexing state or overwrite later user edits.
- [ ] Put note ID, revision, and pipeline identity in jobs; read the note from PostgreSQL rather than treating queued content as authoritative. Use deterministic BullMQ-compatible job IDs without colons.
- [ ] Skip deleted, superseded, or already-indexed revisions. Compute embeddings outside database transactions.
- [ ] Publish the complete passage replacement and ready state in one short transaction. Lock and recheck the current note revision before writing; discard stale results. Duplicate delivery must not duplicate chunks.
- [ ] On retry exhaustion, mark only the matching current revision as failed. Do not let an old job change a newer revision's state; do not retry deterministic invalid-input or dimension errors indefinitely.
- [ ] Recover failed enqueue attempts with a bounded scan of pending notes at worker startup and periodically, initially every 30 seconds with batches of 100 and no overlapping scans. Test deduplication against pending, active, completed, and failed BullMQ jobs.
- [ ] Provide an explicit batched backfill/reindex command for existing notes, failed indexing, and changed pipelines. Do not run model inference inside schema migrations or block every application startup on a full reindex.

PostgreSQL and Redis do not share a transaction. The persisted pending marker plus reconciliation makes missing enqueue attempts recoverable; it is not an exactly-once delivery guarantee.

While a modified note is pending or failed, its older passages must be excluded from search. A deleted note must never reappear because an old worker finishes later. Generation completion continues to mean that the note was persisted, not that its embeddings are ready.

Exit criterion: creation, edits, URL generation, and backfill index correctly. Tests cover Ollama/Redis outages, duplicate delivery, restarts, edits during inference, deletion during inference, and atomic publication. No new SSE progress endpoint is needed for this API-only increment.

## Phase 4: Expose Semantic Retrieval

- [ ] Add `POST /notes/search` with a strict body containing `query` and optional `limit`. Initial limits: trimmed query of 1-1,000 characters; result count of 1-20, default five.
- [ ] Embed the query with the validated query prefix and active embedding pipeline.
- [ ] Rank eligible chunks by cosine distance (`<=>`, ascending), with stable note ID/ordinal tie-breaking. Exclude non-ready, obsolete-revision, deleted, and incompatible-pipeline material before ranking.
- [ ] Return source-linked passages: note ID, title, source URL, chunk ID, exact text, ordinal, and distance. Keep vectors internal. Lower distance means closer, not a confidence percentage.
- [ ] Add response schemas and types to [packages/contracts](../../packages/contracts/src/index.ts). Keep route HTTP concerns, service use cases, and repository vector SQL separate.
- [ ] Return an empty result list for an empty eligible corpus; avoid an unnecessary Ollama call in that case. Map embedding-service unavailability to a controlled `503`, retaining the existing error boundary for unexpected faults.
- [ ] Validate contracts with Supertest and service tests; use real PostgreSQL tests for cosine ordering, freshness filtering, and parameterized SQL.

Exit criterion: the API retrieves relevant English passages without changing the frontend or generating answers. Do not introduce an arbitrary universal similarity threshold or claim that top-k retrieval proves whether an answer exists.

## Phase 5: Evaluate, Document, and Close the Increment

- [ ] Build a small English evaluation corpus, initially 15-20 notes, with multi-topic notes and distractors. Use a disposable evaluation database, never reset the user's database.
- [ ] Prepare around 15 questions: ten answerable with expected source passages, plus five unsupported questions. Include paraphrases, exact technical names, and acronyms.
- [ ] Keep deterministic unit tests based on fixed vectors separate from semantic-quality evaluation using real Ollama. Add explicit commands for database integration tests and evaluation instead of silently requiring infrastructure for the default fast tests.
- [ ] Record model digest, pipeline version, expected passages, result ranks, Hit@5, mean reciprocal rank, and latency. Initial smoke target: a relevant passage in the top five for at least eight of the ten answerable questions. This small-sample target is not a production-quality guarantee.
- [ ] Inspect unsupported queries' nearest results and distances without treating them as validated answers. Keep held-out questions for checking changes to the model or chunking.
- [ ] Document backfill/reindex, evaluation prerequisites, failures, and recovery. Update [README](../../README.md), [TECH_STACK](../../TECH_STACK.md), and [ROADMAP](../../ROADMAP.md) to reflect only the slice actually delivered.
- [ ] Run focused tests plus the repository's `npm run lint`, `npm run test`, and `npm run build` gates. Separately run migrations, vector SQL tests on real PostgreSQL, worker recovery checks, and retrieval evaluation on real Ollama. Report any unverified checks explicitly.

Exit criterion: retrieval quality and operational behavior are measured and repeatable, with documented limitations.

## Implementation Boundaries

Existing integration points are the [notes repository](../../apps/api/src/notes/notes.repository.ts), [notes service](../../apps/api/src/notes/notes.service.ts), [API composition](../../apps/api/src/app.ts), [server entry point](../../apps/api/src/server.ts), [generation worker](../../apps/api/src/workers/note-generation.worker.ts), and [shared contracts](../../packages/contracts/src/index.ts).

New code should stay within justified boundaries: an embeddings adapter under `ai/`, retrieval/chunking/vector persistence under `notes/retrieval/`, and the indexing queue/worker under `workers/`. Add tests beside the relevant implementation. Do not introduce a general AI framework or an abstraction hierarchy just to prepare hypothetical providers.

## Estimate

Planning estimate: 30-55 focused hours with AI assistance, including learning discussions, tests, and validation. Reserve roughly 40 hours, with contingency up to 55; revise after Phase 1. A first happy-path demonstration may take 8-15 hours but does not establish the lifecycle guarantees above.

## Future Improvements and Scaling

After this increment, connect retrieved passages to answer generation and validate source citations. Add lexical search and rank fusion only if evaluation shows weaknesses on exact technical terms. Consider approximate vector indexes, caching, or more indexing concurrency only after measuring corpus size, latency, and local Ollama capacity.

## References

- [Ollama embedding API](https://docs.ollama.com/api/embed)
- [Ollama nomic-embed-text model](https://ollama.com/library/nomic-embed-text)
- [Nomic v1.5 model card and task prefixes](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- [pgvector storage, cosine distance, and PostgreSQL Docker images](https://github.com/pgvector/pgvector)