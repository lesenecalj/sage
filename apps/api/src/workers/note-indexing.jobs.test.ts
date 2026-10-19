import { describe, expect, it, vi } from 'vitest';

import { RETRIEVAL_PIPELINE_VERSION } from '../notes/retrieval/note-splitter.js';
import { createNoteIndexingJobs } from './note-indexing.jobs.js';
import { noteIndexingQueueName } from './note-indexing.queue.js';

describe('note indexing jobs adapter', () => {
  it('enqueues revision- and pipeline-specific jobs with deterministic IDs', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue(undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const jobs = createNoteIndexingJobs(queue as never);
    const job = {
      noteId: 'note-1',
      sourceRevision: 'revision-1',
      pipelineVersion: RETRIEVAL_PIPELINE_VERSION,
    };

    await jobs.enqueue(job);

    expect(queue.add).toHaveBeenCalledExactlyOnceWith(
      noteIndexingQueueName,
      job,
      { jobId: `note-1-revision-1-${RETRIEVAL_PIPELINE_VERSION}` },
    );
    expect(queue.add.mock.calls[0]?.[2].jobId).not.toContain(':');
  });
});