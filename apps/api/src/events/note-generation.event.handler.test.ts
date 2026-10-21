import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { NoteGenerationJob } from '@sage/contracts';
import type { NoteGenerationEvent, NoteGenerationJobs } from '../workers/types.js';
import { createNoteGenerationEventsHandler } from './note-generation.event.handler.js';

const job: NoteGenerationJob = {
  id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
  status: 'queued',
  stage: 'queued',
  noteId: null,
  error: null,
  createdAt: '2026-09-27T12:00:00.000Z',
  finishedAt: null,
};

describe('note generation events handler', () => {
  it.each(['completed', 'failed'] as const)('closes the stream and subscription for an initially %s job', async (status) => {
    const snapshot = { ...job, status, stage: status };
    const unsubscribe = vi.fn();
    const jobs = {
      get: vi.fn().mockResolvedValue(snapshot),
      subscribe: vi.fn(() => unsubscribe),
    };
    const response = Object.assign(new EventEmitter(), {
      status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(), write: vi.fn(() => true), end: vi.fn(),
    });

    await createNoteGenerationEventsHandler(jobs)(
      { params: { id: job.id } } as Request<{ id: string }>,
      response as unknown as Response, vi.fn(),
    );
    response.emit('close');

    expect(response.write).toHaveBeenCalledExactlyOnceWith(
      `event: job\ndata: ${JSON.stringify({ job: snapshot })}\n\n`,
    );
    expect(response.end).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('returns 404 without opening SSE when the initial job is missing', async () => {
    const unsubscribe = vi.fn();
    const jobs = { get: vi.fn().mockResolvedValue(null), subscribe: () => unsubscribe };
    const response = Object.assign(new EventEmitter(), {
      status: vi.fn().mockReturnThis(), json: vi.fn(),
      set: vi.fn(), write: vi.fn(),
    });

    await createNoteGenerationEventsHandler(jobs)(
      { params: { id: job.id } } as Request<{ id: string }>,
      response as unknown as Response, vi.fn(),
    );

    expect(response.status).toHaveBeenCalledExactlyOnceWith(404);
    expect(response.json).toHaveBeenCalledExactlyOnceWith({ error: 'generation job not found' });
    expect(response.set).not.toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('sends a safe retryable error when subscription setup fails', async () => {
    const jobs = {
      get: vi.fn(),
      subscribe: vi.fn(() => { throw new Error('private connection details'); }),
    };
    const response = Object.assign(new EventEmitter(), {
      status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(), write: vi.fn(() => true), end: vi.fn(),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await createNoteGenerationEventsHandler(jobs)(
        { params: { id: job.id } } as Request<{ id: string }>,
        response as unknown as Response, vi.fn(),
      );

      expect(response.write).toHaveBeenCalledExactlyOnceWith(
        'retry: 1500\nevent: error\ndata: {"error":"Generation tracking is temporarily unavailable. Reconnecting...","retryable":true}\n\n',
      );
      expect(response.end).toHaveBeenCalledOnce();
      expect(jobs.get).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.each(['initial', 'refresh'] as const)('sends a safe retryable SSE error when the %s Redis read fails', async (phase) => {
    const failure = new Error('Redis connection failed: private-host password=secret');
    const get = vi.fn().mockRejectedValue(failure);
    if (phase === 'refresh') get.mockResolvedValueOnce(job);
    let listener: (event: NoteGenerationEvent) => void = () => {};
    const unsubscribe = vi.fn();
    const jobs: NoteGenerationJobs = {
      waitUntilReady: async () => {}, close: async () => {},
      submit: async () => ({ success: false, error: 'INVALID_INPUT' }),
      get, list: async () => [],
      subscribe: (_id, callback) => { listener = callback; return unsubscribe; },
    };
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const response = Object.assign(new EventEmitter(), {
      headersSent: false,
      status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(() => { response.headersSent = true; }),
      write: vi.fn((_frame: string) => true), end: vi.fn(() => finish()),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const next = vi.fn();
      await createNoteGenerationEventsHandler(jobs)(
        { params: { id: job.id } } as Request<{ id: string }>,
        response as unknown as Response, next,
      );
      if (phase === 'refresh') listener({ type: 'state_changed' });
      await finished;

      const frames = response.write.mock.calls.map(([frame]) => String(frame)).join('');
      expect(frames).toContain('"retryable":true');
      expect(frames).toContain('retry: 1500');
      expect(frames).not.toContain('private-host');
      expect(frames).not.toContain('password=secret');
      expect(log).toHaveBeenCalledWith(expect.any(String), failure);
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(next).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('buffers rapid progress during the initial snapshot and forwards every stage before completion', async () => {
    let resolveSnapshot: (snapshot: NoteGenerationJob | null) => void = () => {};
    let listener: (event: NoteGenerationEvent) => void = () => {};
    const completedJob: NoteGenerationJob = {
      ...job, status: 'completed', stage: 'completed', noteId: job.id,
      finishedAt: '2026-09-27T12:01:00.000Z',
    };
    const get = vi.fn()
      .mockImplementationOnce(() => new Promise<NoteGenerationJob | null>((resolve) => {
        resolveSnapshot = resolve;
      }))
      .mockResolvedValue(completedJob);
    const unsubscribe = vi.fn();
    const jobs: NoteGenerationJobs = {
      waitUntilReady: async () => {}, close: async () => {},
      submit: async () => ({ success: false, error: 'INVALID_INPUT' }),
      get, list: async () => [],
      subscribe: (_id, callback) => { listener = callback; return unsubscribe; },
    };
    let finishStream: () => void = () => {};
    const finished = new Promise<void>((resolve) => { finishStream = resolve; });
    const response = Object.assign(new EventEmitter(), {
      status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(), write: vi.fn((_frame: string) => true), end: vi.fn(() => finishStream()),
    });
    const next = vi.fn();
    const handler = createNoteGenerationEventsHandler(jobs);
    const handling = handler(
      { params: { id: job.id } } as Request<{ id: string }>,
      response as unknown as Response, next,
    );

    listener({ type: 'progress', stage: 'reading_page' });
    listener({ type: 'progress', stage: 'summarizing' });
    listener({ type: 'progress', stage: 'saving_note' });
    listener({ type: 'state_changed' });
    resolveSnapshot(job);
    await handling;
    await finished;

    const stages = response.write.mock.calls.map(([frame]) => {
      const data = String(frame).split('data: ')[1];
      return JSON.parse(data ?? '').job.stage;
    });
    expect(stages).toEqual(['queued', 'reading_page', 'summarizing', 'saving_note', 'completed']);
    expect(get).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('does not write the initial snapshot if the client disconnects while it loads', async () => {
    let resolveSnapshot: (snapshot: NoteGenerationJob | null) => void = () => {};
    const get = vi.fn(() => new Promise<NoteGenerationJob | null>((resolve) => {
      resolveSnapshot = resolve;
    }));
    const unsubscribe = vi.fn();
    const jobs: NoteGenerationJobs = {
      waitUntilReady: async () => {},
      close: async () => {},
      submit: async () => ({ success: false, error: 'INVALID_INPUT' }),
      get,
      list: async () => [],
      subscribe: () => unsubscribe,
    };

    const emitter = new EventEmitter();
    const response = Object.assign(emitter, {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    });
    const next = vi.fn();
    const handler = createNoteGenerationEventsHandler(jobs) as unknown as (
      request: Request<{ id: string }>,
      response: Response,
      next: NextFunction,
    ) => Promise<void>;

    const handling = handler(
      { params: { id: job.id } } as Request<{ id: string }>,
      response as unknown as Response,
      next,
    );
    expect(get).toHaveBeenCalledWith(job.id);

    emitter.emit('close');
    resolveSnapshot(job);
    await handling;

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(response.set).not.toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('waits for drain before forwarding buffered events in order', async () => {
    let listener: (event: NoteGenerationEvent) => void = () => {};
    const completedJob: NoteGenerationJob = {
      ...job, status: 'completed', stage: 'completed', noteId: job.id,
      finishedAt: '2026-09-27T12:01:00.000Z',
    };
    const jobs: NoteGenerationJobs = {
      waitUntilReady: async () => {}, close: async () => {},
      submit: async () => ({ success: false, error: 'INVALID_INPUT' }),
      get: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(completedJob),
      list: async () => [],
      subscribe: (_id, callback) => { listener = callback; return () => {}; },
    };
    let startFirstWrite: () => void = () => {};
    const firstWriteStarted = new Promise<void>((resolve) => { startFirstWrite = resolve; });
    let finishStream: () => void = () => {};
    const finished = new Promise<void>((resolve) => { finishStream = resolve; });
    const emitter = new EventEmitter();
    let writeCount = 0;
    const response = Object.assign(emitter, {
      status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(),
      writableNeedDrain: true,
      write: vi.fn((_frame: string) => {
        startFirstWrite();
        return writeCount++ === 0 ? false : true;
      }),
      end: vi.fn(() => finishStream()),
    });
    const handling = createNoteGenerationEventsHandler(jobs)(
      { params: { id: job.id } } as Request<{ id: string }>,
      response as unknown as Response,
      vi.fn(),
    );

    await firstWriteStarted;
    expect(response.write).toHaveBeenCalledTimes(1);
    listener({ type: 'progress', stage: 'summarizing' });
    listener({ type: 'state_changed' });
    expect(response.write).toHaveBeenCalledTimes(1);

    response.writableNeedDrain = false;
    emitter.emit('drain');
    await handling;
    await finished;

    const stages = response.write.mock.calls.map(([frame]) => {
      const data = String(frame).split('data: ')[1];
      return JSON.parse(data ?? '').job.stage;
    });
    expect(stages).toEqual(['queued', 'summarizing', 'completed']);
  });
});