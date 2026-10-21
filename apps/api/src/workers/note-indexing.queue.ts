import { Queue } from 'bullmq';

import type { NoteIndexingJob } from '../notes/retrieval/note-indexing-jobs.port.js';
import { redisConnectionOptions } from './note-generation.queue.js';

export const noteIndexingQueueName = 'note-indexing';

export function createNoteIndexingQueue(redisUrl?: string) {
  return new Queue<NoteIndexingJob, void, string>(noteIndexingQueueName, {
    connection: redisConnectionOptions(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 1_000 },
    },
  });
}