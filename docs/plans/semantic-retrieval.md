# Semantic Note Retrieval Plan

Status: Phases 1 and 2 complete; Phase 3 not started.
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
| Embeddings | LangChain `OllamaEmbeddings` with Nomic task prefixes and `truncate: false` | Reuse the supported Ollama integration while retaining model-specific input formatting. |
| Vector storage | LangChain `PGVectorStore` on PostgreSQL 16 with pgvector | Use the maintained integration and keep vector persistence out of the Prisma domain schema. |
| Retrieval | Exact cosine-distance search using `<=>` | Simple baseline; approximate indexes can wait for measured latency constraints. |
| Indexing | Dedicated BullMQ queue and indexing worker | Reuse Redis/BullMQ; adds orchestration and eventual consistency but isolates CRUD from embedding failures. |
| Source representation | LangChain `Document` chunks with note/revision/pipeline metadata | SAGE remains authoritative for notes and freshness; the vector store is derived and rebuildable. |

Queries and documents must use the same embedding model and compatible pipeline version. Changing the model or chunking strategy requires controlled reindexing; a dimension change may also require a schema migration.

## Phase 1: Validate the Model and Infrastructure

- [x] Call Ollama's `POST /api/embed` with real documents and queries. Verify response shape, vector count, finite nonzero values, dimension, latency, and the deployed context limit.
- [x] Validate `nomic-embed-text:v1.5` with its `search_document:` and `search_query:` prefixes. Its native output is expected to have 768 dimensions; verify before fixing the schema.
- [x] Validate `truncate: false` in model checks to expose inputs that exceed the context rather than silently lose text. The LangChain adapter preserves this setting; do not assume deployed Ollama context equals the model's maximum advertised context.
- [x] Record the model tag and resolved digest. Define a pipeline version covering the splitter and input formatting.
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

- [x] Keep canonical note content and internal indexing metadata in Prisma: current revision, indexed revision, pipeline version, `pending`/`ready`/`failed` status, and bounded error description. Do not expose these fields through the public note DTO.
- [x] Persist the pending state with note creation and assign a fresh revision on title/content changes, distinguishing even an A-to-B-to-A edit sequence.
- [x] Use LangChain's `RecursiveCharacterTextSplitter` with an initial 1,800-character size and 200-character overlap. Its JavaScript implementation trims chunk-boundary whitespace; results cite the stored chunk and its source note rather than exact character offsets.
- [x] Wrap LangChain `OllamaEmbeddings` with Nomic's `search_document:` and `search_query:` prefixes and `truncate: false`.
- [x] Configure LangChain `PGVectorStore` for 768-dimensional cosine vectors in its own `sage_note_vectors` table. The library initializes this derived table; Prisma does not model or duplicate vector rows.
- [x] Prefix embedding input with the title (bounded to 200 characters), retain an offset to recover the exact passage for citations, and attach `noteId`, `sourceRevision`, `pipelineVersion`, `ordinal`, title, and source URL as LangChain `Document` metadata.
- [x] Keep the Prisma schema limited to canonical notes and indexing state. During pre-production, synchronize schema changes with `prisma db push`; LangChain owns its derived vector table.
- [x] Cover splitting and Nomic formatting with unit tests; test PGVectorStore insertion, filtered search, and deletion against real PostgreSQL.

Chunk sizes are character-based starting heuristics, not token guarantees. `truncate: false` exposes oversized inputs; tune chunking based on retrieval evaluation.

Exit criterion: CRUD remains compatible, LangChain adapters are tested, and real PostgreSQL tests verify vector insertion, metadata-filtered search, and deletion. No HNSW or IVFFlat index yet.

## Phase 3: Index Asynchronously and Recover Safely

