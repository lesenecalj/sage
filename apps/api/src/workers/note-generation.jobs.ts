import { Queue, QueueEvents, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';

import {
  noteGenerationJobStageSchema,
  type NoteGenerationJob,
  type NoteGenerationJobStatus,
} from '@sage/contracts';
import { fromUrlInputSchema, type FromUrlInput } from '../notes/generation/from-url.input.js';
import type { NoteGenerationEvent, NoteGenerationJobs, SubmitNoteGenerationResult } from '../notes/generation/note-generation-jobs.port.js';
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

function toSnapshot(job: Job<FromUrlInput, NoteGenerationJobResult, string>, status: NoteGenerationJobStatus): NoteGenerationJob {
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
  const subscribers = new Map<string, Set<(event: NoteGenerationEvent) => void>>();
  const onConnectionError = (error: Error) => {
    console.error('Note generation Redis connection error.', error);
    for (const listeners of subscribers.values()) {
      for (const listener of listeners) listener({ type: 'tracking_error' });
    }
  };
  queue.on('error', onConnectionError);
  events.on('error', onConnectionError);

  async function readSnapshot(job: Job<FromUrlInput, NoteGenerationJobResult, string>): Promise<NoteGenerationJob | null> {
    const state = await job.getState();
    if (state === 'unknown') return null;
    const status = statusFor(state);
    if (status !== 'completed' && status !== 'failed') return toSnapshot(job, status);

    const terminalJob = await queue.getJob(job.id ?? '');
    if (!terminalJob) return null;
    if (!terminalJob.finishedOn || (status === 'completed' && !terminalJob.returnvalue?.noteId)) {
      throw new Error('Generation job terminal result is unavailable.');
    }
    return toSnapshot(terminalJob, status);
  }

  async function get(id: string) {
    const job = await queue.getJob(id);
    return job ? readSnapshot(job) : null;
  }

  function subscribe(id: string, listener: (event: NoteGenerationEvent) => void): () => void {
    const listeners = subscribers.get(id) ?? new Set<(event: NoteGenerationEvent) => void>();
    listeners.add(listener);
    subscribers.set(id, listeners);

    const onProgress = (event: { jobId: string; data: unknown }) => {
      if (event.jobId !== id) return;
      const data = event.data;
      const stage = typeof data === 'object' && data !== null && 'stage' in data ? data.stage : null;
      if (stage === 'reading_page' || stage === 'summarizing' || stage === 'saving_note') {
        listener({ type: 'progress', stage });
      }
    };
    const onCompleted = (event: { jobId: string }) => {
      if (event.jobId === id) listener({ type: 'state_changed' });
    };
    const onFailed = (event: { jobId: string }) => {
      if (event.jobId === id) listener({ type: 'state_changed' });
    };

    events.on('progress', onProgress);
    events.on('completed', onCompleted);
    events.on('failed', onFailed);
    return () => {
      events.off('progress', onProgress);
      events.off('completed', onCompleted);
      events.off('failed', onFailed);
      listeners.delete(listener);
      if (!listeners.size) subscribers.delete(id);
    };
  }

  return {
    async waitUntilReady() {
      await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
    },
    async close() {
      queue.off('error', onConnectionError);
      events.off('error', onConnectionError);
      subscribers.clear();
      await Promise.all([queue.close(), events.close()]);
    },
    async submit(input): Promise<SubmitNoteGenerationResult> {
      const result = fromUrlInputSchema.safeParse(input);
      if (!result.success) return { success: false, error: 'INVALID_INPUT' };

      const jobId = randomUUID();
      const job = await queue.add(noteGenerationQueueName, result.data, { jobId });
      const snapshot = await readSnapshot(job);
      if (!snapshot) throw new Error('Accepted generation job is unavailable.');
      return { success: true, job: snapshot };
    },
    get,
    async list() {
      const jobs = await queue.getJobs(
        ['waiting', 'active', 'delayed', 'failed', 'completed'],
        0,
        99,
        false,
      );
      const snapshots = await Promise.all(jobs.map(readSnapshot));
      return snapshots.filter((job): job is NoteGenerationJob => job !== null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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