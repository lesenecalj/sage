import { EventEmitter } from 'node:events';
import type { QueueEvents } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { createNoteGenerationJobs } from './note-generation.jobs.js';
import { noteGenerationQueueName, type createNoteGenerationQueue } from './note-generation.queue.js';

function createQueueStub(getJob: ReturnType<typeof vi.fn>) {
  return Object.assign(new EventEmitter(), { getJob }) as unknown as ReturnType<typeof createNoteGenerationQueue>;
}

describe('generation progress adapter', () => {
  it('acknowledges an accepted job without reading Redis state again', async () => {
    const timestamp = 1_760_000_000_000;
    const getState = vi.fn().mockRejectedValue(new Error('Redis state read unavailable'));
    const getJob = vi.fn().mockRejectedValue(new Error('Redis job read unavailable'));
    const add = vi.fn(async (_name: string, _input: unknown, { jobId }: { jobId: string }) => ({
      id: jobId, timestamp, getState,
    }));
    const queue = Object.assign(createQueueStub(getJob), { add });
    const jobs = createNoteGenerationJobs(queue, new EventEmitter() as QueueEvents);
    const input = { url: 'https://example.com/', instruction: 'Summarize the page' };

    const result = await jobs.submit(input);

    expect(result).toEqual({
      id: expect.any(String),
      status: 'queued',
      stage: 'queued',
      noteId: null,
      error: null,
      createdAt: new Date(timestamp).toISOString(),
      finishedAt: null,
    });
    expect(add).toHaveBeenCalledExactlyOnceWith(noteGenerationQueueName, input, { jobId: result.id });
    expect(getState).not.toHaveBeenCalled();
    expect(getJob).not.toHaveBeenCalled();
  });

  it('propagates an enqueue failure instead of acknowledging an unaccepted job', async () => {
    const failure = new Error('Redis enqueue unavailable');
    const add = vi.fn().mockRejectedValue(failure);
    const queue = Object.assign(createQueueStub(vi.fn()), { add });
    const jobs = createNoteGenerationJobs(queue, new EventEmitter() as QueueEvents);

    await expect(jobs.submit({ url: 'https://example.com/', instruction: 'Summarize' }))
      .rejects.toBe(failure);
  });

  it('handles queue and QueueEvents Redis errors and notifies active subscribers', () => {
    const queue = createQueueStub(vi.fn());
    const events = new EventEmitter();
    const jobs = createNoteGenerationJobs(queue, events as QueueEvents);
    const listener = vi.fn();
    const unsubscribe = jobs.subscribe('job-1', listener);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redisError = new Error('connection lost');

    expect(() => queue.emit('error', redisError)).not.toThrow();
    expect(() => events.emit('error', redisError)).not.toThrow();
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { type: 'tracking_error' },
      { type: 'tracking_error' },
    ]);
    expect(log).toHaveBeenCalledTimes(2);

    unsubscribe();
    log.mockRestore();
  });

  it('reloads terminal fields when completion happens after the initial job read', async () => {
    const events = new EventEmitter();
    const staleJob = {
      id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45', timestamp: 1_760_000_000_000,
      progress: { stage: 'summarizing' }, returnvalue: null,
      getState: vi.fn().mockResolvedValue('completed'),
    };
    const terminalJob = {
      ...staleJob, finishedOn: staleJob.timestamp + 60_000,
      returnvalue: { noteId: staleJob.id }, progress: { stage: 'saving_note' },
    };
    const getJob = vi.fn().mockResolvedValueOnce(staleJob).mockResolvedValueOnce(terminalJob);
    const queue = createQueueStub(getJob);
    const jobs = createNoteGenerationJobs(queue, events as QueueEvents);

    await expect(jobs.get(staleJob.id)).resolves.toMatchObject({
      status: 'completed', stage: 'completed', noteId: staleJob.id,
      finishedAt: new Date(terminalJob.finishedOn).toISOString(),
    });
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it('forwards progress payloads without replacing them with the latest Redis snapshot', () => {
    const events = new EventEmitter();
    const getJob = vi.fn();
    const queue = createQueueStub(getJob);
    const jobs = createNoteGenerationJobs(queue, events as QueueEvents);
    const listener = vi.fn();
    const unsubscribe = jobs.subscribe('job-1', listener);

    events.emit('progress', { jobId: 'job-1', data: { stage: 'summarizing' } });
    events.emit('progress', { jobId: 'job-1', data: { stage: 'saving_note' } });
    events.emit('completed', { jobId: 'job-1' });
    events.emit('progress', { jobId: 'other-job', data: { stage: 'reading_page' } });

    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { type: 'progress', stage: 'summarizing' },
      { type: 'progress', stage: 'saving_note' },
      { type: 'state_changed' },
    ]);
    expect(getJob).not.toHaveBeenCalled();
    unsubscribe();
    expect(events.listenerCount('progress')).toBe(0);
    expect(events.listenerCount('completed')).toBe(0);
    expect(events.listenerCount('failed')).toBe(0);
  });
});