- [ ] Validate LangChain embedding responses for vector count, dimensions, finite values, and nonzero values before persistence.
- [ ] Initialize one LangChain `PGVectorStore` per indexing worker and close its pool during graceful shutdown.
- [ ] Add a BullMQ indexing queue and dedicated worker under `workers/`. Update startup/watch scripts and dependency composition. Start indexing concurrency at one, with bounded batches, retries, and graceful shutdown.
- [ ] Enqueue after manual creation, edits, and generated-note persistence. A queue failure must not turn a successful note save into a failed CRUD response: leave the persisted pending marker for recovery.
- [ ] Preserve `createGenerated` idempotency: redelivery of a generation job must not reset indexing state or overwrite later user edits.
- [ ] Put note ID, revision, and pipeline identity in jobs; read the note from PostgreSQL rather than treating queued content as authoritative. Use deterministic BullMQ-compatible job IDs without colons.
- [ ] Skip deleted, superseded, or already-indexed revisions. Compute embeddings outside database transactions.
- [ ] Before retrying a revision, delete its partial vector documents by metadata, then insert the complete LangChain document batch. The library inserts rather than upserts, so retries must explicitly clean up that revision.
- [ ] After vector insertion, conditionally mark the note ready only if its revision is still current. If the conditional update loses a race, delete that stale revision's vectors. A note remains pending while indexing is incomplete, so partial inserts are never eligible for retrieval.
- [ ] On retry exhaustion, mark only the matching current revision as failed. Do not let an old job change a newer revision's state; do not retry deterministic invalid-input or dimension errors indefinitely.
- [ ] Recover failed enqueue attempts with a bounded scan of pending notes at worker startup and periodically, initially every 30 seconds with batches of 100 and no overlapping scans. Test deduplication against pending, active, completed, and failed BullMQ jobs.
- [ ] Provide an explicit batched backfill/reindex command for existing notes, failed indexing, and changed pipelines. Do not run model inference inside schema migrations or block every application startup on a full reindex.

PostgreSQL and Redis do not share a transaction, and LangChain's vector-store pool is separate from Prisma's. The persisted pending marker plus reconciliation makes missing enqueue attempts recoverable; it is not an exactly-once delivery guarantee. The vector table has no foreign key to `Note`, so search must validate each result against current note revision/status and deletion state; cleanup removes orphaned or obsolete documents.

While a modified note is pending or failed, its older passages must be excluded from search. A deleted note must never reappear because an old worker finishes later. Generation completion continues to mean that the note was persisted, not that its embeddings are ready.

Exit criterion: creation, edits, URL generation, and backfill index correctly. Tests cover Ollama/Redis outages, duplicate delivery, restarts, edits during inference, deletion during inference, partial vector writes, and stale-result rejection. No new SSE progress endpoint is needed for this API-only increment.

## Phase 4: Expose Semantic Retrieval

- [ ] Add `POST /notes/search` with a strict body containing `query` and optional `limit`. Initial limits: trimmed query of 1-1,000 characters; result count of 1-20, default five.
- [ ] Embed the query with the validated query prefix and active embedding pipeline.
- [ ] Use LangChain PGVectorStore similarity search with the active pipeline filter, then validate candidate metadata against current Note revision/status before returning results. Over-fetch candidates if stale rows need to be discarded.
- [ ] Return source-linked passages: note ID, title, source URL, document ID, chunk text, ordinal, and distance. Keep vectors internal. Lower cosine distance means closer, not a confidence percentage.
- [ ] Add response schemas and types to [packages/contracts](../../packages/contracts/src/index.ts). Keep route HTTP concerns, service use cases, and repository vector SQL separate.
- [ ] Return an empty result list for an empty eligible corpus; avoid an unnecessary Ollama call in that case. Map embedding-service unavailability to a controlled `503`, retaining the existing error boundary for unexpected faults.
- [ ] Validate contracts with Supertest and service tests; use real PostgreSQL tests for cosine ordering and freshness filtering across Prisma and PGVectorStore.

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

Keep the Nomic/Ollama embedding adapter under `ai/`. Keep note-specific splitting, LangChain Document construction, and PGVectorStore composition under `retrieval/`, with `note-` names that make their domain scope explicit. Keep the indexing queue/worker under `workers/`. Add tests beside the relevant implementation; do not add a second vector persistence abstraction around LangChain.

## Estimate

Planning estimate: 30-55 focused hours with AI assistance, including learning discussions, tests, and validation. Reserve roughly 40 hours, with contingency up to 55; revise after Phase 1. A first happy-path demonstration may take 8-15 hours but does not establish the lifecycle guarantees above.

## Future Improvements and Scaling

After this increment, connect retrieved passages to answer generation and validate source citations. Add lexical search and rank fusion only if evaluation shows weaknesses on exact technical terms. Consider approximate vector indexes, caching, or more indexing concurrency only after measuring corpus size, latency, and local Ollama capacity.

## References

- [Ollama embedding API](https://docs.ollama.com/api/embed)
- [Ollama nomic-embed-text model](https://ollama.com/library/nomic-embed-text)
- [Nomic v1.5 model card and task prefixes](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- [LangChain.js PGVectorStore](https://docs.langchain.com/oss/javascript/integrations/vectorstores/pgvector)
- [LangChain.js Ollama embeddings](https://docs.langchain.com/oss/javascript/integrations/text_embedding/ollama)
- [LangChain.js text splitters](https://docs.langchain.com/oss/javascript/integrations/splitters)
- [pgvector storage, cosine distance, and PostgreSQL Docker images](https://github.com/pgvector/pgvector)