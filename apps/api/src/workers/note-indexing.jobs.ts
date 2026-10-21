import { Queue } from 'bullmq';

import type { NoteIndexingJob, NoteIndexingJobs } from '../notes/retrieval/note-indexing-jobs.port.js';
import { createNoteIndexingQueue, noteIndexingQueueName } from './note-indexing.queue.js';

type IndexingQueue = Pick<Queue<NoteIndexingJob, void, string>, 'add' | 'waitUntilReady' | 'close'>;

export function createNoteIndexingJobs(queue: IndexingQueue): NoteIndexingJobs {
  return {
    async enqueue(job) {
      const jobId = `${job.noteId}-${job.sourceRevision}-${job.pipelineVersion}`;
      await queue.add(noteIndexingQueueName, job, { jobId });
    },
    async waitUntilReady() {
      await queue.waitUntilReady();
    },
    async close() {
      await queue.close();
    },
  };
}

export function createRedisNoteIndexingJobs(redisUrl?: string): NoteIndexingJobs {
  return createNoteIndexingJobs(createNoteIndexingQueue(redisUrl));
}