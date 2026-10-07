import { Queue, QueueEvents, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';

import {
  noteGenerationJobStageSchema,
  type NoteGenerationJob,
  type NoteGenerationJobStatus,
} from '@sage/contracts';
import { fromUrlInputSchema, type FromUrlInput } from '../notes/from-url.input.js';
import type { NoteGenerationJobs, SubmitNoteGenerationResult } from '../notes/note-generation-jobs.port.js';
import {
  createNoteGenerationQueue,
  noteGenerationQueueName,
  redisConnectionOptions,
  type NoteGenerationJobResult,
} from './note-generation.queue.js';

type GenerationQueue = Queue<FromUrlInput, NoteGenerationJobResult, string>;

function statusFor(state: string): NoteGenerationJobStatus {
  if (state === 'active') return 'running';
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  return 'queued';
}

async function toSnapshot(job: Job<FromUrlInput, NoteGenerationJobResult, string>): Promise<NoteGenerationJob> {
  const status = statusFor(await job.getState());
  const progress = typeof job.progress === 'object' && job.progress !== null && 'stage' in job.progress
    ? noteGenerationJobStageSchema.safeParse(job.progress.stage)
    : null;
  const stage = status === 'completed'
    ? 'completed'
    : status === 'failed'
      ? 'failed'
      : progress?.success
        ? progress.data
        : status === 'running'
          ? 'reading_page'
          : 'queued';
  const noteId = status === 'completed' && typeof job.returnvalue?.noteId === 'string'
    ? job.returnvalue.noteId
    : null;

  return {
    id: job.id ?? '',
    status,
    stage,
    noteId,
    error: status === 'failed' ? 'Note generation failed. Please retry.' : null,
    createdAt: new Date(job.timestamp).toISOString(),
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  };
}

export function createNoteGenerationJobs(queue: GenerationQueue, events: QueueEvents): NoteGenerationJobs {
  async function get(id: string) {
    const job = await queue.getJob(id);
    return job ? toSnapshot(job) : null;
  }

  function subscribe(id: string, listener: () => void): () => void {
    const onProgress = (event: { jobId: string }) => {
      if (event.jobId === id) listener();
    };
    const onCompleted = (event: { jobId: string }) => {
      if (event.jobId === id) listener();
    };
    const onFailed = (event: { jobId: string }) => {
      if (event.jobId === id) listener();
    };

    events.on('progress', onProgress);
    events.on('completed', onCompleted);
    events.on('failed', onFailed);
    return () => {
      events.off('progress', onProgress);
      events.off('completed', onCompleted);
      events.off('failed', onFailed);
    };
  }

  return {
    async waitUntilReady() {
      await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
    },
    async close() {
      await Promise.all([queue.close(), events.close()]);
    },
    async submit(input): Promise<SubmitNoteGenerationResult> {
      const result = fromUrlInputSchema.safeParse(input);
      if (!result.success) return { success: false, error: 'INVALID_INPUT' };

      const jobId = randomUUID();
      const job = await queue.add(noteGenerationQueueName, result.data, { jobId });
      return { success: true, job: await toSnapshot(job) };
    },
    get,
    async list() {
      const jobs = await queue.getJobs(
        ['waiting', 'active', 'delayed', 'failed', 'completed'],
        0,
        99,
        false,
      );
      const snapshots = await Promise.all(jobs.map(toSnapshot));
      return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    subscribe,
  };
}

export function createRedisNoteGenerationJobs(redisUrl?: string): NoteGenerationJobs {
  const queue = createNoteGenerationQueue(redisUrl);
  const events = new QueueEvents(noteGenerationQueueName, {
    connection: redisConnectionOptions(redisUrl),
  });
  return createNoteGenerationJobs(queue, events);
}