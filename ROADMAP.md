# Product Roadmap

---

# V1 - Knowledge Assistant (MVP)

Goal:

Turn personal notes into a searchable AI assistant.

## Features

- Create notes
- List notes
- Update notes
- Delete notes
- Import notes
- Ask questions
- Receive answers with citations

## User Journey

1. Add notes
2. Notes are indexed
3. Ask a question
4. Receive an answer
5. See which notes were used

## Learning Focus

### AI Engineering

- Prompt design
- Embeddings
- Chunking
- Retrieval
- RAG

### Architecture

- Modular design
- Data modeling
- API design

## Current Status

The application foundation is complete: React/Vite frontend, Express API, development proxy, and an API health check. Users can create and list notes through an in-memory MVP implementation. Persistence and retrieval are not implemented yet.

## Technical TODO

- Extract shared Note request and response Zod schemas into a `packages/contracts` workspace when the API contract grows beyond the current create/list slice.

---

# V2 - Learning Assistant

Goal:

Help users actively review knowledge.

## Features

- Generate quiz from notes
- Save quiz attempts
- Review answers
- Quiz history

## User Journey

1. Select a topic
2. Generate quiz
3. Answer questions
4. Review expected answers

## Learning Focus

### AI Engineering

- Structured prompts
- Content generation
- Evaluation workflows

### Backend

- Domain modeling
- Persistence strategies

---

# Engineering Roadmap

The following work is intentionally focused on engineering concepts rather than user-facing capabilities.

---

# E1 - Redis Caching

Question:

How can expensive operations be optimized?

## Goals

- Cache retrieval results
- Cache frequent questions
- Measure cache effectiveness

## Concepts

- Cache Aside
- TTL
- Invalidation
- Key Design
- Hit Rate

---

# E2 - Background Processing

Question:

Why should long-running operations happen asynchronously?

## Goals

- Introduce job processing
- Index notes in background
- Retry failed jobs

## Concepts

- Async processing
- Workers
- Queues
- Job states
- Eventual consistency

---

# E3 - Reliability

Question:

How should failures be handled?

## Goals

- Retry failed operations
- Improve resiliency
- Track failures

## Concepts

- Retry policies
- Failure handling
- Reliability patterns

---

# E4 - Idempotency

Question:

How do we safely retry requests?

## Goals

- Prevent duplicate imports
- Prevent duplicate processing

## Concepts

- Idempotency keys
- Safe retries
- Duplicate request protection

---

# E5 - Concurrency

Question:

What happens when multiple operations happen at the same time?

## Goals

- Handle concurrent updates
- Prevent race conditions

## Concepts

- Optimistic locking
- Transactions
- Consistency
- Race conditions

---

# E6 - Observability

Question:

How do we know the system is healthy?

## Goals

- Structured logging
- Metrics
- Tracing

## Concepts

- Monitoring
- Diagnostics
- Production readiness

---

# Definition of Success

## MVP Success

A user can:

- Import notes
- Ask questions
- Receive answers with citations

Quiz generation is a V2 success criterion.

## Engineering Success

I can clearly explain:

- Why RAG works
- Why Redis is useful
- Why workers exist
- Why idempotency matters
- How concurrency issues occur
- Which tradeoffs were made throughout the project